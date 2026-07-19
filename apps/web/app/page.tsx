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
  title: 'Kodpauza — доход во время работы Codex и Claude Code',
  description:
    'Установите Kodpauza для VS Code и получайте 50% стоимости подтвержденных показов, пока Codex или Claude Code готовит ответ.',
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
