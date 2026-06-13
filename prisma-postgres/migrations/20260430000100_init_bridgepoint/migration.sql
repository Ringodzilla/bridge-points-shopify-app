CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
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
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "autoGrantEnabled" BOOLEAN NOT NULL DEFAULT true,
    "grantRateNumerator" INTEGER NOT NULL DEFAULT 1,
    "grantRateDenominator" INTEGER NOT NULL DEFAULT 100,
    "defaultGrantCurrencyCode" TEXT,
    "defaultExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "manualDefaultExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

CREATE TABLE "ManualGrantLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerDisplayName" TEXT,
    "staffUserId" TEXT NOT NULL,
    "staffEmail" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "notifyCustomer" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "storeCreditAccountId" TEXT,
    "storeCreditTxnId" TEXT,
    "balanceAfterAmount" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualGrantLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrantExecutionLock" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payloadJson" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantExecutionLock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManualGrantLog_shop_createdAt_idx" ON "ManualGrantLog"("shop", "createdAt");

CREATE INDEX "ManualGrantLog_customerId_createdAt_idx" ON "ManualGrantLog"("customerId", "createdAt");

CREATE UNIQUE INDEX "GrantExecutionLock_shop_key_key" ON "GrantExecutionLock"("shop", "key");

CREATE INDEX "GrantExecutionLock_shop_sourceType_createdAt_idx" ON "GrantExecutionLock"("shop", "sourceType", "createdAt");
