'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Code2, Eye, EyeOff, Loader2, MailCheck, Megaphone, Send } from 'lucide-react';
import { CaptchaWidget } from '@/components/captcha-widget';
import { ApiClientError, type ApiErrorPayload, apiClient } from '@/lib/api-client';
import { pendingVerificationEmailKey } from '@/lib/auth-state';
import { reachMetrikaGoal } from '@/lib/metrika';

type AuthFormProps = {
  mode: 'login' | 'register';
};

type AuthUser = {
  role: 'developer' | 'advertiser' | 'admin';
  emailVerified?: boolean;
  isEmailVerified?: boolean;
  emailVerifiedAt?: string | null;
};

type AuthResponse = {
  token?: string;
  user?: AuthUser;
  email?: string;
  verificationRequired?: boolean;
  verified?: boolean;
  retryAfter?: number;
  retryAfterSeconds?: number;
};

type FormStatus = 'idle' | 'loading' | 'success' | 'error';
type AuthAction = 'login' | 'register' | 'verify' | 'resend';

const defaultResendCooldown = 60;

function errorPayload(error: ApiClientError) {
  return typeof error.payload === 'object' && error.payload !== null
    ? (error.payload as ApiErrorPayload)
    : undefined;
}

function verificationRequired(error: ApiClientError) {
  const payload = errorPayload(error);
  return (
    payload?.verificationRequired === true ||
    payload?.code === 'EMAIL_VERIFICATION_REQUIRED' ||
    payload?.code === 'EMAIL_NOT_VERIFIED' ||
    /подтверд|verif/i.test(`${payload?.message ?? ''} ${payload?.error ?? ''}`)
  );
}

function authErrorMessage(error: unknown, action: AuthAction) {
  if (!(error instanceof ApiClientError)) return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  if (error.status === 0) return error.message;

  const payload = errorPayload(error);
  const backendText = `${payload?.message ?? ''} ${payload?.error ?? ''}`.trim();
  const code = payload?.code ?? '';

  if (error.status === 429) {
    const wait = error.retryAfterSeconds;
    return wait
      ? `Слишком много попыток. Повторите через ${wait} сек.`
      : 'Слишком много попыток. Подождите немного и повторите запрос.';
  }
  if (
    /DISPOSABLE|TEMPORARY_EMAIL/i.test(code) ||
    /временн|однораз|disposable|temporary/i.test(backendText)
  ) {
    return 'Временные и одноразовые почтовые адреса не принимаются. Укажите постоянную почту.';
  }
  if (/CAPTCHA/i.test(code) || /captcha|капч/i.test(backendText)) {
    return 'Проверка CAPTCHA не пройдена или устарела. Пройдите её ещё раз.';
  }
  if (action === 'login' && error.status === 401) {
    return 'Неверная почта или пароль.';
  }
  if (action === 'register' && error.status === 409) {
    return 'Аккаунт с такой почтой уже существует. Войдите или подтвердите почту.';
  }
  if (action === 'verify' && [400, 401, 404, 410, 422].includes(error.status)) {
    return 'Код неверный или уже истёк. Проверьте письмо либо запросите новый код.';
  }
  if (action === 'resend' && error.status === 404) {
    return 'Аккаунт с такой почтой не найден.';
  }
  if (error.status >= 500) {
    return 'Сервис временно недоступен. Попробуйте ещё раз позже.';
  }
  if (/[А-Яа-яЁё]/.test(backendText)) return backendText;
  if (action === 'register') return 'Не удалось создать аккаунт. Проверьте поля формы.';
  if (action === 'verify') return 'Не удалось подтвердить почту. Проверьте код.';
  return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

function isVerifiedUser(user: AuthUser) {
  if (typeof user.emailVerified === 'boolean') return user.emailVerified;
  if (typeof user.isEmailVerified === 'boolean') return user.isEmailVerified;
  if ('emailVerifiedAt' in user) return Boolean(user.emailVerifiedAt);
  return true;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<'credentials' | 'verification'>('credentials');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<'developer' | 'advertiser'>('developer');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (mode !== 'login') return;
    const pendingEmail = window.localStorage.getItem(pendingVerificationEmailKey);
    if (!pendingEmail) return;
    setEmail(pendingEmail);
    setPhase('verification');
    setMessage('Введите код подтверждения, который мы отправили на вашу почту.');
  }, [mode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [resendCooldown]);

  function openVerification(nextEmail: string, cooldown = defaultResendCooldown) {
    const normalizedEmail = nextEmail.trim().toLowerCase();
    window.localStorage.removeItem('kodpauza_token');
    window.localStorage.setItem(pendingVerificationEmailKey, normalizedEmail);
    window.dispatchEvent(new Event('kodpauza-auth-changed'));
    setEmail(normalizedEmail);
    setVerificationCode('');
    setResendCooldown(cooldown);
    setPhase('verification');
    setStatus('success');
    setMessage(`Код подтверждения отправлен на ${normalizedEmail}.`);
  }

  function completeAuthentication(result: AuthResponse, successMessage: string) {
    if (
      !result.token ||
      !result.user ||
      !['developer', 'advertiser', 'admin'].includes(result.user.role)
    ) {
      return false;
    }
    if (!isVerifiedUser(result.user)) {
      openVerification(result.email ?? email, 0);
      return true;
    }

    window.localStorage.setItem('kodpauza_token', result.token);
    window.localStorage.removeItem(pendingVerificationEmailKey);
    window.dispatchEvent(new Event('kodpauza-auth-changed'));
    setStatus('success');
    setMessage(successMessage);
    router.push(
      result.user.role === 'advertiser'
        ? '/advertiser'
        : result.user.role === 'admin'
          ? '/admin'
          : '/developer',
    );
    return true;
  }

  async function onCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (mode === 'register' && !captchaToken) {
      setStatus('error');
      setMessage('Сначала пройдите проверку CAPTCHA.');
      return;
    }

    setStatus('loading');
    const form = new FormData(event.currentTarget);
    const normalizedEmail = email.trim().toLowerCase();
    const password = String(form.get('password') ?? '');

    try {
      const endpoint = mode === 'login' ? '/v1/auth/login' : '/v1/auth/register';
      const body =
        mode === 'login'
          ? { email: normalizedEmail, password }
          : {
              displayName: String(form.get('displayName') ?? '').trim(),
              email: normalizedEmail,
              password,
              role,
              captchaToken: captchaToken as string,
              ...(role === 'advertiser'
                ? {
                    companyName: String(form.get('companyName') ?? '').trim(),
                    inn: String(form.get('inn') ?? '').trim() || undefined,
                  }
                : {}),
            };

      const result = await apiClient.post<AuthResponse, typeof body>(
        endpoint,
        body,
        mode === 'register' ? { timeoutMs: 25_000 } : undefined,
      );

      if (mode === 'register') {
        reachMetrikaGoal('registration_started', { role });
        if (result.token && result.user && isVerifiedUser(result.user)) {
          reachMetrikaGoal('registration_completed', { role: result.user.role });
        }
      }

      if (result.verificationRequired || !result.token) {
        openVerification(
          result.email ?? normalizedEmail,
          result.retryAfterSeconds ?? result.retryAfter ?? defaultResendCooldown,
        );
        return;
      }

      if (
        !completeAuthentication(
          result,
          mode === 'login'
            ? 'Вход выполнен. Открываем кабинет.'
            : 'Аккаунт создан. Открываем кабинет.',
        )
      ) {
        throw new ApiClientError(502, { error: 'API вернул неполный ответ авторизации.' });
      }
    } catch (error) {
      if (mode === 'login' && error instanceof ApiClientError && verificationRequired(error)) {
        const payload = errorPayload(error);
        openVerification(payload?.email ?? normalizedEmail, error.retryAfterSeconds ?? 0);
        return;
      }

      setStatus('error');
      setMessage(authErrorMessage(error, mode));
      if (mode === 'register') {
        setCaptchaToken(null);
        setCaptchaResetKey((value) => value + 1);
      }
    }
  }

  async function onVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const result = await apiClient.post<AuthResponse, { email: string; code: string }>(
        '/v1/auth/verify-email',
        { email, code: verificationCode },
      );

      if (
        result.verified ||
        (result.token && result.user && isVerifiedUser(result.user))
      ) {
        reachMetrikaGoal('registration_completed', { role: result.user?.role ?? role });
      }

      if (completeAuthentication(result, 'Почта подтверждена. Открываем кабинет.')) return;
      if (!result.verified) {
        throw new ApiClientError(502, { error: 'API не подтвердил активацию аккаунта.' });
      }

      window.localStorage.removeItem(pendingVerificationEmailKey);
      window.dispatchEvent(new Event('kodpauza-auth-changed'));
      setPhase('credentials');
      setStatus('success');
      setMessage('Почта подтверждена. Теперь войдите с вашим паролем.');
    } catch (error) {
      setStatus('error');
      setMessage(authErrorMessage(error, 'verify'));
    }
  }

  async function resendCode() {
    if (isResending || resendCooldown > 0) return;
    setIsResending(true);
    setMessage('');

    try {
      const result = await apiClient.post<AuthResponse, { email: string }>(
        '/v1/auth/resend-verification',
        { email },
      );
      setResendCooldown(result.retryAfterSeconds ?? result.retryAfter ?? defaultResendCooldown);
      setStatus('success');
      setMessage(`Новый код отправлен на ${email}.`);
    } catch (error) {
      if (error instanceof ApiClientError && error.retryAfterSeconds) {
        setResendCooldown(error.retryAfterSeconds);
      }
      setStatus('error');
      setMessage(authErrorMessage(error, 'resend'));
    } finally {
      setIsResending(false);
    }
  }

  function changeEmail() {
    window.localStorage.removeItem(pendingVerificationEmailKey);
    window.dispatchEvent(new Event('kodpauza-auth-changed'));
    setPhase('credentials');
    setStatus('idle');
    setMessage('');
    setVerificationCode('');
  }

  if (phase === 'verification') {
    return (
      <form
        onSubmit={onVerifySubmit}
        className="rounded-md border border-line bg-white p-5 shadow-panel sm:p-6"
      >
        <div className="flex items-start gap-3 rounded-md bg-emerald-50 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-emerald-700 shadow-sm">
            <MailCheck aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-ink">Подтвердите почту</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900">
              Аккаунт неактивен, пока вы не введёте код из письма. До этого кабинет недоступен.
            </p>
          </div>
        </div>

        <label className="mt-5 grid gap-2 text-sm font-medium text-ink">
          Код из письма для <span className="break-all font-semibold text-signal">{email}</span>
          <input
            name="verificationCode"
            value={verificationCode}
            onChange={(event) =>
              setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoFocus
            className="focus-ring h-12 rounded-md border border-line px-3 text-center font-mono text-xl tracking-[0.35em] text-ink"
            placeholder="000000"
            aria-describedby="verification-help"
          />
        </label>
        <p id="verification-help" className="mt-2 text-xs leading-5 text-slate-500">
          Код состоит из 6 цифр. Если письма нет, проверьте папку «Спам».
        </p>

        <button
          type="submit"
          disabled={status === 'loading' || verificationCode.length !== 6}
          className="focus-ring mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === 'loading' ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <MailCheck aria-hidden className="h-4 w-4" />
          )}
          Подтвердить аккаунт
        </button>

        <button
          type="button"
          onClick={() => void resendCode()}
          disabled={isResending || resendCooldown > 0}
          className="focus-ring mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {isResending ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Send aria-hidden className="h-4 w-4" />
          )}
          {resendCooldown > 0
            ? `Отправить снова через ${resendCooldown} сек.`
            : 'Отправить код снова'}
        </button>

        {message ? (
          <p
            className={`mt-4 rounded-md px-3 py-2 text-sm ${status === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={changeEmail}
          className="focus-ring mt-5 text-sm font-medium text-signal hover:underline"
        >
          Указать другую почту
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={onCredentialsSubmit}
      className="rounded-md border border-line bg-white p-5 shadow-panel sm:p-6"
    >
      <div className="grid gap-5">
        {mode === 'register' ? (
          <label className="grid gap-2 text-sm font-medium text-ink">
            Ваше имя
            <input
              name="displayName"
              required
              autoComplete="name"
              maxLength={120}
              className="focus-ring h-11 rounded-md border border-line px-3 text-base text-ink"
              placeholder="Алексей"
            />
          </label>
        ) : null}

        <label className="grid gap-2 text-sm font-medium text-ink">
          Рабочая почта
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="focus-ring h-11 rounded-md border border-line px-3 text-base text-ink"
            placeholder="name@example.com"
          />
          {mode === 'register' ? (
            <span className="text-xs font-normal leading-5 text-slate-500">
              Одноразовые и временные почтовые адреса не принимаются.
            </span>
          ) : null}
        </label>

        <label className="grid gap-2 text-sm font-medium text-ink">
          Пароль
          <span className="relative block">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              minLength={10}
              maxLength={72}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="focus-ring h-11 w-full rounded-md border border-line px-3 pr-11 text-base text-ink"
              placeholder={mode === 'login' ? 'Введите пароль' : 'Минимум 10 символов'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="focus-ring absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-ink"
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showPassword ? (
                <EyeOff aria-hidden className="h-4 w-4" />
              ) : (
                <Eye aria-hidden className="h-4 w-4" />
              )}
            </button>
          </span>
        </label>

        {mode === 'register' ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-ink">
              Как вы будете использовать kodpauza
            </legend>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1" role="group">
              <button
                type="button"
                onClick={() => setRole('developer')}
                aria-pressed={role === 'developer'}
                className={`focus-ring flex min-h-14 items-center gap-2 rounded-md px-3 text-left text-sm font-semibold transition ${role === 'developer' ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}
              >
                <Code2 aria-hidden className="h-4 w-4 shrink-0" />
                Разработчик
              </button>
              <button
                type="button"
                onClick={() => setRole('advertiser')}
                aria-pressed={role === 'advertiser'}
                className={`focus-ring flex min-h-14 items-center gap-2 rounded-md px-3 text-left text-sm font-semibold transition ${role === 'advertiser' ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}
              >
                <Megaphone aria-hidden className="h-4 w-4 shrink-0" />
                Рекламодатель
              </button>
            </div>
          </fieldset>
        ) : null}

        {mode === 'register' && role === 'advertiser' ? (
          <>
            <label className="grid gap-2 text-sm font-medium text-ink">
              Название компании
              <input
                name="companyName"
                required
                minLength={2}
                maxLength={160}
                autoComplete="organization"
                className="focus-ring h-11 rounded-md border border-line px-3 text-base text-ink"
                placeholder="ООО Компания"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink">
              ИНН{' '}
              <input
                name="inn"
                maxLength={32}
                inputMode="numeric"
                className="focus-ring h-11 rounded-md border border-line px-3 text-base text-ink"
                placeholder="7700000000"
              />
            </label>
          </>
        ) : null}

        {mode === 'register' ? (
          <>
            <CaptchaWidget onTokenChange={setCaptchaToken} resetKey={captchaResetKey} />
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-600">
              <input type="checkbox" required className="mt-1 h-4 w-4 accent-emerald-700" />
              <span>
                Я принимаю{' '}
                <Link href="/terms" className="font-medium text-signal hover:underline">
                  условия использования
                </Link>{' '}
                и{' '}
                <Link href="/privacy" className="font-medium text-signal hover:underline">
                  политику конфиденциальности
                </Link>
                .
              </span>
            </label>
          </>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={status === 'loading' || (mode === 'register' && !captchaToken)}
        className="focus-ring mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === 'loading' ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
        {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
      </button>

      {message ? (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${status === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      <p className="mt-5 text-sm text-slate-500">
        {mode === 'login' ? 'Еще нет аккаунта? ' : 'Уже есть аккаунт? '}
        <Link
          href={mode === 'login' ? '/register' : '/login'}
          className="font-medium text-mint hover:text-ink"
        >
          {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
        </Link>
      </p>
    </form>
  );
}
