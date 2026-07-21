import { describe, expect, it } from 'vitest';
import { renderVerificationEmail } from '../src/emailTemplates.js';

describe('Kodpauza email templates', () => {
  it('renders a branded verification email with matching HTML and plain text', () => {
    const message = renderVerificationEmail({
      code: '482913',
      expiresInMinutes: 15,
      dashboardUrl: 'https://kodpauza.ru',
    });

    expect(message.subject).toBe('Подтвердите почту в Kodpauza');
    expect(message.text).toContain('482913');
    expect(message.text).toContain('15 минут');
    expect(message.text).toContain('https://kodpauza.ru/register');
    expect(message.html).toContain('<!doctype html>');
    expect(message.html).toContain('Почта почти подтверждена');
    expect(message.html).toContain('482913');
    expect(message.html).toContain('https://kodpauza.ru/register');
    expect(message.html).toContain('рекламная пауза в VS Code');
    expect(message.html.length).toBeLessThan(50_000);
  });

  it.each([
    [1, '1 минуту'],
    [2, '2 минуты'],
    [5, '5 минут'],
    [21, '21 минуту'],
  ])('uses the correct Russian duration for %i minutes', (minutes, expected) => {
    const message = renderVerificationEmail({
      code: '123456',
      expiresInMinutes: minutes,
      dashboardUrl: 'http://localhost:3000',
    });

    expect(message.text).toContain(expected);
    expect(message.html).toContain(expected);
  });

  it('escapes dynamic values before placing them in HTML', () => {
    const message = renderVerificationEmail({
      code: '<12&34>',
      expiresInMinutes: 15,
      dashboardUrl: 'https://kodpauza.ru',
    });

    expect(message.html).toContain('&lt;12&amp;34&gt;');
    expect(message.html).not.toContain('<12&34>');
    expect(message.text).toContain('<12&34>');
  });
});
