import { BotContext, BotState } from './context';

export type StepHandler = (ctx: BotContext) => Promise<unknown>;

/**
 * Routes free-form input (text, contact, location, photo, shared user) to the handler of the
 * step the user is currently in. Buttons are handled separately by callback/hears handlers.
 */
export class StateRouter {
  private readonly handlers = new Map<BotState, StepHandler>();

  on(state: BotState, handler: StepHandler): this {
    if (this.handlers.has(state)) throw new Error(`Duplicate step handler for state "${state}"`);
    this.handlers.set(state, handler);
    return this;
  }

  /** Returns false when the current state has no handler (caller falls through). */
  async dispatch(ctx: BotContext): Promise<boolean> {
    const handler = this.handlers.get(ctx.session.state);
    if (!handler) return false;
    await handler(ctx);
    return true;
  }
}
