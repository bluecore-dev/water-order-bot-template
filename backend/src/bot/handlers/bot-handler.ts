import { Composer } from 'grammy';
import { BotContext } from '../context';
import { StateRouter } from '../state-router';

/** A feature module of the bot: registers its commands, buttons and step handlers. */
export interface BotHandler {
  register(composer: Composer<BotContext>, router: StateRouter): void;
}

/** Parses a positive integer from a regex match group; NaN-safe. */
export function intParam(match: RegExpMatchArray | string | null | undefined, index: number): number {
  if (!match || typeof match === 'string') return NaN;
  const value = Number(match[index]);
  return Number.isSafeInteger(value) ? value : NaN;
}
