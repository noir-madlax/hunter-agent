import { buildRequirementPolicy, evaluateCandidateAgainstCodexPolicy, type RequirementPolicy } from "@/lib/headhunter-policy";
import { normalizeJobAnalysis } from "@/lib/job-schema";
import { getPersolReportData, type PersolCandidateRecord } from "@/lib/persol-report-data";
import { applyRequirementGateScore, evaluateRequirementGates } from "@/lib/requirement-gates";
import {
  getProjectWithRelations,
  refreshProjectStats,
  serializeProject,
  snapshotToRawProfile,
  type CandidateSnapshot,
} from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";

type ScanOptions = {
  runId?: string;
  limit?: number;
  includeProject?: boolean;
};

type CandidateMatch = {
  record: PersolCandidateRecord;
  score: number;
  reasons: string[];
  concerns: string[];
  policyTrace: string[];
  gate: string;
  advisorTier?: "client_ready" | "phone_validate" | "watchlist" | "reject";
  scenarioEvidence?: string[];
  implicitSuccessCriteria?: string[];
  companySimilarityBreakdown?: string[];
  talentDbInsights?: string[];
  phoneVerification?: string[];
  verifiedFacts?: string[];
  weakSignals?: string[];
  inferredFit?: string[];
  verificationGaps?: string[];
  comparisonRank?: number;
  comparisonVerdict?: string;
  differentiators?: string[];
  tradeoffs?: string[];
  judgeScore?: number;
  judgeReasons?: string[];
  judgeRisks?: string[];
  consultantFeedback?: ConsultantFeedback;
};

type ConsultantFeedback = {
  decision: "保留" | "降级" | "移出";
  externalCandidateId?: string;
  name?: string;
  company?: string;
  title?: string;
  reason?: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function stripSearchText(record: PersolCandidateRecord): CandidateSnapshot {
  const { searchText, ...snapshot } = record;
  void searchText;
  return snapshot;
}

function normalizeText(value: string | number | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

// 过滤库里数据导入留下的占位/无效公司记录 — 这些候选人即使 title 匹配也无法做 source 验证
const INVALID_COMPANY_PATTERNS: RegExp[] = [
  /^公司（请不要修改）$/,
  /^未知公司/,
  /^未知\s*\d+$/,
  /^公司$/,
  /^无$/,
  /^-\s*\d+$/,
  /^DFF$/i,
];

function isUsableCandidate(record: PersolCandidateRecord): boolean {
  if (record.dataQuality) {
    if (record.dataQuality.hasJunkCompany) return false;
  } else {
    const company = String(record.companyName || "").trim();
    if (company && INVALID_COMPANY_PATTERNS.some((p) => p.test(company))) {
      return false;
    }
  }
  const company = String(record.companyName || "").trim();
  if (!company) {
    // 允许无公司名记录通过 — 仍可能从 title / notes 命中
    return Boolean(record.title || record.firstExperienceTitle);
  }
  return true;
}

function parseConsultantFeedback(project: { projectMemories?: Array<{ content: string }> }) {
  const latestByKey = new Map<string, ConsultantFeedback>();
  for (const memory of project.projectMemories ?? []) {
    const marker = "候选人裁判JSON：";
    if (!memory.content.includes(marker)) continue;
    const raw = memory.content.slice(memory.content.lastIndexOf(marker) + marker.length).trim();
    const parsed = parseJson<Partial<ConsultantFeedback> & { type?: string }>(raw, {});
    if (parsed.type !== "candidate_judgement" || !parsed.decision) continue;
    if (!["保留", "降级", "移出"].includes(parsed.decision)) continue;
    const feedback: ConsultantFeedback = {
      decision: parsed.decision as ConsultantFeedback["decision"],
      externalCandidateId: parsed.externalCandidateId ? String(parsed.externalCandidateId) : undefined,
      name: parsed.name,
      company: parsed.company,
      title: parsed.title,
      reason: parsed.reason,
    };
    const key = feedback.externalCandidateId || [feedback.name, feedback.company, feedback.title].map(normalizeText).join("|");
    if (key) latestByKey.set(key, feedback);
  }
  return [...latestByKey.values()];
}

function matchConsultantFeedback(record: PersolCandidateRecord, feedbackItems: ConsultantFeedback[]) {
  const externalId = String(record.id);
  const candidateText = normalizeText([record.name, record.chineseName, record.englishName, record.companyName, record.title, record.firstExperienceTitle].filter(Boolean).join(" "));
  return feedbackItems.find((feedback) => {
    if (feedback.externalCandidateId && feedback.externalCandidateId === externalId) return true;
    const name = normalizeText(feedback.name);
    const company = normalizeText(feedback.company);
    const title = normalizeText(feedback.title);
    const nameHit = !name || candidateText.includes(name);
    const companyHit = !company || candidateText.includes(company);
    const titleHit = !title || candidateText.includes(title);
    return Boolean(name && nameHit && companyHit && titleHit);
  });
}

function applyConsultantFeedback(match: CandidateMatch, feedback: ConsultantFeedback | undefined): CandidateMatch {
  if (!feedback) return match;
  const reason = feedback.reason || `顾问裁判：${feedback.decision}`;
  if (feedback.decision === "移出") {
    return {
      ...match,
      score: 0,
      gate: "reject",
      advisorTier: "reject",
      concerns: [...match.concerns, "顾问裁判：已移出，本项目后续扫描不得自动加回"],
      policyTrace: [...match.policyTrace, `结构化反馈：移出；${reason}`],
      consultantFeedback: feedback,
    };
  }
  if (feedback.decision === "降级") {
    return {
      ...match,
      score: Math.min(match.score - 18, 64),
      gate: "borderline",
      advisorTier: "watchlist",
      concerns: [...match.concerns, "顾问裁判：已降级，不应进入 Top 推荐位"],
      policyTrace: [...match.policyTrace, `结构化反馈：降级；${reason}`],
      consultantFeedback: feedback,
    };
  }
  return {
    ...match,
    score: Math.min(100, match.score + 8),
    reasons: [...match.reasons, "顾问裁判：保留，作为可继续验证候选人"],
    policyTrace: [...match.policyTrace, `结构化反馈：保留；${reason}`],
    consultantFeedback: feedback,
  };
}

function hitCount(text: string, terms: string[]) {
  return terms.filter((term) => term && text.includes(term)).length;
}

function scoreCandidate(
  record: PersolCandidateRecord,
  terms: string[],
  companyTerms: string[],
  roleFamily: RequirementPolicy["roleFamily"],
) {
  const titleText = [record.title, record.firstExperienceTitle, record.functionPath].join(" ").toLowerCase();
  const companyText = (record.companyName || "").toLowerCase();
  const notesText = (record.notes || []).join(" ").toLowerCase();
  const fullText = record.searchText;
  const titleHits = hitCount(titleText, terms);
  const companyHits = hitCount(companyText, [...terms, ...companyTerms]);
  const notesHits = hitCount(notesText, terms);
  const fullHits = hitCount(fullText, terms);
  const reasons: string[] = [];
  let score = 0;

  if (titleHits) {
    score += titleHits * 7;
    reasons.push(`职位/职能命中 ${titleHits} 个信号`);
  }
  if (companyHits) {
    score += companyHits * 6;
    reasons.push(`公司背景命中 ${companyHits} 个客户/相似公司信号`);
  }
  if (notesHits) {
    score += notesHits * 4;
    reasons.push(`顾问备注命中 ${notesHits} 个画像信号`);
  }
  if (fullHits) score += Math.min(20, fullHits * 2);

  if (roleFamily === "hr" && /hr|human|人力|人事|组织|人才|薪酬|绩效|员工关系/.test(fullText)) {
    score += 10;
    reasons.push("HR/组织相关履历信号");
  }
  if (roleFamily === "hr" && /hrvp|chro|cho|人力资源副总裁/.test(titleText)) {
    score += 20;
    reasons.push("title 直接命中 HRVP/CHO/CHRO");
  } else if (roleFamily === "hr" && /hrd|人力资源总监|人力资源负责人|集团人力资源|hr head|head of hr/.test(titleText)) {
    score += 14;
    reasons.push("title 命中 HRD/人力资源负责人");
  }
  if (/vp|vice|副总裁|总裁|负责人|head|director|总监|hrd|cho|chro|coo|总经理/.test(titleText)) {
    score += 8;
    reasons.push("高阶管理或负责人 title 信号");
  }
  if (/苏州|无锡|昆山|常州|上海|南京|杭州|长三角/.test(fullText)) {
    score += 8;
    reasons.push("苏州/长三角可达性信号");
  }
  if (roleFamily === "hr" && /替代|变革|组织调整|从0到1|搭建|集团|体系|文化|od|组织发展/.test(notesText)) {
    score += 8;
    reasons.push("组织变革或体系搭建证据");
  }
  if (record.annualSalary && record.annualSalary >= 700000 && record.annualSalary <= 1600000) {
    score += 8;
    reasons.push("薪酬带接近项目预算");
  } else if (record.annualSalary && record.annualSalary > 1600000) {
    score -= 8;
    reasons.push("薪酬可能超过项目预算");
  }
  if (record.hasNotes) {
    score += 4;
    reasons.push("有人才库备注可复核动机/风险");
  }
  if (record.mobile || record.email) score += 2;
  if (record.experienceCount >= 3) score += 2;

  return { score, reasons };
}

function textOf(values: Array<string | string[] | number | null | undefined>) {
  return values.flatMap((value) => (Array.isArray(value) ? value : [value])).filter(Boolean).join(" ").toLowerCase();
}

function applyRequirementGatesToMatch(
  analysis: ReturnType<typeof normalizeJobAnalysis>,
  match: CandidateMatch,
): CandidateMatch {
  const gates = evaluateRequirementGates(analysis, match.record);
  const score = applyRequirementGateScore(match.score, gates);
  const rejected = gates.reject || match.gate === "reject" || score < 55;
  const gate: CandidateMatch["gate"] = rejected ? "reject" : score >= 90 ? "strong_fit" : score >= 72 ? "fit" : "borderline";
  const advisorTier: CandidateMatch["advisorTier"] = rejected
    ? "reject"
    : score >= 88 && match.advisorTier === "client_ready" && gates.maxScore >= 88
      ? "client_ready"
      : score >= 72
        ? "phone_validate"
        : "watchlist";

  return {
    ...match,
    score,
    gate,
    advisorTier,
    reasons: [...gates.reasons, ...match.reasons],
    concerns: [...gates.concerns, ...match.concerns],
    policyTrace: [...match.policyTrace, ...gates.policyTrace],
  };
}

function companyFitSignals(projectText: string, candidateText: string) {
  const signals: string[] = [];
  const risks: string[] = [];
  let score = 0;

  const wantsSuzhou = /苏州|长三角/.test(projectText);
  const wantsTechService = /科技|互联网|数字化|软件|saas|平台|技术服务/.test(projectText);
  const wantsGrowthPrivate = /民营|成长|扩张|组织升级|组织效能|转型|业务增长|新增|替代/.test(projectText);
  const wantsMncMedicalChannel = /依视路|essilor|luxottica|眼科|诊所|医疗器械|生命科学|mnc|外企/.test(projectText);
  const wantsDealerSales = /经销|commercial|sales|销售|渠道销售|销售渠道|区域销售|大区/.test(projectText);

  if (wantsSuzhou) {
    if (/苏州|无锡|昆山|常州|上海|南京|杭州|长三角/.test(candidateText)) {
      score += 2;
      signals.push("公司/地点相似：长三角或苏州可落地");
    } else {
      score -= 2;
      risks.push("公司/地点风险：缺少长三角落地证据");
    }
  }

  if (wantsTechService) {
    if (/互联网|科技|软件|saas|平台|数字|智能|ai|信息|系统|数据|小米|字节|腾讯|阿里|美团|京东|平安智慧|径硕|企服/.test(candidateText)) {
      score += 2;
      signals.push("公司相似：科技/互联网/信息服务背景可解释给客户");
    } else if (/制造|化工|医药|医疗|汽车|地产|传统|零售|快消/.test(candidateText)) {
      score -= 2;
      risks.push("公司相似风险：行业可迁移但不是信息服务/科技主线");
    }
  }

  if (wantsGrowthPrivate) {
    if (/独角兽|民营|创业|成长|上市|拟上市|集团|从0到1|搭建|组织调整|变革|转型|扩张/.test(candidateText)) {
      score += 2;
      signals.push("公司阶段相似：成长/变革/集团化组织经验");
    }
  }

  if (wantsMncMedicalChannel) {
    if (/sanofi|辉瑞|thermo|fisher|拜尔斯道夫|beiersdorf|target|trane|kerry|医疗|医药|器械|眼科|诊所|生命科学|外企|mnc|global|英文/.test(candidateText)) {
      score += 3;
      signals.push("公司相似：MNC/医疗/生命科学/英文环境更贴近客户");
    } else if (/互联网|游戏|地产|金融|教育/.test(candidateText)) {
      score -= 3;
      risks.push("公司相似风险：行业场景距离医疗/眼科/外企渠道较远");
    }
  }

  if (wantsDealerSales) {
    if (/commercial|sales|渠道|经销|区域|大区|ka|零售|批发|客户|业务伙伴/.test(candidateText)) {
      score += 2;
      signals.push("业务场景相似：商业/销售/渠道组织支持经验");
    } else {
      score -= 2;
      risks.push("业务场景风险：缺少商业/销售/渠道组织证据");
    }
  }

  return { score, signals, risks };
}

function talentDbNoteSignals(record: PersolCandidateRecord, projectText: string) {
  const notesText = textOf([record.notes, record.expectedSalary, record.status]);
  const signals: string[] = [];
  const risks: string[] = [];
  let score = 0;
  const projectWantsMedical = /医疗|医药|器械|眼科|诊所|生命科学|医院|药房|healthcare|medical|pharma/.test(projectText);
  const projectWantsOverseas = /海外|出海|国际化|跨文化|外派|欧美|global|oversea|eor|gdpr|英语|英文/.test(projectText);
  const projectWantsCommercial = /commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/.test(projectText);

  if (/推荐|符合|可推荐|想看机会|看机会|主动|开放|在看|可聊|意向/.test(notesText)) {
    score += 3;
    signals.push("人才库备注：存在积极机会意向或顾问可推荐记录");
  }
  if (/面试评价|电话|聊过|沟通|顾问面试|kpi/.test(notesText)) {
    score += 2;
    signals.push("人才库备注：有过顾问沟通记录，电话前可复核细节");
  }
  if (/从0到1|搭建|重组|组织调整|变革|合并|盘点|mapping|绩效|激励|人效|业务深入|强行介入业务|需求对齐/.test(notesText)) {
    score += 3;
    signals.push("人才库备注：出现组织/业务项目案例，可作为电话验证切口");
  }
  if (projectWantsOverseas && /海外|欧洲|德国|荷兰|外派|local|eor|合同|工作签证|英文|英语|global/.test(notesText)) {
    score += 2;
    signals.push("人才库备注：出现海外/跨文化/合规相关线索");
  }
  if (projectWantsCommercial && /渠道|经销|销售|区域|大区|ka|commercial|sales/.test(notesText)) {
    score += 2;
    signals.push("人才库备注：出现销售/渠道支持线索");
  }
  if (projectWantsMedical && /医疗|医药|器械|眼科|诊所|生命科学|药房|医院/.test(notesText)) {
    score += 2;
    signals.push("人才库备注：出现医疗/生命科学场景线索");
  }

  if (/不感冒|不认同|不考虑|不看|不想|没兴趣|暂不|婉拒|拒绝|不接受|不方便/.test(notesText)) {
    score -= 8;
    risks.push("人才库备注风险：候选人对机会、品牌、地点或沟通意愿存在负向记录");
  }
  if (/外地不考虑|异地不考虑|不去|不接受.*base|通勤.*不|家在.*不考虑/.test(notesText)) {
    score -= 6;
    risks.push("人才库备注风险：地点/通勤落地性存在负向记录");
  }
  if (/薪酬.*高|超过|低于预期|涨幅|base.*高|年薪.*高|cash.*150|cash.*130|预算.*不/.test(notesText) && /薪酬|预算|w|万|百万/.test(projectText)) {
    score -= 4;
    risks.push("人才库备注风险：薪酬期望可能和客户预算冲突");
  }
  if (/内定|已入职|offer.*接受|不跳|稳定|刚来|刚入职/.test(notesText)) {
    score -= 4;
    risks.push("人才库备注风险：当前流动性或可触达性较弱");
  }

  return { score, signals, risks };
}

function consultantJudgeCandidate(
  analysis: ReturnType<typeof normalizeJobAnalysis>,
  match: CandidateMatch,
): CandidateMatch {
  const policy = buildRequirementPolicy(analysis);
  const record = match.record;
  const titleText = textOf([record.title, record.firstExperienceTitle]);
  const fullText = textOf([
    record.companyName,
    record.title,
    record.firstExperienceTitle,
    record.functionPath,
    record.functionTags,
    record.notes,
    record.deepProfileText,
    record.expectedSalary,
  ]);
  const projectText = textOf([
    analysis.projectName,
    analysis.jobBrief.roleTitle,
    analysis.jobBrief.businessContext,
    analysis.jobBrief.mustHave,
    analysis.roleProfile.roleEssence,
    analysis.roleProfile.successProfile,
    analysis.roleProfile.hardConstraints,
    analysis.roleProfile.strongSignals,
    analysis.roleProfile.weakSignals,
    analysis.roleProfile.falsePositiveRisks,
    analysis.talentPersona.mustHave,
    analysis.searchMap.targetIndustries,
    analysis.searchMap.targetCompanies,
    analysis.searchMap.keywords,
  ]);
  const reasons: string[] = [];
  const risks: string[] = [];
  let judge = Math.min(match.score * 0.78, policy.roleFamily === "hr" ? 74 : 78);
  const companyFit = companyFitSignals(projectText, fullText);
  judge += companyFit.score;
  reasons.push(...companyFit.signals.map((signal) => `顾问裁判：${signal}`));
  risks.push(...companyFit.risks.map((risk) => `顾问裁判：${risk}`));
  const noteFit = talentDbNoteSignals(record, projectText);
  judge += noteFit.score;
  reasons.push(...noteFit.signals.map((signal) => `顾问裁判：${signal}`));
  risks.push(...noteFit.risks.map((risk) => `顾问裁判：${risk}`));

  if (policy.roleFamily === "hr") {
    const wantsExecutive = policy.seniorityIntent === "executive";
    const exactHrvp = /hrvp|chro|cho|人力资源副总裁|首席人才官|首席人力/.test(titleText);
    const hrd = /hrd|人力资源总监|集团人力资源总监|人力资源负责人|head of hr|hr head|人力资源部\s*副总经理/.test(titleText);
    const hrbp = /hrbp|business partner/.test(titleText);
    const odCoe = /组织发展|组织效能|od\b|薪酬|绩效|招聘|人才发展|干部|hr系统|人效/.test(titleText);
    const hasBusinessHr = /hrbp|business partner|业务伙伴|支持业务|商业|销售|渠道|commercial|sales/.test(fullText);
    const hasOd = /组织发展|组织效能|组织架构|岗位体系|人才盘点|od\b|组织诊断/.test(fullText);
    const hasRewards = /薪酬|绩效|激励|奖金|人效|c&b|compensation|performance/.test(fullText);
    const hasCadre = /干部|继任|领导力|人才梯队|succession/.test(fullText);
    const hasDigital = /数字化|hr系统|人效分析|人才画像|驾驶舱|people analytics|hris|dashboard/.test(fullText);
    const hasGroup = /集团|总部|业务单元|多业务|coe|ssc|共享/.test(fullText);
    const hardOdProject = policy.hrFocuses.includes("hard_od");
    const hardOdTitle = /组织发展|组织效能|组织管理|组织干部|od\b|岗位管理|编制|人效/.test(titleText);
    const hardOdEvidence = /硬od|组织诊断|组织架构|组织设计|组织治理|组织效能|组织效率|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|管控模式/.test(fullText);
    const consultingEvidence = /aon|怡安|mercer|美世|wtw|韦莱|hay|合益|korn ferry|光辉|ey|pwc|毕马威|德勤|咨询/.test(fullText);
    const internetHardwareEvidence = /字节|美团|京东|百度|阿里|腾讯|网易|滴滴|得物|小红书|快手|携程|贝壳|华为|小米|海尔|美的|oppo|vivo|大疆|顺丰|菜鸟|德邦|比亚迪|理想|吉利|蔚来|小鹏|极氪|互联网|智能|科技/.test(fullText);
    const trainingOnly = /培训|td\b|ld\b|学习发展|人才发展|企业大学|课程/.test(titleText) && !hardOdEvidence;
    const hrbpOnly = /hrbp|business partner|业务伙伴/.test(titleText) && !hardOdEvidence;
    const commercialBpProject = policy.hrWorkMode === "commercial_bp";
    const commercialEvidence = /commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/.test(fullText);
    const overseasBpProject = policy.hrWorkMode === "overseas_bp";
    const overseasEvidence = /海外|出海|国际化|跨文化|外派|eor|gdpr|劳动法规|用工合规|欧洲|德国|西班牙|欧美|英文|英语|global|oversea/.test(fullText);
    const ecommerceBpProject = policy.hrWorkMode === "ecommerce_bp";
    const ecommerceEvidence = /电商|直播|主播|投手|大促|618|双11|内容平台|私域|微商城|独立站|亚马逊|e-?commerce|amazon|流量/.test(fullText);
    const customerCenterBpProject = policy.hrWorkMode === "customer_center_bp";
    const customerCenterEvidence = /用户中心|客服|客户服务|会员|私域|微商城|用户研究|产品培训|运动市场部|mkt|consumer|customer|crm|服务质量|体验/.test(fullText);
    const recruitingCommsNoise = /招聘|talent acquisition|recruiting|内部沟通|雇主品牌/.test(titleText);
    const targetFocusCount = [
      policy.hrFocuses.includes("hard_od") && (hardOdTitle || hardOdEvidence),
      policy.hrFocuses.includes("business_hr") && hasBusinessHr,
      policy.hrFocuses.includes("organizational_development") && hasOd,
      policy.hrFocuses.includes("compensation_performance") && hasRewards,
      policy.hrFocuses.includes("cadre_management") && hasCadre,
      policy.hrFocuses.includes("hr_digital") && hasDigital,
      policy.hrFocuses.includes("group_hr_system") && hasGroup,
      policy.hrFocuses.includes("overall_hr_leader") && [hasBusinessHr, hasOd, hasRewards, hasCadre, hasGroup].filter(Boolean).length >= 3,
    ].filter(Boolean).length;

    if (wantsExecutive) {
      if (exactHrvp) {
        judge += 6;
        reasons.push("顾问裁判：title 是 HRVP/CHRO/CHO，客户更容易理解层级");
      } else if (hrd) {
        judge += 4;
        reasons.push("顾问裁判：HRD/Head of HR 可作为一号位候选，但需验证管理幅度");
      } else {
        judge -= 12;
        risks.push("顾问裁判：客户要 HRVP，一号位/负责人层级不足，容易在简历关被挑战");
      }
    } else if (hrbp && /commercial|经销|渠道|销售|业务型/.test(projectText)) {
      judge += 6;
      reasons.push("顾问裁判：HRBP title 与商业/渠道支持场景直接贴合");
    }

    if (targetFocusCount >= 2) {
      judge += 5;
      reasons.push("顾问裁判：不只是 HR title，方向证据能支撑客户需求");
    } else if (targetFocusCount === 1) {
      judge += 3;
      reasons.push("顾问裁判：有一个明确方向证据，电话可继续验证深度");
    } else if (policy.hrFocuses.length) {
      judge -= 8;
      risks.push("顾问裁判：方向证据弱，可能只是泛 HR 相关");
    }

    if (hardOdProject) {
      if (hardOdTitle && hardOdEvidence) {
        judge += 12;
        reasons.push("顾问裁判：硬 OD 证据完整，命中组织诊断/架构/编制/岗位价值/人效主线");
      } else if (hardOdTitle || hardOdEvidence) {
        judge += 6;
        reasons.push("顾问裁判：有硬 OD 线索，需电话验证项目深度");
      } else {
        judge -= 22;
        risks.push("顾问裁判：硬 OD 门槛弱，缺少组织诊断/架构设计/编制/岗位价值/人效证据");
      }
      if (consultingEvidence && internetHardwareEvidence) {
        judge += 8;
        reasons.push("顾问裁判：人力咨询 + 互联网/高科技复合背景，符合第一梯队");
      } else if (internetHardwareEvidence || consultingEvidence) {
        judge += 4;
        reasons.push("顾问裁判：来源公司接近 SHEIN OD 目标池");
      }
      if (trainingOnly) {
        judge -= 18;
        risks.push("顾问裁判：更像 TD/培训/学习发展，不是硬 OD 主线");
      }
      if (hrbpOnly) {
        judge -= 16;
        risks.push("顾问裁判：泛 HRBP 缺少硬 OD 项目证据，不应排高");
      }
      if (/招聘|员工关系|行政/.test(titleText) && !hardOdEvidence) {
        judge -= 18;
        risks.push("顾问裁判：职能偏离硬 OD");
      }
    }

    if (odCoe && wantsExecutive && !exactHrvp && !hrd) {
      judge -= 8;
      risks.push("顾问裁判：更像强 COE/专家，不一定能承担 HR 一号位");
    }
    if (commercialBpProject && recruitingCommsNoise) {
      judge -= commercialEvidence ? 12 : 20;
      risks.push("顾问裁判：商业/渠道 HRBP 岗位中，候选人更像招聘/内部沟通/雇主品牌方向，需降级为验证池");
    }
    if (commercialBpProject && !commercialEvidence) {
      judge -= 12;
      risks.push("顾问裁判：商业/渠道 HRBP 缺少销售、渠道、区域或 KA 支持证据，不应直接推荐");
    }
    if (overseasBpProject && !overseasEvidence) {
      judge -= 16;
      risks.push("顾问裁判：海外 BP 缺少出海、跨文化、外派、合规或英文工作场景证据，不应排高");
    }
    if (ecommerceBpProject && !ecommerceEvidence) {
      judge -= 18;
      risks.push("顾问裁判：电商 BP 缺少直播、投手、运营、大促、私域或电商增长团队证据，不应排高");
    }
    if (ecommerceBpProject && overseasEvidence && !ecommerceEvidence) {
      judge -= 8;
      risks.push("顾问裁判：候选人更像海外 BP，而不是电商业务 BP");
    }
    if (customerCenterBpProject && !customerCenterEvidence) {
      judge -= 14;
      risks.push("顾问裁判：用户中心 BP 缺少客服、会员、私域、用户研究、产品培训或体验指标证据");
    }
    if (/行政|人力行政|行政中心/.test(titleText) && wantsExecutive) {
      judge -= 10;
      risks.push("顾问裁判：人力行政混合 title，需确认不是行政负责人包装成 HR");
    }
    if (/苏州|无锡|昆山|常州|上海|南京|杭州|长三角/.test(fullText)) {
      judge += 3;
      reasons.push("顾问裁判：地点/长三角落地风险较低");
    } else if (/苏州|长三角/.test(projectText)) {
      judge -= 4;
      risks.push("顾问裁判：苏州总部落地性没有证据");
    }
    if (record.annualSalary && /100|150|百万|hrvp|副总裁/.test(projectText)) {
      if (record.annualSalary > 1800000) {
        judge -= 6;
        risks.push("顾问裁判：薪酬明显高于预算，客户买单概率下降");
      } else if (record.annualSalary >= 800000) {
        judge += 3;
        reasons.push("顾问裁判：薪酬段接近高阶 HR 预算");
      }
    }
    if (record.hasNotes) {
      judge += 2;
      reasons.push("顾问裁判：人才库备注足够，电话前可判断风险");
    } else {
      judge -= 3;
      risks.push("顾问裁判：缺少备注证据，推荐前不确定性高");
    }
  } else if (policy.roleFamily === "operator") {
    const isTargetCompany = /字节|美团|阿里|小红书|拼多多|pdd|temu|小米|宝洁|贝恩|bcg|pcg|红杉|高瓴|shein|希音/.test(fullText);
    const strategyCore = /战略|策略|商分|商业分析|经营分析|业务分析/.test(titleText);
    const ownerSignal = /国家负责人|品类负责人|业务负责人|经营负责人|中台|治理|体验/.test(fullText);
    const disqualifier =
      /行政|总助|总经理助理|董事长助理|秘书|培训|组织咨询|企业大学/.test(titleText) ||
      /hrbp|hrd|人力资源|人事|招聘|薪酬|员工关系|人才发展|人才保障|人才中心|组织人才|组织发展|组织效能|od\b|people strategy|talent acquisition|recruiting|human resources/.test(fullText);
    const gameStrategy = /腾讯游戏|游戏公司|游戏战略|游戏.*战略|游族|game/.test(fullText);
    const ecommerceOperating = /电商|跨境|零售|消费品|商分|商业分析|品类|国家负责人|country|category/.test(fullText);

    if (isTargetCompany && strategyCore) {
      judge += 10;
      reasons.push("顾问裁判：目标来源公司 + 战略/商分核心 title，客户容易买单");
    }
    if (isTargetCompany && /战略分析经理/.test(titleText)) {
      judge += 3;
      reasons.push("顾问裁判：战略分析经理比泛社区/平台策略更贴近全球经营者目标画像");
    }
    if (ownerSignal) {
      judge += 5;
      reasons.push("顾问裁判：有业务负责人/品类/国家/中台方向信号");
    }
    if (!strategyCore && !ownerSignal) {
      judge -= 10;
      risks.push("顾问裁判：缺少战略/经营/负责人核心证据");
    }
    if (disqualifier) {
      judge -= 18;
      risks.push("顾问裁判：命中已知噪音方向，电话前不应排高");
    }
    if (gameStrategy && !ecommerceOperating) {
      judge -= 12;
      risks.push("顾问裁判：游戏战略是可验证相关，但离跨境电商经营者主线有距离，不应排入 Top10 前列");
    }
    if (/海外|国际化|英语|出海|跨境|global/.test(fullText)) {
      judge += 3;
      reasons.push("顾问裁判：全球化/出海信号对经营者岗位有帮助");
    }
  }

  let cap = 100;
  if (policy.roleFamily === "hr") {
    const wantsExecutive = policy.seniorityIntent === "executive";
    const exactHrvp = /hrvp|chro|cho|人力资源副总裁|首席人才官|首席人力/.test(titleText);
    const hrd = /hrd|人力资源总监|集团人力资源总监|人力资源负责人|head of hr|hr head|人力资源部\s*副总经理/.test(titleText);
    const hardOdProject = policy.hrFocuses.includes("hard_od");
    const hardOdTitle = /组织发展|组织效能|组织管理|组织干部|od\b|岗位管理|编制|人效/.test(titleText);
    const hardOdEvidence = /硬od|组织诊断|组织架构|组织设计|组织治理|组织效能|组织效率|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|管控模式/.test(fullText);
    const trainingOnly = /培训|td\b|ld\b|学习发展|人才发展|企业大学|课程/.test(titleText) && !hardOdEvidence;
    const hrbpOnly = /hrbp|business partner|业务伙伴/.test(titleText) && !hardOdEvidence;
    if (wantsExecutive && hrd && !exactHrvp) cap = Math.min(cap, 92);
    if (wantsExecutive && !exactHrvp && !hrd) cap = Math.min(cap, 76);
    if (hardOdProject && !hardOdTitle && !hardOdEvidence) cap = Math.min(cap, 68);
    if (hardOdProject && (trainingOnly || hrbpOnly)) cap = Math.min(cap, 72);
    if (policy.hrWorkMode === "commercial_bp" && /招聘|talent acquisition|recruiting|内部沟通|雇主品牌/.test(titleText)) {
      cap = Math.min(cap, /commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/.test(fullText) ? 86 : 78);
    }
    if (policy.hrWorkMode === "overseas_bp" && !/海外|出海|国际化|跨文化|外派|eor|gdpr|劳动法规|用工合规|欧洲|德国|西班牙|欧美|英文|英语|global|oversea/.test(fullText)) {
      cap = Math.min(cap, 78);
    }
    if (policy.hrWorkMode === "ecommerce_bp" && !/电商|直播|主播|投手|大促|618|双11|内容平台|私域|微商城|独立站|亚马逊|e-?commerce|amazon|流量/.test(fullText)) {
      cap = Math.min(cap, 74);
    }
    if (policy.hrWorkMode === "customer_center_bp" && !/用户中心|客服|客户服务|会员|私域|微商城|用户研究|产品培训|运动市场部|mkt|consumer|customer|crm|服务质量|体验/.test(fullText)) {
      cap = Math.min(cap, 78);
    }
  }
  if (companyFit.signals.length === 0) cap = Math.min(cap, 88);
  if (policy.roleFamily === "operator" && /腾讯游戏|游戏公司|游戏战略|游戏.*战略|游族|game/.test(fullText) && !/电商|跨境|零售|消费品|商分|商业分析|品类|国家负责人|country|category/.test(fullText)) {
    cap = Math.min(cap, 54);
  }
  if (risks.length >= 3) cap = Math.min(cap, 78);
  else if (risks.length >= 2) cap = Math.min(cap, 84);
  else if (risks.length === 1) cap = Math.min(cap, 94);

  const judgeScore = Math.max(0, Math.min(cap, Math.round(judge)));
  let gate =
    judgeScore >= 90 && risks.length <= 1
      ? "strong_fit"
      : judgeScore >= 74
        ? "fit"
        : judgeScore >= 58
          ? "borderline"
          : "reject";
  if (match.gate === "reject" && judgeScore < 90) {
    gate = "reject";
  }

  return {
    ...match,
    score: judgeScore,
    gate,
    reasons: [...reasons, ...match.reasons],
    concerns: [...risks, ...match.concerns],
    policyTrace: [...match.policyTrace, `顾问裁判分：${judgeScore}`],
    judgeScore,
    judgeReasons: reasons,
    judgeRisks: risks,
  };
}

function buildAdvisorReview(
  analysis: ReturnType<typeof normalizeJobAnalysis>,
  match: CandidateMatch,
): Pick<
  CandidateMatch,
  "advisorTier" | "scenarioEvidence" | "implicitSuccessCriteria" | "companySimilarityBreakdown" | "talentDbInsights" | "phoneVerification" | "policyTrace"
> {
  const policy = buildRequirementPolicy(analysis);
  const record = match.record;
  const fullText = textOf([
    record.companyName,
    record.title,
    record.firstExperienceTitle,
    record.functionPath,
    record.functionTags,
    record.notes,
    record.deepProfileText,
    record.expectedSalary,
  ]);
  const projectText = textOf([
    analysis.projectName,
    analysis.jobBrief.roleTitle,
    analysis.jobBrief.businessContext,
    analysis.jobBrief.mustHave,
    analysis.roleProfile.roleEssence,
    analysis.roleProfile.successProfile,
    analysis.roleProfile.hardConstraints,
    analysis.roleProfile.strongSignals,
    analysis.roleProfile.weakSignals,
    analysis.talentPersona.mustHave,
    analysis.searchMap.keywords,
    analysis.companyTeamBrief.confirmed,
    analysis.deepResearch.companySignals.map((signal) => `${signal.name} ${signal.impact}`),
  ]);
  const scenarioEvidence: string[] = [];
  const implicitSuccessCriteria: string[] = [];
  const companySimilarityBreakdown: string[] = [];
  const talentDbInsights: string[] = [];
  const phoneVerification: string[] = [];
  const projectWantsMedical = /医疗|医药|器械|眼科|诊所|生命科学|医院|药房|healthcare|medical|pharma/.test(projectText);
  const projectWantsOutdoorConsumer = /户外|运动|跑步|越野|攀登|攀岩|登山|徒步|消费品|服装|鞋|品牌|门店|零售|赛事|fuga|trail|climb|outdoor|sports/.test(projectText);
  const projectWantsEcommerce = /电商|直播|主播|投手|大促|618|双11|私域|会员|微商城|线上|独立站|亚马逊|e-?commerce|amazon/.test(projectText);
  const projectWantsOverseas = /海外|出海|国际化|跨文化|外派|欧美|global|oversea|eor|gdpr|英语|英文/.test(projectText);
  const projectWantsCommercial = /commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/.test(projectText);

  const addEvidence = (pattern: RegExp, evidence: string) => {
    if (pattern.test(fullText) && !scenarioEvidence.includes(evidence)) scenarioEvidence.push(evidence);
  };
  const addQuestion = (question: string) => {
    if (!phoneVerification.includes(question)) phoneVerification.push(question);
  };
  const addCriterion = (criterion: string) => {
    if (!implicitSuccessCriteria.includes(criterion)) implicitSuccessCriteria.push(criterion);
  };
  const addSimilarity = (pattern: RegExp, label: string) => {
    if (pattern.test(fullText) && !companySimilarityBreakdown.includes(label)) companySimilarityBreakdown.push(label);
  };

  const noteFit = talentDbNoteSignals(record, projectText);
  talentDbInsights.push(...noteFit.signals, ...noteFit.risks);

  if (policy.roleFamily === "hr") {
    if (policy.hrWorkMode !== "hard_od") {
      addEvidence(/hrbp|business partner|业务伙伴|hr manager|人力资源经理/, "HRBP / HR Manager 职能入口成立");
    }
    addEvidence(/commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/, "商业/销售/渠道支持场景证据");
    addEvidence(/医疗|医药|器械|眼科|诊所|生命科学|pharma|medical|healthcare/, "医疗/生命科学/专业服务生态证据");
    addEvidence(/海外|国际化|global|欧美|英语|英文|跨文化|外派|eor|gdpr/, "海外/跨文化/英文环境证据");
    addEvidence(/电商|直播|主播|投手|大促|618|双11|私域|会员|微商城/, "电商/用户运营/高流动业务支持证据");
    addEvidence(/组织诊断|组织架构|组织设计|编制|岗位价值|人效|od\b|组织效能/, "硬 OD / 组织效能项目证据");
    addEvidence(/薪酬|绩效|激励|奖金|提成|人效|c&b|performance|incentive/, "绩效激励/人效机制证据");
    if (projectWantsOverseas || /mnc|外企|全球|外资|英文|英语/.test(projectText)) {
      addSimilarity(/mnc|外企|global|英文|英语|viatris|拜尔斯道夫|target|thermo|fisher|pfizer|辉瑞|sanofi|海外|出海|国际化|跨文化/, "公司治理/语言环境：外企、出海或全球化组织可迁移");
    }
    if (projectWantsMedical) {
      addSimilarity(/医疗|医药|器械|眼科|诊所|生命科学|pharma|medical|healthcare/, "客户类型：医疗/生命科学/专业服务生态相似");
    }
    if (projectWantsOutdoorConsumer) {
      addSimilarity(/户外|运动|跑步|越野|攀登|攀岩|登山|徒步|消费品|服装|鞋|品牌|门店|零售|赛事|fuga|trail|climb|outdoor|sports|亚玛芬|迪卡侬|耐克|阿迪|安踏|李宁/, "客户类型：户外/运动/消费品牌或零售门店组织相似");
    }
    if (projectWantsCommercial) {
      addSimilarity(/commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/, "渠道结构：销售/渠道/经销商组织相似");
    }
    if (projectWantsEcommerce) {
      addSimilarity(/电商|直播|主播|投手|大促|私域|会员|微商城|用户|客服|customer|crm|线上|独立站|亚马逊|e-?commerce|amazon/, "运营场景：电商/用户运营/服务团队相似");
    }
    addSimilarity(/成长|扩张|变革|重组|组织调整|从0到1|搭建|上市|拟上市/, "组织阶段：增长、变革或体系搭建阶段相似");

    if (policy.hrWorkMode === "commercial_bp") {
      addCriterion("业务负责人买单：能和 GM / Sales Head 对话，而不只是 HR 流程执行");
      addCriterion("渠道组织理解：理解经销商、区域销售、KA 或专业解决方案团队的管理逻辑");
      addCriterion("绩效激励落地：能处理销售目标、提成奖金、人效和组织调整");
      addQuestion("是否直接支持过销售、渠道、经销商、区域或 KA 团队？支持人数和区域范围是多少？");
      addQuestion("是否参与过销售绩效、提成、奖金或大区/渠道组织调整？请举最近一个案例。");
      if (/医疗|眼科|器械|诊所|生命科学|专业解决方案/.test(projectText)) {
        addCriterion("专业生态迁移：理解医疗/器械/生命科学/专业服务客户链路");
        addQuestion("是否理解医疗器械、生命科学、专业解决方案或诊所/医院渠道的销售组织特点？");
      }
      addQuestion("主要业务 stakeholder 是 GM、Sales Head 还是部门负责人？对方最看重 HRBP 什么能力？");
    } else if (policy.hrWorkMode === "overseas_bp") {
      addCriterion("海外组织从 0 到 1：能处理总部外派、本地雇佣、跨文化协作和合规边界");
      addCriterion("英文工作能力：可独立与海外业务负责人沟通并推进问题");
      addCriterion("BP + TA 复合：能支持海外核心岗位招聘和组织规划");
      addQuestion("具体支持过哪些国家/区域？总部外派、本地雇佣、EOR/contractor 和合规分别做过什么？");
      addQuestion("英文是否能独立和海外业务负责人沟通？最近一次英文工作场景是什么？");
      addQuestion("是否做过海外核心岗位招聘、跨文化管理或外派政策落地？");
    } else if (policy.hrWorkMode === "ecommerce_bp") {
      addCriterion("高节奏业务贴身：能支持直播、投手、运营、内容或电商增长团队");
      addCriterion("大促和激励机制：经历过 618/双11/大促人力调配和绩效复盘");
      addCriterion("高流动治理：能处理年轻团队流失、稀缺岗位招聘和快速组织迭代");
      addQuestion("是否支持过电商、直播、投手、运营团队？业务规模、流失率和节奏如何？");
      addQuestion("是否参与 618、双11 或大促人力调配、临时激励、绩效复盘？");
      addQuestion("是否处理过年轻团队高流失、稀缺岗位猎聘和快速迭代的管理问题？");
    } else if (policy.hrWorkMode === "customer_center_bp") {
      addCriterion("用户/服务团队理解：能支持客服、会员、私域、用户研究、产品培训或市场运营");
      addCriterion("服务质量与人效：能处理排班、效率、服务质量、绩效激励和体验指标");
      addQuestion("是否支持过客服、会员、私域、用户研究、产品培训或市场/用户运营团队？");
      addQuestion("是否处理过服务质量、人效、排班、绩效激励或用户体验相关组织问题？");
      addQuestion("候选人更偏服务运营 BP、MKT BP，还是泛后台 HR？");
    } else if (policy.hrWorkMode === "hard_od") {
      addCriterion("硬 OD 深度：组织诊断、架构设计、编制、岗位价值、人效至少有多个真实项目");
      addCriterion("方案到落地：不是只出 PPT，而是能推动业务和管理层执行");
      addQuestion("是否主导过组织诊断、组织架构设计、编制管理、岗位价值评估或人效提升？分别做到什么深度？");
      addQuestion("项目覆盖的业务规模、复杂度和落地结果是什么？是方案设计者还是参与者？");
      addQuestion("方法论来自甲方实战还是咨询项目？能否迁移到当前组织阶段？");
    } else if (policy.hrWorkMode === "hr_leader") {
      addCriterion("一号位复杂度：真正管过 HR 全模块、团队和业务高管协同");
      addCriterion("组织结果：能证明组织、干部、绩效、文化或变革带来业务结果");
      addQuestion("是否真正承担过 HR 一号位责任？汇报对象、团队规模和模块覆盖如何？");
      addQuestion("最关键的组织、干部、绩效或文化变革案例是什么？结果如何衡量？");
      addQuestion("薪酬、地点、老板风格和替代/新增背景是否可接受？");
    } else {
      addCriterion("职能边界清楚：确认候选人实际是 BP、COE、SSC 还是综合 HR 管理");
      addQuestion("实际支持的业务对象是谁？是 BP、COE、SSC 还是综合 HR 管理？");
      addQuestion("最近一个能证明岗位核心能力的案例是什么？候选人承担了什么责任？");
    }
  } else if (policy.roleFamily === "operator") {
    addCriterion("经营者潜力：不只是分析，必须有业务落地、增长或资源推动证据");
    addCriterion("目标来源优先：互联网/电商/消费/咨询/投资背景必须和经营执行结合");
    addEvidence(/战略|策略|商分|商业分析|经营分析|业务分析/, "战略/商分/经营分析主线");
    addEvidence(/电商|跨境|海外|国际化|品类|国家负责人|中台|治理|体验/, "电商/跨境/品类/国家/中台场景");
    addEvidence(/落地|推动|增长|年度规划|竞品|roi|gtm|项目管理/, "策略落地和经营推动证据");
    addQuestion("候选人做的是分析建议，还是对业务结果和落地负责？最近一次推动结果是什么？");
    addQuestion("是否有电商、跨境、消费品、品类、国家或中台治理相关业务体感？");
    addQuestion("为什么愿意从当前路径转向业务负责人/经营者路径？");
  } else if (policy.roleFamily === "procurement") {
    addCriterion("采购主轴成立：title/function 必须是采购、供应链或供应商管理，不被行业词劫持");
    addCriterion("品类和规模可验证：需要确认采购品类、金额、供应商和成本结果");
    addEvidence(/采购|procurement|sourcing|供应商|招标|询价|合同|成本|供应链/, "采购/供应链/供应商管理主线");
    addEvidence(/硬件|gpu|算力|服务器|数据中心|租赁|nvidia|amd|电子设备/, "品类/技术场景证据");
    addQuestion("采购品类、年度规模、核心供应商和议价机制是什么？");
    addQuestion("是否主导过供应商寻源、招标询价、合同谈判、成本下降或供应风险处理？");
    addQuestion("是否带团队？团队规模、分工和绩效指标是什么？");
  } else {
    addQuestion("候选人的 title/function 与岗位核心职责如何对应？");
    addQuestion("有哪些可量化案例能证明当前项目的 must-have？");
    addQuestion("薪酬、地点、动机和到岗风险分别是什么？");
  }

  const riskCount = match.concerns.length + (match.judgeRisks?.length || 0);
  const hasScenarioEvidence = scenarioEvidence.length >= 2 || (scenarioEvidence.length >= 1 && match.score >= 88);
  const advisorTier =
    match.gate === "reject"
      ? "reject"
      : match.score >= 88 && hasScenarioEvidence && riskCount <= 2
        ? "client_ready"
        : match.score >= 72
          ? "phone_validate"
          : "watchlist";

  return {
    advisorTier,
    scenarioEvidence: scenarioEvidence.slice(0, 6),
    implicitSuccessCriteria: implicitSuccessCriteria.slice(0, 5),
    companySimilarityBreakdown: companySimilarityBreakdown.slice(0, 5),
    talentDbInsights: talentDbInsights.slice(0, 5),
    phoneVerification: phoneVerification.slice(0, 4),
    policyTrace: [...match.policyTrace, `顾问分层：${advisorTier}`],
  };
}

function evidenceBuckets(match: CandidateMatch): Pick<CandidateMatch, "verifiedFacts" | "weakSignals" | "inferredFit" | "verificationGaps"> {
  const reasons = [...match.reasons, ...(match.scenarioEvidence ?? []), ...(match.talentDbInsights ?? [])];
  const verifiedFacts = reasons
    .filter((item) => /强约束|核心证据|title|职能|服务场景命中|岗位成败关键|人才库备注|顾问备注|薪酬带|地点硬约束/.test(item))
    .slice(0, 8);
  const weakSignals = reasons
    .filter((item) => /公司背景|目标来源|相似|全球化|英语|出海|可达性|命中 \d+ 个|画像信号/.test(item))
    .slice(0, 8);
  const inferredFit = [
    ...(match.implicitSuccessCriteria ?? []).map((item) => `岗位成功标准推断：${item}`),
    ...(match.companySimilarityBreakdown ?? []).map((item) => `公司/场景可迁移推断：${item}`),
  ].slice(0, 8);
  const verificationGaps = [...match.concerns, ...(match.phoneVerification ?? [])].slice(0, 10);

  return {
    verifiedFacts,
    weakSignals,
    inferredFit,
    verificationGaps,
  };
}

function candidateLabel(match: CandidateMatch) {
  return `${match.record.name || match.record.chineseName || match.record.englishName || "未命名"} / ${match.record.companyName || "未填公司"} / ${
    match.record.title || match.record.firstExperienceTitle || "未填职位"
  }`;
}

function compareShortlistMatches(analysis: ReturnType<typeof normalizeJobAnalysis>, matches: CandidateMatch[]): CandidateMatch[] {
  const roleProfile = analysis.roleProfile;
  const essence = roleProfile.roleEssence || analysis.hunterReasoningKernel.roleNucleus || analysis.jobBrief.roleTitle || "当前岗位";

  return matches.map((match, index) => {
    const previous = index > 0 ? matches[index - 1] : null;
    const next = index < matches.length - 1 ? matches[index + 1] : null;
    const differentiators = uniqueStrings([
      ...(match.verifiedFacts ?? []),
      ...(match.judgeReasons ?? []),
      ...match.reasons,
    ])
      .filter((item) => /强约束|目标来源|战略|策略|商分|经营|业务|品类|国家|中台|治理|体验|落地|增长|负责人|title|职能|人才库备注|roleProfile/.test(item))
      .slice(0, 5);
    const tradeoffs = uniqueStrings([
      ...(match.verificationGaps ?? []),
      ...(match.judgeRisks ?? []),
      ...match.concerns,
    ])
      .filter(Boolean)
      .slice(0, 5);
    const relativeNotes = [
      previous ? `相对上一名 ${candidateLabel(previous)}：分差 ${Math.round(previous.score - match.score)}，需要用事实证据补齐差距。` : "当前为本轮排序第一梯队，用作校准锚点。",
      next ? `相对下一名 ${candidateLabel(next)}：领先 ${Math.round(match.score - next.score)}，主要看强证据是否更贴近岗位本质。` : "当前处在本轮候选池尾部，应重点判断是否仍值得电话验证。",
    ];

    return {
      ...match,
      comparisonRank: index + 1,
      comparisonVerdict: `第 ${index + 1} 名：围绕「${essence}」排序。${relativeNotes.join(" ")}`,
      differentiators,
      tradeoffs,
    };
  });
}

export async function scanProjectLonglist(projectId: string, options: ScanOptions = {}) {
  const project = await getProjectWithRelations(projectId);

  if (!project || !project.jobBrief) {
    return { error: "项目或岗位画像不存在", status: 404 as const };
  }

  const analysis = normalizeJobAnalysis(parseJson<unknown>(project.jobBrief.structuredJson, {}));
  const companyTerms = compactTerms([
    analysis.jobBrief.clientCompany,
    analysis.searchMap.targetCompanies,
    analysis.roleProfile.sourceArchetypes,
    analysis.deepResearch.companySimilarityMap,
    analysis.deepResearch.companySignals.map((item) => item.name),
    analysis.deepResearch.peopleNodes.map((item) => item.name),
  ]);
  const terms = compactTerms([
    analysis.jobBrief.clientCompany,
    analysis.jobBrief.roleTitle,
    analysis.jobBrief.businessContext,
    analysis.searchMap.targetIndustries,
    analysis.searchMap.targetCompanies,
    analysis.searchMap.targetTitles,
    analysis.searchMap.keywords,
    analysis.roleProfile.successProfile,
    analysis.roleProfile.hardConstraints,
    analysis.roleProfile.strongSignals,
    analysis.roleProfile.weakSignals,
    analysis.talentPersona.mustHave,
    analysis.talentPersona.strongMatch,
    analysis.companyTeamBrief.confirmed,
    analysis.companyTeamBrief.missing,
  ]);

  if (!terms.length) {
    return { added: 0, updated: 0, matched: 0, reason: "项目信息不足，等待补充岗位名称或人才画像。" };
  }

  const requirementPolicy = buildRequirementPolicy(analysis);
  const consultantFeedback = parseConsultantFeedback(project);
  const { records } = await getPersolReportData();
  const filteredRecords = records.filter((record) => isUsableCandidate(record));
  const rankedMatches: CandidateMatch[] = filteredRecords
    .map((record) => {
      const codexFit = evaluateCandidateAgainstCodexPolicy(analysis, record);
      const keywordFit = scoreCandidate(record, terms, companyTerms, requirementPolicy.roleFamily);
      const score = Math.min(100, Math.round(codexFit.score + Math.min(6, keywordFit.score * 0.06)));
      const judged = consultantJudgeCandidate(analysis, {
        record,
        score,
        reasons: [...codexFit.reasons, ...keywordFit.reasons.slice(0, 3)],
        concerns: codexFit.concerns,
        policyTrace: codexFit.policyTrace,
        gate: codexFit.gate,
      });
      const reviewed = { ...judged, ...buildAdvisorReview(analysis, judged) };
      const gated = applyRequirementGatesToMatch(analysis, applyConsultantFeedback(reviewed, matchConsultantFeedback(record, consultantFeedback)));
      return { ...gated, ...evidenceBuckets(gated) };
    })
    .filter((item) => item.gate !== "reject" && item.score >= 55)
    .sort((a, b) => b.score - a.score || b.record.lastUpdateDate.localeCompare(a.record.lastUpdateDate));
  const limit = options.limit ?? 50;
  const fitMatches = rankedMatches.filter((item) => item.gate === "strong_fit" || item.gate === "fit");
  const borderlineMatches = rankedMatches.filter((item) => item.gate === "borderline");
  const matches = compareShortlistMatches(analysis, [...fitMatches, ...borderlineMatches].slice(0, limit));

  let added = 0;
  let updated = 0;
  let stale = 0;
  const archived = 0;
  const matchedExternalIds = matches.map((match) => String(match.record.id));

  for (const match of matches) {
    const snapshot = stripSearchText(match.record);
    const externalCandidateId = String(snapshot.id);
    const existing = await prisma.candidate.findFirst({
      where: { projectId, externalSource: "persol", externalCandidateId },
      select: { id: true, status: true, funnelStatus: true, screeningResults: { take: 1, select: { id: true } } },
    });
    const reactivatedStatus =
      existing?.status === "stale_scan" || existing?.status === "archived" || existing?.funnelStatus === "archived"
        ? existing.screeningResults.length
          ? "screened"
          : "pending_screening"
        : undefined;
    const candidateData = {
      name: snapshot.name || snapshot.chineseName || snapshot.englishName || null,
      currentCompany: snapshot.companyName || null,
      currentTitle: snapshot.title || snapshot.firstExperienceTitle || null,
      rawProfile: snapshotToRawProfile(snapshot),
      externalSource: "persol",
      externalCandidateId,
      snapshotJson: JSON.stringify({
        ...snapshot,
        matchScore: match.score,
        matchReasons: match.reasons,
        matchConcerns: match.concerns,
        matchGate: match.gate,
        advisorTier: match.advisorTier,
        scenarioEvidence: match.scenarioEvidence,
        implicitSuccessCriteria: match.implicitSuccessCriteria,
        companySimilarityBreakdown: match.companySimilarityBreakdown,
        talentDbInsights: match.talentDbInsights,
        phoneVerification: match.phoneVerification,
        verifiedFacts: match.verifiedFacts,
        weakSignals: match.weakSignals,
        inferredFit: match.inferredFit,
        verificationGaps: match.verificationGaps,
        comparisonRank: match.comparisonRank,
        comparisonVerdict: match.comparisonVerdict,
        differentiators: match.differentiators,
        tradeoffs: match.tradeoffs,
        judgeScore: match.judgeScore,
        judgeReasons: match.judgeReasons,
        judgeRisks: match.judgeRisks,
        consultantFeedback: match.consultantFeedback,
        policyTrace: match.policyTrace,
        requirementPolicy,
      }),
      ...(reactivatedStatus ? { status: reactivatedStatus } : {}),
      ...(existing?.funnelStatus === "archived" ? { funnelStatus: "longlist" } : {}),
    };

    await prisma.candidate.upsert({
      where: {
        projectId_externalSource_externalCandidateId: {
          projectId,
          externalSource: "persol",
          externalCandidateId,
        },
      },
      update: candidateData,
      create: {
        ...candidateData,
        projectId,
        funnelStatus: "longlist",
        status: "pending_screening",
      },
    });

    if (existing) updated += 1;
    else added += 1;

    if (options.runId) {
      await prisma.agentEvidence.create({
        data: {
          runId: options.runId,
          sourceType: "talent_db",
          sourceName: `${candidateData.name || "未命名"} / ${candidateData.currentCompany || "未填公司"}`,
          sourceStatus: "talent_db_match",
          content: `人才库匹配分 ${match.score}（${match.gate}）：${match.reasons.slice(0, 4).join("；") || "基础字段命中项目画像"}${match.concerns.length ? `；风险：${match.concerns.slice(0, 2).join("；")}` : ""}`,
          confidence: Math.min(92, Math.max(45, match.score)),
          metadataJson: JSON.stringify({
            externalSource: "persol",
            externalCandidateId,
            company: candidateData.currentCompany,
            title: candidateData.currentTitle,
            score: match.score,
            reasons: match.reasons,
            concerns: match.concerns,
            gate: match.gate,
            consultantFeedback: match.consultantFeedback,
            policyTrace: match.policyTrace,
          }),
        },
      });
    }
  }

  const staleResult = await prisma.candidate.updateMany({
    where: {
      projectId,
      externalSource: "persol",
      externalCandidateId: { notIn: matchedExternalIds },
      funnelStatus: "longlist",
      status: { not: "stale_scan" },
      recommendationReports: { none: {} },
    },
    data: {
      status: "stale_scan",
    },
  });
  stale = staleResult.count;

  await refreshProjectStats(projectId);
  const nextProject = options.includeProject === false ? null : await getProjectWithRelations(projectId);

  return {
    added,
    updated,
    stale,
    archived,
    removed: archived,
    matched: matches.length,
    matches: matches.map((match) => ({
      id: match.record.id,
      name: match.record.name || match.record.chineseName || match.record.englishName,
      company: match.record.companyName,
      title: match.record.title || match.record.firstExperienceTitle,
      score: match.score,
      reasons: match.reasons,
      concerns: match.concerns,
      verifiedFacts: match.verifiedFacts,
      weakSignals: match.weakSignals,
      inferredFit: match.inferredFit,
      verificationGaps: match.verificationGaps,
      comparisonRank: match.comparisonRank,
      comparisonVerdict: match.comparisonVerdict,
      differentiators: match.differentiators,
      tradeoffs: match.tradeoffs,
      gate: match.gate,
    })),
    project: nextProject ? serializeProject(nextProject) : null,
  };
}
