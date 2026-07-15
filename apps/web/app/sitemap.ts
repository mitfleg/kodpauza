import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

const routes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/for-developers', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/for-advertisers', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/install', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/docs', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
