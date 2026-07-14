import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const sources = [
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf',
  'https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt',
] as const;

const localOverrides = [
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  'disposablemail.com',
  'dispostable.com',
  'emailondeck.com',
  'fakemail.net',
  'getnada.com',
  'grr.la',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'minuteinbox.com',
  'mintemail.com',
  'mohmal.com',
  'sharklasers.com',
  'temp-mail.org',
  'tempail.com',
  'throwawaymail.com',
  'trashlify.com',
  'trashmail.com',
  'yopmail.com',
] as const;

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const outputPath = path.join(rootDir, 'apps/api/data/disposable-email-domains.txt');
const domainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const responses = await Promise.all(
  sources.map(async (source) => {
    const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Не удалось загрузить ${source}: HTTP ${response.status}`);
    const domains = parseDomains(await response.text());
    if (domains.length < 100) throw new Error(`Источник вернул слишком мало доменов: ${source}`);
    return domains;
  }),
);

const domains = [...new Set([...responses.flat(), ...localOverrides])].sort();
const header = [
  '# Generated file. Do not edit domain rows manually.',
  `# Updated: ${new Date().toISOString()}`,
  ...sources.map((source) => `# Source: ${source}`),
  '# Local overrides are maintained in scripts/update-disposable-email-domains.ts.',
  '',
];

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${header.join('\n')}${domains.join('\n')}\n`, 'utf8');
console.log(`Сохранено ${domains.length} доменов: ${outputPath}`);

function parseDomains(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase().replace(/^\*\./, ''))
    .filter((line) => line && !line.startsWith('#') && domainPattern.test(line));
}
