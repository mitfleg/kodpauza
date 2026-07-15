import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { HomeExperience } from '@/components/home/home-experience';
import { buildPublicMetadata } from '@/lib/seo';
import {
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from '@/lib/structured-data';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Kodpauza — реклама в Codex и Claude Code',
  description:
    'Нативная реклама во время ожидания Codex и Claude Code. Разработчики получают 50% стоимости подтвержденных показов, рекламодатели — доступ к технической аудитории.',
  path: '/',
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={[organizationJsonLd, websiteJsonLd, softwareApplicationJsonLd]} />
      <HomeExperience />
    </>
  );
}
