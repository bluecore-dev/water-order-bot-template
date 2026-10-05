import { readFileSync } from 'fs';
import { join } from 'path';

// Loaded before every test file: the test env fully replaces any developer .env values.
for (const line of readFileSync(join(__dirname, 'test.env'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1);
}
for (const key of Object.keys(process.env)) {
  if (key.startsWith('AMOCRM_') && !['AMOCRM_SYNC_ENABLED'].includes(key)) delete process.env[key];
}

const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!dbName.endsWith('_test')) throw new Error(`Tests must use a *_test database, got "${dbName}"`);
