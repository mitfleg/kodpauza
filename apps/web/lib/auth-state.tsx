'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiClientError, type ApiErrorPayload, apiClient } from '@/lib/api-client';

export type UserRole = 'developer' | 'advertiser' | 'admin';

export type CurrentUser = {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string | null;
  emailVerified?: boolean;
  isEmailVerified?: boolean;
  emailVerifiedAt?: string | null;
};

export const pendingVerificationEmailKey = 'kodpauza_pending_verification_email';

export function isEmailVerified(user: CurrentUser) {
  if (typeof user.emailVerified === 'boolean') return user.emailVerified;
  if (typeof user.isEmailVerified === 'boolean') return user.isEmailVerified;
  if ('emailVerifiedAt' in user) return Boolean(user.emailVerifiedAt);

  // Совместимость со старым API: раньше признак в профиле отсутствовал,
  // а доступ определялся самим фактом выдачи токена.
  return true;
}

type MeResponse = { user: CurrentUser | null };
type AuthContextValue = {
  user: CurrentUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  verificationEmail: string | null;
  error: string;
  refresh: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const storedToken = window.localStorage.getItem('kodpauza_token');
    setToken(storedToken);
    setError('');

    if (!storedToken) {
      setUser(null);
      setVerificationEmail(window.localStorage.getItem(pendingVerificationEmailKey));
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.get<MeResponse>('/v1/auth/me', { token: storedToken });
      if (!response.user || !['developer', 'advertiser', 'admin'].includes(response.user.role)) {
        throw new ApiClientError(502, { error: 'API вернул некорректный профиль.' });
      }

      if (!isEmailVerified(response.user)) {
        window.localStorage.removeItem('kodpauza_token');
        window.localStorage.setItem(pendingVerificationEmailKey, response.user.email);
        setToken(null);
        setUser(null);
        setVerificationEmail(response.user.email);
        return;
      }

      window.localStorage.removeItem(pendingVerificationEmailKey);
      setVerificationEmail(null);
      setUser(response.user);
    } catch (caught) {
      if (caught instanceof ApiClientError && [401, 403].includes(caught.status)) {
        window.localStorage.removeItem('kodpauza_token');
        setToken(null);
        setUser(null);

        const payload =
          typeof caught.payload === 'object' && caught.payload !== null
            ? (caught.payload as ApiErrorPayload)
            : undefined;
        const verificationRequired =
          payload?.verificationRequired === true ||
          payload?.code === 'EMAIL_VERIFICATION_REQUIRED' ||
          payload?.code === 'EMAIL_NOT_VERIFIED' ||
          /подтверд|verif/i.test(`${payload?.message ?? ''} ${payload?.error ?? ''}`);
        if (verificationRequired) {
          const email = payload?.email ?? window.localStorage.getItem(pendingVerificationEmailKey);
          if (email) window.localStorage.setItem(pendingVerificationEmailKey, email);
          setVerificationEmail(email);
        }
      } else {
        setError(caught instanceof Error ? caught.message : 'Не удалось проверить авторизацию.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAuthChange = () => void refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'kodpauza_token') void refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('kodpauza-auth-changed', onAuthChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('kodpauza-auth-changed', onAuthChange);
    };
  }, [refresh]);

  const logout = useCallback(() => {
    window.localStorage.removeItem('kodpauza_token');
    window.localStorage.removeItem(pendingVerificationEmailKey);
    setToken(null);
    setUser(null);
    setVerificationEmail(null);
    setError('');
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(user),
      verificationEmail,
      error,
      refresh,
      logout,
    }),
    [user, token, isLoading, verificationEmail, error, refresh, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuthState must be used inside AuthProvider.');
  return value;
}
