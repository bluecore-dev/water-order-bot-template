import { Injectable } from '@nestjs/common';
import { Composer, InlineKeyboard } from 'grammy';
import { isDomainError } from '../../../common/errors';
import { formatAmount, truncate } from '../../../common/utils/format';
import { formatPhone } from '../../../common/utils/phone';
import { SETTING_DEFINITIONS, SETTING_KEYS, SettingKey, isSettingKey } from '../../../modules/settings/settings.registry';
import { SettingsService } from '../../../modules/settings/settings.service';
import { CB } from '../../callbacks';
import { BotContext } from '../../context';
import { cancelKeyboard } from '../../keyboards';
import { BotUi } from '../../services/bot-ui.service';
import { StateRouter } from '../../state-router';
import { isClear } from '../../utils/input';
import { BotHandler } from '../bot-handler';
import { adminOnly } from './admin-guard';

/** Business settings (company name, contacts, limits) editable without touching code. */
@Injectable()
export class AdminSettingsHandler implements BotHandler {
  constructor(
    private readonly settings: SettingsService,
    private readonly ui: BotUi,
  ) {}

  register(bot: Composer<BotContext>, router: StateRouter): void {
    bot.callbackQuery(CB.admin.settings, async (ctx) => {
      await this.ui.answer(ctx);
      this.ui.resetFlow(ctx);
      await this.showList(ctx);
    });

    bot.callbackQuery(/^adm:set:e:(\w+)$/, async (ctx) => {
      const key = ctx.match[1];
      if (!isSettingKey(key)) return this.ui.answer(ctx);
      await this.ui.answer(ctx);
      await this.askValue(ctx, key);
    });

    router.on(
      'admin:setting:edit',
      adminOnly(async (ctx) => {
        const key = ctx.session.admin?.settingKey;
        const text = ctx.message?.text?.trim();
        if (!key) {
          this.ui.resetFlow(ctx);
          return this.ui.showMainMenu(ctx);
        }
        if (!text) return this.ui.reply(ctx, ctx.t.admin.invalidSetting);
        try {
          await this.settings.set(key, isClear(text) ? null : text, `tg:${ctx.from?.id}`);
        } catch (err) {
          if (!isDomainError(err, 'VALIDATION')) throw err;
          return this.ui.reply(ctx, ctx.t.admin.invalidSetting);
        }
        this.ui.resetFlow(ctx);
        await this.ui.showMainMenu(ctx, ctx.t.admin.saved);
        await this.showList(ctx);
      }),
    );
  }

  private display(key: SettingKey, value: string): string {
    if (key === 'support_phone') return formatPhone(value);
    if (key === 'damaged_bottle_fine') return value === '0' ? '' : `${formatAmount(Number(value))} so‘m`;
    return value;
  }

  private async showList(ctx: BotContext): Promise<void> {
    const values = await this.settings.getAll();
    const kb = new InlineKeyboard();
    for (const key of SETTING_KEYS) {
      const label = ctx.t.admin.settingLabels[key];
      kb.text(ctx.t.admin.settingButton(label, truncate(this.display(key, values[key]), 28)), CB.admin.setting(key)).row();
    }
    kb.text(ctx.t.admin.backToMenu, CB.admin.menu);
    await this.ui.editOrReply(ctx, ctx.t.admin.settingsTitle, kb);
  }

  private async askValue(ctx: BotContext, key: SettingKey): Promise<void> {
    const current = await this.settings.get(key);
    ctx.session.state = 'admin:setting:edit';
    ctx.session.admin = { settingKey: key };
    const text = ctx.t.admin.askSetting(
      ctx.t.admin.settingLabels[key],
      this.display(key, current),
      ctx.t.admin.settingHints[key],
      SETTING_DEFINITIONS[key].optional,
    );
    await this.ui.reply(ctx, text, cancelKeyboard(ctx.t));
  }
}
