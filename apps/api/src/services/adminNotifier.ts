import { config } from '../config.js';

export type UnsupportedIntegrationAlert = {
  tool: 'codex' | 'claude';
  version: string;
  clientVersion: string;
  editorName: string;
  reportCount: number;
};

export interface AdminNotifier {
  isConfigured(): boolean;
  notifyUnsupportedIntegration(alert: UnsupportedIntegrationAlert): Promise<void>;
}

export class TelegramAdminNotifier implements AdminNotifier {
  isConfigured(): boolean {
    return Boolean(config.telegramBotToken && config.telegramAdminChatId);
  }

  async notifyUnsupportedIntegration(alert: UnsupportedIntegrationAlert): Promise<void> {
    if (!this.isConfigured()) return;

    const toolName = alert.tool === 'codex' ? 'Codex' : 'Claude Code';
    const adminUrl = new URL('/admin/security', config.dashboardUrl).toString();
    const text = [
      '🚨 Kodpauza: требуется новый патч',
      '',
      `Инструмент: ${toolName}`,
      `Версия: ${alert.version}`,
      `Версия Kodpauza: ${alert.clientVersion}`,
      `Редактор: ${alert.editorName}`,
      `Сигналов: ${alert.reportCount}`,
      '',
      `Открыть центр версий: ${adminUrl}`,
    ].join('\n');

    const endpoint = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    let response: Response;
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
