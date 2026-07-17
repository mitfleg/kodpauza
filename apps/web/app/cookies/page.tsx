import type { Metadata } from 'next';
import { legalDocumentVersions } from '@kodpauza/shared';
import { CookiePreferences } from '@/components/cookie-preferences';
import { LegalDocument, type LegalSection } from '@/components/legal-document';
import { PageShell } from '@/components/page-shell';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({ title: 'Cookie и веб-аналитика', description: 'Обязательные хранилища браузера и управление Яндекс Метрикой.', path: '/cookies' });

const sections: LegalSection[] = [
  { title: 'Обязательные данные браузера', content: <p>Локальное хранилище используется для авторизации, незавершенного подтверждения email, выбранных настроек cookie и технического состояния интерфейса. Без части этих данных вход и кабинет не смогут работать. Они не используются для рекламного профилирования на сторонних сайтах.</p> },
  { title: 'Аналитические cookie', content: <p>Яндекс Метрика включается при открытии сайта и помогает оценивать посещаемость, источники переходов и достижение продуктовых целей. Вебвизор используется для анализа интерфейса: содержимое полей ввода маскируется, а закрытые разделы кабинета скрываются из записи. Аналитика не ограничивает регистрацию и работу кабинета и не используется для чтения исходного кода, промптов или ответов AI.</p> },
  { title: 'Состав и срок', content: <p>Сроки конкретных cookie определяются браузером и поставщиком аналитики. Kodpauza хранит выбранную настройку вместе с датой изменения. При отключении платформа останавливает счетчик в текущем браузере и удаляет доступные ей cookie Метрики; некоторые технические данные могут быть удалены браузером позднее.</p> },
  { title: 'Управление', content: <><p>Аналитика включена по умолчанию. Вы можете отключить или снова включить её в любой момент. Настройка действует только для текущего браузера и устройства.</p><CookiePreferences /></> },
];

export default function CookiesPage() { return <PageShell eyebrow="Правовая информация" title="Cookie и веб-аналитика" description="Как сайт использует cookie и как управлять Яндекс Метрикой."><LegalDocument version={legalDocumentVersions.cookies} sections={sections} /></PageShell>; }
