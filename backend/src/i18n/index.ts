import { uz, Messages } from './uz';

export type { Messages };

export const DEFAULT_LANGUAGE = 'uz';

/**
 * Registered locales. To add Russian: create `ru.ts` exporting `const ru: Messages = {…}`
 * (the type forces every key to exist) and register it here.
 */
const LOCALES: Record<string, Messages> = { uz };

export function getMessages(language?: string | null): Messages {
  return (language && LOCALES[language]) || LOCALES[DEFAULT_LANGUAGE];
}

export const SUPPORTED_LANGUAGES = Object.keys(LOCALES);
