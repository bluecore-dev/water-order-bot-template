export type DomainErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'PRODUCT_UNAVAILABLE'
  | 'PRODUCT_IN_USE'
  | 'CART_EMPTY'
  | 'QUANTITY_LIMIT'
  | 'MIN_ORDER'
  | 'PRICE_CHANGED'
  | 'FORBIDDEN';

/**
 * Business-rule violation. Callers (bot handlers) map `code` to a localized message;
 * `message` is for logs and developers only.
 */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const isDomainError = (err: unknown, code?: DomainErrorCode): err is DomainError =>
  err instanceof DomainError && (code === undefined || err.code === code);
