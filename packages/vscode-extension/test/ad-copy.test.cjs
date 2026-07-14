const test = require('node:test');
const assert = require('node:assert/strict');
const { adDisplayText } = require('../dist/adCopy.js');

test('убирает дублирующую маркировку рекламы из отображаемого текста', () => {
  assert.equal(adDisplayText('Реклама: облако для разработчиков'), 'облако для разработчиков');
  assert.equal(adDisplayText('Advertisement: Developer cloud'), 'Developer cloud');
  assert.equal(adDisplayText('Облако для разработчиков'), 'Облако для разработчиков');
  assert.equal(adDisplayText('Реклама:'), 'Реклама:');
});
