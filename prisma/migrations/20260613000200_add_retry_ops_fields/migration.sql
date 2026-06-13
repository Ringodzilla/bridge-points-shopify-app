ALTER TABLE "ShopSettings" ADD COLUMN "operationsAlertEmail" TEXT;

ALTER TABLE "GrantExecutionLock" ADD COLUMN "failureCategory" TEXT;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "lastErrorMessage" TEXT;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "retryEligibleUntil" DATETIME;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "nextRetryAt" DATETIME;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "lastNotifiedAt" DATETIME;
