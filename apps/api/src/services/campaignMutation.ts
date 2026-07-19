import type { Prisma } from '@prisma/client';

/**
 * Serializes every state/content mutation for one campaign. The lock key must
 * stay compatible with impression accounting, which uses the same namespace.
 */
export async function lockCampaignMutation(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'campaign:' + campaignId}))`;
}

export function sameCampaignRevision(current: Date, reviewed: Date): boolean {
  return current.getTime() === reviewed.getTime();
}
