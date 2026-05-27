import { buildRequirementPolicy } from "@/lib/headhunter-policy";
import { normalizeJobAnalysis, type JobAnalysis } from "@/lib/job-schema";
import { scanProjectLonglist } from "@/lib/longlist-scan";
import { getPersolReportData, type PersolCandidateRecord } from "@/lib/persol-report-data";
import { policyCalibrationSummary } from "@/lib/policy-calibration";
import { getProjectWithRelations, serializeProject } from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";

type RunTrigger = "project_created" | "project_updated" | "manual_rescan" | "case_simulation";
type OrchestrationResult = {
  runId: string | null;
  status: "done" | "blocked" | "skipped";
  summary: string;
  missingBasicInfo?: string[];
};

const ORCHESTRATION_STALE_LOCK_MS = 15 * 60 * 1000;
const DEFAULT_AGENT_RUN_KEEP = 50;
const DEFAULT_AGENT_RUN_KEEP_FULL_OUTPUT = 8;
const DEFAULT_AGENT_RUN_OUTPUT_MAX_BYTES = 200_000;

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function envInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function reserveOrchestrationRun(projectId: string, trigger: RunTrigger, input: string | object) {
  const staleBefore = new Date(Date.now() - ORCHESTRATION_STALE_LOCK_MS);
  await prisma.agentRun.updateMany({
    where: {
      projectId,
      type: "pre_screening_orchestration",
      status: "active",
      startedAt: { lt: staleBefore },
    },
    data: {
      status: "manual_required",
      summary: "自动运行超过 15 分钟未完成，已释放运行锁，等待重新触发。",
      completedAt: new Date(),
    },
  });

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      projectId,
      type: "pre_screening_orchestration",
      status: "active",
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  if (activeRun) {
    return {
      run: null,
      skipped: {
        runId: activeRun.id,
        status: "skipped" as const,
        summary: "已有 Longlist 刷新正在运行，已跳过本次重复触发。",
      },
    };
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId,
      type: "pre_screening_orchestration",
      trigger,
      status: "active",
      inputJson: JSON.stringify(input),
    },
  });

  return { run, skipped: null };
}

async function pruneAgentRuns(projectId: string) {
  try {
    const keepRuns = envInt("AGENT_RUN_KEEP", DEFAULT_AGENT_RUN_KEEP);
    const keepFullOutput = Math.min(keepRuns, envInt("AGENT_RUN_KEEP_FULL_OUTPUT", DEFAULT_AGENT_RUN_KEEP_FULL_OUTPUT));
    const maxOutputBytes = envInt("AGENT_RUN_OUTPUT_MAX_BYTES", DEFAULT_AGENT_RUN_OUTPUT_MAX_BYTES);

    const runsToCompact = await prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      skip: keepFullOutput,
      take: Math.max(0, keepRuns - keepFullOutput),
      select: { id: true, outputJson: true },
    });

    await Promise.all(
      runsToCompact
        .filter((run) => run.outputJson.length > maxOutputBytes)
        .map((run) =>
          prisma.agentRun.update({
            where: { id: run.id },
            data: {
              outputJson: JSON.stringify({
                pruned: true,
                reason: `AgentRun output exceeded ${maxOutputBytes} bytes and was compacted automatically.`,
              }),
            },
          }),
        ),
    );

    const runsToDelete = await prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      skip: keepRuns,
      take: 100,
      select: { id: true },
    });

    if (runsToDelete.length) {
      await prisma.agentRun.deleteMany({ where: { id: { in: runsToDelete.map((run) => run.id) } } });
    }
  } catch (error) {
    console.error("[agent-orchestrator] prune AgentRun failed", error);
  }
}

function shortList(values: string[], limit = 5) {
  return values.filter(Boolean).slice(0, limit);
}

function compactTerms(values: Array<string | string[] | null | undefined>) {
  const terms = new Set<string>();
  for (const value of values.flatMap((item) => (Array.isArray(item) ? item : [item]))) {
    for (const token of (value || "").split(/[,\s，、/|;；:：()（）\-]+/)) {
      const normalized = token.trim().toLowerCase();
      if (normalized.length >= 2) terms.add(normalized);
    }
  }
  return [...terms];
}

function sourceStatusFromConfidence(confidence: string) {
  if (/客户|确认|原文/.test(confidence)) return "confirmed";
  if (/公开|人才库|来源/.test(confidence)) return "sourced";
  return "derived";
}

function hasMeaningfulText(value: string | null | undefined) {
  const text = (value || "").trim();
  if (text.length < 2) return false;
  return !/^(待确认|未知|未填|无|n\/a|null|undefined|client company|客户公司|目标岗位|岗位待确认|role|title)$/i.test(text);
}

function assessBasicIntakeReadiness(analysis: JobAnalysis) {
  const structuredBrief = analysis.intakeBuilder.structuredBrief;
  const companyText = [analysis.jobBrief.clientCompany, structuredBrief.clientCompany, analysis.projectName].filter(Boolean).join(" ");
  const locationText = [
    structuredBrief.locationAndWorkModel,
    ...analysis.companyTeamBrief.confirmed,
    ...analysis.sourcingGuardrails,
    ...analysis.jobBrief.openQuestions,
  ]
    .filter(Boolean)
    .join(" ");

  const hasCompany = hasMeaningfulText(analysis.jobBrief.clientCompany || structuredBrief.clientCompany) || /保密客户|客户暂不披露/.test(companyText);
  const hasRole = hasMeaningfulText(analysis.jobBrief.roleTitle || structuredBrief.role);
  const hasLocation =
    hasMeaningfulText(structuredBrief.locationAndWorkModel) &&
    /(上海|北京|深圳|广州|广州市|杭州|苏州|南京|成都|武汉|西安|厦门|佛山|东莞|天津|重庆|香港|新加坡|德国|西班牙|欧洲|美国|海外|base|工作地|工作地点|地点|办公|onsite|hybrid|remote|远程|全国|可异地|外派|出差)/i.test(locationText);

  const missing: string[] = [];
  const questions: string[] = [];
  if (!hasCompany) {
    missing.push("客户公司");
    questions.push("客户公司是否可以确认？如果保密，请明确写「保密客户，先按行业/业务场景推进」。");
  }
  if (!hasRole) {
    missing.push("目标岗位");
    questions.push("目标岗位名称或职能主轴是什么？例如 HRBP、商业BP、海外HRBP、TA、OD 等。");
  }
  if (!hasLocation) {
    missing.push("工作地点/办公模式");
    questions.push("岗位实际 base 城市和办公模式是什么？例如 广州 onsite、上海 hybrid、远程、全国可异地。");
  }

  return {
    ready: missing.length === 0,
    missing,
    questions,
  };
}

export async function appendProjectMemory(projectId: string, content: string, role = "user", title?: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  return prisma.projectMemory.create({
    data: {
      projectId,
      role,
      title: title || (role === "user" ? "用户输入" : "Agent 输出"),
      content: trimmed,
      source: "conversation",
    },
  });
}

async function addStep(
  runId: string,
  order: number,
  skillName: string,
  output: unknown,
  input: unknown = {},
  status = "done",
) {
  return prisma.agentStep.create({
    data: {
      runId,
      order,
      skillName,
      status,
      inputJson: JSON.stringify(input),
      outputJson: JSON.stringify(output),
      completedAt: new Date(),
    },
  });
}

async function addEvidence(
  runId: string,
  sourceType: string,
  sourceName: string,
  content: string,
  sourceStatus = "derived",
  confidence = 60,
  metadata: unknown = {},
) {
  return prisma.agentEvidence.create({
    data: {
      runId,
      sourceType,
      sourceName,
      sourceStatus,
      content,
      confidence,
      metadataJson: JSON.stringify(metadata),
    },
  });
}

async function recordScoringModelVersion(projectId: string, analysis: JobAnalysis, reason: string) {
  const latest = await prisma.scoringModelVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true, dimensionsJson: true },
  });
  const dimensionsJson = JSON.stringify(analysis.scoringModel.dimensions);
  if (latest?.dimensionsJson === dimensionsJson) return latest.version;

  const version = (latest?.version ?? 0) + 1;
  await prisma.scoringModelVersion.create({
    data: {
      projectId,
      version,
      reason,
      dimensionsJson,
      requiredOutputsJson: JSON.stringify(analysis.scoringModel.requiredOutputs),
    },
  });
  return version;
}

function deriveOrganizationContext(analysis: JobAnalysis) {
  return {
    confirmed: shortList(analysis.companyTeamBrief.confirmed, 8),
    missing: shortList(analysis.companyTeamBrief.missing, 8),
    clientQuestions: shortList(analysis.companyTeamBrief.clientQuestions, 6),
    impliedContext: shortList(
      [
        analysis.jobBrief.businessContext,
        analysis.jobBrief.reportingLine ? `汇报线：${analysis.jobBrief.reportingLine}` : "",
        analysis.jobBrief.salaryBudget ? `薪酬：${analysis.jobBrief.salaryBudget}` : "",
        ...analysis.jobBrief.softSignals,
      ],
      8,
    ),
  };
}

async function addResearchEvidence(runId: string, analysis: JobAnalysis) {
  for (const node of [...analysis.deepResearch.companySignals, ...analysis.deepResearch.peopleNodes].slice(0, 10)) {
    await addEvidence(
      runId,
      "deep_research",
      node.name,
      [node.publicEvidence, node.talentDbEvidence, node.impact, node.nextVerification].filter(Boolean).join("；") ||
        "结构化研究信号，等待进一步验证。",
      sourceStatusFromConfidence(node.sourceStatus),
      /确认|客户/.test(node.sourceStatus) ? 85 : /公开|人才库/.test(node.sourceStatus) ? 72 : 55,
      node,
    );
  }

  for (const item of analysis.deepResearch.clientQuestions.slice(0, 6)) {
    await addEvidence(runId, "client_gap", "客户待确认", item, "waiting_user", 45);
  }
}

function companySimilarity(analysis: JobAnalysis, records: PersolCandidateRecord[]) {
  const terms = compactTerms([
    analysis.searchMap.targetCompanies,
    analysis.searchMap.targetIndustries,
    analysis.deepResearch.companySimilarityMap,
    analysis.jobBrief.businessContext,
  ]);
  const counts = new Map<string, { count: number; titleHits: number }>();

  for (const record of records) {
    const company = record.companyName || "未填公司";
    const text = [record.companyName, record.title, record.functionPath, record.notes.join(" ")].join(" ").toLowerCase();
    const hits = terms.filter((term) => text.includes(term)).length;
    if (!hits) continue;
    const next = counts.get(company) ?? { count: 0, titleHits: 0 };
    next.count += 1;
    next.titleHits += hits;
    counts.set(company, next);
  }

  return [...counts.entries()]
    .map(([company, value]) => ({ company, score: value.count * 3 + value.titleHits, candidates: value.count }))
    .sort((a, b) => b.score - a.score || b.candidates - a.candidates)
    .slice(0, 12);
}

function historicalSameCompanySamples(analysis: JobAnalysis, records: PersolCandidateRecord[]) {
  const companyTerms = compactTerms([analysis.jobBrief.clientCompany]);
  const roleTerms = compactTerms([analysis.jobBrief.roleTitle, analysis.searchMap.targetTitles, analysis.searchMap.keywords]);
  if (!companyTerms.length) return [];

  return records
    .map((record) => {
      const text = [record.companyName, record.title, record.firstExperienceTitle, record.functionPath, record.notes.join(" ")].join(" ").toLowerCase();
      const companyHits = companyTerms.filter((term) => text.includes(term)).length;
      if (!companyHits) return null;
      const roleHits = roleTerms.filter((term) => text.includes(term)).length;
      return {
        id: record.id,
        name: record.name || record.chineseName || record.englishName || "未命名候选人",
        company: record.companyName || "未填公司",
        title: record.title || record.firstExperienceTitle || "未填职位",
        relevance: companyHits * 10 + roleHits * 3 + (record.hasNotes ? 2 : 0),
        use: roleHits ? "客户公司同岗/相邻岗样本" : "客户公司历史组织样本",
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 8);
}

function businessModeSimilarPool(analysis: JobAnalysis, similarity: Array<{ company: string; score: number; candidates: number }>) {
  const projectText = [
    analysis.jobBrief.businessContext,
    analysis.jobBrief.companyBackground,
    analysis.talentPersona.mustHave.join(" "),
    analysis.searchMap.targetIndustries.join(" "),
    analysis.searchMap.keywords.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const mode =
    /经销|渠道|commercial|sales|销售/.test(projectText)
      ? "渠道/销售组织"
      : /海外|出海|全球|global|oversea/.test(projectText)
        ? "全球化/出海组织"
        : /电商|直播|私域|会员|平台|运营/.test(projectText)
          ? "电商/平台运营组织"
          : /组织|od|人效|编制|岗位|变革/.test(projectText)
            ? "组织效能/变革场景"
            : "相似业务模式";

  return similarity.slice(0, 10).map((item) => ({
    ...item,
    businessMode: mode,
    reason: `${item.company} 在人才库中有 ${item.candidates} 个样本，可作为${mode}的人才迁移参照。`,
  }));
}

function marketBenchmarkCalibration(
  sameCompanySamples: Array<{ name: string; company: string; title: string; relevance: number; use: string }>,
  similarPool: Array<{ company: string; score: number; candidates: number; businessMode: string; reason: string }>,
) {
  return {
    sameCompanySampleCount: sameCompanySamples.length,
    similarCompanyCount: similarPool.length,
    benchmarkRules: [
      sameCompanySamples.length
        ? "优先读取客户公司历史同岗/相邻岗样本，理解客户实际买单画像。"
        : "客户公司历史同岗样本不足，需用相似公司与业务模式样本补齐。",
      similarPool.length
        ? "用相似公司池校准 target company、target title 和排除项。"
        : "相似公司池不足时，不扩大到泛行业关键词，需要等待客户补充场景。",
      "市场标杆只用于修正人才画像和搜索策略，不直接替代候选人事实判断。",
    ],
  };
}

function deriveLookalikeAnchors(analysis: JobAnalysis, matchedCandidates: Array<{ company: string; title: string; reasons: string[] }>) {
  const anchors = new Set<string>();
  for (const item of analysis.talentPersona.mustHave) anchors.add(item);
  for (const item of analysis.talentPersona.strongMatch) anchors.add(item);
  for (const item of matchedCandidates.slice(0, 5)) {
    if (item.title) anchors.add(item.title);
    if (item.company) anchors.add(item.company);
    for (const reason of item.reasons.slice(0, 2)) anchors.add(reason);
  }
  return [...anchors].filter(Boolean).slice(0, 12);
}

type AuditCandidateSnapshot = {
  matchScore?: number;
  matchReasons?: string[];
  matchConcerns?: string[];
  matchGate?: string;
  advisorTier?: string;
  scenarioEvidence?: string[];
  talentDbInsights?: string[];
  comparisonRank?: number;
  comparisonVerdict?: string;
  differentiators?: string[];
  tradeoffs?: string[];
  policyTrace?: string[];
};

type AuditCandidate = {
  name?: string | null;
  currentCompany?: string | null;
  currentTitle?: string | null;
  snapshot?: unknown;
};

function auditLonglistQuality(project: { candidates?: AuditCandidate[] } | null) {
  const candidates = project?.candidates ?? [];
  const top = candidates
    .slice()
    .sort((a, b) => {
      const aSnapshot = a.snapshot as AuditCandidateSnapshot | null | undefined;
      const bSnapshot = b.snapshot as AuditCandidateSnapshot | null | undefined;
      return (bSnapshot?.matchScore ?? 0) - (aSnapshot?.matchScore ?? 0);
    })
    .slice(0, 20);

  const clientReady = top.filter((candidate) => {
    const snapshot = candidate.snapshot as AuditCandidateSnapshot | null | undefined;
    return snapshot?.advisorTier === "client_ready" || snapshot?.matchGate === "strong_fit";
  });
  const phoneValidate = top.filter((candidate) => {
    const snapshot = candidate.snapshot as AuditCandidateSnapshot | null | undefined;
    return snapshot?.advisorTier === "phone_validate" || snapshot?.matchGate === "fit";
  });
  const noiseRisks = top
    .map((candidate) => {
      const snapshot = candidate.snapshot as AuditCandidateSnapshot | null | undefined;
      const text = [
        candidate.name,
        candidate.currentCompany,
        candidate.currentTitle,
        snapshot?.matchReasons,
        snapshot?.matchConcerns,
        snapshot?.scenarioEvidence,
        snapshot?.talentDbInsights,
        snapshot?.differentiators,
        snapshot?.tradeoffs,
        snapshot?.policyTrace,
      ]
        .flat()
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const isClientReady = snapshot?.advisorTier === "client_ready" || snapshot?.matchGate === "strong_fit";
      const reasons = [
        (snapshot?.matchScore ?? 0) >= 85 &&
        ((snapshot?.scenarioEvidence?.length ?? 0) + (snapshot?.talentDbInsights?.length ?? 0)) < 2
          ? "高分但场景证据不足"
          : "",
        /行政|秘书|总助|纯招聘|talent acquisition|recruiting|ssc|薪酬核算|培训\/组织咨询|培训咨询/.test(text) ? "命中常见噪音职能" : "",
        /不应排高|噪音|准入未通过|不应直接推荐|完全不适合|移出|降级/.test(text) ||
        (!isClientReady && /偏离|更像/.test(text))
          ? "policy trace 已提示降级或复核"
          : "",
        snapshot?.advisorTier === "watchlist" ? "当前只是 watchlist" : "",
      ].filter(Boolean);
      return { name: candidate.name || "未命名候选人", reasons };
    })
    .filter((item) => item.reasons.length);

  const status =
    !top.length ? "waiting_user" : clientReady.length >= 10 && noiseRisks.length <= 2 ? "done" : clientReady.length >= 4 ? "manual_required" : "manual_required";
  const summary =
    !top.length
      ? "Longlist 暂无候选人，需要更多可扫描信号。"
      : clientReady.length >= 5 && noiseRisks.length <= 1
        ? `Top20 中 ${clientReady.length} 人接近客户可看，噪音风险 ${noiseRisks.length} 个。`
        : `Top20 中 ${clientReady.length} 人接近客户可看，${phoneValidate.length} 人需电话验证，噪音风险 ${noiseRisks.length} 个。`;

  return {
    status,
    summary,
    topCount: top.length,
    clientReady: clientReady.map((candidate) => candidate.name || "未命名候选人"),
    phoneValidate: phoneValidate.map((candidate) => candidate.name || "未命名候选人"),
    comparisons: top.slice(0, 10).map((candidate) => {
      const snapshot = candidate.snapshot as AuditCandidateSnapshot | null | undefined;
      return {
        rank: snapshot?.comparisonRank,
        name: candidate.name || "未命名候选人",
        verdict: snapshot?.comparisonVerdict,
        differentiators: snapshot?.differentiators ?? [],
        tradeoffs: snapshot?.tradeoffs ?? [],
      };
    }),
    noiseRisks: noiseRisks.slice(0, 5),
  };
}

export async function orchestrateProjectToLonglist(projectId: string, trigger: RunTrigger, input: string | object = {}): Promise<OrchestrationResult | null> {
  const project = await getProjectWithRelations(projectId);
  if (!project || !project.jobBrief) return null;

  const analysis = normalizeJobAnalysis(parseJson<unknown>(project.jobBrief.structuredJson, {}));
  const reservation = await reserveOrchestrationRun(projectId, trigger, input);
  if (reservation.skipped) return reservation.skipped;

  const run = reservation.run;
  if (!run) return null;

  try {
    const scoringVersion = await recordScoringModelVersion(projectId, analysis, trigger === "project_created" ? "项目创建后的初始评分模型" : "项目认知更新后的动态评分模型");

    await addStep(run.id, 1, "岗位输入 / 客户初始需求", {
      trigger,
      input,
      memoryCount: project.projectMemories.length,
    });

    await addStep(run.id, 2, "岗位解析与结构化编辑", {
      projectName: analysis.projectName,
      clientCompany: analysis.jobBrief.clientCompany,
      roleTitle: analysis.jobBrief.roleTitle,
      missing: analysis.companyTeamBrief.missing,
    });

    const intakeGate = assessBasicIntakeReadiness(analysis);
    if (!intakeGate.ready) {
      await addStep(run.id, 3, "基础信息完整性 Gate", {
        ready: false,
        missing: intakeGate.missing,
        requiredQuestions: intakeGate.questions,
        stopReason: "缺少基础信息，暂停 Longlist 自动扫描，等待用户补齐后再继续。",
      }, input, "waiting_user");

      const summary = `已暂停 Longlist：缺少${intakeGate.missing.join("、")}。请先补充：${intakeGate.questions.join("；")}`;
      await appendProjectMemory(projectId, summary, "agent", "Agent 基础信息追问");
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "manual_required",
          summary,
          outputJson: JSON.stringify({ intakeGate }),
          completedAt: new Date(),
        },
      });

      await pruneAgentRuns(projectId);
      return { runId: run.id, status: "blocked", summary, missingBasicInfo: intakeGate.missing };
    }

    const requirementPolicy = buildRequirementPolicy(analysis);
    const organizationContext = deriveOrganizationContext(analysis);
    await addResearchEvidence(run.id, analysis);
    await addStep(run.id, 3, "客户公司 / 部门 Deep Research", {
      rules: analysis.deepResearch.operatingRules,
      companySignals: analysis.deepResearch.companySignals.length,
      peopleNodes: analysis.deepResearch.peopleNodes.length,
      organizationContext,
      gaps: analysis.deepResearch.clientQuestions,
    });

    const { records } = await getPersolReportData();
    const similarity = companySimilarity(analysis, records);
    const sameCompanySamples = historicalSameCompanySamples(analysis, records);
    const similarPool = businessModeSimilarPool(analysis, similarity);
    const benchmarkCalibration = marketBenchmarkCalibration(sameCompanySamples, similarPool);
    await addStep(run.id, 4, "公司相似度研究", { similarCompanies: similarity });
    await addStep(run.id, 5, "客户公司历史同岗样本", {
      samples: sameCompanySamples,
      rule: "先看客户公司同岗/相邻岗历史样本，用真实买单画像校准 JD 推断。",
    });
    await addStep(run.id, 6, "竞品 / 相似公司样本", {
      samples: similarity.slice(0, 8),
      rule: "竞品和相似公司样本用于扩展目标公司，但不能替代 must-have。",
    });
    await addStep(run.id, 7, "业务模式相似公司池", {
      pool: similarPool,
      rule: "按业务模式、渠道结构、组织阶段和复杂度解释公司相似度。",
    });
    await addStep(run.id, 8, "市场标杆校准", benchmarkCalibration);
    await addStep(run.id, 9, "Codex 顾问判断 Policy", requirementPolicy);
    await addStep(run.id, 10, "Codex 裁判样本蒸馏与回归", policyCalibrationSummary, {
      trigger,
      benchmark: "npm run policy:eval",
    });
    for (const item of similarity.slice(0, 8)) {
      await addEvidence(
        run.id,
        "company_similarity",
        item.company,
        `人才库中出现 ${item.candidates} 个相关样本，相似度分 ${item.score}。`,
        "talent_db_derived",
        Math.min(86, 48 + item.score),
        item,
      );
    }

    const scan = await scanProjectLonglist(projectId, { runId: run.id, includeProject: false });
    const matches: Array<{
      id: number;
      name: string;
      company: string;
      title: string;
      score: number;
      reasons: string[];
      comparisonRank?: number;
      comparisonVerdict?: string;
      differentiators?: string[];
      tradeoffs?: string[];
    }> =
      "matches" in scan && scan.matches ? scan.matches : [];
    const anchors = deriveLookalikeAnchors(analysis, matches);
    await addStep(run.id, 11, "高匹配人才锚点", {
      anchors,
      basis: matches.slice(0, 5).map((item) => ({ name: item.name, company: item.company, title: item.title, score: item.score })),
    });
    await addStep(run.id, 12, "相似人才扩展 Lookalike Talent Expansion", {
      anchors,
      expansionRule: "Lookalike 只作为扩展搜索方向，必须回到岗位 must-have 和顾问裁判规则校验。",
    });
    await addStep(run.id, 13, "修正人才画像", {
      persona: analysis.talentPersona,
      benchmarkCalibration,
      anchors,
    });
    await addStep(run.id, 14, "生成搜索策略 / Target Company / Target Title / 排除项", {
      targetCompanies: analysis.searchMap.targetCompanies,
      targetTitles: analysis.searchMap.targetTitles,
      keywords: analysis.searchMap.keywords,
      exclusions: analysis.searchMap.excludedIndustries,
    });
    await addStep(run.id, 15, "从人才库加入 Longlist", {
      dataSource: "人才库",
      totalRecords: records.length,
      scanProtocol: analysis.deepResearch.talentDbScanProtocol,
      matched: "matched" in scan ? scan.matched : 0,
    });
    await addStep(run.id, 16, "项目内候选人快照保存", {
      added: "added" in scan ? scan.added : 0,
      updated: "updated" in scan ? scan.updated : 0,
      stale: "stale" in scan ? scan.stale : 0,
      archived: "archived" in scan ? scan.archived : 0,
      matched: "matched" in scan ? scan.matched : 0,
      stopAt: "形成可用 longlist 后停止；不自动评分。",
    });
    await addStep(run.id, 17, "Shortlist 横向比较", {
      rule: "Top 候选人按岗位本质做相互校准，输出 differentiators / tradeoffs / comparisonVerdict，避免只逐个打分。",
      comparisons: "matches" in scan && scan.matches ? scan.matches.slice(0, 10).map((item) => ({
        rank: item.comparisonRank,
        name: item.name,
        company: item.company,
        title: item.title,
        score: item.score,
        verdict: item.comparisonVerdict,
        differentiators: item.differentiators,
        tradeoffs: item.tradeoffs,
      })) : [],
    });
    await addStep(run.id, 18, "自动评分 Longlist", {
      status: "manual_required",
      reason: "当前产品边界仍要求顾问显式点击开始/重跑 AI 评分。",
      dimensions: analysis.scoringModel.dimensions,
    }, {}, "manual_required");
    const auditProject = await getProjectWithRelations(projectId);
    const longlistAudit = auditProject ? auditLonglistQuality(serializeProject(auditProject)) : null;
    if (longlistAudit) {
      await addStep(run.id, 19, "AI 排序 / Longlist 质量审计", longlistAudit, { topN: 20 }, longlistAudit.status);
      for (const risk of longlistAudit.noiseRisks.slice(0, 3)) {
        await addEvidence(
          run.id,
          "longlist_quality_audit",
          risk.name,
          `需复核：${risk.reasons.join("；")}`,
          "manual_required",
          68,
          risk,
        );
      }
    }

    const summary =
      "matched" in scan && scan.matched
        ? `已自动执行到 Longlist：人才库命中 ${scan.matched} 人，新增 ${scan.added} 人，更新 ${scan.updated} 人，本轮未进 Top50 ${scan.stale ?? 0} 人；${longlistAudit?.summary || "评分等待顾问触发。"}`
        : "已自动执行到 Longlist 扫描：当前信号不足或未命中足够候选人，等待补充客户/岗位/团队信息。";

    await appendProjectMemory(projectId, summary, "agent", "Agent 自动执行");
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "done",
        summary,
        outputJson: JSON.stringify({
          scoringVersion,
          requirementPolicy,
          scan: {
            added: "added" in scan ? scan.added : 0,
            updated: "updated" in scan ? scan.updated : 0,
            stale: "stale" in scan ? scan.stale ?? 0 : 0,
            archived: "archived" in scan ? scan.archived ?? 0 : 0,
            matched: "matched" in scan ? scan.matched : 0,
            matches: "matches" in scan ? scan.matches : [],
          },
          similarity: similarity.slice(0, 8),
          anchors,
          longlistAudit,
        }),
        completedAt: new Date(),
      },
    });
    await pruneAgentRuns(projectId);
    return { runId: run.id, status: "done", summary };
  } catch (error) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "manual_required",
        summary: error instanceof Error ? error.message : "Agent 自动链路执行失败，需要人工复核。",
        completedAt: new Date(),
      },
    });
    await pruneAgentRuns(projectId);
    throw error;
  }
}
