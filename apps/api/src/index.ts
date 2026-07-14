import { buildApp } from './app.js';
import { config, validateRuntimeConfig } from './config.js';
import { prisma } from './prisma.js';

validateRuntimeConfig();

const app = buildApp();

app.listen({ port: config.port, host: '0.0.0.0' }).catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  await prisma.$disconnect();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
