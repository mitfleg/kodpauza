import { readFileSync } from 'node:fs';

const generatedBlocklist = new Set(
  readFileSync(new URL('../data/disposable-email-domains.txt', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith('#')),
);

export function isDisposableEmail(email: string, additionalDomains: readonly string[] = []) {
  const domain = email.split('@')[1]?.trim().toLowerCase().replace(/\.$/, '') ?? '';
  if (!domain) return false;

  const candidates = domain
    .split('.')
    .map((_, index, labels) => labels.slice(index).join('.'))
    .filter((candidate) => candidate.includes('.'));
  const configuredDomains = new Set(
    additionalDomains.map((item) => item.trim().toLowerCase().replace(/^\*\./, '')),
  );

  return candidates.some(
    (candidate) => generatedBlocklist.has(candidate) || configuredDomains.has(candidate),
  );
}

export function disposableEmailDomainCount() {
  return generatedBlocklist.size;
}
