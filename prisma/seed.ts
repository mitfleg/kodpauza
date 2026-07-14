import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

async function upsertUser(email: string, password: string, role: 'developer' | 'advertiser' | 'admin') {
  const passwordHash = await bcrypt.hash(password, 10);
  const emailVerifiedAt = new Date();
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, role, emailVerifiedAt },
    create: {
      email,
      passwordHash,
      role,
      emailVerifiedAt,
      displayName:
        role === 'admin' ? 'Администратор' : role === 'developer' ? 'Тестовый разработчик' : 'Рекламодатель',
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.KODPAUZA_ALLOW_LOCAL_SEED !== 'true') {
    throw new Error('Local seed is disabled in production. Set KODPAUZA_ALLOW_LOCAL_SEED=true explicitly.');
  }
  const admin = await upsertUser('admin@kodpauza.local', 'admin123456', 'admin');
  const developer = await upsertUser('dev@kodpauza.local', 'dev123456', 'developer');
  const advertiser = await upsertUser('adv@kodpauza.local', 'adv123456', 'advertiser');

  await prisma.developerProfile.upsert({
    where: { userId: developer.id },
    update: {},
    create: {
      userId: developer.id,
      installId: 'local-install-dev',
      eventSecret: crypto.randomBytes(32).toString('hex'),
    },
  });

  const advertiserCredit = await prisma.ledgerEntry.findFirst({
    where: { userId: advertiser.id, type: 'advertiser_credit' },
  });
  if (!advertiserCredit) {
    await prisma.ledgerEntry.create({
      data: {
        userId: advertiser.id,
        type: 'advertiser_credit',
        amountKopecks: 1000000,
        description: 'Стартовый тестовый баланс',
      },
    });
  }

  const advertiserProfile = await prisma.advertiserProfile.upsert({
    where: { userId: advertiser.id },
    update: { companyName: 'Тестовый рекламодатель', inn: '0000000000' },
    create: {
      userId: advertiser.id,
      companyName: 'Тестовый рекламодатель',
      inn: '0000000000',
      balanceKopecks: 1000000,
    },
  });

  await prisma.campaign.upsert({
    where: { id: 'camp_codex_active' },
    update: {
      advertiserId: advertiserProfile.id,
      status: 'active',
      text: 'Реклама: облако для разработчиков - тестовый показ',
      url: 'https://example.ru',
      cpmKopecks: 30000,
      billableCpmKopecks: 30000,
      format: 'standard',
      budgetKopecks: 1000000,
    },
    create: {
      id: 'camp_codex_active',
      advertiserId: advertiserProfile.id,
      name: 'Тестовая кампания',
      text: 'Реклама: облако для разработчиков - тестовый показ',
      url: 'https://example.ru',
      status: 'active',
      cpmKopecks: 30000,
      billableCpmKopecks: 30000,
      format: 'standard',
      budgetKopecks: 1000000,
    },
  });

  console.log(`Seed готов: ${admin.email}, ${developer.email}, ${advertiser.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
