export function unsupportedIntegrationMessage(toolName: string, version?: string): string {
  const normalizedVersion = version?.trim();
  const versionLabel = normalizedVersion ? ` ${normalizedVersion}` : '';
  return `Версия ${toolName}${versionLabel} не поддерживается Kodpauza. Обновите ${toolName} и Kodpauza до последних доступных версий, затем выполните команду «Kodpauza: Подключить интеграции». До этого реклама отключена.`;
}
