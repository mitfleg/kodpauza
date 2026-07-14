import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { config } from '../config.js';

const yooKassaPaymentSchema = z
  .object({
    id: z.string().min(1).max(100),
    status: z.enum(['pending', 'waiting_for_capture', 'succeeded', 'canceled']),
    paid: z.boolean().optional(),
    amount: z
      .object({
        value: z.string().regex(/^\d{1,10}\.\d{2}$/),
        currency: z.string().length(3),
      })
      .strict(),
    confirmation: z
      .object({
        type: z.string(),
        confirmation_url: z.string().url().optional(),
      })
      .passthrough()
      .optional(),
    metadata: z.record(z.unknown()).optional(),
    test: z.boolean().optional(),
    created_at: z.string().datetime({ offset: true }).optional(),
    cancellation_details: z
      .object({
        party: z.string().optional(),
        reason: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type YooKassaPayment = z.infer<typeof yooKassaPaymentSchema> & {
  amountKopecks: number;
};

export type CreateYooKassaPaymentInput = {
  localPaymentId: string;
  advertiserId: string;
  amountKopecks: number;
  customerEmail: string;
  returnUrl: string;
  idempotenceKey: string;
};

export interface YooKassaClientContract {
  isConfigured(): boolean;
  createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPayment>;
  getPayment(providerPaymentId: string): Promise<YooKassaPayment>;
}

export class YooKassaApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly providerCode: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'YooKassaApiError';
  }
}

export class YooKassaClient implements YooKassaClientContract {
  isConfigured(): boolean {
    return Boolean(config.yooKassaShopId && config.yooKassaSecretKey);
  }

  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPayment> {
    const receipt =
      config.yooKassaReceiptVatCode === undefined
        ? undefined
        : {
            customer: { email: input.customerEmail },
            items: [
              {
                description: 'Пополнение рекламного баланса Kodpauza',
                quantity: '1.00',
                amount: { value: kopecksToProviderValue(input.amountKopecks), currency: 'RUB' },
                vat_code: config.yooKassaReceiptVatCode,
                payment_mode: 'advance',
                payment_subject: 'service',
              },
            ],
          };

    return this.request('/payments', {
      method: 'POST',
      idempotenceKey: input.idempotenceKey,
      body: {
        amount: { value: kopecksToProviderValue(input.amountKopecks), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        description: `Пополнение рекламного баланса Kodpauza ${input.localPaymentId.slice(-8)}`,
        metadata: {
          kodpauza_payment_id: input.localPaymentId,
          kodpauza_advertiser_id: input.advertiserId,
        },
        ...(receipt ? { receipt } : {}),
      },
    });
  }

  async getPayment(providerPaymentId: string): Promise<YooKassaPayment> {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(providerPaymentId)) {
      throw new YooKassaApiError(
        'Некорректный идентификатор платежа ЮKassa.',
        400,
        'invalid_payment_id',
        false,
      );
    }
    return this.request(`/payments/${encodeURIComponent(providerPaymentId)}`, { method: 'GET' });
  }

  private async request(
    path: string,
    options: { method: 'GET' | 'POST'; body?: Record<string, unknown>; idempotenceKey?: string },
  ): Promise<YooKassaPayment> {
    if (!this.isConfigured()) {
      throw new YooKassaApiError('ЮKassa не настроена.', 503, 'not_configured', false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.yooKassaTimeoutMs);
    timeout.unref();

    let response: Response;
    try {
      response = await fetch(`${config.yooKassaApiBaseUrl.replace(/\/+$/, '')}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.yooKassaShopId}:${config.yooKassaSecretKey}`).toString('base64')}`,
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.idempotenceKey ? { 'Idempotence-Key': options.idempotenceKey } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'AbortError';
      throw new YooKassaApiError(
        timedOut ? 'ЮKassa не ответила вовремя.' : 'Не удалось связаться с ЮKassa.',
        503,
        timedOut ? 'timeout' : 'network_error',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload = await safeJson(response);
    if (!response.ok) {
      const providerError = z
        .object({
          code: z.string().optional(),
          description: z.string().optional(),
        })
        .passthrough()
        .safeParse(payload);
      const providerCode = providerError.success
        ? (providerError.data.code ?? 'provider_error')
        : 'provider_error';
      throw new YooKassaApiError(
        'ЮKassa отклонила запрос.',
        response.status,
        providerCode,
        response.status === 429 || response.status >= 500,
      );
    }

    const parsed = yooKassaPaymentSchema.safeParse(payload);
    if (!parsed.success) {
      throw new YooKassaApiError(
        'ЮKassa вернула некорректный ответ.',
        502,
        'invalid_response',
        true,
      );
    }
    return { ...parsed.data, amountKopecks: providerValueToKopecks(parsed.data.amount.value) };
  }
}

export function kopecksToProviderValue(amountKopecks: number): string {
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks < 1) {
    throw new RangeError('Сумма платежа должна быть положительным целым числом копеек.');
  }
  const rubles = Math.floor(amountKopecks / 100);
  const kopecks = String(amountKopecks % 100).padStart(2, '0');
  return `${rubles}.${kopecks}`;
}

export function providerValueToKopecks(value: string): number {
  const match = /^(\d{1,10})\.(\d{2})$/.exec(value);
  if (!match)
    throw new YooKassaApiError('Некорректная сумма в ответе ЮKassa.', 502, 'invalid_amount', true);
  const amount = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(amount)) {
    throw new YooKassaApiError(
      'Сумма ЮKassa превышает допустимый предел.',
      502,
      'invalid_amount',
      true,
    );
  }
  return amount;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
