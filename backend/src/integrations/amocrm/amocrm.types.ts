/** Subset of amoCRM API v4 shapes used by this integration. */

export interface AmocrmFieldValue {
  value: string | number | boolean;
  enum_code?: string;
  enum_id?: number;
}

export interface AmocrmCustomFieldValue {
  field_id?: number;
  field_code?: string;
  values: AmocrmFieldValue[];
}

export interface AmocrmContact {
  id: number;
  name?: string;
  custom_fields_values?: AmocrmCustomFieldValue[] | null;
}

export interface AmocrmLead {
  id: number;
  name?: string;
}

export interface AmocrmContactCreate {
  name: string;
  first_name?: string;
  last_name?: string;
  custom_fields_values?: AmocrmCustomFieldValue[];
}

export interface AmocrmLeadCreate {
  name: string;
  price?: number;
  pipeline_id?: number;
  status_id?: number;
  responsible_user_id?: number;
  custom_fields_values?: AmocrmCustomFieldValue[];
  _embedded?: {
    contacts?: Array<{ id: number }>;
    tags?: Array<{ name: string }>;
  };
}

export interface AmocrmAccount {
  id: number;
  name: string;
  subdomain: string;
}

export interface AmocrmPipeline {
  id: number;
  name: string;
  is_main?: boolean;
  _embedded?: { statuses?: Array<{ id: number; name: string }> };
}

export interface AmocrmCustomField {
  id: number;
  name: string;
  type: string;
  code?: string | null;
}

export interface AmocrmUser {
  id: number;
  name: string;
  email?: string;
}

export interface AmocrmTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

export interface Embedded<K extends string, T> {
  _embedded?: { [key in K]?: T[] };
}
