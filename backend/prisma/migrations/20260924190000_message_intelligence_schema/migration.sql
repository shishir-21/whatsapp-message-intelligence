-- Hand-edited so that existing Message rows are preserved: groups are moved
-- into their own table and string columns are converted to enums in place.

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageCategory" AS ENUM ('ROUTINE_UPDATE', 'INCIDENT', 'CHANGE_REQUEST', 'RESOURCE_UPDATE', 'QUESTION', 'IRRELEVANT');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CORRECTED');

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "whatsappGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSelected" BOOLEAN,
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- Backfill: one Group per distinct WhatsApp group id already in Message,
-- using the most recently seen group name.
INSERT INTO "Group" ("id", "whatsappGroupId", "name", "createdAt", "updatedAt")
SELECT DISTINCT ON ("groupId")
    gen_random_uuid()::text, "groupId", "groupName", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Message"
ORDER BY "groupId", "timestamp" DESC;

-- Message.groupId now points at Group.id instead of the WhatsApp group id.
UPDATE "Message" m
SET "groupId" = g."id"
FROM "Group" g
WHERE g."whatsappGroupId" = m."groupId";

-- AlterTable: Message
ALTER TABLE "Message" DROP COLUMN "groupName";

ALTER TABLE "Message" RENAME COLUMN "timestamp" TO "sentAt";

ALTER TABLE "Message" ALTER COLUMN "senderName" DROP NOT NULL;

ALTER TABLE "Message"
    ALTER COLUMN "messageType" TYPE "MessageType" USING (
        CASE lower("messageType")
            WHEN 'chat'     THEN 'TEXT'
            WHEN 'text'     THEN 'TEXT'
            WHEN 'image'    THEN 'IMAGE'
            WHEN 'video'    THEN 'VIDEO'
            WHEN 'audio'    THEN 'AUDIO'
            WHEN 'ptt'      THEN 'VOICE'
            WHEN 'voice'    THEN 'VOICE'
            WHEN 'document' THEN 'DOCUMENT'
            WHEN 'sticker'  THEN 'STICKER'
            WHEN 'location' THEN 'LOCATION'
            WHEN 'vcard'    THEN 'CONTACT'
            WHEN 'contact'  THEN 'CONTACT'
            ELSE 'OTHER'
        END
    )::"MessageType",
    ALTER COLUMN "messageType" SET DEFAULT 'TEXT';

ALTER TABLE "Message" ALTER COLUMN "processingStatus" DROP DEFAULT;
ALTER TABLE "Message"
    ALTER COLUMN "processingStatus" TYPE "ProcessingStatus" USING (
        CASE upper("processingStatus")
            WHEN 'PROCESSING' THEN 'PROCESSING'
            WHEN 'COMPLETED'  THEN 'COMPLETED'
            WHEN 'FAILED'     THEN 'FAILED'
            ELSE 'PENDING'
        END
    )::"ProcessingStatus",
    ALTER COLUMN "processingStatus" SET DEFAULT 'PENDING';

ALTER TABLE "Message"
    ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastProcessingError" TEXT,
    ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "summary" TEXT,
    "priority" "Priority",
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "requestedAction" TEXT,
    "people" TEXT[],
    "deadline" TIMESTAMP(3),
    "entities" JSONB,
    "rawOutput" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "aiAnalysisId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "reviewerName" TEXT,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalResult" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "aiAnalysisId" TEXT NOT NULL,
    "reviewId" TEXT,
    "category" "MessageCategory" NOT NULL,
    "summary" TEXT,
    "priority" "Priority",
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "requestedAction" TEXT,
    "people" TEXT[],
    "deadline" TIMESTAMP(3),
    "entities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_whatsappGroupId_key" ON "Group"("whatsappGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_isSelected_key" ON "Group"("isSelected");

-- CreateIndex
CREATE INDEX "AIAnalysis_messageId_createdAt_idx" ON "AIAnalysis"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "AIAnalysis_category_idx" ON "AIAnalysis"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Review_aiAnalysisId_key" ON "Review"("aiAnalysisId");

-- CreateIndex
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinalResult_messageId_key" ON "FinalResult"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalResult_reviewId_key" ON "FinalResult"("reviewId");

-- CreateIndex
CREATE INDEX "FinalResult_aiAnalysisId_idx" ON "FinalResult"("aiAnalysisId");

-- CreateIndex
CREATE INDEX "FinalResult_category_idx" ON "FinalResult"("category");

-- CreateIndex
CREATE INDEX "Message_groupId_sentAt_idx" ON "Message"("groupId", "sentAt");

-- CreateIndex
CREATE INDEX "Message_processingStatus_createdAt_idx" ON "Message"("processingStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_aiAnalysisId_fkey" FOREIGN KEY ("aiAnalysisId") REFERENCES "AIAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalResult" ADD CONSTRAINT "FinalResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalResult" ADD CONSTRAINT "FinalResult_aiAnalysisId_fkey" FOREIGN KEY ("aiAnalysisId") REFERENCES "AIAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalResult" ADD CONSTRAINT "FinalResult_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
