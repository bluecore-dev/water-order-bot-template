import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { AmocrmEntityType, AmocrmSync, SyncStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { safeErrorMessage } from '../../common/utils/redact';
import { AmocrmAuthFailedEvent, AmocrmSyncFailedEvent, Events, OrderCreatedEvent } from '../../common/events';
import { getMessages } from '../../i18n';
import { OrderFull } from '../../modules/orders/orders.service';
import { AmocrmAuthService } from './amocrm-auth.service';
import { AmocrmService } from './amocrm.service';
import { AmocrmAuthError, AmocrmNotConfiguredError } from './amocrm.errors';
import { buildContactPayload, buildLeadPayload, buildNoteText } from './amocrm-payload.builder';
import { AMOCRM_RETRY_DELAYS_MIN, AMOCRM_STALE_PROCESSING_MS, AMOCRM_SYNC_STEPS } from './amocrm.constants';

export type SyncOutcome = 'done' | 'skipped' | 'failed' | 'waiting_auth';

const AUTH_RETRY_MS = 5 * 60 * 1000;
const AUTH_ALERT_INTERVAL_MS = 60 * 60 * 1000;
const ALERT_ON_ATTEMPT = 3;
const BATCH_SIZE = 20;

/**
 * Delivers orders to amoCRM from the AmocrmSync outbox.
 *
 * Each order has three rows (CONTACT → LEAD → NOTE) processed in order. A failing step is
 * retried with backoff; steps already done are never repeated, and the amoCRM ids are stored
 * on the order, so retries cannot create duplicate contacts or leads. The customer never
 * waits for any of this: orders are confirmed before the first sync attempt starts.
 */
@Injectable()
export class AmocrmSyncService {
  private readonly logger = new Logger(AmocrmSyncService.name);
  private readonly inFlight = new Set<number>();
  private ticking = false;
  private lastAuthAlertAt = 0;
  /** Tests switch this off to drive processOrder() deterministically. */
  autoKick = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly auth: AmocrmAuthService,
    private readonly amocrm: AmocrmService,
    private readonly events: EventEmitter2,
  ) {}

  canSync(): boolean {
    return this.config.amocrm.syncEnabled && this.auth.isConfigured();
  }

  @OnEvent(Events.OrderCreated)
  onOrderCreated(event: OrderCreatedEvent): void {
    this.kick(event.orderId);
  }

  /** Fire-and-forget attempt (right after the order is saved, or after a manual resend). */
  kick(orderId: number): void {
    if (!this.autoKick) return;
    setImmediate(() => {
      this.processOrder(orderId).catch((err) =>
        this.logger.error({ msg: 'amoCRM sync crashed', orderId, err: safeErrorMessage(err) }),
      );
    });
  }

  @Interval('amocrm-sync', 60_000)
  async tick(): Promise<void> {
    if (!this.autoKick || this.ticking || !this.canSync()) return;
    this.ticking = true;
    try {
      await this.recoverStale();
      const now = new Date();
      const due = await this.prisma.amocrmSync.findMany({
        where: { status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] }, nextAttemptAt: { lte: now } },
        select: { orderId: true },
        distinct: ['orderId'],
        orderBy: { orderId: 'asc' },
        take: BATCH_SIZE,
      });
      for (const { orderId } of due) {
        const outcome = await this.processOrder(orderId);
        if (outcome === 'waiting_auth') break; // no point hammering amoCRM with every order
      }
    } catch (err) {
      this.logger.error({ msg: 'amoCRM sync tick failed', err: safeErrorMessage(err) });
    } finally {
      this.ticking = false;
    }
  }

  /** PROCESSING rows left behind by a crash become retryable again. */
  async recoverStale(): Promise<number> {
    const { count } = await this.prisma.amocrmSync.updateMany({
      where: { status: SyncStatus.PROCESSING, lastAttemptAt: { lt: new Date(Date.now() - AMOCRM_STALE_PROCESSING_MS) } },
      data: { status: SyncStatus.FAILED, errorMessage: 'Interrupted (process restarted during sync)', nextAttemptAt: new Date() },
    });
    if (count) this.logger.warn({ msg: 'Recovered stale amoCRM sync rows', count });
    return count;
  }

  async processOrder(orderId: number): Promise<SyncOutcome> {
    if (!this.canSync() || this.inFlight.has(orderId)) return 'skipped';
    this.inFlight.add(orderId);
    try {
      return await this.runSteps(orderId);
    } finally {
      this.inFlight.delete(orderId);
    }
  }

  private async runSteps(orderId: number): Promise<SyncOutcome> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true, amocrmSyncs: true },
    });
    if (!order) return 'skipped';

    const rows = AMOCRM_SYNC_STEPS.map((step) => order.amocrmSyncs.find((r) => r.entityType === step)).filter(
      (r): r is AmocrmSync => !!r,
    );
    const gate = rows.find((r) => r.status !== SyncStatus.SUCCESS);
    if (!gate) return 'done';
    if (!gate.nextAttemptAt || gate.nextAttemptAt > new Date() || gate.status === SyncStatus.PROCESSING) return 'skipped';

    // Claim the gate row; a concurrent worker (or second instance) will find nothing to claim.
    const claimed = await this.prisma.amocrmSync.updateMany({
      where: { id: gate.id, status: gate.status, updatedAt: gate.updatedAt },
      data: { status: SyncStatus.PROCESSING, lastAttemptAt: new Date() },
    });
    if (claimed.count === 0) return 'skipped';

    const full = { ...order, amocrmSyncs: [...order.amocrmSyncs].sort((a, b) => a.id - b.id) } as OrderFull;
    const t = getMessages(order.user.language);
    let contactId = order.amocrmContactId;
    let leadId = order.amocrmLeadId;
    let current: AmocrmSync = gate;

    try {
      for (const row of rows) {
        if (row.status === SyncStatus.SUCCESS) continue;
        current = row;
        if (row.id !== gate.id) {
          await this.prisma.amocrmSync.update({ where: { id: row.id }, data: { status: SyncStatus.PROCESSING, lastAttemptAt: new Date() } });
        }

        let entityId: number;
        switch (row.entityType) {
          case AmocrmEntityType.CONTACT: {
            entityId =
              contactId ??
              (await this.amocrm.findContactIdByPhone(order.phone)) ??
              (await this.amocrm.createContact(buildContactPayload(full, t, this.config.amocrm.contactFields.telegram)));
            contactId = entityId;
            await this.prisma.order.update({ where: { id: order.id }, data: { amocrmContactId: entityId } });
            break;
          }
          case AmocrmEntityType.LEAD: {
            if (!contactId) throw new Error('Contact step has not completed');
            const leadName = t.crm.leadName(order.orderNumber);
            const existing = leadId ?? (row.attempts > 0 ? await this.amocrm.findLeadIdByExactName(leadName) : null);
            entityId = existing ?? (await this.amocrm.createLead(buildLeadPayload(full, contactId, await this.leadOptions(), t)));
            leadId = entityId;
            await this.prisma.order.update({ where: { id: order.id }, data: { amocrmLeadId: entityId } });
            break;
          }
          case AmocrmEntityType.NOTE: {
            if (!leadId) throw new Error('Lead step has not completed');
            entityId = await this.amocrm.addLeadNote(leadId, buildNoteText(full, t, this.config.timezone));
            break;
          }
        }

        await this.prisma.amocrmSync.update({
          where: { id: row.id },
          data: { status: SyncStatus.SUCCESS, entityId, errorMessage: null, syncedAt: new Date(), nextAttemptAt: null },
        });
      }
      this.logger.log({ msg: 'Order synced to amoCRM', orderId, orderNumber: order.orderNumber, contactId, leadId });
      return 'done';
    } catch (err) {
      return this.handleFailure(order.id, order.orderNumber, current, err);
    }
  }

  private async handleFailure(orderId: number, orderNumber: number, row: AmocrmSync, err: unknown): Promise<SyncOutcome> {
    const message = safeErrorMessage(err);

    if (err instanceof AmocrmAuthError || err instanceof AmocrmNotConfiguredError) {
      // Credentials problem: park the order without spending an attempt.
      const next = new Date(Date.now() + AUTH_RETRY_MS);
      await this.prisma.amocrmSync.update({
        where: { id: row.id },
        data: { status: SyncStatus.PENDING, errorMessage: message, nextAttemptAt: next },
      });
      await this.alignPendingRows(orderId, row.id, next);
      this.logger.warn({ msg: 'amoCRM sync waiting for valid credentials', orderId, err: message });
      if (Date.now() - this.lastAuthAlertAt > AUTH_ALERT_INTERVAL_MS) {
        this.lastAuthAlertAt = Date.now();
        this.events.emit(Events.AmocrmAuthFailed, { error: message } satisfies AmocrmAuthFailedEvent);
      }
      return 'waiting_auth';
    }

    const attempts = row.attempts + 1;
    const final = attempts >= this.config.amocrm.maxAttempts;
    const delayMin = AMOCRM_RETRY_DELAYS_MIN[Math.min(attempts - 1, AMOCRM_RETRY_DELAYS_MIN.length - 1)];
    const next = final ? null : new Date(Date.now() + delayMin * 60_000);

    await this.prisma.amocrmSync.update({
      where: { id: row.id },
      data: { status: SyncStatus.FAILED, attempts, errorMessage: message, nextAttemptAt: next },
    });
    await this.alignPendingRows(orderId, row.id, next);

    this.logger.error({ msg: 'amoCRM sync failed', orderId, step: row.entityType, attempts, final, err: message });
    if (attempts === ALERT_ON_ATTEMPT || final) {
      this.events.emit(Events.AmocrmSyncFailed, { orderId, orderNumber, attempts, final, error: message } satisfies AmocrmSyncFailedEvent);
    }
    return 'failed';
  }

  /** Later steps wait for the failed one; keep them out of the due list until then. */
  private async alignPendingRows(orderId: number, exceptId: number, next: Date | null): Promise<void> {
    await this.prisma.amocrmSync.updateMany({
      where: { orderId, id: { not: exceptId }, status: { in: [SyncStatus.PENDING, SyncStatus.PROCESSING] } },
      data: { status: SyncStatus.PENDING, nextAttemptAt: next },
    });
  }

  private async leadOptions() {
    const c = this.config.amocrm;
    const configuredFields = Object.values(c.leadFields).filter(Boolean).length > 0;
    return {
      pipelineId: c.pipelineId,
      statusId: c.statusId,
      responsibleUserId: c.responsibleUserId,
      tags: c.leadTags,
      fields: c.leadFields,
      fieldTypes: configuredFields ? await this.amocrm.leadFieldTypes() : new Map<number, string>(),
    };
  }

  /** Manual retry from the admin panel: a fresh round of attempts for every unfinished step. */
  async requeueOrder(orderId: number): Promise<void> {
    const now = new Date();
    await this.prisma.amocrmSync.updateMany({
      where: { orderId, status: { in: [SyncStatus.FAILED, SyncStatus.PENDING] } },
      data: { status: SyncStatus.PENDING, attempts: 0, nextAttemptAt: now },
    });
    this.kick(orderId);
  }

  async requeueAllFailed(): Promise<number> {
    const failed = await this.prisma.amocrmSync.findMany({
      where: { status: SyncStatus.FAILED },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    for (const { orderId } of failed) {
      await this.prisma.amocrmSync.updateMany({
        where: { orderId, status: { in: [SyncStatus.FAILED, SyncStatus.PENDING] } },
        data: { status: SyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date() },
      });
    }
    if (failed.length) setImmediate(() => void this.tick());
    return failed.length;
  }

  async counts(): Promise<{ pendingOrders: number; failedOrders: number }> {
    const [pendingOrders, failedOrders] = await Promise.all([
      this.prisma.order.count({ where: { amocrmSyncs: { some: { status: { in: [SyncStatus.PENDING, SyncStatus.PROCESSING] } } } } }),
      this.prisma.order.count({ where: { amocrmSyncs: { some: { status: SyncStatus.FAILED } } } }),
    ]);
    return { pendingOrders, failedOrders };
  }
}
