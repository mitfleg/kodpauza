import crypto from 'node:crypto';

const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

type Surface = 'claude_code_vscode' | 'codex_vscode';
type SignableKodpauzaEvent = {
  eventId: string;
  adId: string;
  campaignId: string;
  surface: Surface;
  visibleMs?: number;
  clientVersion: string;
  toolName: string;
  toolVersion: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
  }
  return data as T;
}

function signatureHeaders(type: 'impression' | 'click', event: SignableKodpauzaEvent, eventSecret: string) {
  const timestamp = new Date().toISOString();
  const signature = crypto
    .createHmac('sha256', eventSecret)
    .update(eventSignaturePayload(type, event, timestamp))
    .digest('hex');

  return {
    'x-kodpauza-timestamp': timestamp,
    'x-kodpauza-signature': `sha256=${signature}`,
  };
}

function eventSignaturePayload(type: 'impression' | 'click', event: SignableKodpauzaEvent, timestamp: string): string {
  return [
    'kodpauza-event-v1',
    type,
    timestamp,
    event.eventId,
    event.adId,
    event.campaignId,
    event.surface,
    event.visibleMs ?? '',
    event.clientVersion,
    event.toolName,
    event.toolVersion,
  ].join('\n');
}

const login = await request<{
  token: string;
  eventSecret: string | null;
}>('/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'dev@kodpauza.local', password: 'dev123456' }),
});

if (!login.eventSecret) throw new Error('Developer eventSecret is missing.');

const auth = { authorization: `Bearer ${login.token}` };
const before = await request<{ balanceKopecks: number }>('/v1/developer/balance', { headers: auth });
const ad = await request<{
  adId: string;
  campaignId: string;
  surface: SignableKodpauzaEvent['surface'];
  trackable?: boolean;
}>('/v1/ads/next?surface=codex_vscode', { headers: auth });

if (ad.trackable === false || ad.campaignId === 'house') {
  throw new Error('No payable Codex campaign is available for smoke test.');
}
if (ad.surface !== 'codex_vscode') {
  throw new Error(`Unexpected ad surface: ${ad.surface}`);
}

const event: SignableKodpauzaEvent = {
  eventId: crypto.randomUUID(),
  adId: ad.adId,
  campaignId: ad.campaignId,
  surface: ad.surface,
  visibleMs: 5200,
  clientVersion: '0.1.0',
  toolName: 'openai.chatgpt',
  toolVersion: '0.1.0',
};

const impression = await request<{ rewardKopecks: number; fraudStatus: string }>('/v1/events/impression', {
  method: 'POST',
  headers: {
    ...auth,
    ...signatureHeaders('impression', event, login.eventSecret),
  },
  body: JSON.stringify(event),
});

const after = await request<{ balanceKopecks: number }>('/v1/developer/balance', { headers: auth });

console.log(
  JSON.stringify(
    {
      ok: true,
      rewardKopecks: impression.rewardKopecks,
      fraudStatus: impression.fraudStatus,
      balanceBefore: before.balanceKopecks,
      balanceAfter: after.balanceKopecks,
    },
    null,
    2,
  ),
);
