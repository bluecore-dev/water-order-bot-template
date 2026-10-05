/** HTTP-level failure from the amoCRM API. Message is safe to log and to show to admins. */
export class AmocrmApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AmocrmApiError';
  }

  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** amoCRM is not configured at all (no domain / credentials in env). */
export class AmocrmNotConfiguredError extends Error {
  constructor() {
    super('amoCRM is not configured');
    this.name = 'AmocrmNotConfiguredError';
  }
}

/**
 * Credentials exist but cannot be used: OAuth not completed yet, refresh token revoked or
 * expired, long-lived token rejected. Not the order's fault — orders wait without burning
 * retry attempts until access is restored.
 */
export class AmocrmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmocrmAuthError';
  }
}
