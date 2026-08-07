const test = require('node:test');
const assert = require('node:assert/strict');
const { unsupportedIntegrationMessage } = require('../dist/integrationCompatibilityMessage.js');

test('сообщение о несовместимой версии дает пользователю полный порядок действий', () => {
  const message = unsupportedIntegrationMessage('Codex', '26.999.1');

  assert.equal(
    message,
    'Версия Codex 26.999.1 не поддерживается Kodpauza. Обновите Codex и Kodpauza до последних доступных версий, затем выполните команду «Kodpauza: Подключить интеграции». До этого реклама отключена.',
  );
});

test('сообщение не оставляет лишний пробел, если версия неизвестна', () => {
  assert.match(unsupportedIntegrationMessage('Claude Code'), /^Версия Claude Code не /);
});
