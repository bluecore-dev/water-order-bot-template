import { Injectable } from '@nestjs/common';
import { phoneMatchKey } from '../../common/utils/phone';
import { AmocrmApiClient } from './amocrm-api.client';
import { AmocrmApiError } from './amocrm.errors';
import {
  AmocrmAccount,
  AmocrmContact,
  AmocrmContactCreate,
  AmocrmCustomField,
  AmocrmLead,
  AmocrmLeadCreate,
  AmocrmPipeline,
  AmocrmUser,
  Embedded,
} from './amocrm.types';

const FIELD_TYPES_TTL_MS = 10 * 60 * 1000;

/** amoCRM operations used by the sync worker and the admin tools. */
@Injectable()
export class AmocrmService {
  private fieldTypes: { at: number; types: Map<number, string> } | null = null;

  constructor(private readonly api: AmocrmApiClient) {}

  getAccount(): Promise<AmocrmAccount> {
    return this.api.get<AmocrmAccount>('/account').then((a) => {
      if (!a) throw new AmocrmApiError(500, 'Empty account response');
      return a;
    });
  }

  /**
   * Finds an existing contact for a phone. amoCRM's `query` search is fuzzy, so candidates are
   * re-checked by comparing the last 9 digits of every stored phone; the oldest match wins so
   * repeat customers keep attaching to the same contact.
   */
  async findContactIdByPhone(phone: string): Promise<number | null> {
    const key = phoneMatchKey(phone);
    if (!key) return null;
    const res = await this.api.get<Embedded<'contacts', AmocrmContact>>('/contacts', { query: key, limit: 50 });
    const matches = (res?._embedded?.contacts ?? []).filter((c) =>
      (c.custom_fields_values ?? [])
        .filter((f) => f.field_code === 'PHONE')
        .flatMap((f) => f.values)
        .some((v) => phoneMatchKey(String(v.value)) === key),
    );
    if (!matches.length) return null;
    return matches.sort((a, b) => a.id - b.id)[0].id;
  }

  async createContact(contact: AmocrmContactCreate): Promise<number> {
    const res = await this.api.post<Embedded<'contacts', { id: number }>>('/contacts', [contact]);
    const id = res?._embedded?.contacts?.[0]?.id;
    if (!id) throw new AmocrmApiError(500, 'amoCRM did not return the created contact id');
    return id;
  }

  async createLead(lead: AmocrmLeadCreate): Promise<number> {
    const res = await this.api.post<Embedded<'leads', { id: number }>>('/leads', [lead]);
    const id = res?._embedded?.leads?.[0]?.id;
    if (!id) throw new AmocrmApiError(500, 'amoCRM did not return the created lead id');
    return id;
  }

  /** Used on retries to avoid a duplicate lead when a previous attempt died after creating it. */
  async findLeadIdByExactName(name: string): Promise<number | null> {
    const res = await this.api.get<Embedded<'leads', AmocrmLead>>('/leads', { query: name, limit: 50 });
    const match = (res?._embedded?.leads ?? []).filter((l) => l.name === name).sort((a, b) => a.id - b.id)[0];
    return match?.id ?? null;
  }

  async addLeadNote(leadId: number, text: string): Promise<number> {
    const res = await this.api.post<Embedded<'notes', { id: number }>>(`/leads/${leadId}/notes`, [
      { note_type: 'common', params: { text } },
    ]);
    const id = res?._embedded?.notes?.[0]?.id;
    if (!id) throw new AmocrmApiError(500, 'amoCRM did not return the created note id');
    return id;
  }

  async listPipelines(): Promise<AmocrmPipeline[]> {
    const res = await this.api.get<Embedded<'pipelines', AmocrmPipeline>>('/leads/pipelines');
    return res?._embedded?.pipelines ?? [];
  }

  async listCustomFields(entity: 'leads' | 'contacts'): Promise<AmocrmCustomField[]> {
    const all: AmocrmCustomField[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await this.api.get<Embedded<'custom_fields', AmocrmCustomField>>(`/${entity}/custom_fields`, { page, limit: 250 });
      const batch = res?._embedded?.custom_fields ?? [];
      all.push(...batch);
      if (batch.length < 250) break;
    }
    return all;
  }

  async listUsers(): Promise<AmocrmUser[]> {
    const res = await this.api.get<Embedded<'users', AmocrmUser>>('/users', { limit: 250 });
    return res?._embedded?.users ?? [];
  }

  /** Lead custom field id → type, cached briefly; used to send numbers to numeric fields. */
  async leadFieldTypes(): Promise<Map<number, string>> {
    if (this.fieldTypes && Date.now() - this.fieldTypes.at < FIELD_TYPES_TTL_MS) return this.fieldTypes.types;
    const fields = await this.listCustomFields('leads');
    const types = new Map(fields.map((f) => [f.id, f.type]));
    this.fieldTypes = { at: Date.now(), types };
    return types;
  }
}
