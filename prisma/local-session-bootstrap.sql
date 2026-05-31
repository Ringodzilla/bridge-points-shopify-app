CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

CREATE TABLE IF NOT EXISTS "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "autoGrantEnabled" BOOLEAN NOT NULL DEFAULT true,
    "grantRateNumerator" INTEGER NOT NULL DEFAULT 1,
    "grantRateDenominator" INTEGER NOT NULL DEFAULT 100,
    "defaultGrantCurrencyCode" TEXT,
    "defaultExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "manualDefaultExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "ManualGrantLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerDisplayName" TEXT,
    "amount" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "notifyCustomer" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "storeCreditAccountId" TEXT,
    "storeCreditTxnId" TEXT,
    "balanceAfterAmount" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "ManualGrantLog_shop_createdAt_idx" ON "ManualGrantLog"("shop", "createdAt");
CREATE INDEX IF NOT EXISTS "ManualGrantLog_customerId_createdAt_idx" ON "ManualGrantLog"("customerId", "createdAt");

CREATE TABLE IF NOT EXISTS "GrantExecutionLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payloadJson" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "GrantExecutionLock_shop_key_key" ON "GrantExecutionLock"("shop", "key");
CREATE INDEX IF NOT EXISTS "GrantExecutionLock_shop_sourceType_createdAt_idx" ON "GrantExecutionLock"("shop", "sourceType", "createdAt");
