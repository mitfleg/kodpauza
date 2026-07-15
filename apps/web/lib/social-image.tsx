import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

const fontDirectory = path.join(process.cwd(), 'public/fonts/social');
const fontFiles = Promise.all(
  [
    'noto-sans-cyrillic-400-normal.woff',
    'noto-sans-latin-400-normal.woff',
    'noto-sans-cyrillic-700-normal.woff',
    'noto-sans-latin-700-normal.woff',
  ].map(async (fileName) => {
    const font = await readFile(path.join(fontDirectory, fileName));
    return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
  }),
);

export async function createSocialImage() {
  const [cyrillicRegular, latinRegular, cyrillicBold, latinBold] = await fontFiles;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background: '#17202a',
        color: '#ffffff',
        fontFamily: 'Noto Sans Cyrillic, Noto Sans Latin',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          right: -110,
          top: -190,
          borderRadius: 999,
          background: 'rgba(15,159,140,0.24)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 440,
          height: 440,
          right: 120,
          bottom: -300,
          borderRadius: 999,
          background: 'rgba(37,99,235,0.26)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.12,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          width: '100%',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,.18)',
              background: 'rgba(255,255,255,.08)',
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            {'</>'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 30, fontWeight: 700 }}>kodpauza</span>
            <span style={{ marginTop: 5, fontSize: 17, color: '#9fb0c4' }}>
              рекламная пауза в инструментах разработчика
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 940 }}>
          <span
            style={{
              alignSelf: 'flex-start',
              padding: '9px 14px',
              borderRadius: 999,
              background: 'rgba(94,234,212,.12)',
              border: '1px solid rgba(94,234,212,.32)',
              color: '#74ead6',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Codex · Claude Code · VS Code
          </span>
          <span style={{ marginTop: 24, fontSize: 62, lineHeight: 1.08, fontWeight: 700 }}>
            Реклама в паузах AI без помех работе
          </span>
          <span style={{ marginTop: 22, fontSize: 25, lineHeight: 1.35, color: '#c9d3df' }}>
            Доход разработчикам. Доступ к технической аудитории рекламодателям.
          </span>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Noto Sans Cyrillic', data: cyrillicRegular, weight: 400 },
        { name: 'Noto Sans Latin', data: latinRegular, weight: 400 },
        { name: 'Noto Sans Cyrillic', data: cyrillicBold, weight: 700 },
        { name: 'Noto Sans Latin', data: latinBold, weight: 700 },
      ],
    },
  );
}
