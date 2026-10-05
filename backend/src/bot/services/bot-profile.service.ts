import { Injectable, Logger } from '@nestjs/common';
import { InputFile } from 'grammy';
import { formatPhone } from '../../common/utils/phone';
import { safeErrorMessage } from '../../common/utils/redact';
import { getMessages } from '../../i18n';
import { AdminsService } from '../../modules/admins/admins.service';
import { SettingsService } from '../../modules/settings/settings.service';
import { BotApiHolder } from './bot-api.holder';

const DESCRIPTION_MAX = 512;
const SHORT_DESCRIPTION_MAX = 120;

/**
 * Keeps the bot's Telegram profile in line with the business settings: the "What can this
 * bot do?" description, the short "About" text and the command menu. Runs on startup and
 * after admins edit the company name, contacts or payment note — only changed fields are
 * sent, so restarts don't hit Telegram's rate limits for these methods.
 */
@Injectable()
export class BotProfileService {
  private readonly logger = new Logger(BotProfileService.name);

  constructor(
    private readonly holder: BotApiHolder,
    private readonly settings: SettingsService,
    private readonly admins: AdminsService,
  ) {}

  async sync(): Promise<void> {
    const api = this.holder.api;
    if (!api) return;
    const t = getMessages();
    const s = await this.settings.getAll();
    const description = t.botProfile
      .description({ company: s.company_name, phone: formatPhone(s.support_phone), hours: s.working_hours, note: s.payment_note })
      .slice(0, DESCRIPTION_MAX);
    const short = (s.company_name ? t.botProfile.shortDescription(s.company_name) : t.botProfile.shortDescriptionGeneric).slice(
      0,
      SHORT_DESCRIPTION_MAX,
    );

    try {
      if ((await api.getMyDescription()).description !== description) await api.setMyDescription(description);
      if ((await api.getMyShortDescription()).short_description !== short) await api.setMyShortDescription(short);
      await this.syncCommands();
      this.logger.log({ msg: 'Bot profile synced' });
    } catch (err) {
      this.logger.warn({ msg: 'Bot profile sync failed', err: safeErrorMessage(err) });
    }
  }

  private baseCommands() {
    const t = getMessages();
    return [
      { command: 'start', description: t.commands.start },
      { command: 'cancel', description: t.commands.cancel },
    ];
  }

  async syncCommands(): Promise<void> {
    const api = this.holder.api;
    if (!api) return;
    const base = this.baseCommands();
    const current = await api.getMyCommands();
    if (JSON.stringify(current) !== JSON.stringify(base)) await api.setMyCommands(base);
    for (const id of await this.admins.notifiableIds()) await this.ensureAdminCommands(id);
  }

  /** Adds /admin to an admin's own command menu (possible only once they have opened the bot). */
  async ensureAdminCommands(telegramId: string | number): Promise<void> {
    const api = this.holder.api;
    if (!api) return;
    const t = getMessages();
    try {
      await api.setMyCommands([...this.baseCommands(), { command: 'admin', description: t.commands.admin }], {
        scope: { type: 'chat', chat_id: Number(telegramId) },
      });
    } catch {
      // "chat not found": the admin has not started the bot yet; retried on their /start.
    }
  }

  async setPhoto(data: Buffer): Promise<void> {
    const api = this.holder.api;
    if (!api) throw new Error('Bot is not running');
    await api.setMyProfilePhoto({ type: 'static', photo: new InputFile(data, 'avatar.jpg') });
    this.logger.log({ msg: 'Bot profile photo changed' });
  }
}
