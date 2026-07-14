import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(rootDir, '.env') });

const source = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!source) throw new Error('LOCAL_DATABASE_URL or DATABASE_URL is required.');
const url = new URL(source);
const schema = url.searchParams.get('schema');
if (!schema || !/^[a-z0-9_]+_local$/i.test(schema) || schema === 'public') {
  throw new Error('Local reset is allowed only for a schema ending in _local.');
}

const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  NODE_ENV: 'development',
  KODPAUZA_ALLOW_LOCAL_SEED: 'true',
};

run(['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed', '--schema', 'prisma/schema.prisma']);
run(['exec', 'tsx', 'prisma/seed.ts']);

function run(args: string[]) {
  const result = spawnSync('pnpm', args, { cwd: rootDir, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
