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

CREATE TABLE IF NOT EXISTS "InviteJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "customMessage" TEXT,
    "from" TEXT,
    "tagInput" TEXT,
    "emailFilter" TEXT NOT NULL DEFAULT 'present',
    "purchaseFilter" TEXT NOT NULL DEFAULT 'all',
    "purchasedAfter" TEXT,
    "segmentQuery" TEXT,
    "previewCount" INTEGER NOT NULL DEFAULT 0,
    "previewPrecision" TEXT NOT NULL DEFAULT 'NONE',
    "previewCustomersJson" TEXT,
    "nextCursor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "queuedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "lastError" TEXT,
    "attemptedCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "billedCount" INTEGER NOT NULL DEFAULT 0,
    "lastBillingError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "InviteDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("jobId") REFERENCES "InviteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InviteJob_shop_createdAt_idx" ON "InviteJob"("shop", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "InviteDelivery_jobId_customerId_key" ON "InviteDelivery"("jobId", "customerId");
CREATE INDEX IF NOT EXISTS "InviteDelivery_jobId_status_idx" ON "InviteDelivery"("jobId", "status");

CREATE TABLE IF NOT EXISTS "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "autoGrantEnabled" BOOLEAN NOT NULL DEFAULT true,
    "grantRateNumerator" INTEGER NOT NULL DEFAULT 1,
    "grantRateDenominator" INTEGER NOT NULL DEFAULT 100,
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
