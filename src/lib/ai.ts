import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { applyExplicitJobFacts } from "@/lib/job-fact-extract";
import { headhunterSkillPrompt } from "@/lib/headhunter-skills";
import { jobAnalysisSchema, normalizeJobAnalysis, type JobAnalysis } from "@/lib/job-schema";
import type { CandidateSnapshot, ScreeningOutput } from "@/lib/project-funnel";

const openAIModel = process.env.OPENAI_MODEL || "gpt-5.2";
const deepSeekModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const deepSeekFastModel = process.env.DEEPSEEK_FAST_MODEL || "deepseek-v4-pro";
const deepSeekAnalysisModel = process.env.DEEPSEEK_ANALYSIS_MODEL || deepSeekFastModel;
const deepSeekScreeningModel = process.env.DEEPSEEK_SCREENING_MODEL || deepSeekModel;
const deepSeekTimeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 45000);
const openAITimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
const llmMaxAttempts = Math.max(1, Number(process.env.LLM_RETRY_LIMIT || process.env.JOB_ANALYSIS_RETRY_LIMIT || 3));

type AnalysisMode = "openai" | "deepseek";
type ModelMode = "openai" | "deepseek";

const screeningOutputSchema = z.object({
  recommendation: z.enum(["强烈推荐", "推荐", "谨慎推荐", "不推荐"]),
  score: z.number().int().min(0).max(100),
  dimensionScores: z.record(z.string(), z.number().min(0).max(100)),
  evidence: z.array(z.string()).min(1),
  risks: z.array(z.string()).default([]),
  missingInfo: z.array(z.string()).min(1),
  questions: z.array(z.string()).min(1),
  summary: z.string().min(1),
});

const instructions = [
  headhunterSkillPrompt,
  "你是资深猎头交付顾问，专注把客户岗位需求转成可执行搜寻策略。",
  "你的第一步必须像 Codex 客户端顾问推演：先判断岗位本体和 hiring problem，再把证据分成 core / strongPlus / adjacent / verification，最后才展开搜索。",
  "必须先输出 hunterReasoningKernel。roleNucleus 用一句话说明这个岗位到底是什么；hiringProblem 说明客户真正要解决的招聘问题。",
  "同时必须输出 roleProfile：把 JD 编译成岗位族、岗位本质、成功画像、硬约束、强信号、弱信号、误伤风险、目标来源画像和面试验证问题。roleProfile 是给 hunter agent 执行用的，不要写空泛管理词。",
  "evidenceTiers.core 只能放没有它就不像这个岗位的准入证据；talentPersona.mustHave、jobBrief.mustHave 和 intakeBuilder.structuredBrief.mustHave 必须只来自 core。",
  "evidenceTiers.strongPlus 放明显加分项；evidenceTiers.adjacent 放相邻业务上下文、可迁移场景、行业/公司/服务对象扩展；evidenceTiers.verification 放电话或客户追问验证点。",
  "不要把 adjacent context 升级为 must-have。例如业务上下文中出现 commercial、电商、用户中心、渠道、海外、OD、TA 等词时，只有和岗位核直接构成准入关系的词才能进入 core，其余必须放 adjacent 或 strongPlus。",
  "actionGate 只在缺客户公司/保密客户边界、目标岗位/职能主轴、工作地点/办公模式或客户明确硬性门槛时阻塞 Longlist。团队构成、前任原因、成功标准、当地HR配置默认是 nonBlockingGaps。",
  "searchDiscipline.primaryPool 必须从岗位核和 core 派生；expansionPool 可以来自 adjacent，但 expansion 不得替代 topRankRules。",
  "第一步不是假设客户已经给了完整JD，而是把JD、电话纪要或几个关键词需求转成结构化 intake brief，帮助顾问知道已知信息、合理推断和还要向客户收集什么。",
  "把 Deep Research 写入结果：每个公开/客户/人才库信号都要标注来源状态、岗位影响和下一步验证；每出现新人物或公司都要触发人才库扫描。",
  "把可复用 skill 写入 skillLibrary：包括岗位输入解析、组织上下文补齐、客户公司/部门 Deep Research、人才库人物/公司扫描、公司相似度研究、高匹配画像锚点与 lookalike 扩展、Longlist 自动快照、首轮电话判断模板、AI 初筛评分准备、Shortlist/推荐报告交付。",
  "每次生成或更新项目时都必须重新校准 scoringModel：根据已确认需求、待验证假设、Deep Research、人才库信号和顾问反馈决定维度新增/移除/升权/降权；不要只沿用默认数值。",
  "scoringModel.dimensions 每个维度都必须有 signals，signals 要能在候选人快照、备注、title、公司、行业或电话反馈中被验证。",
  "进入 Longlist 前必须完成基础信息 Gate：客户公司或明确保密客户、目标岗位/职能主轴、工作地点与办公模式。缺任一项时，必须把具体追问写入 companyTeamBrief.missing、companyTeamBrief.clientQuestions、intakeBuilder.collectionTasks 和 nextActions，不要假装已确认。",
  "workflowBlueprint 仅作为兼容字段；不要输出 pending 待办语义。自动执行动作应表达为已自动执行、正在执行或需人工确认。",
  "只根据用户提供的信息和合理行业推断输出，不要编造候选人事实。",
  "所有字段用中文输出；公司名、title、搜索关键词可保留英文。",
  "风险和待确认问题必须明确，不能只写岗位优点。",
].join("\n");

const jsonShape = {
  projectName: "string",
  hunterReasoningKernel: {
    roleNucleus: "string: 一句话说明岗位本体，不要堆关键词",
    hiringProblem: "string: 客户真正要解决的招聘/组织问题",
    evidenceTiers: {
      core: ["string: 准入证据，没有它就不像这个岗位；mustHave 只能来自这里"],
      strongPlus: ["string: 明显加分项，但不是准入"],
      adjacent: ["string: 相邻业务上下文、行业/公司/服务对象扩展；不能进入 must-have"],
      verification: ["string: 可电话或客户追问验证的问题"],
    },
    actionGate: {
      canStartLonglist: "boolean",
      blockingGaps: ["string: 只有缺客户/岗位主轴/base/硬门槛时才阻塞"],
      nonBlockingGaps: ["string: 可边找边验证，不影响先跑 Longlist"],
      rationale: "string",
    },
    searchDiscipline: {
      primaryPool: ["string: 第一优先搜索池，从岗位核和 core 派生"],
      expansionPool: ["string: 扩展池，从 adjacent 派生"],
      topRankRules: ["string: 进入 Top 的必要解释规则"],
      demotionRules: ["string: 只命中 adjacent 或弱证据时如何降级"],
    },
    selfCheck: {
      adjacentPromotedToMustHave: ["string: 被发现误升为 must-have 的 adjacent 项"],
      corrected: "boolean",
      notes: ["string"],
    },
  },
  roleProfile: {
    roleFamily: "operator | strategy | category | governance | hr | procurement | finance | legal | technology | commercial | general",
    roleEssence: "string: 这个岗位本质上要招什么人、解决什么问题",
    hiringProblem: "string: 客户为什么现在要招这个人",
    successProfile: ["string: 过往什么经历会高概率成功"],
    hardConstraints: ["string: 必须满足的硬约束"],
    strongSignals: ["string: 简历中出现则明显加分的证据"],
    weakSignals: ["string: 只能算弱信号、不能单独推荐的线索"],
    falsePositiveRisks: ["string: 看起来像但实际应降级或排除的履历噪音"],
    sourceArchetypes: ["string: 目标公司/路径/人群画像"],
    interviewValidation: ["string: 面试或电话必须验证的问题"],
  },
  intakeBuilder: {
    inputType: "string: JD全文 | 客户关键词 | 电话纪要 | 混合输入",
    knownSignals: ["string"],
    inferredHypotheses: ["string"],
    structuredBrief: {
      role: "string",
      clientCompany: "string",
      businessContext: "string",
      teamScope: "string",
      locationAndWorkModel: "string",
      compensation: "string",
      reportingLine: "string",
      mustHave: ["string"],
      unknowns: ["string"],
    },
    collectionTasks: ["string"],
  },
  jobBrief: {
    roleTitle: "string",
    clientCompany: "string",
    companyBackground: "string",
    businessContext: "string",
    reportingLine: "string",
    salaryBudget: "string",
    responsibilities: ["string"],
    mustHave: ["string"],
    niceToHave: ["string"],
    exclusions: ["string"],
    softSignals: ["string"],
    openQuestions: ["string"],
  },
  companyTeamBrief: {
    confirmed: ["string"],
    missing: ["string"],
    clientQuestions: ["string"],
  },
  talentPersona: {
    summary: "string",
    mustHave: ["string"],
    strongMatch: ["string"],
    riskSignals: ["string"],
    evidenceToCollect: ["string"],
  },
  searchMap: {
    targetIndustries: ["string"],
    targetCompanies: ["string"],
    targetTitles: ["string"],
    keywords: ["string"],
    excludedIndustries: ["string"],
    sourcingChannels: ["string"],
    outreachAngle: "string",
  },
  booleanSearch: {
    precise: "string",
    expanded: "string",
    excludeNoise: "string",
    platformNotes: ["string"],
  },
  sourcingGuardrails: ["string"],
  screeningPlan: {
    firstRoundOrder: ["string"],
    qualificationQuestions: ["string"],
    riskChecks: ["string"],
  },
  deepResearch: {
    operatingRules: ["string"],
    companySignals: [
      {
        name: "string",
        type: "person | company | team | market | partner | risk",
        sourceStatus: "string: 客户提供 | 已公开证实 | 人才库佐证 | AI推断 | 待确认",
        publicEvidence: "string",
        talentDbEvidence: "string",
        impact: "string",
        nextVerification: "string",
      },
    ],
    peopleNodes: [
      {
        name: "string",
        type: "person | company | team | market | partner | risk",
        sourceStatus: "string",
        publicEvidence: "string",
        talentDbEvidence: "string",
        impact: "string",
        nextVerification: "string",
      },
    ],
    talentDbScanProtocol: ["string"],
    companySimilarityMap: ["string"],
    clientQuestions: ["string"],
  },
  workflowBlueprint: [
    {
      label: "string",
      status: "done | active | waiting_user | manual_required",
      output: "string",
    },
  ],
  skillLibrary: [
    {
      name: "string",
      trigger: "string",
      output: "string",
      guardrail: "string",
    },
  ],
  scoringModel: {
    recommendationLevels: ["string"],
    dimensions: [
      {
        label: "string",
        weight: "number",
        signals: ["string"],
      },
    ],
    capPerProject: "number",
    requiredOutputs: ["string"],
  },
  deliveryWorkflow: [
    {
      label: "string",
      status: "done | active | waiting_user | manual_required",
      output: "string",
    },
  ],
  nextActions: ["string"],
};

function parseJsonAnalysis(content: string): JobAnalysis {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return jobAnalysisSchema.parse(normalizeAnalysisJson(JSON.parse(cleaned)));
}

function normalizeAnalysisJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = value as Record<string, unknown>;
  const deepResearch = draft.deepResearch;
  if (deepResearch && typeof deepResearch === "object" && !Array.isArray(deepResearch)) {
    const research = deepResearch as Record<string, unknown>;
    if (Array.isArray(research.companySignals)) {
      research.companySignals = research.companySignals.map((signal) => {
        if (!signal || typeof signal !== "object" || Array.isArray(signal)) return signal;
        const item = signal as Record<string, unknown>;
        return { ...item, type: normalizeResearchNodeType(item.type) };
      });
    }
  }
  return draft;
}

function normalizeResearchNodeType(value: unknown) {
  const raw = String(value || "").toLowerCase();
  if (["person", "company", "team", "market", "partner", "risk"].includes(raw)) return raw;
  if (/person|people|founder|gm|leader|manager|人|领导|负责人|创始人/.test(raw)) return "person";
  if (/team|department|dept|org|organization|团队|部门|组织/.test(raw)) return "team";
  if (/market|industry|business|competitor|competition|trend|市场|行业|竞品|业务/.test(raw)) return "market";
  if (/partner|channel|client|customer|dealer|supplier|合作|客户|渠道|经销|供应商/.test(raw)) return "partner";
  if (/risk|issue|gap|uncertain|风险|缺口|不确定/.test(raw)) return "risk";
  return "company";
}

function parseJsonObject(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(cleaned) as unknown;
}

function normalizeListField(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  if (typeof value === "string") return value ? [value] : [];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => (typeof item === "string" ? `${key}：${item}` : `${key}：${JSON.stringify(item)}`))
      .filter(Boolean);
  }
  return [];
}

function normalizeScreeningOutputJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = value as Record<string, unknown>;
  const dimensionScores =
    Array.isArray(draft.dimensionScores)
      ? Object.fromEntries(
          draft.dimensionScores.map((item, index) => {
            if (item && typeof item === "object" && !Array.isArray(item)) {
              const entry = item as Record<string, unknown>;
              const label = String(entry.label || entry.name || entry.dimension || `维度${index + 1}`);
              const score = typeof entry.score === "number" ? Math.round(entry.score) : Number(entry.score) || 0;
              return [label, score];
            }
            return [`维度${index + 1}`, typeof item === "number" ? Math.round(item) : Number(item) || 0];
          }),
        )
      : draft.dimensionScores && typeof draft.dimensionScores === "object"
      ? Object.fromEntries(
          Object.entries(draft.dimensionScores as Record<string, unknown>).map(([key, item]) => [
            key,
            typeof item === "number" ? Math.round(item) : Number(item) || 0,
          ]),
        )
      : draft.dimensionScores;
  const missingInfo = normalizeListField(draft.missingInfo);
  const questions = normalizeListField(draft.questions);
  return {
    ...draft,
    score: typeof draft.score === "number" ? Math.round(draft.score) : draft.score,
    dimensionScores,
    evidence: normalizeListField(draft.evidence),
    risks: normalizeListField(draft.risks),
    missingInfo: missingInfo.length ? missingInfo : ["请电话验证核心经历、动机、薪酬、地点和可到岗风险。"],
    questions: questions.length ? questions : ["请电话验证核心经历、动机、薪酬、地点和可到岗风险。"],
  };
}

function candidateSnapshotPrompt(snapshot: CandidateSnapshot) {
  return [
    `人才库 ID: ${snapshot.id ?? "未填"}`,
    `姓名: ${snapshot.name || snapshot.chineseName || snapshot.englishName || "未填"}`,
    `公司: ${snapshot.companyName || "未填"}`,
    `职位: ${snapshot.title || snapshot.firstExperienceTitle || "未填"}`,
    `职能路径: ${snapshot.functionPath || "未填"}`,
    `职能标签: ${snapshot.functionTags?.join(" / ") || "未填"}`,
    `城市/地点代码: ${snapshot.cityCodes?.join("/") || "未填"} / ${snapshot.locationCodes?.join("/") || "未填"}`,
    `年龄/性别: ${snapshot.age ?? "未填"} / ${snapshot.gender || "未填"}`,
    `当前年薪: ${snapshot.annualSalary ?? "未填"}`,
    `期望薪资: ${snapshot.expectedSalary || "未填"}`,
    `来源/状态: ${snapshot.source || "未填"} / ${snapshot.status || "未填"}`,
    `联系方式: ${snapshot.mobile || snapshot.email ? "有" : "缺失"}`,
    `备注: ${snapshot.notes?.join(" | ") || "未填"}`,
    `深度履历摘要: ${snapshot.deepProfileText?.slice(0, 5000) || "未填"}`,
  ].join("\n");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slimModeInstruction(rawInput: string) {
  const compact = rawInput.replace(/\s+/g, "");
  const missingCoreSignals = [
    !/公司|客户|client|company/i.test(rawInput),
    !/地点|base|城市|location|onsite|remote|办公/i.test(rawInput),
    !/薪|预算|package|salary|comp/i.test(rawInput),
    !/职责|负责|岗位|role|function|职能|title/i.test(rawInput),
  ].filter(Boolean).length;

  if (compact.length >= 100 && missingCoreSignals < 2) return "";

  return [
    "【Slim Mode 已自动触发】",
    "当前输入信息不足，不得假装完成完整 6 Stage JD pipeline。",
    "请输出完整 JSON shape 以兼容系统，但内容必须体现：",
    "1. hunterReasoningKernel 做 Stage 1-lite：仅基于少量线索反推岗位核和可验证假设。",
    "2. companyTeamBrief.missing/clientQuestions 和 nextActions 给 3-5 个选择题式追问。",
    "3. hunterReasoningKernel.actionGate.canStartLonglist 必须为 false，blockingGaps 写明缺客户/地点/薪酬/职能主轴中的哪几项。",
    "4. searchMap/booleanSearch 只能给草案，必须标注待验证，不得声称已完成检索或市场判断。",
    "5. Stage 3-lite 标注人才库体检风险和库盲区，不把库内 0 伪装成市场 0。",
  ].join("\n");
}

async function runLlmWithRetries<T>(provider: AnalysisMode, operation: string, task: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= llmMaxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      console.error(`${provider} ${operation} failed on attempt ${attempt}/${llmMaxAttempts}`, error);
      if (attempt < llmMaxAttempts) {
        await delay(Math.min(2000, 350 * attempt));
      }
    }
  }

  throw new Error(`${provider} ${operation} 重试 ${llmMaxAttempts} 次仍失败：${errorMessage(lastError)}`);
}

async function analyzeWithDeepSeek(rawInput: string): Promise<JobAnalysis> {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
    timeout: deepSeekTimeoutMs,
  });

  const completion = await client.chat.completions.create({
    model: deepSeekAnalysisModel,
    messages: [
      {
        role: "system",
        content: `${instructions}\n\n${slimModeInstruction(rawInput)}\n\n你必须输出合法 json，不要输出 markdown。JSON shape:\n${JSON.stringify(
          jsonShape,
          null,
          2,
        )}`,
      },
      {
        role: "user",
        content: `请解析以下客户原始需求。它可能是完整JD，也可能只是客户给的几个关键词。请先生成 hunterReasoningKernel：用 Codex 客户端顾问推演方式收束岗位核、hiring problem、证据分层、action gate 和搜索纪律；再生成 roleProfile，把 JD 编译成岗位族、岗位本质、成功画像、硬约束、强/弱信号、误伤风险、目标来源画像和面试验证问题；然后生成 intakeBuilder，把已知线索、合理假设、结构化 brief 草稿、待收集任务列清楚；再生成岗位画像、公司/团队背景补齐问题、Deep Research、人才画像、搜寻地图、Boolean Search、平台风控规则、初筛计划、评分模型、自动执行链路说明和可复用 skill。请只输出 json。\n\n${rawInput}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("DeepSeek returned empty content");
  }

  return parseJsonAnalysis(content);
}

async function analyzeWithOpenAI(rawInput: string): Promise<JobAnalysis> {
  const client = new OpenAI({ timeout: openAITimeoutMs });
  const response = await client.responses.parse({
    model: openAIModel,
    instructions: `${instructions}\n\n${slimModeInstruction(rawInput)}`,
    input: `请解析以下客户原始需求。它可能是完整JD，也可能只是客户给的几个关键词。请先生成 hunterReasoningKernel：用 Codex 客户端顾问推演方式收束岗位核、hiring problem、证据分层、action gate 和搜索纪律；再生成 roleProfile，把 JD 编译成岗位族、岗位本质、成功画像、硬约束、强/弱信号、误伤风险、目标来源画像和面试验证问题；然后生成 intakeBuilder，把已知线索、合理假设、结构化 brief 草稿、待收集任务列清楚；再生成岗位画像、公司/团队背景补齐问题、Deep Research、人才画像、搜寻地图、Boolean Search、平台风控规则、初筛计划、评分模型、自动执行链路说明和可复用 skill。\n\n${rawInput}`,
    text: {
      format: zodTextFormat(jobAnalysisSchema, "job_analysis"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI returned empty parsed output");
  }

  return response.output_parsed;
}

async function updateAnalysisWithDeepSeek(currentAnalysis: JobAnalysis, insight: string): Promise<JobAnalysis> {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
    timeout: deepSeekTimeoutMs,
  });

  const completion = await client.chat.completions.create({
    model: deepSeekAnalysisModel,
    messages: [
      {
        role: "system",
        content: `${instructions}\n\n你正在更新一个招聘项目的结构化认知。必须保留现有可靠信息，把新增客户信息写入 companyTeamBrief、deepResearch、talentPersona、searchMap、screeningPlan、scoringModel、workflowBlueprint、skillLibrary、nextActions 中相关位置。scoringModel 必须根据新增信息重新校准维度、权重和 signals。不要删除候选人事实，不要编造未验证事实。输出合法 JSON，不要 markdown。JSON shape:\n${JSON.stringify(jsonShape, null, 2)}`,
      },
      {
        role: "user",
        content: `当前项目结构化认知：\n${JSON.stringify(currentAnalysis, null, 2)}\n\n新增客户/候选人/判断信息：\n${insight}\n\n请先重算 hunterReasoningKernel 和 roleProfile，再返回更新后的完整 job analysis JSON。`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("DeepSeek returned empty content");
  return parseJsonAnalysis(content);
}

async function updateAnalysisWithOpenAI(currentAnalysis: JobAnalysis, insight: string): Promise<JobAnalysis> {
  const client = new OpenAI({ timeout: openAITimeoutMs });
  const response = await client.responses.parse({
    model: openAIModel,
    instructions: `${instructions}\n\n你正在更新一个招聘项目的结构化认知。必须保留现有可靠信息，把新增客户信息写入 companyTeamBrief、deepResearch、talentPersona、searchMap、screeningPlan、scoringModel、workflowBlueprint、skillLibrary、nextActions 中相关位置。scoringModel 必须根据新增信息重新校准维度、权重和 signals。不要删除候选人事实，不要编造未验证事实。`,
    input: `当前项目结构化认知：\n${JSON.stringify(currentAnalysis, null, 2)}\n\n新增客户/候选人/判断信息：\n${insight}\n\n请先重算 hunterReasoningKernel 和 roleProfile，再返回更新后的完整 job analysis。`,
    text: {
      format: zodTextFormat(jobAnalysisSchema, "job_analysis_update"),
    },
  });

  if (!response.output_parsed) throw new Error("OpenAI returned empty parsed output");
  return response.output_parsed;
}

async function screenCandidateWithDeepSeek(analysis: JobAnalysis, snapshot: CandidateSnapshot): Promise<ScreeningOutput> {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
    timeout: deepSeekTimeoutMs,
  });

  const completion = await client.chat.completions.create({
    model: deepSeekScreeningModel,
    messages: [
      {
        role: "system",
        content: `${headhunterSkillPrompt}\n\n你是项目 longlist 初筛评分 Agent。只评估当前候选人与当前项目的匹配度，不要编造履历事实。证据必须来自候选人快照、深度履历摘要、顾问备注或项目画像；推断必须标出信息缺口。评分时先区分「事实证据」「弱信号」「合理推断」「待验证风险」：evidence 只放可在候选人材料中看到的事实证据，risks 写弱信号/推断不足/缺失证据，questions 用来验证岗位本质是否成立。推荐等级只能是：强烈推荐 / 推荐 / 谨慎推荐 / 不推荐。必须输出合法 JSON，字段为 recommendation, score, dimensionScores, evidence, risks, missingInfo, questions, summary。`,
      },
      {
        role: "user",
        content: `项目画像和评分模型：\n${JSON.stringify(
          {
            jobBrief: analysis.jobBrief,
            roleProfile: analysis.roleProfile,
            talentPersona: analysis.talentPersona,
            searchMap: analysis.searchMap,
            deepResearch: analysis.deepResearch,
            scoringModel: analysis.scoringModel,
            screeningPlan: analysis.screeningPlan,
          },
          null,
          2,
        )}\n\n候选人快照：\n${candidateSnapshotPrompt(snapshot)}\n\n请输出完整评分 JSON。`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("DeepSeek returned empty content");
  return screeningOutputSchema.parse(normalizeScreeningOutputJson(parseJsonObject(content)));
}

async function screenCandidateWithOpenAI(analysis: JobAnalysis, snapshot: CandidateSnapshot): Promise<ScreeningOutput> {
  const client = new OpenAI({ timeout: openAITimeoutMs });
  const response = await client.responses.parse({
    model: openAIModel,
    instructions: `${headhunterSkillPrompt}\n\n你是项目 longlist 初筛评分 Agent。只评估当前候选人与当前项目的匹配度，不要编造履历事实。证据必须来自候选人快照、深度履历摘要、顾问备注或项目画像；推断必须标出信息缺口。评分时先区分「事实证据」「弱信号」「合理推断」「待验证风险」：evidence 只放可在候选人材料中看到的事实证据，risks 写弱信号/推断不足/缺失证据，questions 用来验证岗位本质是否成立。推荐等级只能是：强烈推荐 / 推荐 / 谨慎推荐 / 不推荐。`,
    input: `项目画像和评分模型：\n${JSON.stringify(
      {
        jobBrief: analysis.jobBrief,
        roleProfile: analysis.roleProfile,
        talentPersona: analysis.talentPersona,
        searchMap: analysis.searchMap,
        deepResearch: analysis.deepResearch,
        scoringModel: analysis.scoringModel,
        screeningPlan: analysis.screeningPlan,
      },
      null,
      2,
    )}\n\n候选人快照：\n${candidateSnapshotPrompt(snapshot)}\n\n请输出完整评分。`,
    text: {
      format: zodTextFormat(screeningOutputSchema, "candidate_screening"),
    },
  });

  if (!response.output_parsed) throw new Error("OpenAI returned empty parsed output");
  return response.output_parsed;
}

export async function analyzeJobBrief(rawInput: string): Promise<{
  analysis: JobAnalysis;
  mode: AnalysisMode;
}> {
  return analyzeJobBriefStrict(rawInput);
}

export async function analyzeJobBriefStrict(rawInput: string): Promise<{
  analysis: JobAnalysis;
  mode: AnalysisMode;
}> {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("未配置 LLM API Key，无法创建项目。");
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      analysis: normalizeJobAnalysis(
        applyExplicitJobFacts(await runLlmWithRetries("deepseek", "job analysis", () => analyzeWithDeepSeek(rawInput)), rawInput),
      ),
      mode: "deepseek",
    };
  }

  return {
    analysis: normalizeJobAnalysis(
      applyExplicitJobFacts(await runLlmWithRetries("openai", "job analysis", () => analyzeWithOpenAI(rawInput)), rawInput),
    ),
    mode: "openai",
  };
}

export async function updateJobAnalysisWithInsight(currentAnalysis: JobAnalysis, insight: string): Promise<{
  analysis: JobAnalysis;
  mode: AnalysisMode;
}> {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("未配置 LLM API Key，无法更新项目认知。");
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      analysis: normalizeJobAnalysis(
        applyExplicitJobFacts(
          await runLlmWithRetries("deepseek", "job analysis update", () => updateAnalysisWithDeepSeek(currentAnalysis, insight)),
          insight,
        ),
      ),
      mode: "deepseek",
    };
  }

  return {
    analysis: normalizeJobAnalysis(
      applyExplicitJobFacts(
        await runLlmWithRetries("openai", "job analysis update", () => updateAnalysisWithOpenAI(currentAnalysis, insight)),
        insight,
      ),
    ),
    mode: "openai",
  };
}

export async function screenCandidateWithModel(
  analysis: JobAnalysis,
  snapshot: CandidateSnapshot,
  localResult: ScreeningOutput,
): Promise<{
  result: ScreeningOutput;
  mode: ModelMode | "local_rules";
}> {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    // 无 LLM key — 回退到本地规则评分。README 承诺的 fallback 路径。
    return { result: localResult, mode: "local_rules" };
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      result: await runLlmWithRetries("deepseek", "candidate screening", () => screenCandidateWithDeepSeek(analysis, snapshot)),
      mode: "deepseek",
    };
  }

  return {
    result: await runLlmWithRetries("openai", "candidate screening", () => screenCandidateWithOpenAI(analysis, snapshot)),
    mode: "openai",
  };
}
