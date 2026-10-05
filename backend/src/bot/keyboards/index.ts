import { Keyboard } from 'grammy';
import { Messages, SUPPORTED_LANGUAGES, getMessages } from '../../i18n';

/** Persistent main menu (reply keyboard). Admins get one extra button. */
export function mainMenuKeyboard(t: Messages, isAdmin: boolean): Keyboard {
  const kb = new Keyboard()
    .text(t.menu.buy)
    .row()
    .text(t.menu.orders)
    .text(t.menu.profile)
    .row()
    .text(t.menu.addresses)
    .text(t.menu.contact);
  if (isAdmin) kb.row().text(t.menu.admin);
  return kb.resized().persistent();
}

export function cancelKeyboard(t: Messages): Keyboard {
  return new Keyboard().text(t.common.cancel).resized();
}

export function phoneKeyboard(t: Messages): Keyboard {
  return new Keyboard().requestContact(t.checkout.sendPhone).row().text(t.common.cancel).resized();
}

export function locationKeyboard(t: Messages, savedLabels: string[] = []): Keyboard {
  const kb = new Keyboard().requestLocation(t.checkout.sendLocation);
  for (const label of savedLabels) kb.row().text(label);
  return kb.row().text(t.common.cancel).resized();
}

export function skipKeyboard(t: Messages): Keyboard {
  return new Keyboard().text(t.common.skip).row().text(t.common.cancel).resized();
}

/**
 * Every translation of a label, so `hears()` keeps working for users of any language
 * once more locales are registered.
 */
export function labelsFor(pick: (t: Messages) => string): string[] {
  return [...new Set(SUPPORTED_LANGUAGES.map((lang) => pick(getMessages(lang))))];
}
