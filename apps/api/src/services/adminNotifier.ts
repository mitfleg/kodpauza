import { config } from '../config.js';
import { fetch, ProxyAgent, type Dispatcher } from 'undici';
import type { UnsupportedVersionAttention } from './integrationVersionPolicy.js';

export type UnsupportedIntegrationAlert = {
  tool: 'codex' | 'claude';
  version: string;
  clientVersion: string;
  editorName: string;
  reportCount: number;
  attention: UnsupportedVersionAttention;
  latestExactVersion: string;
};

export interface AdminNotifier {
  isConfigured(): boolean;
  notifyUnsupportedIntegration(alert: UnsupportedIntegrationAlert): Promise<void>;
}

export class TelegramAdminNotifier implements AdminNotifier {
  private readonly dispatcher: Dispatcher | undefined = createTelegramDispatcher();

  isConfigured(): boolean {
    return Boolean(config.telegramBotToken && config.telegramAdminChatId);
  }

  async notifyUnsupportedIntegration(alert: UnsupportedIntegrationAlert): Promise<void> {
    if (!this.isConfigured()) return;

    const toolName = alert.tool === 'codex' ? 'Codex' : 'Claude Code';
    const adminUrl = new URL('/admin/security', config.dashboardUrl).toString();
    const outdated = alert.attention === 'outdated_tool';
    const text = [
      outdated
        ? '⚠️ Kodpauza: у участника устаревшая версия AI-инструмента'
        : '🚨 Kodpauza: требуется новый патч',
      '',
      `Инструмент: ${toolName}`,
      `Версия: ${alert.version}`,
      `Последняя точно проверенная: ${alert.latestExactVersion}`,
      `Версия Kodpauza: ${alert.clientVersion}`,
      `Редактор: ${alert.editorName}`,
      `Сигналов: ${alert.reportCount}`,
      ...(outdated
        ? [
            '',
            `Действие: попросите участника обновить ${toolName} и Kodpauza, затем повторно подключить интеграции.`,
          ]
        : []),
      '',
      `Открыть центр версий: ${adminUrl}`,
    ].join('\n');

    const endpoint = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramAdminChatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(config.telegramNotificationTimeoutMs),
        dispatcher: this.dispatcher,
      });
    } catch {
      throw new Error('Telegram API недоступен.');
    }

    if (!response.ok) {
      throw new Error(`Telegram API вернул HTTP ${response.status}.`);
    }
    const result = (await response.json()) as { ok?: boolean };
    if (result.ok !== true) throw new Error('Telegram API отклонил уведомление.');
  }
}

function createTelegramDispatcher(): Dispatcher | undefined {
  if (!config.telegramProxyHost) return undefined;

  const proxyUrl = new URL(
    /^https?:\/\//i.test(config.telegramProxyHost)
      ? config.telegramProxyHost
      : `http://${config.telegramProxyHost}`,
  );
  proxyUrl.username = config.telegramProxyUser;
  proxyUrl.password = config.telegramProxyPassword;
  return new ProxyAgent(proxyUrl.toString());
}
