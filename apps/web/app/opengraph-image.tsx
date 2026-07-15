import { createSocialImage } from '@/lib/social-image';

export const alt = 'Kodpauza — реклама в Codex и Claude Code';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  return createSocialImage();
}
