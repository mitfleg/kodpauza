import { describe, expect, it } from 'vitest';

import { appendEridToUrl } from '../src/services/adClickUrl.js';

describe('appendEridToUrl', () => {
  it('добавляет ERID в ссылку объявления', () => {
    expect(appendEridToUrl('https://kodpauza.ru/install', 'token-123')).toBe(
      'https://kodpauza.ru/install?erid=token-123',
    );
  });

  it('сохраняет существующие параметры и fragment', () => {
    expect(
      appendEridToUrl('https://kodpauza.ru/install?utm_source=extension#start', 'token-123'),
    ).toBe('https://kodpauza.ru/install?utm_source=extension&erid=token-123#start');
  });

  it('заменяет ранее заданный ERID', () => {
    expect(appendEridToUrl('https://kodpauza.ru/install?erid=old-token', 'new-token')).toBe(
      'https://kodpauza.ru/install?erid=new-token',
    );
    expect(
      appendEridToUrl(
        'https://kodpauza.ru/install?erid=old-token&utm_source=extension&erid=duplicate#start',
        'new-token',
      ),
    ).toBe('https://kodpauza.ru/install?erid=new-token&utm_source=extension#start');
  });

  it('не меняет ссылку без ERID', () => {
    expect(appendEridToUrl('https://kodpauza.ru/install', null)).toBe(
      'https://kodpauza.ru/install',
    );
    expect(appendEridToUrl('https://kodpauza.ru/install', '   ')).toBe(
      'https://kodpauza.ru/install',
    );
  });

  it('не ломает некорректную ссылку', () => {
    expect(appendEridToUrl('not-a-url', 'token-123')).toBe('not-a-url');
  });
});
