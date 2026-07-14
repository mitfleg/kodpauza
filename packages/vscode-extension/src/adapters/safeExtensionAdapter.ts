import * as vscode from 'vscode';
import { DetectionResult, DiagnosticsResult, PatchResult, ToolAdapter } from './types';

type SafeAdapterOptions = {
  id: string;
  name: string;
  extensionIdHints: string[];
  knownVersions: string[];
  versionedPatch?: boolean;
};

export class SafeExtensionAdapter implements ToolAdapter {
  constructor(private readonly options: SafeAdapterOptions) {}

  get id(): string {
    return this.options.id;
  }

  get name(): string {
    return this.options.name;
  }

  async detect(): Promise<DetectionResult> {
    const extension = vscode.extensions.all.find((item) =>
      this.options.extensionIdHints.some((hint) => item.id.toLowerCase().includes(hint.toLowerCase())),
    );
    if (!extension) {
      return {
        detected: false,
        safeToPatch: false,
        message: `${this.name}: расширение VS Code не найдено.`,
      };
    }

    const version = String(extension.packageJSON?.version ?? '');
    return {
      detected: true,
      extensionId: extension.id,
      extensionPath: extension.extensionPath,
      version,
      safeToPatch: false,
      message: this.options.versionedPatch
        ? `${this.name}: найдено расширение ${extension.id}, версия ${version || 'неизвестна'}. Изменения разрешены только отдельному установщику для проверенной сборки.`
        : `${this.name}: найдено расширение ${extension.id}, версия ${version || 'неизвестна'}. Файлы расширения не изменяются.`,
    };
  }

  async installPatch(options?: { dryRun?: boolean }): Promise<PatchResult> {
    const detection = await this.detect();
    if (!detection.detected) return { ok: false, changed: false, message: detection.message };
    return {
      ok: options?.dryRun === true,
      changed: false,
      dryRun: true,
      message: this.options.versionedPatch
        ? `UI-патч ${this.name} устанавливается только командой «Kodpauza: Подключить интеграции» после проверки версии, хэшей и создания резервной копии.`
        : `Kodpauza не меняет файлы ${this.name}.`,
    };
  }

  async removePatch(): Promise<PatchResult> {
    return { ok: true, changed: false, message: 'Реальный патч не устанавливался, удалять нечего.' };
  }

  async restoreBackup(): Promise<PatchResult> {
    return { ok: true, changed: false, message: 'Реальная резервная копия не создавалась в MVP-режиме.' };
  }

  async diagnostics(): Promise<DiagnosticsResult> {
    const detection = await this.detect();
    return {
      adapterId: this.id,
      name: this.name,
      detection,
      checks: [
        'Проверяет только установленные расширения VS Code.',
        'Не читает проекты пользователя.',
        this.options.versionedPatch
          ? `Останавливает установку, если версия, структура или хэши файлов ${this.name} не совпадают с проверенной сборкой.`
          : 'Не изменяет чужие файлы при неизвестной структуре.',
        this.options.versionedPatch
          ? 'Перед UI-патчем создается полная резервная копия изменяемых файлов.'
          : 'Доступна только проверка без внесения изменений.',
      ],
    };
  }
}
