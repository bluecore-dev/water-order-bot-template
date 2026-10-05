/** In-process domain events (EventEmitter2). Decouples orders from the bot and amoCRM modules. */
export const Events = {
  OrderCreated: 'order.created',
  AmocrmSyncFailed: 'amocrm.sync.failed',
  AmocrmAuthFailed: 'amocrm.auth.failed',
  AmocrmConnected: 'amocrm.connected',
} as const;

export interface OrderCreatedEvent {
  orderId: number;
}

export interface AmocrmSyncFailedEvent {
  orderId: number;
  orderNumber: number;
  attempts: number;
  /** true when no more automatic retries will happen. */
  final: boolean;
  error: string;
}

export interface AmocrmAuthFailedEvent {
  error: string;
}

export interface AmocrmConnectedEvent {
  accountDomain: string;
  telegramId?: string;
}
