import {
  Activity,
  Code2,
  FilePlus2,
  Gauge,
  HandCoins,
  LifeBuoy,
  Megaphone,
  PlugZap,
  ShieldAlert,
  Sparkles,
  UsersRound,
  WalletCards,
} from 'lucide-react';

export type NavigationRole = 'developer' | 'advertiser' | 'admin';

export const publicNav = [
  { href: '/', label: 'О платформе', icon: Sparkles },
  { href: '/for-developers', label: 'Разработчикам', icon: Code2 },
  { href: '/for-advertisers', label: 'Рекламодателям', icon: Megaphone },
  { href: '/install', label: 'Расширение', icon: PlugZap },
  { href: '/support', label: 'Поддержка', icon: LifeBuoy },
];

export const publicFooterNav = [
  ...publicNav.map(({ href, label }) => ({ href, label })),
  { href: '/docs', label: 'Помощь' },
];

export const roleNavigation = {
  developer: [
    { href: '/developer', label: 'Обзор', icon: Gauge },
    { href: '/developer/events', label: 'События', icon: Activity },
    { href: '/developer/payouts', label: 'Выплаты', icon: HandCoins },
    { href: '/developer/integration', label: 'Подключение', icon: PlugZap },
    { href: '/support', label: 'Поддержка', icon: LifeBuoy },
  ],
  advertiser: [
    { href: '/advertiser', label: 'Обзор', icon: Gauge },
    { href: '/advertiser/campaigns', label: 'Кампании', icon: Megaphone },
    { href: '/advertiser/new', label: 'Создать', icon: FilePlus2 },
    { href: '/advertiser/billing', label: 'Баланс', icon: WalletCards },
    { href: '/support', label: 'Поддержка', icon: LifeBuoy },
  ],
  admin: [
    { href: '/admin', label: 'Обзор', icon: Gauge },
    { href: '/admin/campaigns', label: 'Модерация', icon: Megaphone },
    { href: '/admin/users', label: 'Пользователи', icon: UsersRound },
    { href: '/admin/finance', label: 'Финансы', icon: WalletCards },
    { href: '/admin/security', label: 'Безопасность', icon: ShieldAlert },
    { href: '/support', label: 'Поддержка', icon: LifeBuoy },
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
