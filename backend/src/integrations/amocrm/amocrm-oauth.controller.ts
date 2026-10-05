import { Controller, Get, Header, Logger, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { escapeHtml } from '../../common/utils/format';
import { safeErrorMessage } from '../../common/utils/redact';
import { getMessages } from '../../i18n';
import { AmocrmAuthService } from './amocrm-auth.service';

/**
 * OAuth2 redirect target registered in the amoCRM integration (AMOCRM_REDIRECT_URI).
 * The flow starts from the bot: an admin taps "Connect amoCRM", which opens amoCRM's consent
 * page with a signed, 15-minute `state` that this endpoint verifies.
 */
@ApiTags('amocrm')
@Controller('amocrm/oauth')
export class AmocrmOauthController {
  private readonly logger = new Logger(AmocrmOauthController.name);

  constructor(private readonly auth: AmocrmAuthService) {}

  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'amoCRM OAuth2 redirect URI (browser redirect from amoCRM, not for API clients)' })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'referer', required: false, description: 'amoCRM account domain' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('referer') referer: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const t = getMessages();
    const fail = (reason: string) => {
      this.logger.warn({ msg: 'amoCRM OAuth callback rejected', reason });
      res.status(400).type('html').send(page(t.amoPage.failed, false));
    };

    if (error) return fail(`amoCRM returned error: ${String(error).slice(0, 50)}`);
    if (!code || !state || code.length > 4096) return fail('missing code/state');
    const verified = this.auth.verifyState(state);
    if (!verified) return fail('invalid or expired state');
    if (referer && referer.toLowerCase() !== this.auth.domain) return fail('account domain does not match AMOCRM_DOMAIN');

    try {
      await this.auth.exchangeCode(code, verified.telegramId);
    } catch (err) {
      return fail(safeErrorMessage(err));
    }
    res.status(200).type('html').send(page(t.amoPage.connected, true));
  }
}

function page(message: string, ok: boolean): string {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>amoCRM</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f5f7fa;color:#1f2933}
main{background:#fff;padding:32px 28px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:420px;text-align:center}
.i{font-size:48px}</style></head><body><main><div class="i">${ok ? '✅' : '⚠️'}</div><p>${escapeHtml(message)}</p></main></body></html>`;
}
