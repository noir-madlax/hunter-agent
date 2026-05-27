-- Module 12: Outreach Conversion Feedback Loop
-- Adds outreach lifecycle columns to Candidate and creates three new tables:
--   OutreachEvent     append-only state-transition log per candidate
--   PersonaVersion    immutable persona history (v1 -> v2 -> v3)
--   FeedbackLoopRun   one row per reflow event (every 5-10 drop samples)
-- SQLite has no ALTER TABLE ... ADD CONSTRAINT and no enums; values are constrained at the
-- application layer via src/lib/outreach-feedback.ts.

-- 1) Extend Candidate
ALTER TABLE "Candidate" ADD COLUMN "decisionStage" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "outreachChannel" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "outreachResult" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "dropReasonCode" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "dropReasonNote" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "compRealityVsTarget" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "outreachedAt" DATETIME;
ALTER TABLE "Candidate" ADD COLUMN "lastStageChangeAt" DATETIME;

CREATE INDEX "Candidate_projectId_decisionStage_idx" ON "Candidate"("projectId", "decisionStage");
CREATE INDEX "Candidate_projectId_dropReasonCode_idx" ON "Candidate"("projectId", "dropReasonCode");

-- 2) OutreachEvent
CREATE TABLE "OutreachEvent" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "candidateId"         TEXT NOT NULL,
  "projectId"           TEXT NOT NULL,
  "fromStage"           TEXT,
  "toStage"             TEXT NOT NULL,
  "channel"             TEXT,
  "result"              TEXT,
  "dropReasonCode"      TEXT,
  "dropReasonNote"      TEXT,
  "compRealityVsTarget" TEXT,
  "metadataJson"        TEXT NOT NULL DEFAULT '{}',
  "occurredAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OutreachEvent_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"   ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OutreachEvent_candidateId_occurredAt_idx"      ON "OutreachEvent"("candidateId", "occurredAt");
CREATE INDEX "OutreachEvent_projectId_occurredAt_idx"        ON "OutreachEvent"("projectId", "occurredAt");
CREATE INDEX "OutreachEvent_projectId_dropReasonCode_idx"    ON "OutreachEvent"("projectId", "dropReasonCode");

-- 3) FeedbackLoopRun (created before PersonaVersion because PersonaVersion FKs to it)
CREATE TABLE "FeedbackLoopRun" (
  "id"                     TEXT NOT NULL PRIMARY KEY,
  "projectId"              TEXT NOT NULL,
  "sampleSize"             INTEGER NOT NULL,
  "droppedCount"           INTEGER NOT NULL DEFAULT 0,
  "reasonDistributionJson" TEXT NOT NULL DEFAULT '{}',
  "funnelSnapshotJson"     TEXT NOT NULL DEFAULT '{}',
  "recommendedActionsJson" TEXT NOT NULL DEFAULT '[]',
  "assumptionVerdictsJson" TEXT NOT NULL DEFAULT '[]',
  "reportMarkdown"         TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'pending_review',
  "createdAt"              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              DATETIME NOT NULL,
  CONSTRAINT "FeedbackLoopRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FeedbackLoopRun_projectId_createdAt_idx" ON "FeedbackLoopRun"("projectId", "createdAt");

-- 4) PersonaVersion (immutable history; feedbackLoopRunId is unique 1:1 reverse relation)
CREATE TABLE "PersonaVersion" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "projectId"         TEXT NOT NULL,
  "version"           INTEGER NOT NULL,
  "feedbackLoopRunId" TEXT,
  "mustHaveJson"      TEXT NOT NULL,
  "niceToHaveJson"    TEXT NOT NULL,
  "riskJson"          TEXT NOT NULL,
  "structuredJson"    TEXT NOT NULL,
  "changesJson"       TEXT NOT NULL DEFAULT '[]',
  "reasoningMarkdown" TEXT,
  "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaVersion_projectId_fkey"        FOREIGN KEY ("projectId")        REFERENCES "Project"         ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "PersonaVersion_feedbackLoopRunId_fkey" FOREIGN KEY ("feedbackLoopRunId") REFERENCES "FeedbackLoopRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PersonaVersion_projectId_version_key"       ON "PersonaVersion"("projectId", "version");
CREATE UNIQUE INDEX "PersonaVersion_feedbackLoopRunId_key"        ON "PersonaVersion"("feedbackLoopRunId");
CREATE INDEX        "PersonaVersion_projectId_createdAt_idx"      ON "PersonaVersion"("projectId", "createdAt");
