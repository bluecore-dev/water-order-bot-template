/**
 * Prepares the test database before Jest runs. Refuses to touch any database whose name
 * does not end in "_test" — tests truncate tables and must never hit dev or production data.
 */
const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', 'test', 'test.env'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const dbName = new URL(env.DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith('_test')) {
  console.error(`Refusing to run tests against database "${dbName}" (name must end with _test)`);
  process.exit(1);
}

execSync('npx prisma migrate deploy', {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
});
console.log(`Test database "${dbName}" is migrated`);
