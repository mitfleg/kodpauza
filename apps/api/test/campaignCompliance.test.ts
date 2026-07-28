import { describe, expect, it } from 'vitest';
import { campaignComplianceIssues } from '../src/services/campaignCompliance.js';

const advertiser = {
  companyName: 'Самозанятый Иванов Иван Иванович',
  publicName: 'Kodpauza',
  advertiserInfoUrl: 'https://kodpauza.ru/advertiser',
  inn: '123456789012',
};

describe('campaignComplianceIssues', () => {
  it('принимает заполненные закрытые юридические и публичные данные', () => {
    expect(
      campaignComplianceIssues(advertiser, [{ label: 'Основной', erid: 'valid-erid' }]),
    ).toEqual([]);
  });

  it('блокирует тестовые реквизиты, опасную ссылку и креатив без ERID', () => {
    const issues = campaignComplianceIssues(
      {
        companyName: 'ООО ТЕСТ',
        publicName: 'Kodpauza',
        advertiserInfoUrl: 'http://kodpauza.ru/advertiser',
        inn: 'abc',
      },
      [{ label: 'Вариант 1', erid: null }],
    );

    expect(issues).toEqual([
      'укажите настоящее юридическое имя рекламодателя',
      'укажите ИНН из 10 или 12 цифр',
      'укажите публичную HTTPS-страницу со сведениями о рекламодателе',
      'укажите ERID для креатива «Вариант 1»',
    ]);
  });
});
