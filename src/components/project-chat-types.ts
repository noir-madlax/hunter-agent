import type { JobAnalysis } from "@/lib/job-schema";

export type ProjectOption = {
  id: string;
  name: string;
  clientCompany: string | null;
  roleTitle: string | null;
  funnelStatus: string;
  longlistCount: number;
  screenedCount: number;
  shortlistCount: number;
  riskCount: number;
  updatedAt: string;
};

export type ProjectCandidate = {
  id: string;
  name: string | null;
  currentCompany: string | null;
  currentTitle: string | null;
  status: string;
  funnelStatus: string;
  externalSource?: string | null;
  externalCandidateId: string | null;
  rawProfile?: string | null;
  addedToProjectAt?: string | null;
  // Module 12 outreach lifecycle (nullable until candidate progresses)
  decisionStage?: string | null;
  outreachChannel?: string | null;
  outreachResult?: string | null;
  dropReasonCode?: string | null;
  dropReasonNote?: string | null;
  compRealityVsTarget?: string | null;
  outreachedAt?: string | null;
  lastStageChangeAt?: string | null;
  snapshot: {
    id: number;
    name?: string;
    chineseName?: string;
    englishName?: string;
    companyName?: string;
    title?: string;
    firstExperienceTitle?: string;
    matchScore?: number;
    matchReasons?: string[];
    matchConcerns?: string[];
    matchGate?: string;
    advisorTier?: string;
    scenarioEvidence?: string[];
    implicitSuccessCriteria?: string[];
    companySimilarityBreakdown?: string[];
    talentDbInsights?: string[];
    phoneVerification?: string[];
    policyTrace?: string[];
    mobile?: string;
    email?: string;
    age?: number | null;
    gender?: string;
    expectedSalary?: string;
    annualSalary?: number | null;
    notes?: string[];
    functionPath?: string;
    functionTags?: string[];
    source?: string;
    status?: string;
    consultantRank?: string;
    compensationDetail?: string;
    lastContactDate?: string;
    lastUpdateDate?: string;
    lastStatusDate?: string;
    dateAdded?: string;
    owner?: number | null;
    addedBy?: number | null;
    companyId?: number | null;
    educationCount?: number;
    experienceCount?: number;
    projectCount?: number;
    languageCount?: number;
    skillCount?: number;
    logUpdateDate?: string;
    governedSalary?: {
      rawText: string;
      annualizedTotal: number | null;
      base: {
        monthly: number;
        months: number;
        annualizedBase: number;
      } | null;
      bonus: {
        rawText: string;
        annualizedBonus: number;
      } | null;
      equity: {
        rawText: string;
        type: "options" | "rsu" | "shares" | null;
        totalValue: number | null;
        vestingYears: number | null;
        annualizedValue: number | null;
        percentage: number | null;
      } | null;
    } | null;
    governedNotes?: {
      timeline: Array<{
        id: number | string;
        dateAdded: string;
        category: string;
        rawCategory: string;
        content: string;
      }>;
      seekingStatus: "active" | "passive" | "unknown";
      extractedTags: string[];
    } | null;
    [key: string]: unknown;
  } | null;
  screening: null | {
    id: string;
    recommendation: string;
    score: number;
    modelMode: string;
    dimensionScores: Record<string, number>;
    evidence: string[];
    risks: string[];
    missingInfo: string[];
    questions: string[];
  };
};

export type CandidateProfilePayload = {
  record: NonNullable<ProjectCandidate["snapshot"]>;
  rawList: Record<string, unknown> | null;
  rawDetail: Record<string, unknown> | null;
  rawDetailSource: string | null;
  deepProfile: {
    id: number;
    selfAssessment: string;
    attachments: Array<{
      id: number | string | null;
      name: string;
      category: string;
      source: string;
      ext: string;
      dateAdded: string;
      filesize: number | null;
    }>;
    jobSubmissions: Array<{
      id: number | string | null;
      jobTitle: string;
      clientName: string;
      status: string;
      dateAdded: string;
      lastUpdateDate: string;
    }>;
    experiences: Array<{
      id: number | string | null;
      company: string;
      title: string;
      period: string;
      description: string;
    }>;
    educations: Array<{
      id: number | string | null;
      school: string;
      major: string;
      degree: string;
      period: string;
    }>;
    projects: Array<{
      id: number | string | null;
      name: string;
      role: string;
      period: string;
      description: string;
    }>;
    candidateMeta: {
      address: string;
      workStart: string;
      highestEducationRef: string;
      currentSalary: string;
      expectedSalary: string;
      positionStatus: string;
    };
    governedExperiences?: Array<{
      id: number | string | null;
      company: string;
      title: string;
      period: string;
      description: string;
    }> | null;
  } | null;
};

export type LonglistQualityReview = {
  status: "empty" | "needs_input" | "weak" | "usable" | "strong";
  summary: string;
  clientReady: ProjectCandidate[];
  phoneValidate: ProjectCandidate[];
  noiseRisks: Array<{ candidate: ProjectCandidate; reasons: string[] }>;
  missingSignals: string[];
  judgeRequests: string[];
};

export type CandidateBand = "client_ready" | "phone_validate" | "hold";
export type ScreeningBand = "advance" | "judge" | "hold";

export type ProjectReport = {
  id: string;
  candidateId: string | null;
  title: string;
  markdown: string;
  updatedAt: string;
};

export type AgentStepPayload = {
  id: string;
  skillName: string;
  status: string;
  output: unknown;
  order: number;
  completedAt: string | null;
};

export type AgentEvidencePayload = {
  id: string;
  sourceType: string;
  sourceName: string | null;
  sourceStatus: string;
  content: string;
  confidence: number;
  createdAt: string;
};

export type AgentRunPayload = {
  id: string;
  type: string;
  trigger: string;
  status: string;
  summary: string | null;
  createdAt: string;
  steps: AgentStepPayload[];
  evidences: AgentEvidencePayload[];
};

export type ProjectMemoryPayload = {
  id: string;
  role: string;
  title: string | null;
  content: string;
  source: string;
  createdAt: string;
};

export type ScoringModelVersionPayload = {
  id: string;
  version: number;
  reason: string | null;
  createdAt: string;
};

export type ProjectPayload = {
  id: string;
  name: string;
  clientCompany: string | null;
  roleTitle: string | null;
  funnelStatus: string;
  stats: {
    longlistCount: number;
    screenedCount: number;
    shortlistCount: number;
    riskCount: number;
  };
  analysis: JobAnalysis;
  candidates: ProjectCandidate[];
  reports: ProjectReport[];
  agentRuns: AgentRunPayload[];
  projectMemories: ProjectMemoryPayload[];
  scoringModelVersions: ScoringModelVersionPayload[];
};

export type ProjectInsightStreamEvent =
  | { type: "memory_saved"; project: ProjectPayload; message: string }
  | { type: "status"; step: string; message: string; mode?: string }
  | { type: "project"; project: ProjectPayload; message: string }
  | { type: "answer_delta"; delta: string }
  | { type: "done"; message: string }
  | { type: "error"; message: string };

export type AgentLoopTaskStatus = "pending" | "active" | "done" | "failed";

export type AgentLoopTask = {
  id: string;
  label: string;
  tool: string;
  status: AgentLoopTaskStatus;
  result: string;
};

export type FailedInsightRetry = {
  projectId: string;
  insight: string;
};

export type ProjectCreationStreamEvent =
  | { type: "task"; id: string; label: string; tool: string; status: Exclude<AgentLoopTaskStatus, "pending">; result?: string }
  | { type: "project_created"; projectId: string }
  | { type: "project"; project: ProjectPayload; message: string }
  | { type: "answer_delta"; delta: string; projectId: string }
  | { type: "answer"; message: string; projectId: string }
  | { type: "done"; message: string; projectId: string }
  | { type: "error"; message: string; projectId?: string };

export type FunnelStage = "job_brief" | "longlist" | "screening" | "shortlist" | "reports";

export type ConversationEntry = {
  id: string;
  content: string;
  title: string;
  time: string;
  timestamp: string;
};

export type FollowUpOption = {
  label: string;
  value: string;
};

export type FollowUpQuestion = {
  id: string;
  eyebrow: string;
  question: string;
  reason: string;
  options: FollowUpOption[];
  freeformPrompt: string;
};

export type ReasoningStepStatus = "done" | "active" | "waiting_user" | "manual_required" | "failed";

export const stageLabels: Record<string, string> = {
  job_brief: "岗位画像",
  longlist: "Longlist",
  screening: "AI 初筛",
  shortlist: "Shortlist",
  reports: "推荐报告",
};

export const APP_TIME_ZONE = "Asia/Shanghai";
export const MESSAGE_PREVIEW_MAX_LENGTH = 1200;
export const CREATION_LOOP_STORAGE_KEY = "hunter-agent:last-creation-loop";

export const recommendationWeight: Record<string, number> = {
  强烈推荐: 4,
  推荐: 3,
  谨慎推荐: 2,
  不推荐: 1,
};
