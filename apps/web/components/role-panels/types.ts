export type ApiError = Error & { message: string };

export type CampaignStatus = 'draft' | 'pending' | 'active' | 'paused' | 'rejected';
export type CampaignFormat = 'standard' | 'premium';
export type EventType = 'impression' | 'click';
export type FraudStatus = 'clean' | 'suspicious' | 'rejected';
export type FraudSeverity = 'low' | 'medium' | 'high';

export type DeveloperBalance = {
  balanceKopecks: number;
  totalImpressions: number;
  totalClicks: number;
  payoutStatus: string;
};

export type DeveloperPayoutStatus = 'requested' | 'paid' | 'rejected' | 'canceled';

export type DeveloperPayout = {
  id: string;
  amountKopecks: number;
  currency: string;
  status: DeveloperPayoutStatus;
  provider: string;
  externalReference?: string | null;
  reviewNote?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
  paidAt?: string | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeveloperPayoutsResponse = {
  balances: {
    availableKopecks: number;
    reservedKopecks: number;
    paidKopecks: number;
  };
  policy: {
    minAmountKopecks: number;
    maxAmountKopecks: number;
    manualReview: boolean;
  };
  payouts: DeveloperPayout[];
  pagination: Pagination;
};

export type DeveloperStatsDay = {
  date: string;
  impressions: number;
  clicks: number;
  rewardKopecks: number;
};

export type DeveloperStats = {
  days: DeveloperStatsDay[];
};

export type Campaign = {
  id: string;
  name: string;
  text: string;
  url: string;
  status: CampaignStatus | string;
  cpmKopecks: number;
  billableCpmKopecks: number;
  format: CampaignFormat;
  budgetKopecks: number;
  spentKopecks: number;
  impressionsLimit?: number | null;
  impressionsServed: number;
  clicks: number;
  createdAt?: string;
  advertiser?: {
    balanceKopecks?: number;
    user?: {
      email: string;
    };
  };
};

export type DeveloperEvent = {
  eventId: string;
  adId: string;
  type: EventType;
  createdAt?: string;
  campaign?: {
    name?: string | null;
    text?: string | null;
  } | null;
  fraudStatus: FraudStatus | string;
  rewardKopecks: number;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DeveloperEventsResponse = {
  events: DeveloperEvent[];
  pagination: Pagination;
};

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  displayName?: string | null;
  createdAt?: string;
  developerProfile?: { balanceKopecks: number } | null;
  advertiserProfile?: { companyName: string; balanceKopecks: number } | null;
};

export type AdvertiserStats = {
  campaigns: Campaign[];
  balanceKopecks: number;
  totals: { impressions: number; clicks: number; spentKopecks: number };
};

export type AdvertiserPaymentStatus = 'pending' | 'succeeded' | 'canceled' | 'failed';

export type AdvertiserPayment = {
  id: string;
  providerPaymentId?: string | null;
  amountKopecks: number;
  currency: string;
  status: AdvertiserPaymentStatus;
  confirmationUrl?: string | null;
  providerTest?: boolean | null;
  credited: boolean;
  paidAt?: string | null;
  canceledAt?: string | null;
  failureCode?: string | null;
  createdAt: string;
};

export type AdvertiserPaymentsResponse = {
  enabled: boolean;
  payments: AdvertiserPayment[];
};

export type AdminEvent = {
  id: string;
  type: EventType;
  createdAt: string;
  rewardKopecks: number;
  fraudStatus: FraudStatus | string;
  user?: {
    email: string;
  } | null;
  campaign?: {
    name: string;
  } | null;
};

export type FraudFlag = {
  id: string;
  reason: string;
  severity: FraudSeverity | string;
  createdAt: string;
  user?: {
    email: string;
  } | null;
  event?: {
    type?: EventType;
    fraudStatus?: FraudStatus | string;
  } | null;
};

export type AdminAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  admin?: {
    email: string;
  } | null;
};

export type IntegrationVersionReport = {
  id: string;
  tool: 'codex' | 'claude';
  version: string;
  supported: boolean;
  compatibilityMode: 'exact' | 'structural' | 'unsupported';
  clientVersion: string;
  editorName: string;
  reportCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt?: string | null;
};

export type AdminData = {
  funnel?: {
    stages: Array<{ id: string; label: string; value: number }>;
    days: Array<{ date: string; registrations: number; installs: number; impressions: number }>;
  };
  users?: { users: AdminUser[] };
  campaigns?: { campaigns: Campaign[] };
  events?: { events: AdminEvent[] };
  fraud?: { fraudFlags: FraudFlag[] };
  audit?: { auditLog: AdminAuditLog[] };
  integrationVersions?: { reports: IntegrationVersionReport[] };
  payments?: { payments: AdminPayment[] };
  payouts?: AdminDeveloperPayoutsResponse;
  finance?: {
    chargedKopecks: number;
    rewardedKopecks: number;
    platformMarginKopecks: number;
    creditedKopecks: number;
  };
};

export type AdminDeveloperPayout = DeveloperPayout & {
  developer: {
    user: { email: string; displayName?: string | null };
  };
};

export type AdminDeveloperPayoutsResponse = {
  payouts: AdminDeveloperPayout[];
  pagination: Pagination;
};

export type AdminPayment = Pick<
  AdvertiserPayment,
  | 'id'
  | 'providerPaymentId'
  | 'amountKopecks'
  | 'currency'
  | 'status'
  | 'providerTest'
  | 'failureCode'
  | 'paidAt'
  | 'createdAt'
> & {
  advertiser: {
    companyName: string;
    user: { email: string };
  };
};
