CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "autoGrantEnabled" BOOLEAN NOT NULL DEFAULT true,
    "grantRateNumerator" INTEGER NOT NULL DEFAULT 1,
    "grantRateDenominator" INTEGER NOT NULL DEFAULT 100,
    "defaultExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "manualDefaultExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ManualGrantLog" (
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

CREATE INDEX "ManualGrantLog_shop_createdAt_idx" ON "ManualGrantLog"("shop", "createdAt");
CREATE INDEX "ManualGrantLog_customerId_createdAt_idx" ON "ManualGrantLog"("customerId", "createdAt");
