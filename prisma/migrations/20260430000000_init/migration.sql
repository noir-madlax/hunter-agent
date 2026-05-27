CREATE TABLE "Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "clientCompany" TEXT,
  "roleTitle" TEXT,
  "status" TEXT NOT NULL DEFAULT 'job_brief',
  "funnelStatus" TEXT NOT NULL DEFAULT 'job_brief',
  "longlistCount" INTEGER NOT NULL DEFAULT 0,
  "screenedCount" INTEGER NOT NULL DEFAULT 0,
  "shortlistCount" INTEGER NOT NULL DEFAULT 0,
  "riskCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "JobBrief" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "rawInput" TEXT NOT NULL,
  "roleTitle" TEXT NOT NULL,
  "clientCompany" TEXT,
  "salaryBudget" TEXT,
  "reportingLine" TEXT,
  "businessContext" TEXT,
  "structuredJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "JobBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TalentPersona" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "mustHaveJson" TEXT NOT NULL,
  "niceToHaveJson" TEXT NOT NULL,
  "riskJson" TEXT NOT NULL,
  "structuredJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TalentPersona_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SearchMap" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "targetIndustriesJson" TEXT NOT NULL,
  "targetCompaniesJson" TEXT NOT NULL,
  "targetTitlesJson" TEXT NOT NULL,
  "keywordsJson" TEXT NOT NULL,
  "exclusionsJson" TEXT NOT NULL,
  "structuredJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SearchMap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Candidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT,
  "currentCompany" TEXT,
  "currentTitle" TEXT,
  "rawProfile" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'longlist',
  "externalSource" TEXT,
  "externalCandidateId" TEXT,
  "snapshotJson" TEXT,
  "funnelStatus" TEXT NOT NULL DEFAULT 'longlist',
  "addedToProjectAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Candidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ScreeningResult" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "candidateId" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "structuredJson" TEXT NOT NULL,
  "dimensionScoresJson" TEXT NOT NULL DEFAULT '{}',
  "evidenceJson" TEXT NOT NULL DEFAULT '[]',
  "risksJson" TEXT NOT NULL DEFAULT '[]',
  "missingInfoJson" TEXT NOT NULL DEFAULT '[]',
  "questionsJson" TEXT NOT NULL DEFAULT '[]',
  "modelMode" TEXT NOT NULL DEFAULT 'local_rules',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ScreeningResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RecommendationReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "candidateId" TEXT,
  "title" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "structuredJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RecommendationReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecommendationReport_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "JobBrief_projectId_key" ON "JobBrief"("projectId");
CREATE UNIQUE INDEX "TalentPersona_projectId_key" ON "TalentPersona"("projectId");
CREATE UNIQUE INDEX "SearchMap_projectId_key" ON "SearchMap"("projectId");
CREATE UNIQUE INDEX "Candidate_projectId_externalSource_externalCandidateId_key" ON "Candidate"("projectId", "externalSource", "externalCandidateId");
