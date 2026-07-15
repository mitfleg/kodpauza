const siteUrl = new URL(process.env.INDEXNOW_SITE_URL ?? 'https://kodpauza.ru');
const key = process.env.INDEXNOW_KEY ?? '90fbf4fbfaa4ebeb90b7ba623367b08d';
const publicPaths = [
  '/',
  '/for-developers',
  '/for-advertisers',
  '/install',
  '/docs',
  '/privacy',
  '/terms',
];

const payload = {
  host: siteUrl.host,
  key,
  keyLocation: new URL(`/${key}.txt`, siteUrl).toString(),
  urlList: publicPaths.map((path) => new URL(path, siteUrl).toString()),
};

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'Kodpauza-IndexNow/1.0',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const detail = (await response.text()).trim();
  throw new Error(`IndexNow returned ${response.status}${detail ? `: ${detail}` : ''}`);
}

console.log(`IndexNow accepted ${payload.urlList.length} Kodpauza URLs (${response.status}).`);
