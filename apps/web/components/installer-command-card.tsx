'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { reachMetrikaGoal } from '@/lib/metrika';

type Platform = 'unix' | 'windows';

const commands: Record<Platform, string> = {
  unix: 'curl -fsSL https://kodpauza.ru/install.sh | sh',
  windows: 'irm https://kodpauza.ru/install.ps1 | iex',
};

const platforms: Array<{ id: Platform; label: string; hint: string }> = [
  { id: 'unix', label: 'macOS / Linux', hint: 'Terminal' },
  { id: 'windows', label: 'Windows', hint: 'PowerShell' },
];

export function InstallerCommandCard() {
  const [platform, setPlatform] = useState<Platform>('unix');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (/Windows/i.test(navigator.userAgent)) setPlatform('windows');
  }, []);

  async function copyCommand() {
    const command = commands[platform];
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = command;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    reachMetrikaGoal('extension_download', { method: 'one_command', platform });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-[#101820] text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b62]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f4bd4f]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#5ac568]" />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Terminal aria-hidden className="h-3.5 w-3.5" />
          Быстрая установка
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div
          role="tablist"
          aria-label="Операционная система"
          className="inline-flex rounded-md border border-white/10 bg-white/[0.04] p-1"
        >
          {platforms.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={platform === item.id}
              onClick={() => {
                setPlatform(item.id);
                setCopied(false);
              }}
              className={`focus-ring rounded px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                platform === item.id
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex min-h-24 items-center gap-3 rounded-md border border-white/10 bg-black/25 px-4 py-4">
          <span className="select-none font-mono text-sm font-semibold text-emerald-400">$</span>
          <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-6 text-slate-100 sm:text-sm">
            {commands[platform]}
          </code>
          <button
            type="button"
            onClick={copyCommand}
            className="focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/15"
            aria-label="Скопировать команду установки"
          >
            {copied ? (
              <Check aria-hidden className="h-4 w-4 text-emerald-300" />
            ) : (
              <Copy aria-hidden className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>
            {platforms.find((item) => item.id === platform)?.hint}: вставьте и нажмите Enter
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <Check aria-hidden className="h-3.5 w-3.5" />
            Без прав администратора
          </span>
        </div>
      </div>
    </div>
  );
}
