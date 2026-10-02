-- CreateEnum
CREATE TYPE "ConversationSource" AS ENUM ('CAPTURE', 'MANUAL', 'REDDIT_DATA_API');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'REVIEWING', 'DRAFT_READY', 'MANUALLY_CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'CLOSED', 'IRRELEVANT');

-- CreateEnum
CREATE TYPE "WatchlistType" AS ENUM ('KEYWORD', 'COMPETITOR');

-- CreateTable
CREATE TABLE "WatchList" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WatchlistType" NOT NULL DEFAULT 'KEYWORD',
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subreddit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "watchListId" TEXT,
    "sourceType" "ConversationSource" NOT NULL,
    "sourceUrl" TEXT,
    "sourceSubreddit" TEXT,
    "text" TEXT,
    "textChars" INTEGER NOT NULL,
    "textExpiresAt" TIMESTAMP(3) NOT NULL,
    "textPurgedAt" TIMESTAMP(3),
    "title" TEXT,
    "author" TEXT,
    "summary" TEXT,
    "lastCommentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "notes" TEXT NOT NULL DEFAULT '',
    "contactedBy" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchList_workspaceId_idx" ON "WatchList"("workspaceId");

-- CreateIndex
CREATE INDEX "WatchList_workspaceId_active_idx" ON "WatchList"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_createdAt_idx" ON "Conversation"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_sourceType_idx" ON "Conversation"("workspaceId", "sourceType");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_createdAt_sourceType_idx" ON "Conversation"("workspaceId", "createdAt", "sourceType");

-- CreateIndex
CREATE INDEX "Conversation_textExpiresAt_idx" ON "Conversation"("textExpiresAt");

-- CreateIndex
CREATE INDEX "Opportunity_workspaceId_stage_idx" ON "Opportunity"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "Opportunity_workspaceId_createdAt_idx" ON "Opportunity"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_conversationId_idx" ON "Opportunity"("conversationId");

-- AddForeignKey
ALTER TABLE "WatchList" ADD CONSTRAINT "WatchList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_watchListId_fkey" FOREIGN KEY ("watchListId") REFERENCES "WatchList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactedBy_fkey" FOREIGN KEY ("contactedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
