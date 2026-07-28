const test = require('node:test');
const assert = require('node:assert/strict');
const { adDisplayText, adPresentationText } = require('../dist/adCopy.js');

test('убирает дублирующую маркировку рекламы из отображаемого текста', () => {
  assert.equal(adDisplayText('Реклама: облако для разработчиков'), 'облако для разработчиков');
  assert.equal(adDisplayText('Advertisement: Developer cloud'), 'Developer cloud');
  assert.equal(adDisplayText('Облако для разработчиков'), 'Облако для разработчиков');
  assert.equal(adDisplayText('Реклама:'), 'Узнать подробнее');
  assert.equal(adDisplayText('Advertisement:'), 'Узнать подробнее');
});

test('показывает обязательную маркировку, публичный бренд и оффер без дублей', () => {
  assert.equal(
    adPresentationText('Acme', 'Реклама: Быстрые серверы'),
    'Реклама · Acme · Быстрые серверы',
  );
  assert.equal(
    adPresentationText('Acme', 'Acme · Быстрые серверы'),
    'Реклама · Acme · Быстрые серверы',
  );
  assert.equal(
    adPresentationText('Acme', 'Реклама · Acme · Быстрые серверы'),
    'Реклама · Acme · Быстрые серверы',
  );
  assert.equal(adPresentationText('Acme', 'Реклама:'), 'Реклама · Acme · Узнать подробнее');
  assert.match(adPresentationText('Acme', 'Быстрые серверы'), /^Реклама · Acme · /);
  assert.doesNotMatch(adPresentationText('Acme', 'Быстрые серверы'), /Спонсорское предложение/);
});
