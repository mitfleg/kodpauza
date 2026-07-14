CREATE TABLE "ExtensionSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionSession_tokenHash_key" ON "ExtensionSession"("tokenHash");
CREATE INDEX "ExtensionSession_userId_revokedAt_expiresAt_idx" ON "ExtensionSession"("userId", "revokedAt", "expiresAt");

ALTER TABLE "ExtensionSession"
ADD CONSTRAINT "ExtensionSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
