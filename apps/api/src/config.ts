import crypto from 'node:crypto';
import {
  RUNTIME_POLICY_MAX_TTL_MS,
  RUNTIME_POLICY_PUBLIC_KEY_DER_BASE64,
} from './runtimePolicyConstants.js';

const localJwtSecret = 'local-dev-secret-change-me';
const localIpHashSecret = 'local-hash-secret-change-me';
const localEmailVerificationSecret = 'local-email-verification-secret-change-me';
const nodeEnv = process.env.NODE_ENV ?? 'development';

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function csvFromEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalIntegerFromEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export const config = {
  nodeEnv,
  port: Number(process.env.API_PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? localJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  jwtIssuer: process.env.JWT_ISSUER ?? 'kodpauza-api',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'kodpauza-clients',
  passwordSaltRounds: Math.min(14, Math.max(10, Number(process.env.PASSWORD_SALT_ROUNDS ?? 12))),
  ipHashSecret: process.env.IP_HASH_SECRET ?? localIpHashSecret,
  emailVerificationSecret:
    process.env.KODPAUZA_EMAIL_VERIFICATION_SECRET ?? localEmailVerificationSecret,
  dashboardUrl: process.env.KODPAUZA_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3000',
  publicApiUrl:
    process.env.KODPAUZA_PUBLIC_API_URL ??
    (nodeEnv === 'production' ? 'https://api.kodpauza.ru' : 'http://localhost:4000'),
  extensionArtifactDirectory: process.env.KODPAUZA_EXTENSION_ARTIFACT_DIRECTORY ?? 'artifacts',
  allowedOrigins: csvFromEnv(process.env.KODPAUZA_ALLOWED_ORIGINS),
  trustProxy: process.env.KODPAUZA_TRUST_PROXY === 'true' ? 1 : false,
  localDevelopment: process.env.KODPAUZA_LOCAL_DEVELOPMENT === 'true',
  allowInsecureLocalhost: process.env.KODPAUZA_ALLOW_INSECURE_LOCALHOST === 'true',
  allowPublicAdminRegistration: process.env.KODPAUZA_ALLOW_PUBLIC_ADMIN_REGISTRATION === 'true',
  requireEventSignatures: process.env.KODPAUZA_REQUIRE_EVENT_SIGNATURES !== 'false',
  runtimePolicyVersion: process.env.KODPAUZA_RUNTIME_POLICY_VERSION?.trim() || '1',
  runtimePolicyTtlMs: numberFromEnv('KODPAUZA_RUNTIME_POLICY_TTL_MS', 15 * 60 * 1000),
  runtimePolicyEnabled: booleanFromEnv('KODPAUZA_RUNTIME_POLICY_ENABLED', true),
  runtimePolicyKeyId: process.env.KODPAUZA_RUNTIME_POLICY_KEY_ID?.trim() || 'kodpauza-runtime-2026-01',
  runtimePolicyPrivateKeyBase64:
    process.env.KODPAUZA_RUNTIME_POLICY_PRIVATE_KEY_BASE64?.trim() ?? '',
  runtimePolicyBlockedTools: csvFromEnv(process.env.KODPAUZA_RUNTIME_POLICY_BLOCKED_TOOLS),
  runtimePolicyBlockedToolVersions: csvFromEnv(
    process.env.KODPAUZA_RUNTIME_POLICY_BLOCKED_TOOL_VERSIONS,
  ),
  runtimePolicyBlockedSurfaces: csvFromEnv(process.env.KODPAUZA_RUNTIME_POLICY_BLOCKED_SURFACES),
  runtimePolicyBlockedCampaigns: csvFromEnv(process.env.KODPAUZA_RUNTIME_POLICY_BLOCKED_CAMPAIGNS),
  adServeTtlMs: numberFromEnv('KODPAUZA_AD_SERVE_TTL_MS', 10 * 60 * 1000),
  testAdvertiserCreditKopecks:
    nodeEnv === 'test' ? Number(process.env.KODPAUZA_TEST_ADVERTISER_CREDIT_KOPECKS ?? 0) : 0,
  eventSignatureMaxSkewMs: numberFromEnv('KODPAUZA_EVENT_SIGNATURE_MAX_SKEW_MS', 5 * 60 * 1000),
  extensionSessionTtlMs: numberFromEnv(
    'KODPAUZA_EXTENSION_SESSION_TTL_MS',
    180 * 24 * 60 * 60 * 1000,
  ),
  rateLimitWindowMs: numberFromEnv('KODPAUZA_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  rateLimitAuth: numberFromEnv('KODPAUZA_RATE_LIMIT_AUTH', 30),
  rateLimitRegister: numberFromEnv('KODPAUZA_RATE_LIMIT_REGISTER', nodeEnv === 'test' ? 10_000 : 5),
  rateLimitAds: numberFromEnv('KODPAUZA_RATE_LIMIT_ADS', 180),
  rateLimitEvents: numberFromEnv('KODPAUZA_RATE_LIMIT_EVENTS', 120),
  rateLimitPayments: numberFromEnv('KODPAUZA_RATE_LIMIT_PAYMENTS', 10),
  rateLimitDefault: numberFromEnv('KODPAUZA_RATE_LIMIT_DEFAULT', 600),
  captchaSecretKey: process.env.KODPAUZA_CAPTCHA_SECRET_KEY?.trim() ?? '',
  captchaVerifyUrl:
    process.env.KODPAUZA_CAPTCHA_VERIFY_URL?.trim() ||
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  captchaDevToken: process.env.KODPAUZA_CAPTCHA_DEV_TOKEN?.trim() || 'kodpauza-local-captcha-pass',
  disposableEmailDomains: csvFromEnv(process.env.KODPAUZA_DISPOSABLE_EMAIL_DOMAINS).map((domain) =>
    domain.toLowerCase(),
  ),
  emailVerificationCodeTtlMs: numberFromEnv(
    'KODPAUZA_EMAIL_VERIFICATION_CODE_TTL_MS',
    15 * 60 * 1000,
  ),
  emailVerificationResendCooldownMs: numberFromEnv(
    'KODPAUZA_EMAIL_VERIFICATION_RESEND_COOLDOWN_MS',
    60 * 1000,
  ),
  emailVerificationMaxAttempts: numberFromEnv('KODPAUZA_EMAIL_VERIFICATION_MAX_ATTEMPTS', 5),
  emailTransport:
    process.env.KODPAUZA_EMAIL_TRANSPORT?.trim().toLowerCase() ||
    (nodeEnv === 'production' ? 'smtp' : 'console'),
  smtpHost: process.env.KODPAUZA_SMTP_HOST?.trim() ?? '',
  smtpPort: numberFromEnv('KODPAUZA_SMTP_PORT', 587),
  smtpSecure: booleanFromEnv('KODPAUZA_SMTP_SECURE', false),
  smtpRequireTls: booleanFromEnv('KODPAUZA_SMTP_REQUIRE_TLS', nodeEnv === 'production'),
  smtpConnectionTimeoutMs: numberFromEnv('KODPAUZA_SMTP_CONNECTION_TIMEOUT_MS', 8_000),
  smtpGreetingTimeoutMs: numberFromEnv('KODPAUZA_SMTP_GREETING_TIMEOUT_MS', 8_000),
  smtpSocketTimeoutMs: numberFromEnv('KODPAUZA_SMTP_SOCKET_TIMEOUT_MS', 10_000),
  smtpUser: process.env.KODPAUZA_SMTP_USER?.trim() ?? '',
  smtpPassword: process.env.KODPAUZA_SMTP_PASSWORD ?? '',
  smtpFrom: process.env.KODPAUZA_SMTP_FROM?.trim() || 'Kodpauza <noreply@localhost>',
  telegramBotToken: process.env.KODPAUZA_TELEGRAM_BOT_TOKEN?.trim() ?? '',
  telegramAdminChatId: process.env.KODPAUZA_TELEGRAM_ADMIN_CHAT_ID?.trim() ?? '',
  telegramNotificationTimeoutMs: numberFromEnv(
    'KODPAUZA_TELEGRAM_NOTIFICATION_TIMEOUT_MS',
    8_000,
  ),
  telegramProxyHost:
    process.env.KODPAUZA_TELEGRAM_PROXY_HOST?.trim() || process.env.PROXY_HOST?.trim() || '',
  telegramProxyUser:
    process.env.KODPAUZA_TELEGRAM_PROXY_USER?.trim() || process.env.PROXY_USER?.trim() || '',
  telegramProxyPassword:
    process.env.KODPAUZA_TELEGRAM_PROXY_PASSWORD ?? process.env.PROXY_PASSWORD ?? '',
  developerPayoutMinKopecks: numberFromEnv('KODPAUZA_DEVELOPER_PAYOUT_MIN_KOPECKS', 30_000),
  developerPayoutMaxKopecks: numberFromEnv('KODPAUZA_DEVELOPER_PAYOUT_MAX_KOPECKS', 100_000_000),
  yooKassaShopId: process.env.YOOKASSA_SHOP_ID?.trim() ?? '',
  yooKassaSecretKey: process.env.YOOKASSA_SECRET_KEY?.trim() ?? '',
  yooKassaApiBaseUrl: process.env.YOOKASSA_API_BASE_URL?.trim() || 'https://api.yookassa.ru/v3',
  yooKassaTimeoutMs: numberFromEnv('YOOKASSA_TIMEOUT_MS', 12_000),
  yooKassaReceiptVatCode: optionalIntegerFromEnv('YOOKASSA_RECEIPT_VAT_CODE'),
};

export function validateRuntimeConfig() {
  const minimumAllowedPayoutKopecks = config.localDevelopment ? 1 : 100;
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('API_PORT must be a valid TCP port.');
  }
  if (
    !Number.isInteger(config.testAdvertiserCreditKopecks) ||
    config.testAdvertiserCreditKopecks < 0
  ) {
    throw new Error('KODPAUZA_TEST_ADVERTISER_CREDIT_KOPECKS must be a non-negative integer.');
  }
  if (
    !Number.isInteger(config.runtimePolicyTtlMs) ||
    config.runtimePolicyTtlMs < 60_000 ||
    config.runtimePolicyTtlMs > RUNTIME_POLICY_MAX_TTL_MS
  ) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_TTL_MS must be between 60000 and 86400000.');
  }
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(config.runtimePolicyVersion)) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_VERSION is invalid.');
  }
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(config.runtimePolicyKeyId)) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_KEY_ID is invalid.');
  }
  validateRuntimePolicyBlockLists();
  if (config.runtimePolicyPrivateKeyBase64) validateRuntimePolicySigningKey();
  if (
    !Number.isInteger(config.developerPayoutMinKopecks) ||
    !Number.isInteger(config.developerPayoutMaxKopecks) ||
    config.developerPayoutMinKopecks < minimumAllowedPayoutKopecks ||
    config.developerPayoutMaxKopecks < config.developerPayoutMinKopecks
  ) {
    throw new Error('Developer payout limits are invalid.');
  }
  if (Boolean(config.yooKassaShopId) !== Boolean(config.yooKassaSecretKey)) {
    throw new Error('YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY must be configured together.');
  }
  if (
    !Number.isInteger(config.emailVerificationMaxAttempts) ||
    config.emailVerificationMaxAttempts < 1
  ) {
    throw new Error('KODPAUZA_EMAIL_VERIFICATION_MAX_ATTEMPTS must be a positive integer.');
  }
  if (config.emailTransport !== 'console' && config.emailTransport !== 'smtp') {
    throw new Error('KODPAUZA_EMAIL_TRANSPORT must be either console or smtp.');
  }
  if (!Number.isInteger(config.smtpPort) || config.smtpPort < 1 || config.smtpPort > 65535) {
    throw new Error('KODPAUZA_SMTP_PORT must be a valid TCP port.');
  }
  if (Boolean(config.smtpUser) !== Boolean(config.smtpPassword)) {
    throw new Error('KODPAUZA_SMTP_USER and KODPAUZA_SMTP_PASSWORD must be configured together.');
  }
  if (Boolean(config.telegramBotToken) !== Boolean(config.telegramAdminChatId)) {
    throw new Error(
      'KODPAUZA_TELEGRAM_BOT_TOKEN and KODPAUZA_TELEGRAM_ADMIN_CHAT_ID must be configured together.',
    );
  }
  const telegramProxyParts = [
    config.telegramProxyHost,
    config.telegramProxyUser,
    config.telegramProxyPassword,
  ];
  if (telegramProxyParts.some(Boolean) && !telegramProxyParts.every(Boolean)) {
    throw new Error(
      'Telegram proxy host, user and password must be configured together.',
    );
  }
  if (config.telegramProxyHost) {
    const proxyUrl = new URL(
      /^https?:\/\//i.test(config.telegramProxyHost)
        ? config.telegramProxyHost
        : `http://${config.telegramProxyHost}`,
    );
    if (
      !['http:', 'https:'].includes(proxyUrl.protocol) ||
      proxyUrl.username ||
      proxyUrl.password ||
      proxyUrl.pathname !== '/' ||
      proxyUrl.search ||
      proxyUrl.hash ||
      !proxyUrl.port
    ) {
      throw new Error('Telegram proxy host must contain only HTTP(S) host and port.');
    }
  }
  if (
    config.yooKassaReceiptVatCode !== undefined &&
    (!Number.isInteger(config.yooKassaReceiptVatCode) ||
      config.yooKassaReceiptVatCode < 1 ||
      config.yooKassaReceiptVatCode > 12)
  ) {
    throw new Error('YOOKASSA_RECEIPT_VAT_CODE must be an integer from 1 to 12.');
  }
  const yooKassaApiUrl = new URL(config.yooKassaApiBaseUrl);
  if (yooKassaApiUrl.protocol !== 'https:' || yooKassaApiUrl.username || yooKassaApiUrl.password) {
    throw new Error('YOOKASSA_API_BASE_URL must use HTTPS and must not contain credentials.');
  }
  const captchaVerifyUrl = new URL(config.captchaVerifyUrl);
  if (
    captchaVerifyUrl.protocol !== 'https:' ||
    captchaVerifyUrl.username ||
    captchaVerifyUrl.password
  ) {
    throw new Error('KODPAUZA_CAPTCHA_VERIFY_URL must use HTTPS and must not contain credentials.');
  }
  if (config.localDevelopment) validateLocalDevelopmentConfig();
  if (config.nodeEnv !== 'production') return;

  const unsafeSecrets = [
    isUnsafeSecret(config.jwtSecret) ? 'JWT_SECRET' : null,
    isUnsafeSecret(config.ipHashSecret) ? 'IP_HASH_SECRET' : null,
    !config.localDevelopment && isUnsafeSecret(config.emailVerificationSecret)
      ? 'KODPAUZA_EMAIL_VERIFICATION_SECRET'
      : null,
  ].filter(Boolean);

  if (unsafeSecrets.length) {
    throw new Error(`Production secrets are not configured: ${unsafeSecrets.join(', ')}`);
  }
  if (config.allowPublicAdminRegistration) {
    throw new Error('Public administrator registration cannot be enabled in production.');
  }
  if (!config.requireEventSignatures) {
    throw new Error('Event signatures cannot be disabled in production.');
  }
  if (!config.runtimePolicyPrivateKeyBase64) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_PRIVATE_KEY_BASE64 is required in production.');
  }
  if (config.allowedOrigins.length === 0) {
    throw new Error('KODPAUZA_ALLOWED_ORIGINS is required in production.');
  }
  if (!config.localDevelopment && !config.captchaSecretKey) {
    throw new Error('KODPAUZA_CAPTCHA_SECRET_KEY is required in production.');
  }
  if (
    !config.localDevelopment &&
    (config.emailTransport !== 'smtp' || !config.smtpHost || !config.smtpFrom)
  ) {
    throw new Error('Production email verification requires configured SMTP transport.');
  }
  if (!config.localDevelopment && !config.smtpSecure && !config.smtpRequireTls) {
    throw new Error('Production SMTP transport must require TLS.');
  }

  const urls = [config.dashboardUrl, config.publicApiUrl, ...config.allowedOrigins];
  for (const value of urls) {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(config.allowInsecureLocalhost && local)) {
      throw new Error(`Production URL must use HTTPS: ${value}`);
    }
  }
}

function validateRuntimePolicyBlockLists(): void {
  if (!config.runtimePolicyBlockedTools.every((value) => value === 'codex' || value === 'claude')) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_BLOCKED_TOOLS contains an unknown tool.');
  }
  if (
    !config.runtimePolicyBlockedSurfaces.every(
      (value) => value === 'codex_vscode' || value === 'claude_code_vscode',
    )
  ) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_BLOCKED_SURFACES contains an unknown surface.');
  }
  if (
    !config.runtimePolicyBlockedToolVersions.every((value) =>
      /^(codex|claude)@[A-Za-z0-9._+-]{1,80}$/.test(value),
    )
  ) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_BLOCKED_TOOL_VERSIONS is invalid.');
  }
  if (
    !config.runtimePolicyBlockedCampaigns.every((value) => /^[A-Za-z0-9_-]{1,100}$/.test(value))
  ) {
    throw new Error('KODPAUZA_RUNTIME_POLICY_BLOCKED_CAMPAIGNS is invalid.');
  }
}

function validateRuntimePolicySigningKey(): void {
  try {
    const pem = Buffer.from(config.runtimePolicyPrivateKeyBase64, 'base64').toString('utf8');
    const privateKey = crypto.createPrivateKey(pem);
    const publicKey = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
    if (publicKey.toString('base64') !== RUNTIME_POLICY_PUBLIC_KEY_DER_BASE64) {
      throw new Error('key mismatch');
    }
  } catch {
    throw new Error(
      'KODPAUZA_RUNTIME_POLICY_PRIVATE_KEY_BASE64 is invalid or does not match the extension public key.',
    );
  }
}

function validateLocalDevelopmentConfig() {
  if (!config.allowInsecureLocalhost) {
    throw new Error('KODPAUZA_LOCAL_DEVELOPMENT requires KODPAUZA_ALLOW_INSECURE_LOCALHOST=true.');
  }
  const urls = [config.dashboardUrl, config.publicApiUrl, ...config.allowedOrigins];
  if (urls.length < 2) throw new Error('Local development requires localhost URLs.');
  for (const value of urls) {
    const url = new URL(value);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error('KODPAUZA_LOCAL_DEVELOPMENT can only be used with localhost URLs.');
    }
  }
}

function isUnsafeSecret(secret: string): boolean {
  return (
    secret.length < 32 ||
    secret === localJwtSecret ||
    secret === localIpHashSecret ||
    secret === localEmailVerificationSecret ||
    /(replace|change[-_ ]?me|example|local[-_ ]?secret)/i.test(secret)
  );
}
