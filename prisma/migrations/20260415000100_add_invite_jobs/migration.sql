-- CreateTable
CREATE TABLE "InviteJob" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InviteDelivery" (
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
    CONSTRAINT "InviteDelivery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "InviteJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InviteJob_shop_createdAt_idx" ON "InviteJob"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InviteDelivery_jobId_customerId_key" ON "InviteDelivery"("jobId", "customerId");

-- CreateIndex
CREATE INDEX "InviteDelivery_jobId_status_idx" ON "InviteDelivery"("jobId", "status");
