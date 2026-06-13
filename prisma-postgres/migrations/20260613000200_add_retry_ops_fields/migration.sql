ALTER TABLE "ShopSettings" ADD COLUMN "operationsAlertEmail" TEXT;

ALTER TABLE "GrantExecutionLock" ADD COLUMN "failureCategory" TEXT;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "lastErrorMessage" TEXT;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "retryEligibleUntil" TIMESTAMP(3);
ALTER TABLE "GrantExecutionLock" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "GrantExecutionLock" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GrantExecutionLock" ADD COLUMN "lastNotifiedAt" TIMESTAMP(3);
