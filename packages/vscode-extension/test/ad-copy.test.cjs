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

test('показывает имя компании перед оффером без служебного ярлыка', () => {
  assert.equal(
    adPresentationText('Acme', 'Реклама: Быстрые серверы'),
    'Acme · Быстрые серверы',
  );
  assert.equal(adPresentationText('Acme', 'Acme · Быстрые серверы'), 'Acme · Быстрые серверы');
  assert.equal(adPresentationText('Acme', 'Реклама:'), 'Acme · Узнать подробнее');
  assert.doesNotMatch(adPresentationText('Acme', 'Реклама:'), /Реклама/);
  assert.doesNotMatch(adPresentationText('Acme', 'Быстрые серверы'), /Спонсорское предложение/);
});
