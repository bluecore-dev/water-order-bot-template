import { AmocrmEntityType } from '@prisma/client';

/** Sync steps per order, in execution order. Each step has its own AmocrmSync row. */
export const AMOCRM_SYNC_STEPS: readonly AmocrmEntityType[] = [
  AmocrmEntityType.CONTACT,
  AmocrmEntityType.LEAD,
  AmocrmEntityType.NOTE,
];

/** Retry delays (minutes) by attempt number; the last value repeats. */
export const AMOCRM_RETRY_DELAYS_MIN = [1, 2, 5, 10, 30, 60, 120, 240, 480, 720];

export const AMOCRM_TOKEN_PROVIDER = 'amocrm';

/** A PROCESSING row older than this is assumed to belong to a crashed worker. */
export const AMOCRM_STALE_PROCESSING_MS = 10 * 60 * 1000;
