import type {
  AgentEvidence,
  AgentRun,
  AgentStep,
  Candidate,
  JobBrief,
  Project,
  ProjectMemory,
  RecommendationReport,
  ScoringModelVersion,
  ScreeningResult,
} from "@prisma/client";

import { normalizeJobAnalysis, type JobAnalysis } from "@/lib/job-schema";
import type { PersolCandidateRecord } from "@/lib/persol-report-data";
import { prisma } from "@/lib/prisma";
import { applyRequirementGateScore, evaluateRequirementGates } from "@/lib/requirement-gates";

export const SCREENING_LIMIT = 50;

export type CandidateSnapshot = Omit<PersolCandidateRecord, "searchText">;

type CandidateWithRelations = Candidate & {
  screeningResults: ScreeningResult[];
  recommendationReports?: RecommendationReport[];
};

type ProjectWithRelations = Project & {
  jobBrief: JobBrief | null;
  talentPersona: { structuredJson: string } | null;
  searchMap: { structuredJson: string } | null;
  candidates: CandidateWithRelations[];
  recommendationReports: RecommendationReport[];
  agentRuns: Array<
    Omit<AgentRun, "inputJson" | "outputJson"> & {
      inputJson?: string;
      outputJson?: string;
      steps: AgentStep[];
      evidences: AgentEvidence[];
    }
  >;
  projectMemories: ProjectMemory[];
  scoringModelVersions: ScoringModelVersion[];
};

export type ScreeningOutput = {
  recommendation: "强烈推荐" | "推荐" | "谨慎推荐" | "不推荐";
  score: number;
  dimensionScores: Record<string, number>;
  evidence: string[];
  risks: string[];
  missingInfo: string[];
  questions: string[];
  summary: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function tokens(values: Array<string | string[] | null | undefined>) {
  return values.flatMap((value) => (Array.isArray(value) ? value : [value])).filter(Boolean).join(" ").toLowerCase();
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => needle && haystack.includes(needle.toLowerCase()));
}

function countKeywordHits(haystack: string, needles: string[]) {
  return needles.filter((needle) => needle && haystack.includes(needle.toLowerCase())).length;
}

function tokenizeSignal(value: string) {
  return value
    .split(/[,\s，、/|;；:：()（）\-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function recommendationFromScore(score: number, riskCount: number): ScreeningOutput["recommendation"] {
  if (score >= 82 && riskCount <= 1) return "强烈推荐";
  if (score >= 68) return "推荐";
  if (score >= 48) return "谨慎推荐";
  return "不推荐";
}

export function applyRequirementGateToScreening(
  analysis: JobAnalysis,
  snapshot: CandidateSnapshot,
  result: ScreeningOutput,
): ScreeningOutput {
  const gates = evaluateRequirementGates(analysis, snapshot);
  const score = applyRequirementGateScore(result.score, gates);
  const risks = uniqueStrings([...gates.concerns, ...result.risks]);
  const evidence = uniqueStrings([...gates.reasons, ...result.evidence]);
  const missingInfo = uniqueStrings([...gates.missingInfo, ...result.missingInfo]);
  const recommendation = gates.reject ? "不推荐" : recommendationFromScore(score, risks.length);

  return {
    ...result,
    recommendation,
    score,
    dimensionScores: {
      ...result.dimensionScores,
      "硬约束 Gate": gates.reject ? 0 : Math.min(100, gates.maxScore),
    },
    evidence: evidence.length ? evidence : result.evidence,
    risks,
    missingInfo: missingInfo.length ? missingInfo : result.missingInfo,
    questions: uniqueStrings([
      ...gates.missingInfo.map((item) => `请确认${item}。`),
      ...result.questions,
    ]),
    summary: `${recommendation}，综合评分 ${score}/100。${gates.hardFailures.length ? `硬约束未通过：${gates.hardFailures.join("；")}。` : result.summary}`,
  };
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function snapshotToRawProfile(snapshot: CandidateSnapshot) {
  return [
    `姓名: ${snapshot.name || snapshot.chineseName || snapshot.englishName || "未填"}`,
    `公司: ${snapshot.companyName || "未填"}`,
    `职位: ${snapshot.title || snapshot.firstExperienceTitle || "未填"}`,
    `职能路径: ${snapshot.functionPath || "未填"}`,
    `城市/地点代码: ${snapshot.cityCodes?.join("/") || "未填"} / ${snapshot.locationCodes?.join("/") || "未填"}`,
    `年龄/性别: ${snapshot.age ?? "未填"} / ${snapshot.gender || "未填"}`,
    `当前年薪: ${snapshot.annualSalary ?? "未填"}`,
    `期望薪资: ${snapshot.expectedSalary || "未填"}`,
    `来源/状态: ${snapshot.source || "未填"} / ${snapshot.status || "未填"}`,
    `备注: ${snapshot.notes?.join(" | ") || "未填"}`,
    `深度履历摘要: ${snapshot.deepProfileText?.slice(0, 3000) || "未填"}`,
  ].join("\n");
}

export function runLocalScreening(analysis: JobAnalysis, snapshot: CandidateSnapshot): ScreeningOutput {
  const persona = analysis.talentPersona;
  const roleProfile = analysis.roleProfile;
  const searchMap = analysis.searchMap;
  const job = analysis.jobBrief;
  const notes = snapshot.notes ?? [];
  const candidateText = tokens([
    snapshot.name,
    snapshot.companyName,
    snapshot.title,
    snapshot.firstExperienceTitle,
    snapshot.functionPath,
    snapshot.functionTags,
    snapshot.expectedSalary,
    notes,
    snapshot.deepProfileText,
  ]);
  const titleSignals = [...searchMap.targetTitles, job.roleTitle, ...searchMap.keywords].filter(Boolean);
  const mustHaveHits = persona.mustHave.filter((item) => includesAny(candidateText, tokenizeSignal(item)));
  const strongHits = persona.strongMatch.filter((item) => includesAny(candidateText, tokenizeSignal(item)));
  const roleProfileHardHits = roleProfile.hardConstraints.filter((item) => includesAny(candidateText, tokenizeSignal(item)));
  const roleProfileStrongHits = roleProfile.strongSignals.filter((item) => includesAny(candidateText, tokenizeSignal(item)));
  const roleProfileWeakHits = roleProfile.weakSignals.filter((item) => includesAny(candidateText, tokenizeSignal(item)));
  const roleProfileRiskHits = roleProfile.falsePositiveRisks.filter((item) => includesAny(candidateText, tokenizeSignal(item)));
  const titleMatch = includesAny(candidateText, titleSignals);
  const companyMatch = includesAny(candidateText, searchMap.targetCompanies);
  const industryMatch = includesAny(candidateText, searchMap.targetIndustries);
  const hasNotes = notes.length > 0;
  const hasCompensation = Boolean(snapshot.annualSalary || snapshot.expectedSalary);
  const hasContact = Boolean(snapshot.mobile || snapshot.email);

  const dimensions = analysis.scoringModel.dimensions.length
    ? analysis.scoringModel.dimensions
    : [
        { label: "核心职能匹配", weight: 25, signals: [job.roleTitle, ...persona.mustHave, ...roleProfile.hardConstraints] },
        { label: "业务场景与行业匹配", weight: 20, signals: [...searchMap.targetIndustries, ...searchMap.targetCompanies, ...roleProfile.sourceArchetypes] },
        { label: "关键业绩与案例证据", weight: 20, signals: [...persona.strongMatch, ...roleProfile.strongSignals, "业绩", "组织", "增长"] },
        { label: "薪酬动机与落地风险", weight: 20, signals: ["薪酬", "动机", "离职", "到岗"] },
        { label: "信息完整度与可验证性", weight: 15, signals: ["备注", "联系方式", "薪酬", "履历"] },
      ];

  const dimensionScores = Object.fromEntries(
    dimensions.map((dimension) => {
      const label = dimension.label.toLowerCase();
      const signalTokens = dimension.signals.flatMap(tokenizeSignal);
      const signalHits = countKeywordHits(candidateText, signalTokens);
      let dimensionScore = 38 + Math.min(38, signalHits * 9);

      if (/(职能|岗位|title|role|能力|专业)/i.test(label)) {
        if (titleMatch) dimensionScore += 22;
        if (mustHaveHits.length || roleProfileHardHits.length) dimensionScore += Math.min(20, (mustHaveHits.length + roleProfileHardHits.length) * 5);
      }
      if (/(行业|公司|背景|场景|生态|相似|业务)/i.test(label)) {
        if (companyMatch) dimensionScore += 18;
        if (industryMatch) dimensionScore += 14;
      }
      if (/(业绩|结果|案例|绩效|组织|变革|增长|接管|治理)/i.test(label)) {
        if (hasNotes) dimensionScore += 14;
        if (strongHits.length || roleProfileStrongHits.length) dimensionScore += Math.min(20, (strongHits.length + roleProfileStrongHits.length) * 5);
      }
      if (/(管理|领导|影响力|协同|高管|团队)/i.test(label)) {
        if (includesAny(candidateText, ["vp", "vice", "cho", "chro", "head", "director", "总裁", "总监", "负责人", "首席"])) {
          dimensionScore += 18;
        }
      }
      if (/(薪酬|动机|意愿|落地|地点|风险|到岗)/i.test(label)) {
        if (hasCompensation) dimensionScore += 14;
        if (hasNotes) dimensionScore += 10;
        if (includesAny(candidateText, ["北京", "上海", "广州", "深圳", "苏州", "杭州", "总部", "onsite", "通勤", "异地", "base"])) dimensionScore += 6;
      }
      if (/(完整|验证|信息|联系方式)/i.test(label)) {
        dimensionScore += (snapshot.companyName ? 8 : 0) + (snapshot.title ? 8 : 0) + (hasNotes ? 16 : 0) + (hasCompensation ? 12 : 0) + (hasContact ? 8 : 0);
      }

      return [dimension.label, clampScore(Math.min(94, dimensionScore))];
    }),
  );

  const totalWeight = dimensions.reduce((sum, dimension) => sum + Math.max(0, dimension.weight), 0) || dimensions.length || 1;
  const score = clampScore(
    dimensions.reduce((sum, dimension) => {
      return sum + (dimensionScores[dimension.label] ?? 0) * (Math.max(0, dimension.weight) / totalWeight);
    }, 0),
  );

  const evidence = [
    titleMatch ? `当前 title/职能与目标方向接近：${snapshot.title || snapshot.functionPath}` : "",
    companyMatch ? `公司背景命中目标公司池：${snapshot.companyName}` : "",
    industryMatch ? `候选人文本命中目标行业/场景关键词。` : "",
    mustHaveHits.length ? `命中 must-have 线索：${mustHaveHits.slice(0, 3).join("；")}` : "",
    strongHits.length ? `命中强匹配画像线索：${strongHits.slice(0, 3).join("；")}` : "",
    roleProfileHardHits.length ? `命中 roleProfile 硬约束：${roleProfileHardHits.slice(0, 3).join("；")}` : "",
    roleProfileStrongHits.length ? `命中 roleProfile 强信号：${roleProfileStrongHits.slice(0, 3).join("；")}` : "",
    roleProfileWeakHits.length ? `仅命中 roleProfile 弱信号，需继续验证：${roleProfileWeakHits.slice(0, 2).join("；")}` : "",
    hasNotes ? "存在顾问备注，可用于判断动机、薪酬或风险。" : "",
    ...dimensions
      .filter((dimension) => (dimensionScores[dimension.label] ?? 0) >= 70)
      .slice(0, 3)
      .map((dimension) => `动态评分维度「${dimension.label}」证据较强，当前分 ${dimensionScores[dimension.label]}/100。`),
  ].filter(Boolean);

  const risks = [
    !titleMatch ? "title 或职能路径未明显命中目标岗位，需要人工确认实际职责。" : "",
    !industryMatch && !companyMatch ? "公司/行业背景未明显命中目标 mapping，需要确认可迁移性。" : "",
    !hasNotes ? "缺少顾问访谈备注，动机和风险证据不足。" : "",
    !hasCompensation ? "薪酬信息不完整，无法判断预算匹配。" : "",
    !hasContact ? "联系方式不完整，触达可行性待确认。" : "",
    roleProfileRiskHits.length ? `命中 roleProfile 误伤风险：${roleProfileRiskHits.slice(0, 3).join("；")}` : "",
    ...dimensions
      .filter((dimension) => (dimensionScores[dimension.label] ?? 0) < 50)
      .slice(0, 4)
      .map((dimension) => `动态评分维度「${dimension.label}」证据不足，需要电话验证。`),
  ].filter(Boolean);

  const missingInfo = [
    !hasNotes ? "离职动机、机会意愿、到岗周期" : "",
    !hasCompensation ? "当前薪酬、期望薪酬、最低接受线" : "",
    ...roleProfile.interviewValidation.slice(0, 3),
    ...dimensions
      .filter((dimension) => (dimensionScores[dimension.label] ?? 0) < 65)
      .slice(0, 5)
      .map((dimension) => `${dimension.label} 的可验证证据`),
  ].filter(Boolean);

  const questions = [
    ...roleProfile.interviewValidation.slice(0, 4),
    ...dimensions.slice(0, 5).map((dimension) => `请用一个具体案例说明「${dimension.label}」：背景、你的动作、结果和可量化证据是什么？`),
    "当前薪酬结构、期望薪酬和可接受底线分别是多少？",
    "是否有竞业、反 offer、多流程或到岗时间风险？",
  ];

  const recommendation = recommendationFromScore(score, risks.length);
  const result = {
    recommendation,
    score,
    dimensionScores,
    evidence: evidence.length ? evidence : ["候选人基础字段可用于初步判断，但缺少强证据，需要深访确认。"],
    risks,
    missingInfo,
    questions,
    summary: `${recommendation}，综合评分 ${score}/100。${evidence[0] || "核心证据不足，需要顾问复核。"}`,
  };
  return applyRequirementGateToScreening(analysis, snapshot, result);
}

export function buildRecommendationMarkdown(
  project: ProjectWithRelations,
  candidate: CandidateWithRelations,
  screening: ScreeningResult,
) {
  const analysis = normalizeJobAnalysis(parseJson<unknown>(project.jobBrief?.structuredJson, {}));
  const snapshot = parseJson<CandidateSnapshot>(candidate.snapshotJson, {} as CandidateSnapshot);
  const structured = parseJson<ScreeningOutput>(screening.structuredJson, {} as ScreeningOutput);
  const risks = parseJson<string[]>(screening.risksJson, []);
  const evidence = parseJson<string[]>(screening.evidenceJson, []);
  const questions = parseJson<string[]>(screening.questionsJson, []);

  return `# 候选人推荐报告：${candidate.name || "未命名候选人"}

## 1. 候选人基本信息
- 姓名：${candidate.name || "未填"}
- 当前公司：${candidate.currentCompany || "未填"}
- 当前职位：${candidate.currentTitle || "未填"}
- 人才库 ID：${snapshot.id ?? "未填"}
- 当前薪酬：${snapshot.annualSalary ?? "未填"}
- 期望薪酬：${snapshot.expectedSalary || "未填"}

## 2. 推荐结论
推荐等级：${screening.recommendation}

一句话推荐理由：${structured.summary || `${screening.recommendation}，综合评分 ${screening.score}/100。`}

## 3. 核心匹配点
${evidence.map((item) => `- ${item}`).join("\n") || "- 待顾问补充候选人深访证据。"}

## 4. 风险点
${risks.map((item) => `- ${item}`).join("\n") || "- 暂无明显风险，但仍需顾问复核。"}

## 5. 面试建议
${questions.map((item) => `- ${item}`).join("\n")}

## 6. 岗位对照
- 项目：${project.name}
- 客户：${project.clientCompany || analysis.jobBrief?.clientCompany || "未填"}
- 岗位：${project.roleTitle || analysis.jobBrief?.roleTitle || "未填"}

## 7. 信息来源
- 候选人信息来自人才库快照。
- 评分与推荐等级为 AI/规则初筛结果，需要顾问复核后再对客户正式推荐。
`;
}

export function serializeProject(project: ProjectWithRelations) {
  const analysis = normalizeJobAnalysis(parseJson<unknown>(project.jobBrief?.structuredJson, {}));
  const activeCandidates = project.candidates.filter((candidate) => candidate.funnelStatus !== "archived");
  const activeLonglistCandidates = activeCandidates.filter((candidate) => candidate.funnelStatus === "longlist" && candidate.status !== "stale_scan");
  const screenedCandidates = activeCandidates.filter((candidate) => candidate.screeningResults[0]);
  const riskCount = screenedCandidates.filter((candidate) => {
    const screening = candidate.screeningResults[0];
    return (
      screening.recommendation === "谨慎推荐" ||
      parseJson<string[]>(screening.risksJson, []).length > 0 ||
      parseJson<string[]>(screening.missingInfoJson, []).length > 0
    );
  }).length;

  return {
    id: project.id,
    name: project.name,
    clientCompany: project.clientCompany,
    roleTitle: project.roleTitle,
    status: project.status,
    funnelStatus: project.funnelStatus,
    stats: {
      longlistCount: activeLonglistCandidates.length,
      screenedCount: screenedCandidates.length,
      shortlistCount: activeCandidates.filter((candidate) => candidate.funnelStatus === "shortlist").length,
      riskCount,
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    analysis,
    candidates: project.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      currentCompany: candidate.currentCompany,
      currentTitle: candidate.currentTitle,
      status: candidate.status,
      funnelStatus: candidate.funnelStatus,
      externalSource: candidate.externalSource,
      externalCandidateId: candidate.externalCandidateId,
      snapshot: parseJson<CandidateSnapshot | null>(candidate.snapshotJson, null),
      rawProfile: candidate.rawProfile,
      addedToProjectAt: candidate.addedToProjectAt,
      decisionStage: candidate.decisionStage,
      outreachChannel: candidate.outreachChannel,
      outreachResult: candidate.outreachResult,
      dropReasonCode: candidate.dropReasonCode,
      dropReasonNote: candidate.dropReasonNote,
      compRealityVsTarget: candidate.compRealityVsTarget,
      outreachedAt: candidate.outreachedAt,
      lastStageChangeAt: candidate.lastStageChangeAt,
      screening: candidate.screeningResults[0]
        ? {
            ...candidate.screeningResults[0],
            dimensionScores: parseJson<Record<string, number>>(candidate.screeningResults[0].dimensionScoresJson, {}),
            evidence: parseJson<string[]>(candidate.screeningResults[0].evidenceJson, []),
            risks: parseJson<string[]>(candidate.screeningResults[0].risksJson, []),
            missingInfo: parseJson<string[]>(candidate.screeningResults[0].missingInfoJson, []),
            questions: parseJson<string[]>(candidate.screeningResults[0].questionsJson, []),
            structured: parseJson<ScreeningOutput | null>(candidate.screeningResults[0].structuredJson, null),
          }
        : null,
    })),
    reports: project.recommendationReports.map((report) => ({
      id: report.id,
      projectId: report.projectId,
      candidateId: report.candidateId,
      title: report.title,
      markdown: report.markdown,
      structured: parseJson(report.structuredJson, null),
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    })),
    agentRuns: project.agentRuns.map((run) => ({
      id: run.id,
      type: run.type,
      trigger: run.trigger,
      status: run.status,
      summary: run.summary,
      input: parseJson(run.inputJson, {}),
      output: parseJson(run.outputJson, {}),
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      steps: run.steps.map((step) => ({
        id: step.id,
        skillName: step.skillName,
        status: step.status,
        input: parseJson(step.inputJson, {}),
        output: parseJson(step.outputJson, {}),
        order: step.order,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      })),
      evidences: run.evidences.map((evidence) => ({
        id: evidence.id,
        sourceType: evidence.sourceType,
        sourceName: evidence.sourceName,
        sourceStatus: evidence.sourceStatus,
        content: evidence.content,
        confidence: evidence.confidence,
        metadata: parseJson(evidence.metadataJson, {}),
        createdAt: evidence.createdAt,
      })),
    })),
    projectMemories: project.projectMemories.map((memory) => ({
      id: memory.id,
      role: memory.role,
      title: memory.title,
      content: memory.content,
      source: memory.source,
      createdAt: memory.createdAt,
    })),
    scoringModelVersions: project.scoringModelVersions.map((version) => ({
      id: version.id,
      version: version.version,
      reason: version.reason,
      dimensions: parseJson(version.dimensionsJson, []),
      requiredOutputs: parseJson(version.requiredOutputsJson, []),
      createdAt: version.createdAt,
    })),
  };
}

export async function getProjectWithRelations(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jobBrief: true,
      talentPersona: { select: { structuredJson: true } },
      searchMap: { select: { structuredJson: true } },
      candidates: {
        where: { funnelStatus: { not: "archived" } },
        orderBy: [{ funnelStatus: "asc" }, { addedToProjectAt: "asc" }],
        include: {
          screeningResults: { orderBy: { updatedAt: "desc" }, take: 1 },
          recommendationReports: { orderBy: { updatedAt: "desc" } },
        },
      },
      recommendationReports: { orderBy: { updatedAt: "desc" } },
      agentRuns: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          projectId: true,
          type: true,
          trigger: true,
          status: true,
          summary: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          steps: { orderBy: { order: "asc" } },
          evidences: { orderBy: { createdAt: "desc" }, take: 12 },
        },
      },
      projectMemories: { orderBy: { createdAt: "desc" }, take: 30 },
      scoringModelVersions: { orderBy: { version: "desc" }, take: 10 },
    },
  });
}

export async function refreshProjectStats(projectId: string) {
  const candidates = await prisma.candidate.findMany({
    where: { projectId, funnelStatus: { not: "archived" } },
    select: {
      id: true,
      status: true,
      funnelStatus: true,
      screeningResults: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { recommendation: true, risksJson: true, missingInfoJson: true },
      },
    },
  });
  const screened = candidates.filter((candidate) => candidate.screeningResults.length > 0);
  const riskCount = screened.filter((candidate) => {
    const screening = candidate.screeningResults[0];
    return (
      screening.recommendation === "谨慎推荐" ||
      parseJson<string[]>(screening.risksJson, []).length > 0 ||
      parseJson<string[]>(screening.missingInfoJson, []).length > 0
    );
  }).length;

  return prisma.project.update({
    where: { id: projectId },
    data: {
      longlistCount: candidates.filter((candidate) => candidate.funnelStatus === "longlist" && candidate.status !== "stale_scan").length,
      screenedCount: screened.length,
      shortlistCount: candidates.filter((candidate) => candidate.funnelStatus === "shortlist").length,
      riskCount,
      funnelStatus: candidates.some((candidate) => candidate.funnelStatus === "shortlist")
        ? "shortlist"
        : screened.length
          ? "screening"
          : candidates.length
            ? "longlist"
            : "job_brief",
    },
  });
}
