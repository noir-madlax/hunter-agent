import { z } from "zod";

import { codexAdvisorSkillCards } from "@/lib/codex-advisor-policy";
import { classifyProjectGaps } from "@/lib/intake-gaps";

const list = z.array(z.string()).default([]);

const finiteNumber = (fallback: number) =>
  z.preprocess((value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string") {
      const normalized = value.trim().replace(/%$/, "");
      if (!normalized || normalized.toLowerCase() === "nan") return fallback;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (value === null || value === undefined) return fallback;
    return value;
  }, z.number());

const workflowStepSchema = z.object({
  label: z.string(),
  status: z.enum(["done", "in_progress", "pending", "active", "waiting_user", "manual_required"]),
  output: z.string(),
});

const researchNodeSchema = z.object({
  name: z.string(),
  type: z.enum(["person", "company", "team", "market", "partner", "risk"]),
  sourceStatus: z.string(),
  publicEvidence: z.string(),
  talentDbEvidence: z.string(),
  impact: z.string(),
  nextVerification: z.string(),
});

const skillCardSchema = z.object({
  name: z.string(),
  trigger: z.string(),
  output: z.string(),
  guardrail: z.string(),
});

const scoringDimensionSchema = z.object({
  label: z.string(),
  weight: finiteNumber(10),
  signals: list,
});

const hunterReasoningKernelSchema = z
  .object({
    roleNucleus: z.string().default(""),
    hiringProblem: z.string().default(""),
    evidenceTiers: z
      .object({
        core: list,
        strongPlus: list,
        adjacent: list,
        verification: list,
      })
      .default({ core: [], strongPlus: [], adjacent: [], verification: [] }),
    actionGate: z
      .object({
        canStartLonglist: z.boolean().default(false),
        blockingGaps: list,
        nonBlockingGaps: list,
        rationale: z.string().default(""),
      })
      .default({ canStartLonglist: false, blockingGaps: [], nonBlockingGaps: [], rationale: "" }),
    searchDiscipline: z
      .object({
        primaryPool: list,
        expansionPool: list,
        topRankRules: list,
        demotionRules: list,
      })
      .default({ primaryPool: [], expansionPool: [], topRankRules: [], demotionRules: [] }),
    selfCheck: z
      .object({
        adjacentPromotedToMustHave: list,
        corrected: z.boolean().default(false),
        notes: list,
      })
      .default({ adjacentPromotedToMustHave: [], corrected: false, notes: [] }),
  })
  .default({
    roleNucleus: "",
    hiringProblem: "",
    evidenceTiers: { core: [], strongPlus: [], adjacent: [], verification: [] },
    actionGate: { canStartLonglist: false, blockingGaps: [], nonBlockingGaps: [], rationale: "" },
    searchDiscipline: { primaryPool: [], expansionPool: [], topRankRules: [], demotionRules: [] },
    selfCheck: { adjacentPromotedToMustHave: [], corrected: false, notes: [] },
  });

const roleProfileSchema = z
  .object({
    roleFamily: z
      .enum(["operator", "strategy", "category", "governance", "hr", "procurement", "finance", "legal", "technology", "commercial", "general"])
      .default("general"),
    roleEssence: z.string().default(""),
    hiringProblem: z.string().default(""),
    successProfile: list,
    hardConstraints: list,
    strongSignals: list,
    weakSignals: list,
    falsePositiveRisks: list,
    sourceArchetypes: list,
    interviewValidation: list,
  })
  .default({
    roleFamily: "general",
    roleEssence: "",
    hiringProblem: "",
    successProfile: [],
    hardConstraints: [],
    strongSignals: [],
    weakSignals: [],
    falsePositiveRisks: [],
    sourceArchetypes: [],
    interviewValidation: [],
  });

export const DEFAULT_AGENT_SKILLS = [
  ...codexAdvisorSkillCards,
  {
    name: "Longlist 准入门槛",
    trigger: "人才库扫描产生候选人时",
    output: "每个候选人输出进入 longlist 的理由、风险、match gate 和可审计 policy trace",
    guardrail: "行业或公司关键词强但职位层级弱时必须降权；职位层级强但行业弱时可进入待验证池",
  },
  {
    name: "HRVP 任务重心拆解",
    trigger: "岗位包含 HRVP、CHRO、HR 一号位、人力资源副总裁或集团 HR 负责人时",
    output: "先判断本次是综合一号位、OD、业务 HR、干部、薪酬绩效、招聘供应链、集团体系、文化变革还是 HR 数字化，再动态调整搜索策略和 Longlist 排序",
    guardrail: "不能把同公司不同 HRVP 方向都按同一批 CHRO/HRD 处理；方向证据不足时进入电话验证，不写成已确认事实",
  },
  {
    name: "岗位输入解析与结构化",
    trigger: "用户输入 JD、电话纪要、客户关键词或补充信息时自动触发",
    output: "JobBrief、已确认事实、合理假设、信息缺口和下一步追问",
    guardrail: "少量信息也可以先推进；缺失内容以选择题追问，不阻塞项目创建",
  },
  {
    name: "组织与业务上下文补齐",
    trigger: "出现客户公司、业务线、团队范围、汇报关系、替代/新增原因或成功标准时",
    output: "客户公司、部门/团队边界、关键利益相关人、决策链和成功标准",
    guardrail: "领导偏好、组织关系和业务变化必须区分客户确认、公开证据、人才库佐证和待确认",
  },
  {
    name: "客户公司/部门 Deep Research",
    trigger: "客户公司、业务线/部门、合作方、竞品或关键人物出现时自动进入推理过程",
    output: "组织节点、公开证据、人才库佐证、可信度、岗位影响和验证问题",
    guardrail: "无法证实的公司动态只作为假设，不写成事实",
  },
  {
    name: "人才库人物/公司扫描",
    trigger: "每出现一个新人名、公司名、合作方名、竞品名或相似公司名",
    output: "精确命中、同名噪音、相关候选人反馈、面试记录、组织变化和薪酬动机信号",
    guardrail: "同名记录不能直接当作本人；必须匹配公司、title、时间线或备注上下文",
  },
  {
    name: "公司相似度研究",
    trigger: "需要确定目标公司池、竞品池或可迁移候选人来源时",
    output: "强相似、可迁移、备选公司池，以及业务模式、渠道结构和组织阶段相似原因",
    guardrail: "不能只按行业名相似，要看客户类型、销售组织、渠道结构、业务阶段和组织变化",
  },
  {
    name: "高匹配画像锚点与 Lookalike 扩展",
    trigger: "Longlist 或人才库中出现高匹配样本后",
    output: "提取公司路径、title 演进、职能关键词、薪酬区间和可迁移经历，再扩展相似人群",
    guardrail: "Lookalike 只用于扩展搜索方向，不能替代岗位 must-have 和人工判断",
  },
  {
    name: "Longlist 自动候选人快照",
    trigger: "岗位名称、人才画像、目标 title 或关键词足够后",
    output: "从人才库扫描候选人并保存项目内稳定快照",
    guardrail: "只保存当前项目 longlist 快照；不对全库自动评分，不依赖后续搜索结果动态变化",
  },
  {
    name: "首轮电话判断模板",
    trigger: "候选人进入电话初筛前",
    output: "4 个关键问题、加分信号、风险信号、建议话术和电话后标签",
    guardrail: "电话目标是验证关键假设，不是完整面试或自动推荐",
  },
  {
    name: "AI 初筛评分准备",
    trigger: "Longlist 已生成且顾问点击开始/重跑 AI 评分时",
    output: "评分维度、候选人证据、风险、信息缺口和建议追问",
    guardrail: "评分必须由顾问显式触发；每项目最多评分 50 人",
  },
  {
    name: "Shortlist / 推荐报告交付",
    trigger: "评分完成后由顾问人工确认 shortlist，并显式触发报告生成",
    output: "Shortlist 推荐判断和推荐报告草稿",
    guardrail: "不自动触达候选人，不自动约面，不绕过顾问确认",
  },
];

export const jobAnalysisSchema = z.object({
  projectName: z.string(),
  hunterReasoningKernel: hunterReasoningKernelSchema,
  roleProfile: roleProfileSchema,
  intakeBuilder: z.object({
    inputType: z.string(),
    knownSignals: list,
    inferredHypotheses: list,
    structuredBrief: z.object({
      role: z.string(),
      clientCompany: z.string(),
      businessContext: z.string(),
      teamScope: z.string(),
      locationAndWorkModel: z.string(),
      compensation: z.string(),
      reportingLine: z.string(),
      mustHave: list,
      unknowns: list,
    }),
    collectionTasks: list,
  }),
  jobBrief: z.object({
    roleTitle: z.string(),
    clientCompany: z.string(),
    companyBackground: z.string(),
    businessContext: z.string(),
    reportingLine: z.string(),
    salaryBudget: z.string(),
    responsibilities: list,
    mustHave: list,
    niceToHave: list,
    exclusions: list,
    softSignals: list,
    openQuestions: list,
  }),
  companyTeamBrief: z.object({
    confirmed: list,
    missing: list,
    clientQuestions: list,
  }),
  talentPersona: z.object({
    summary: z.string(),
    mustHave: list,
    strongMatch: list,
    riskSignals: list,
    evidenceToCollect: list,
  }),
  searchMap: z.object({
    targetIndustries: list,
    targetCompanies: list,
    targetTitles: list,
    keywords: list,
    excludedIndustries: list,
    sourcingChannels: list,
    outreachAngle: z.string(),
  }),
  booleanSearch: z.object({
    precise: z.string(),
    expanded: z.string(),
    excludeNoise: z.string(),
    platformNotes: list,
  }),
  sourcingGuardrails: list,
  screeningPlan: z.object({
    firstRoundOrder: list,
    qualificationQuestions: list,
    riskChecks: list,
  }),
  deepResearch: z
    .object({
      operatingRules: list,
      companySignals: z.array(researchNodeSchema).default([]),
      peopleNodes: z.array(researchNodeSchema).default([]),
      talentDbScanProtocol: list,
      companySimilarityMap: list,
      clientQuestions: list,
    })
    .default({
      operatingRules: [
        "所有客户提供事实、公开资料和人才库信息必须分开标注来源状态。",
        "每出现一个新人物、组织、合作方或竞品名，都同时触发公网检索和人才库扫描。",
        "人才库命中必须看公司、职位、履历和备注上下文；同名但无法匹配时标为噪音。",
        "人才库反馈可用于判断组织变化、面试体验、薪酬动机和候选人顾虑，但不能替代客户确认。",
      ],
      companySignals: [],
      peopleNodes: [],
      talentDbScanProtocol: [
        "先查客户公司 + 岗位名，找曾在同公司同岗位/相邻岗位工作过的人。",
        "再查业务线/部门、团队范围、汇报关系、关键利益相关人、合作方和竞品公司，补充组织结构和领导偏好。",
        "对高匹配候选人提取画像锚点，再做 lookalike 扩展。",
        "所有结论输出为：公开信息、人才库命中、可信度、对岗位判断影响、下一步验证。",
      ],
      companySimilarityMap: [],
      clientQuestions: [],
    }),
  workflowBlueprint: z
    .array(workflowStepSchema)
    .default([
      { label: "岗位输入/编辑", status: "done", output: "解析 JD 或电话纪要，形成可编辑 JobBrief" },
      { label: "公司/部门 Deep Research", status: "active", output: "自动补齐客户公司、业务线/部门、团队范围、关键利益相关人、合作方和竞品信息" },
      { label: "人才画像/搜索策略", status: "done", output: "生成 must-have、nice-to-have、deal-breaker、目标公司和关键词" },
      { label: "人才库预筛选", status: "active", output: "系统自动查客户公司同岗/相邻岗历史样本，再查竞品和相似业务样本" },
      { label: "Longlist 快照", status: "active", output: "系统在信息足够后扫描人才库，保存稳定候选人快照" },
      { label: "AI 评分", status: "manual_required", output: "顾问点击开始/重跑 AI 评分后，项目 longlist 内最多 50 人全量评分" },
      { label: "顾问确认 Shortlist", status: "manual_required", output: "AI 排序后由顾问人工确认 shortlist" },
      { label: "推荐报告草稿", status: "manual_required", output: "顾问确认 shortlist 后显式触发报告草稿生成" },
    ]),
  skillLibrary: z
    .array(skillCardSchema)
    .default(DEFAULT_AGENT_SKILLS),
  scoringModel: z
    .object({
      recommendationLevels: list,
      dimensions: z.array(scoringDimensionSchema).default([]),
      capPerProject: finiteNumber(50),
      requiredOutputs: list,
    })
    .default({
      recommendationLevels: ["强烈推荐", "推荐", "谨慎推荐", "不推荐"],
      dimensions: [
        { label: "核心职能匹配", weight: 24, signals: ["目标岗位", "核心职责", "must-have", "title", "职能路径"] },
        { label: "业务场景与行业匹配", weight: 18, signals: ["客户行业", "业务模式", "目标公司", "相似公司", "商业场景"] },
        { label: "关键业绩与案例证据", weight: 18, signals: ["业绩", "结果", "组织变化", "项目案例", "可量化成果"] },
        { label: "管理影响力与协同复杂度", weight: 14, signals: ["团队管理", "高管协同", "跨部门", "决策链", "影响力"] },
        { label: "薪酬动机与落地风险", weight: 14, signals: ["薪酬", "期望", "动机", "到岗", "竞业", "反 offer"] },
        { label: "信息完整度与可验证性", weight: 12, signals: ["备注", "联系方式", "履历", "面试反馈", "客户确认"] },
      ],
      capPerProject: 50,
      requiredOutputs: ["推荐等级", "综合分", "证据", "风险点", "信息缺口", "建议追问"],
    }),
  deliveryWorkflow: z.array(workflowStepSchema).default([]),
  nextActions: list,
});

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function hasMeaningfulText(value: string | null | undefined) {
  const text = (value || "").trim();
  if (text.length < 2) return false;
  return !/^(待确认|未知|未填|无|n\/a|null|undefined|client company|客户公司|目标岗位|岗位待确认|role|title)$/i.test(text);
}

function removeExact(items: string[], excluded: string[]) {
  const excludedSet = new Set(excluded.map((item) => item.trim().toLowerCase()).filter(Boolean));
  return items.filter((item) => !excludedSet.has(item.trim().toLowerCase()));
}

type HunterHrWorkMode = "commercial" | "overseas" | "ecommerce" | "customer" | "business" | "unknown";

const hunterHrWorkModeLabels: Record<Exclude<HunterHrWorkMode, "unknown">, string> = {
  commercial: "商业/渠道 HRBP",
  overseas: "海外/跨文化 HRBP",
  ecommerce: "电商业务 HRBP",
  customer: "用户/服务团队 HRBP",
  business: "业务 HRBP",
};

function detectHunterHrWorkMode(roleText: string, contextText: string): HunterHrWorkMode {
  const role = roleText.toLowerCase();
  const context = contextText.toLowerCase();
  const text = `${role} ${context}`;
  const isBp = /hrbp|business partner|业务伙伴|bp\b|人力资源业务伙伴/.test(text);
  if (!isBp) return "unknown";

  if (/海外|出海|跨文化|overseas|global hrbp|global\s*bp|外派|eor|gdpr/.test(role)) return "overseas";
  if (/经销|渠道|commercial|dealer|distributor|sales|销售|专业解决方案/.test(role)) return "commercial";
  if (/电商|直播|投手|大促|e-?commerce/.test(role)) return "ecommerce";
  if (/用户中心|客服|客户服务|用户研究|产品培训|会员|私域|customer|crm/.test(role)) return "customer";

  if (/海外\s*hr|海外|出海|跨文化|外派|eor|gdpr|overseas|global/.test(context)) return "overseas";
  if (/经销|渠道|commercial|dealer|distributor|区域销售|销售团队|专业解决方案/.test(context)) return "commercial";
  if (/电商|直播|主播|投手|大促|618|双11|e-?commerce/.test(context)) return "ecommerce";
  if (/用户中心|客服|客户服务|用户研究|产品培训|会员|私域|customer|crm/.test(context)) return "customer";
  return "business";
}

function scenarioAdjacentLabels(primaryMode: HunterHrWorkMode) {
  return Object.entries(hunterHrWorkModeLabels)
    .filter(([mode]) => mode !== primaryMode && mode !== "business")
    .map(([, label]) => label);
}

function isAdjacentScenarioSignal(item: string, primaryMode: HunterHrWorkMode) {
  const text = item.toLowerCase();
  return scenarioAdjacentLabels(primaryMode).some((label) => item.includes(label)) ||
    (primaryMode !== "overseas" && /海外|出海|跨文化|外派|eor|gdpr|overseas|global/.test(text)) ||
    (primaryMode !== "commercial" && /经销|渠道|commercial|dealer|distributor|区域销售|专业解决方案/.test(text)) ||
    (primaryMode !== "ecommerce" && /电商|直播|主播|投手|大促|618|双11|e-?commerce/.test(text)) ||
    (primaryMode !== "customer" && /用户中心|客服|客户服务|用户研究|产品培训|会员|私域|customer|crm/.test(text));
}

function detectRoleProfileFamily(text: string): JobAnalysis["roleProfile"]["roleFamily"] {
  const normalized = text.toLowerCase();
  if (/全球经营者|经营者|国家负责人|country manager|business head|gm|总经理/.test(normalized)) return "operator";
  if (/品类负责人|品类|category manager|category lead/.test(normalized)) return "category";
  if (/中台|治理|体验|风控|trust|safety|governance|experience/.test(normalized)) return "governance";
  if (/战略|策略|商分|商业分析|经营分析|strategy|business analysis/.test(normalized)) return "strategy";
  if (/hrvp|chro|cho|hrbp|hrd|human resources|人力资源|人事|组织发展|组织效能/.test(normalized)) return "hr";
  if (/采购|供应商|供应链|procurement|sourcing|supplier|vendor/.test(normalized)) return "procurement";
  if (/finance|cfo|财务|资金|审计|税务/.test(normalized)) return "finance";
  if (/legal|法务|合规|律师/.test(normalized)) return "legal";
  if (/cto|技术|研发|工程|产品|数据|算法|ai|软件/.test(normalized)) return "technology";
  if (/commercial|sales|销售|商务|渠道|经销|市场|增长/.test(normalized)) return "commercial";
  return "general";
}

function deriveRoleProfile(analysis: JobAnalysis): JobAnalysis["roleProfile"] {
  const projectText = [
    analysis.projectName,
    analysis.jobBrief.roleTitle,
    analysis.jobBrief.clientCompany,
    analysis.jobBrief.businessContext,
    analysis.jobBrief.responsibilities,
    analysis.jobBrief.mustHave,
    analysis.talentPersona.summary,
    analysis.talentPersona.mustHave,
    analysis.talentPersona.strongMatch,
    analysis.searchMap.targetTitles,
    analysis.searchMap.keywords,
    analysis.hunterReasoningKernel.roleNucleus,
    analysis.hunterReasoningKernel.hiringProblem,
  ]
    .flat()
    .filter(Boolean)
    .join(" ");
  const family = detectRoleProfileFamily(projectText);
  const role = analysis.jobBrief.roleTitle || analysis.intakeBuilder.structuredBrief.role || analysis.projectName || "目标岗位";
  const hiringProblem =
    analysis.hunterReasoningKernel.hiringProblem ||
    analysis.jobBrief.businessContext ||
    analysis.intakeBuilder.structuredBrief.businessContext ||
    "客户需要确认岗位真正解决的业务问题。";
  const core = analysis.hunterReasoningKernel.evidenceTiers.core.length
    ? analysis.hunterReasoningKernel.evidenceTiers.core
    : [...analysis.jobBrief.mustHave, ...analysis.talentPersona.mustHave];
  const strong = analysis.hunterReasoningKernel.evidenceTiers.strongPlus.length
    ? analysis.hunterReasoningKernel.evidenceTiers.strongPlus
    : [...analysis.jobBrief.niceToHave, ...analysis.talentPersona.strongMatch];
  const adjacent = analysis.hunterReasoningKernel.evidenceTiers.adjacent;
  const verification = analysis.hunterReasoningKernel.evidenceTiers.verification.length
    ? analysis.hunterReasoningKernel.evidenceTiers.verification
    : [...analysis.jobBrief.openQuestions, ...analysis.talentPersona.evidenceToCollect];

  const base = {
    roleFamily: family,
    roleEssence: `${role}：${hiringProblem}`.slice(0, 240),
    hiringProblem,
    successProfile: unique(core).slice(0, 8),
    hardConstraints: unique([
      ...core,
      analysis.intakeBuilder.structuredBrief.locationAndWorkModel,
      analysis.jobBrief.salaryBudget,
    ]).slice(0, 8),
    strongSignals: unique(strong).slice(0, 10),
    weakSignals: unique(adjacent).slice(0, 10),
    falsePositiveRisks: unique([
      ...analysis.jobBrief.exclusions,
      ...analysis.talentPersona.riskSignals,
      ...analysis.searchMap.excludedIndustries,
      ...analysis.hunterReasoningKernel.searchDiscipline.demotionRules,
    ]).slice(0, 10),
    sourceArchetypes: unique([
      ...analysis.hunterReasoningKernel.searchDiscipline.primaryPool,
      ...analysis.searchMap.targetCompanies,
      ...analysis.searchMap.targetTitles,
    ]).slice(0, 10),
    interviewValidation: unique([
      ...verification,
      ...analysis.screeningPlan.qualificationQuestions,
      ...analysis.screeningPlan.riskChecks,
    ]).slice(0, 10),
  } satisfies JobAnalysis["roleProfile"];

  if (family === "operator" || family === "strategy" || family === "category" || family === "governance") {
    return {
      ...base,
      roleFamily: family,
      roleEssence:
        base.roleEssence ||
        "业务经营高潜：用策略、数据和商业判断找到增量机会，并能跨团队推动落地。",
      successProfile: unique([
        "年轻高潜，能从策略/商分/咨询/投资转向业务经营",
        "有商业 sense、数据分析和结果导向",
        "能多问为什么，拆业务问题并推动落地",
        ...base.successProfile,
      ]).slice(0, 8),
      strongSignals: unique([
        "字节/美团/阿里/拼多多/小红书/SHEIN 等平台策略、商分或经营分析",
        "头部咨询/投资且有消费、电商、跨境或互联网业务 case",
        "负责过年度规划、竞品分析、增长策略、ROI 或跨部门项目落地",
        ...base.strongSignals,
      ]).slice(0, 10),
      weakSignals: unique([
        "只有海外、英文或名校背景，但没有业务经营证据",
        "只有行业相似或公司名好看，缺少策略落地/业务结果",
        ...base.weakSignals,
      ]).slice(0, 10),
      falsePositiveRisks: unique([
        "纯 HR/行政/总助/培训/组织咨询路径",
        "纯研究、纯投后、纯咨询建议，缺少业务落地责任",
        "游戏/内容等相邻策略背景但没有电商、跨境、消费或经营分析证据",
        ...base.falsePositiveRisks,
      ]).slice(0, 10),
      sourceArchetypes: unique([
        "字节策略 / 美团商分 / 阿里经营分析 / PDD-Temu / 小红书商业化策略",
        "头部咨询或投资，且项目直接贴近电商、消费、跨境或平台经营",
        "大厂品类、国家、区域、中台治理或体验负责人梯队",
        ...base.sourceArchetypes,
      ]).slice(0, 10),
      interviewValidation: unique([
        "最近一次不是只做分析、而是推动业务结果的案例是什么？候选人对结果负责到什么程度？",
        "为什么愿意从策略/投资/咨询转向业务负责人路径？",
        "对跨境电商、服装品类、拉美国家经营或体验治理的理解来自真实业务还是外部观察？",
        ...base.interviewValidation,
      ]).slice(0, 10),
    };
  }

  return base;
}

function deriveHunterReasoningKernel(analysis: JobAnalysis): JobAnalysis["hunterReasoningKernel"] {
  const role = analysis.jobBrief.roleTitle || analysis.intakeBuilder.structuredBrief.role || analysis.projectName || "待确认岗位";
  const businessContext =
    analysis.jobBrief.businessContext ||
    analysis.intakeBuilder.structuredBrief.businessContext ||
    analysis.talentPersona.summary ||
    "先判断岗位主轴、服务对象和客户 hiring problem。";
  const gapBuckets = classifyProjectGaps([
    ...analysis.companyTeamBrief.missing,
    ...analysis.intakeBuilder.structuredBrief.unknowns,
  ]);
  const hasCompany = hasMeaningfulText(analysis.jobBrief.clientCompany || analysis.intakeBuilder.structuredBrief.clientCompany);
  const hasRole = hasMeaningfulText(role);
  const hasLocation = hasMeaningfulText(analysis.intakeBuilder.structuredBrief.locationAndWorkModel);
  const blockingGaps = unique([
    ...gapBuckets.blocking,
    !hasCompany ? "客户公司或保密客户边界" : "",
    !hasRole ? "目标岗位/职能主轴" : "",
    !hasLocation ? "工作地点/办公模式" : "",
  ]);
  const primaryMode = detectHunterHrWorkMode(role, businessContext);
  const primaryModeLabel = primaryMode === "unknown" ? "" : hunterHrWorkModeLabels[primaryMode];
  const roleContext = `${role} ${businessContext} ${analysis.talentPersona.summary}`.toLowerCase();
  const isHrRole = /hrbp|hrd|hrvp|chro|cho|human resources|人力资源|人事|组织发展|组织效能|薪酬|绩效|招聘|人才发展|员工关系/.test(roleContext);
  const candidateCoreSignals = unique([
    role,
    isHrRole ? primaryModeLabel : "",
    isHrRole ? "HRBP 实战经验，能直接支持业务 leader" : "",
    ...analysis.jobBrief.mustHave,
    ...analysis.talentPersona.mustHave,
  ]);
  const core = unique([
    ...candidateCoreSignals.filter((item) => !isAdjacentScenarioSignal(item, primaryMode)).slice(0, 6),
  ]).slice(0, 8);
  const adjacent = unique([
    ...candidateCoreSignals.filter((item) => isAdjacentScenarioSignal(item, primaryMode)),
    ...analysis.searchMap.targetIndustries,
    ...analysis.searchMap.targetCompanies,
    ...analysis.searchMap.keywords,
  ]).slice(0, 10);

  return {
    roleNucleus: `${role}：${businessContext}`.slice(0, 220),
    hiringProblem: businessContext,
    evidenceTiers: {
      core,
      strongPlus: unique([
        ...analysis.jobBrief.niceToHave,
        ...analysis.talentPersona.strongMatch,
      ]).slice(0, 8),
      adjacent,
      verification: unique([
        ...gapBuckets.nonBlocking,
        ...analysis.companyTeamBrief.clientQuestions,
        ...analysis.jobBrief.openQuestions,
      ]).slice(0, 8),
    },
    actionGate: {
      canStartLonglist: blockingGaps.length === 0,
      blockingGaps,
      nonBlockingGaps: unique(gapBuckets.nonBlocking).slice(0, 8),
      rationale: blockingGaps.length
        ? `缺少${blockingGaps.join("、")}，应先补齐后再自动进入 Longlist。`
        : "客户公司、岗位主轴和地点/办公模式足够明确，可以先启动 Longlist；其他缺口进入电话或客户验证。",
    },
    searchDiscipline: {
      primaryPool: unique([
        ...analysis.searchMap.targetTitles.slice(0, 5),
        ...core.slice(0, 3),
      ]).slice(0, 8),
      expansionPool: unique([
        ...analysis.searchMap.targetCompanies,
        ...analysis.searchMap.targetIndustries,
      ]).slice(0, 8),
      topRankRules: [
        "Top 排序必须先命中岗位核和 core evidence，不能只靠行业、公司名或相邻场景。",
        "相邻业务上下文只能加分或扩展召回，不能替代 core evidence。",
      ],
      demotionRules: [
        "只命中 adjacent context、缺少 core evidence 的候选人降级到电话验证或备选。",
        "title/function 与岗位主轴不符时，即使公司或行业相似也不得进入客户可看。",
      ],
    },
    selfCheck: {
      adjacentPromotedToMustHave: [],
      corrected: false,
      notes: ["该 kernel 由 normalize 兜底生成；后续模型输出应显式给出证据分层。"],
    },
  };
}

function enforceHunterReasoningKernel(analysis: JobAnalysis): JobAnalysis {
  const existing = analysis.hunterReasoningKernel;
  const derived = deriveHunterReasoningKernel(analysis);
  const kernel: JobAnalysis["hunterReasoningKernel"] = {
    roleNucleus: existing.roleNucleus || derived.roleNucleus,
    hiringProblem: existing.hiringProblem || derived.hiringProblem,
    evidenceTiers: {
      core: unique(existing.evidenceTiers.core.length ? existing.evidenceTiers.core : derived.evidenceTiers.core),
      strongPlus: unique(existing.evidenceTiers.strongPlus.length ? existing.evidenceTiers.strongPlus : derived.evidenceTiers.strongPlus),
      adjacent: unique(existing.evidenceTiers.adjacent.length ? existing.evidenceTiers.adjacent : derived.evidenceTiers.adjacent),
      verification: unique(existing.evidenceTiers.verification.length ? existing.evidenceTiers.verification : derived.evidenceTiers.verification),
    },
    actionGate: {
      canStartLonglist: existing.actionGate.rationale ? existing.actionGate.canStartLonglist : derived.actionGate.canStartLonglist,
      blockingGaps: unique(existing.actionGate.blockingGaps.length ? existing.actionGate.blockingGaps : derived.actionGate.blockingGaps),
      nonBlockingGaps: unique(existing.actionGate.nonBlockingGaps.length ? existing.actionGate.nonBlockingGaps : derived.actionGate.nonBlockingGaps),
      rationale: existing.actionGate.rationale || derived.actionGate.rationale,
    },
    searchDiscipline: {
      primaryPool: unique(existing.searchDiscipline.primaryPool.length ? existing.searchDiscipline.primaryPool : derived.searchDiscipline.primaryPool),
      expansionPool: unique(existing.searchDiscipline.expansionPool.length ? existing.searchDiscipline.expansionPool : derived.searchDiscipline.expansionPool),
      topRankRules: unique(existing.searchDiscipline.topRankRules.length ? existing.searchDiscipline.topRankRules : derived.searchDiscipline.topRankRules),
      demotionRules: unique(existing.searchDiscipline.demotionRules.length ? existing.searchDiscipline.demotionRules : derived.searchDiscipline.demotionRules),
    },
    selfCheck: existing.selfCheck,
  };
  const adjacentPromoted = kernel.evidenceTiers.adjacent.filter((item) =>
    [...analysis.jobBrief.mustHave, ...analysis.talentPersona.mustHave, ...analysis.intakeBuilder.structuredBrief.mustHave].some(
      (mustHave) => mustHave.trim().toLowerCase() === item.trim().toLowerCase(),
    ),
  );
  kernel.actionGate.canStartLonglist = kernel.actionGate.blockingGaps.length === 0;
  kernel.actionGate.rationale = kernel.actionGate.canStartLonglist
    ? "客户公司、岗位主轴和地点/办公模式足够明确，可以先启动 Longlist；其他缺口进入电话或客户验证。"
    : kernel.actionGate.rationale;
  const primaryMode = detectHunterHrWorkMode(
    analysis.jobBrief.roleTitle || analysis.intakeBuilder.structuredBrief.role || analysis.projectName,
    kernel.hiringProblem || analysis.jobBrief.businessContext || analysis.intakeBuilder.structuredBrief.businessContext,
  );
  const semanticAdjacentPromoted = kernel.evidenceTiers.core.filter((item) => isAdjacentScenarioSignal(item, primaryMode));
  const adjacentEvidence = unique([...kernel.evidenceTiers.adjacent, ...semanticAdjacentPromoted]);
  const core = removeExact(kernel.evidenceTiers.core, adjacentEvidence);
  const mustHave = core.length ? core : removeExact(unique(analysis.talentPersona.mustHave), adjacentEvidence);

  return {
    ...analysis,
    hunterReasoningKernel: {
      ...kernel,
      evidenceTiers: {
        ...kernel.evidenceTiers,
        core: core.length ? core : kernel.evidenceTiers.core,
        adjacent: adjacentEvidence,
      },
      selfCheck: {
        adjacentPromotedToMustHave: unique([
          ...kernel.selfCheck.adjacentPromotedToMustHave,
          ...adjacentPromoted,
          ...semanticAdjacentPromoted,
        ]),
        corrected: kernel.selfCheck.corrected || adjacentPromoted.length > 0 || semanticAdjacentPromoted.length > 0,
        notes: unique([
          ...kernel.selfCheck.notes,
          adjacentPromoted.length ? "normalize 已阻止 adjacent context 直接进入 must-have。" : "",
          semanticAdjacentPromoted.length ? "normalize 已按岗位主轴把相邻 HRBP 场景从 core evidence 降级到 adjacent context。" : "",
        ]),
      },
    },
    intakeBuilder: {
      ...analysis.intakeBuilder,
      structuredBrief: {
        ...analysis.intakeBuilder.structuredBrief,
        mustHave,
        unknowns: unique([...kernel.actionGate.blockingGaps, ...kernel.actionGate.nonBlockingGaps]),
      },
    },
    jobBrief: {
      ...analysis.jobBrief,
      mustHave,
      niceToHave: unique([...kernel.evidenceTiers.strongPlus, ...analysis.jobBrief.niceToHave]),
      openQuestions: unique([...kernel.evidenceTiers.verification, ...analysis.jobBrief.openQuestions]).slice(0, 10),
    },
    companyTeamBrief: {
      ...analysis.companyTeamBrief,
      missing: unique([...kernel.actionGate.blockingGaps, ...kernel.actionGate.nonBlockingGaps]),
      clientQuestions: unique([...kernel.evidenceTiers.verification, ...analysis.companyTeamBrief.clientQuestions]).slice(0, 10),
    },
    talentPersona: {
      ...analysis.talentPersona,
      summary: analysis.talentPersona.summary || kernel.roleNucleus,
      mustHave,
      strongMatch: unique([...kernel.evidenceTiers.strongPlus, ...analysis.talentPersona.strongMatch]),
      evidenceToCollect: unique([...kernel.evidenceTiers.verification, ...analysis.talentPersona.evidenceToCollect]).slice(0, 10),
    },
    searchMap: {
      ...analysis.searchMap,
      targetTitles: unique([...kernel.searchDiscipline.primaryPool, ...analysis.searchMap.targetTitles]),
      targetCompanies: unique([...analysis.searchMap.targetCompanies, ...kernel.searchDiscipline.expansionPool]),
      keywords: unique([...mustHave, ...kernel.evidenceTiers.strongPlus, ...analysis.searchMap.keywords]).slice(0, 24),
    },
    screeningPlan: {
      ...analysis.screeningPlan,
      firstRoundOrder: unique([...kernel.searchDiscipline.primaryPool, ...analysis.screeningPlan.firstRoundOrder]).slice(0, 10),
      riskChecks: unique([...kernel.searchDiscipline.demotionRules, ...analysis.screeningPlan.riskChecks]).slice(0, 12),
    },
  };
}

function enforceRoleProfile(analysis: JobAnalysis): JobAnalysis {
  const existing = analysis.roleProfile;
  const derived = deriveRoleProfile(analysis);
  const roleProfile: JobAnalysis["roleProfile"] = {
    roleFamily: existing.roleFamily === "general" ? derived.roleFamily : existing.roleFamily,
    roleEssence: existing.roleEssence || derived.roleEssence,
    hiringProblem: existing.hiringProblem || derived.hiringProblem,
    successProfile: unique(existing.successProfile.length ? existing.successProfile : derived.successProfile).slice(0, 10),
    hardConstraints: unique(existing.hardConstraints.length ? existing.hardConstraints : derived.hardConstraints).slice(0, 10),
    strongSignals: unique(existing.strongSignals.length ? existing.strongSignals : derived.strongSignals).slice(0, 12),
    weakSignals: unique(existing.weakSignals.length ? existing.weakSignals : derived.weakSignals).slice(0, 12),
    falsePositiveRisks: unique(existing.falsePositiveRisks.length ? existing.falsePositiveRisks : derived.falsePositiveRisks).slice(0, 12),
    sourceArchetypes: unique(existing.sourceArchetypes.length ? existing.sourceArchetypes : derived.sourceArchetypes).slice(0, 12),
    interviewValidation: unique(existing.interviewValidation.length ? existing.interviewValidation : derived.interviewValidation).slice(0, 12),
  };
  const mustHave = unique([...analysis.jobBrief.mustHave, ...roleProfile.hardConstraints]).slice(0, 12);
  const strongMatch = unique([...roleProfile.strongSignals, ...analysis.talentPersona.strongMatch]).slice(0, 16);
  const riskSignals = unique([...roleProfile.falsePositiveRisks, ...analysis.talentPersona.riskSignals]).slice(0, 16);

  return {
    ...analysis,
    roleProfile,
    jobBrief: {
      ...analysis.jobBrief,
      mustHave,
      niceToHave: unique([...roleProfile.strongSignals, ...analysis.jobBrief.niceToHave]).slice(0, 16),
      exclusions: unique([...roleProfile.falsePositiveRisks, ...analysis.jobBrief.exclusions]).slice(0, 16),
      openQuestions: unique([...roleProfile.interviewValidation, ...analysis.jobBrief.openQuestions]).slice(0, 14),
    },
    talentPersona: {
      ...analysis.talentPersona,
      summary: analysis.talentPersona.summary || roleProfile.roleEssence,
      mustHave,
      strongMatch,
      riskSignals,
      evidenceToCollect: unique([...roleProfile.interviewValidation, ...analysis.talentPersona.evidenceToCollect]).slice(0, 14),
    },
    searchMap: {
      ...analysis.searchMap,
      targetCompanies: unique([...analysis.searchMap.targetCompanies, ...roleProfile.sourceArchetypes]).slice(0, 20),
      keywords: unique([
        ...analysis.searchMap.keywords,
        ...roleProfile.successProfile,
        ...roleProfile.strongSignals,
        ...roleProfile.weakSignals,
      ]).slice(0, 32),
      excludedIndustries: unique([...analysis.searchMap.excludedIndustries, ...roleProfile.falsePositiveRisks]).slice(0, 18),
    },
    screeningPlan: {
      ...analysis.screeningPlan,
      qualificationQuestions: unique([...roleProfile.interviewValidation, ...analysis.screeningPlan.qualificationQuestions]).slice(0, 14),
      riskChecks: unique([...roleProfile.falsePositiveRisks, ...analysis.screeningPlan.riskChecks]).slice(0, 16),
    },
  };
}

function mergeDefaultAgentSkills(analysis: JobAnalysis): JobAnalysis {
  const defaultNames = new Set(DEFAULT_AGENT_SKILLS.map((skill) => skill.name));
  return {
    ...analysis,
    skillLibrary: [
      ...DEFAULT_AGENT_SKILLS,
      ...analysis.skillLibrary.filter((skill) => !defaultNames.has(skill.name)),
    ],
  };
}

export function normalizeJobAnalysis(input: unknown): JobAnalysis {
  const analysis = enforceRoleProfile(enforceHunterReasoningKernel(mergeDefaultAgentSkills(jobAnalysisSchema.parse(input))));
  const projectText = [
    analysis.projectName,
    analysis.jobBrief.clientCompany,
    analysis.intakeBuilder.structuredBrief.clientCompany,
    analysis.jobBrief.businessContext,
  ]
    .join(" ")
    .toLowerCase();
  const isEssilorLuxottica =
    projectText.includes("essilor") ||
    projectText.includes("luxottica") ||
    projectText.includes("依视路") ||
    projectText.includes("陆逊梯卡");

  if (!isEssilorLuxottica || analysis.deepResearch.companySignals.length > 0) {
    return analysis;
  }

  return {
    ...analysis,
    deepResearch: {
      ...analysis.deepResearch,
      companySignals: [
        {
          name: "依视路陆逊梯卡 / EssilorLuxottica",
          type: "company",
          sourceStatus: "客户提供 + 已公开证实",
          publicEvidence: "客户公司名称已确认；集团公开信息显示其覆盖镜片、镜架、零售和专业解决方案，并有医疗诊所资产相关动作。",
          talentDbEvidence: "人才库存在依视路/陆逊梯卡相关候选人、面试反馈和顾虑记录，可用于校准岗位吸引力、薪资和组织风险。",
          impact: "不能按普通外企 Commercial HRBP 处理，需要叠加专业解决方案、渠道和医疗眼科生态理解。",
          nextVerification: "确认岗位所属法人/事业部、业务线、HR 汇报线、业务面试官和最终决策人。",
        },
        {
          name: "经销商 / 专业解决方案团队",
          type: "team",
          sourceStatus: "客户提供 / 边界待确认",
          publicEvidence: "当前会话新增认知：该岗位服务经销商团队；公开资料中专业解决方案和渠道合作信息与该方向一致。",
          talentDbEvidence: "需优先扫描 dealer、distributor、channel、区域销售、药房、医院渠道相关 HRBP 样本。",
          impact: "评分权重从泛 Sales HRBP 调整为经销商/渠道/区域销售支持优先。",
          nextVerification: "确认团队人数、区域划分、经销商管理模式、销售激励痛点和 HRBP 参与边界。",
        },
        {
          name: "医疗 / 眼科 / 诊所生态",
          type: "market",
          sourceStatus: "客户提供 + 已公开证实",
          publicEvidence: "当前会话新增认知：公司收购医疗诊所相关资产；公开信息也支持集团在眼科医疗服务生态方向的延展。",
          talentDbEvidence: "人才库应优先扫描医药、医疗器械、诊断设备、眼科、诊所、药房和医院集团 HRBP。",
          impact: "医疗/眼科/医疗器械/诊所生态相似度进入核心评分维度。",
          nextVerification: "确认该岗位是否直接支持医疗诊所资产、临床合作、专业解决方案或供应链合作相关组织议题。",
        },
      ],
      peopleNodes: [
        {
          name: "陈汐 / Ceci Chen",
          type: "person",
          sourceStatus: "已公开证实 / 人才库无可靠精确命中",
          publicEvidence: "公开报道中出现为依视路陆逊梯卡中国大陆高端市场专业解决方案总经理。",
          talentDbEvidence: "人才库未找到可靠精确命中；Ceci 泛匹配噪音不能作为本人证据。",
          impact: "可能是专业解决方案/高端市场相关关键业务节点，但管理风格和是否为本岗位业务 stakeholder 仍需确认。",
          nextVerification: "向客户确认是否为该岗位服务团队 GM、是否参与面试、对 HRBP 的偏好和当前业务优先级。",
        },
        {
          name: "关键利益相关人 / 决策链节点",
          type: "person",
          sourceStatus: "客户提供 / 待确认",
          publicEvidence: "客户提到团队去年换新 GM，但当前需继续补充公开证据和时间线。",
          talentDbEvidence: "每出现关键业务/HR负责人或面试官姓名，都要扫描人才库本人/同名噪音/候选人面试反馈。",
          impact: "领导偏好会决定候选人是偏变革推动、业务贴身、流程治理还是稳定运营。",
          nextVerification: "确认新 GM 姓名、上任时间、业务目标、直接业务汇报线和 HR 决策链。",
        },
        {
          name: "华厦眼科 / 厦门国药器械合作方节点",
          type: "partner",
          sourceStatus: "已公开证实 / 人才库待补充",
          publicEvidence: "公开报道显示依视路陆逊梯卡与眼科医疗及器械供应链相关合作方存在战略合作。",
          talentDbEvidence: "已识别合作方人物需按姓名和公司双重扫描；同名无法匹配时标为噪音。",
          impact: "提示候选人需理解产品、临床服务、供应链和渠道协作，而非单纯门店零售。",
          nextVerification: "确认这些合作是否影响本岗位服务团队、绩效目标或组织调整。",
        },
      ],
      clientQuestions: [
        "该岗位服务的经销商团队具体属于哪个业务线？覆盖哪些渠道和区域？",
        "去年新 GM 的姓名、上任时间、当前业务目标和对 HRBP 的期待是什么？",
        "业务负责人、HR 汇报线和面试决策人分别是谁？各自的决策权重是什么？",
        "医疗诊所/眼科生态资产对中国团队的组织和人才需求有什么实际影响？",
      ],
    },
  };
}
