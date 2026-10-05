/**
 * Prints what is needed to fill the AMOCRM_* ids in .env: account, pipelines with statuses,
 * users, and lead/contact custom fields. Read-only; uses the same credentials as the app.
 *
 *   npm run amocrm:inspect
 */
process.env.BOT_ENABLED = 'false'; // never start polling from a CLI script

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AmocrmService } from '../src/integrations/amocrm/amocrm.service';
import { AmocrmAuthService } from '../src/integrations/amocrm/amocrm-auth.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const auth = app.get(AmocrmAuthService);
    const state = await auth.connection();
    if (state !== 'ready') {
      console.log(`amoCRM is not usable yet: ${state}. Configure AMOCRM_* in .env (and connect OAuth from the bot).`);
      return;
    }
    const amo = app.get(AmocrmService);
    const account = await amo.getAccount();
    console.log(`\nAccount: ${account.name} (${account.subdomain}) id=${account.id}\n`);

    console.log('Pipelines (AMOCRM_PIPELINE_ID) and statuses (AMOCRM_STATUS_ID):');
    for (const p of await amo.listPipelines()) {
      console.log(`  ${p.id}  ${p.name}${p.is_main ? '  [main]' : ''}`);
      for (const s of p._embedded?.statuses ?? []) console.log(`      ${s.id}  ${s.name}`);
    }

    console.log('\nUsers (AMOCRM_RESPONSIBLE_USER_ID):');
    for (const u of await amo.listUsers()) console.log(`  ${u.id}  ${u.name}${u.email ? ` <${u.email}>` : ''}`);

    console.log('\nLead custom fields (AMOCRM_LEAD_FIELD_*):');
    for (const f of await amo.listCustomFields('leads')) console.log(`  ${f.id}  ${f.name}  [${f.type}]`);

    console.log('\nContact custom fields (AMOCRM_CONTACT_FIELD_TELEGRAM):');
    for (const f of await amo.listCustomFields('contacts')) console.log(`  ${f.id}  ${f.name}  [${f.type}]${f.code ? ` code=${f.code}` : ''}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
