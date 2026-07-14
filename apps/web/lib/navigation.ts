import { BookOpen, Code2, Gauge, HandCoins, Megaphone, ShieldCheck, Sparkles } from 'lucide-react';

export type NavigationRole = 'developer' | 'advertiser' | 'admin';

export const publicNav = [
  { href: '/', label: 'О платформе', icon: Sparkles },
  { href: '/install', label: 'Расширение', icon: Code2 },
  { href: '/docs', label: 'Помощь', icon: BookOpen },
];

export const roleNavigation = {
  developer: [
    { href: '/developer', label: 'Обзор', icon: Gauge },
    { href: '/developer/payouts', label: 'Выплаты', icon: HandCoins },
    { href: '/install', label: 'Расширение', icon: Code2 },
    { href: '/docs', label: 'Помощь', icon: BookOpen },
  ],
  advertiser: [
    { href: '/advertiser', label: 'Кампании', icon: Megaphone },
    { href: '/docs', label: 'Помощь', icon: BookOpen },
  ],
  admin: [
    { href: '/admin', label: 'Управление', icon: ShieldCheck },
    { href: '/docs', label: 'Помощь', icon: BookOpen },
  ],
} satisfies Record<NavigationRole, typeof publicNav>;

export const roleHome: Record<NavigationRole, string> = {
  developer: '/developer',
  advertiser: '/advertiser',
  admin: '/admin',
};

export const roleLabel: Record<NavigationRole, string> = {
  developer: 'Разработчик',
  advertiser: 'Рекламодатель',
  admin: 'Администратор',
};

export const legalNav = [
  { href: '/privacy', label: 'Конфиденциальность' },
  { href: '/terms', label: 'Условия использования' },
];
