import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(rootDir, '.env') });

const databaseUrl = testDatabaseUrl();
const url = new URL(databaseUrl);
const schema = url.searchParams.get('schema');

if (!schema || !/^[a-z0-9_]+_test$/i.test(schema) || schema === 'public') {
  throw new Error('TEST_DATABASE_URL must point to a dedicated schema ending in _test.');
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NODE_ENV: 'test',
  KODPAUZA_TRUST_PROXY: 'true',
  KODPAUZA_ALLOW_LOCAL_SEED: 'true',
  KODPAUZA_CAPTCHA_SECRET_KEY: '',
  KODPAUZA_RATE_LIMIT_REGISTER: '10000',
  KODPAUZA_TEST_ADVERTISER_CREDIT_KOPECKS: '1000000',
};

run(['--filter', '@kodpauza/shared', 'build']);
run([
  'exec',
  'prisma',
  'migrate',
  'reset',
  '--force',
  '--skip-seed',
  '--schema',
  'prisma/schema.prisma',
]);
run(['exec', 'tsx', 'prisma/seed.ts']);

if (!process.argv.includes('--reset-only')) {
  run(['--filter', '@kodpauza/api', 'exec', 'vitest', 'run']);
}

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL or TEST_DATABASE_URL is required.');
  const derived = new URL(process.env.DATABASE_URL);
  derived.searchParams.set('schema', 'kodpauza_test');
  return derived.toString();
}

function run(args: string[]) {
  const result = spawnSync('pnpm', args, { cwd: rootDir, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
