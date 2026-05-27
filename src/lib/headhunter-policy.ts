import type { JobAnalysis } from "@/lib/job-schema";
import type { PersolCandidateRecord } from "@/lib/persol-report-data";
import { CODEX_ADVISOR_POLICY_VERSION, codexAdvisorSearchPrinciples } from "@/lib/codex-advisor-policy";
import { applyRequirementGateScore, evaluateRequirementGates } from "@/lib/requirement-gates";

export type RequirementPolicy = {
  policyVersion: string;
  hardSignals: string[];
  softSignals: string[];
  weakHypotheses: string[];
  roleFamily: "hr" | "operator" | "commercial" | "procurement" | "finance" | "legal" | "technology" | "general";
  hrFocuses: HrFocus[];
  hrWorkMode: HrWorkMode;
  seniorityIntent: "executive" | "lead" | "manager" | "individual" | "unknown";
  searchPrinciples: string[];
};

type HrFocus =
  | "hard_od"
  | "overall_hr_leader"
  | "organizational_development"
  | "business_hr"
  | "cadre_management"
  | "compensation_performance"
  | "recruiting_talent_supply"
  | "group_hr_system"
  | "culture_change"
  | "hr_digital";

type HrWorkMode =
  | "hr_leader"
  | "business_bp"
  | "commercial_bp"
  | "overseas_bp"
  | "ecommerce_bp"
  | "customer_center_bp"
  | "hard_od"
  | "coe_specialist"
  | "unknown";

export type CandidatePolicyFit = {
  score: number;
  reasons: string[];
  concerns: string[];
  policyTrace: string[];
  gate: "strong_fit" | "fit" | "borderline" | "reject";
};

function compact(values: Array<string | string[] | null | undefined>) {
  return values.flatMap((value) => (Array.isArray(value) ? value : [value])).filter(Boolean).join(" ").toLowerCase();
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function countHits(text: string, values: string[]) {
  return values.filter((value) => value && text.includes(value.toLowerCase())).length;
}

function companyTokens(values: Array<string | null | undefined>) {
  const tokens = new Set<string>();
  const blocked = /^(待确认|未知|客户公司|client company|company|目标公司|保密客户)$/i;

  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw || blocked.test(raw)) continue;

    for (const part of raw.split(/[,，、/|;；()（）\s]+/)) {
      const token = part.trim().toLowerCase();
      if (token.length >= 2 && !blocked.test(token)) tokens.add(token);
    }
  }

  if ([...tokens].some((token) => /shein|希音/.test(token))) {
    tokens.add("shein");
    tokens.add("希音");
  }

  return [...tokens];
}

function currentClientCompanyHit(analysis: JobAnalysis, record: PersolCandidateRecord) {
  const companyText = compact([record.companyName]);
  if (!companyText) return null;

  const tokens = companyTokens([
    analysis.jobBrief.clientCompany,
    analysis.intakeBuilder.structuredBrief.clientCompany,
  ]);

  return tokens.find((token) => companyText.includes(token)) ?? null;
}

function operatorTargetSourceText(record: PersolCandidateRecord) {
  return compact([record.companyName, record.title, record.firstExperienceTitle, record.notes, record.deepProfileText]);
}

function operatorExecutionText(record: PersolCandidateRecord) {
  return compact([record.title, record.firstExperienceTitle, record.functionPath, record.notes, record.deepProfileText]);
}

const OPERATOR_STATIC_SOURCE_PATTERNS: RegExp[] = [
  // 国内互联网大厂
  /字节|bytedance|tiktok|抖音/,
  /美团|meituan/,
  /拼多多|pdd|temu/,
  /阿里|alibaba|lazada|速卖通|淘宝|天猫|阿里云|蚂蚁/,
  /腾讯|tencent|pcg|cdg|ieg|csig|wxg|微信/,
  /京东|jd\.com|jingdong/,
  /百度|baidu/,
  /滴滴|嘀嘀|didi/,
  /快手|kuaishou/,
  /网易|netease/,
  /小红书|xiaohongshu|rednote/,
  /携程|trip\.com|ctrip/,
  /哔哩哔哩|b站|bilibili/,
  /唯品会|vipshop/,
  /知乎|zhihu/,
  /微博|weibo/,
  /shopee/,
  /shein|希音/,
  // 硬件/新能源/出行
  /华为|huawei/,
  /小米|xiaomi/,
  /oppo|vivo/,
  /蔚来|nio/,
  /理想汽车|li auto/,
  /小鹏|xpeng/,
  /比亚迪|byd/,
  /宁德时代|catl/,
  /大疆|dji/,
  // 消费品/快消
  /宝洁|p&g|procter/,
  /联合利华|unilever/,
  /欧莱雅|l'oreal|loreal/,
  /玛氏|mars/,
  /雀巢|nestlé|nestle/,
  /可口可乐|coca[- ]cola/,
  /百威|budweiser|ab inbev/,
  /星巴克|starbucks/,
  /麦当劳|mcdonald/,
  /帝亚吉欧|diageo/,
  /保乐力加|pernod ricard/,
  /玛氏箭牌|mars wrigley/,
  /玛氏中国/,
  // 咨询
  /麦肯锡|mckinsey/,
  /贝恩|bain/,
  /\bbcg\b/,
  /罗兰贝格|roland berger/,
  /科尔尼|kearney/,
  /奥利弗|oliver wyman/,
  /埃森哲|accenture/,
  /普华永道|pwc/,
  /德勤|deloitte/,
  /安永|\bey\b/,
  /毕马威|kpmg/,
  // 投资 (PE / VC / HF)
  /红杉|sequoia/,
  /高瓴|hillhouse/,
  /\bidg\b/,
  /\bggv\b/,
  /经纬|matrix partners/,
  /启明|qiming/,
  /五源|5y capital/,
  /钟鼎|cdh/,
  /kkr|凯雷|carlyle|黑石|blackstone|warburg|hsg|chinarock/,
  // 跨国互联网/科技
  /google|谷歌/,
  /microsoft|微软/,
  /apple|苹果/,
  /meta|facebook/,
  /amazon|亚马逊/,
  /\bnvidia\b|英伟达/,
  /tesla|特斯拉/,
  /\bibm\b/,
  /\bsap\b/,
  /\boracle\b/,
];

function extractDynamicOperatorTerms(analysis: JobAnalysis): string[] {
  const sources = [
    ...analysis.hunterReasoningKernel.searchDiscipline.primaryPool,
    ...analysis.hunterReasoningKernel.searchDiscipline.expansionPool,
    ...analysis.roleProfile.sourceArchetypes,
    ...analysis.roleProfile.strongSignals,
    ...analysis.searchMap.targetCompanies,
    ...analysis.searchMap.targetIndustries,
    ...analysis.deepResearch.companySimilarityMap,
    ...analysis.deepResearch.companySignals.map((node) => node.name),
  ];
  const terms = new Set<string>();
  for (const value of sources) {
    if (!value) continue;
    // 切分公司名候选词 — 留长度 ≥ 2 的纯名词片段，丢掉介词性语言
    const tokens = String(value)
      .split(/[（）()、，。；：,;:|\/\\\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2 && t.length <= 30 && !/^(及|或|和|与|the|of|in|for|inc|ltd|llc|集团|公司|股份|有限|科技|管理|咨询|投资|品牌|事业|部门)$/.test(t));
    for (const token of tokens) terms.add(token);
  }
  return [...terms];
}

function hasOperatorTargetSource(text: string, dynamicTerms: string[] = []) {
  if (includesAny(text, OPERATOR_STATIC_SOURCE_PATTERNS)) return true;
  if (!dynamicTerms.length) return false;
  return dynamicTerms.some((term) => term && text.includes(term));
}

function hasStrongOperatorExecution(text: string) {
  return includesAny(text, [
    /战略|策略|商分|商业分析|经营分析|业务分析/,
    /年度规划|竞品分析|业务增量|增长策略|资源管理|roi|gtm/,
    /品类|国家负责人|国家经理|中台|治理|体验/,
    /跨境电商|国际化电商|海外业务|出海业务/,
  ]);
}

function detectRoleFamily(text: string): RequirementPolicy["roleFamily"] {
  if (/全球经营者|经营者|国家负责人|品类负责人|中台|country manager|category manager|business head/.test(text)) return "operator";
  if (/hrvp|chro|cho|hrbp|hrd|head of hr|human resources|人力资源|人事|首席人才官|首席人力/.test(text)) return "hr";
  if (/采购|供应商|招标|询价|合同签订|sourcing|procurement|supplier|vendor/.test(text)) return "procurement";
  if (/薪酬|绩效|员工关系|组织发展|od专家|组织诊断|组织架构|组织设计|组织效能|编制管理|岗位价值|人才发展|招聘|干部管理/.test(text)) return "hr";
  if (/全球经营者|经营者|国家负责人|品类负责人|中台|商分|商业分析|策略|战略|经营分析|业务负责人|运营负责人|category|country manager|business head|strategy|business analysis/.test(text)) return "operator";
  if (/commercial|sales|销售|商务|渠道|经销商|市场|增长/.test(text)) return "commercial";
  if (/finance|cfo|财务|资金|审计|税务/.test(text)) return "finance";
  if (/legal|法务|合规|律师|总法律顾问/.test(text)) return "legal";
  if (/cto|技术|研发|工程|产品|数据|算法|ai|软件/.test(text)) return "technology";
  return "general";
}

function detectSeniority(text: string): RequirementPolicy["seniorityIntent"] {
  if (/vp|副总裁|chro|cho|cto|cfo|coo|ceo|首席|总裁|总经理|head|负责人/.test(text)) return "executive";
  if (/director|总监|负责人|head|lead|leader/.test(text)) return "lead";
  if (/manager|经理|主管/.test(text)) return "manager";
  if (/specialist|专员|顾问/.test(text)) return "individual";
  return "unknown";
}

function detectHrFocuses(text: string): HrFocus[] {
  const focuses = new Set<HrFocus>();
  const bpIntent = /hrbp|business partner|业务伙伴|业务型/.test(text);
  if (!bpIntent && /硬od|od专家|组织发展岗|组织发展专家|组织诊断|组织架构设计|组织设计|组织治理|组织效率|组织效能|编制管理|编制规划|岗位管理|岗位称重|岗位价值|岗位评估|人效管理|人效分析|管控模式/.test(text)) {
    focuses.add("hard_od");
  }
  if (/全面负责|全面统筹|综合管理|hr一号位|人力资源一号位|人力资源管理工作|各模块|全模块|组织、招聘、绩效、薪酬|组织发展、招聘/.test(text)) {
    focuses.add("overall_hr_leader");
  }
  if (/组织发展|组织效能|组织架构|岗位体系|管理机制|人才盘点|od\b|organization development|organizational effectiveness/.test(text)) {
    focuses.add("organizational_development");
  }
  if (/业务型|业务高管伙伴|业务伙伴|业务一线|业务增长|业务支持|业务推动|hrbp|business partner|组织、人才、绩效和激励解决方案/.test(text)) {
    focuses.add("business_hr");
  }
  if (/干部|中高层|继任|领导力|核心人才培养|关键人才梯队|人才梯队|干部标准|succession|leadership/.test(text)) {
    focuses.add("cadre_management");
  }
  if (/薪酬|绩效|激励|目标管理|绩效评价|奖金|人效|c&b|compensation|performance|incentive/.test(text)) {
    focuses.add("compensation_performance");
  }
  if (/招聘|人才供应链|人才引进|人才地图|猎头|关键岗位招聘|高管招聘|talent acquisition|recruiting/.test(text)) {
    focuses.add("recruiting_talent_supply");
  }
  if (/集团|集团化|总部|业务单元|bu|hr协同|管理体系|共享|coe|ssc/.test(text)) {
    focuses.add("group_hr_system");
  }
  if (/企业文化|组织变革|使命|愿景|价值观|管理沟通|凝聚力|认同感|变革|culture|change management/.test(text)) {
    focuses.add("culture_change");
  }
  if (/数字化|hr系统|人力数据|人效分析|人才画像|管理驾驶舱|data|analytics|dashboard|people analytics/.test(text)) {
    focuses.add("hr_digital");
  }
  return [...focuses];
}

function detectHrWorkMode(text: string): HrWorkMode {
  const bpIntent = /hrbp|business partner|业务伙伴|业务型/.test(text);
  if (bpIntent && /用户中心|客服|客户服务|用户研究|产品培训|会员运营|私域运营|微商城|运动市场部|消费者|customer|member|crm/.test(text)) {
    return "customer_center_bp";
  }
  if (bpIntent && /欧美海外|海外\s*bp|海外\s*hrbp|global\s*hrbp|出海.*bp|bp.*出海|bp.*海外|跨文化.*bp/.test(text)) {
    return "overseas_bp";
  }
  if (bpIntent && /电商\s*bp|电商.*hrbp|hrbp.*电商|电商.*业务伙伴|直播.*bp|bp.*直播|投手.*bp|bp.*大促/.test(text)) {
    return "ecommerce_bp";
  }
  if (bpIntent && /commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/.test(text)) {
    return "commercial_bp";
  }
  if (bpIntent && /电商|直播|主播|投手|618|双11|大促|流量|内容平台|e-?commerce/.test(text)) {
    return "ecommerce_bp";
  }
  if (bpIntent && /欧美|海外|出海|国际化|跨文化|外派|eor|gdpr|劳动法规|用工合规|英语|英文|global|oversea/.test(text)) {
    return "overseas_bp";
  }
  if (bpIntent) return "business_bp";
  if (/硬od|od专家|组织发展岗|组织诊断|组织架构设计|组织设计|组织治理|组织效率|组织效能|编制管理|岗位称重|岗位价值|人效管理/.test(text)) {
    return "hard_od";
  }
  if (/全面负责|全面统筹|综合管理|hr一号位|人力资源一号位|hrvp|chro|cho|人力资源副总裁|head of hr|hr head/.test(text)) {
    return "hr_leader";
  }
  if (/组织发展|薪酬|绩效|招聘|员工关系|干部管理|人才发展|数字化|coe|c&b|talent acquisition/.test(text)) {
    return "coe_specialist";
  }
  return "unknown";
}

const hrWorkModeLabel: Record<HrWorkMode, string> = {
  hr_leader: "HR 一号位",
  business_bp: "业务 HRBP",
  commercial_bp: "商业/渠道 HRBP",
  overseas_bp: "海外/跨文化 HRBP",
  ecommerce_bp: "电商业务 HRBP",
  customer_center_bp: "用户/服务团队 HRBP",
  hard_od: "硬 OD/组织效能",
  coe_specialist: "COE 专项",
  unknown: "未明确",
};

const hrWorkModeSignalMap: Record<HrWorkMode, { positive: RegExp[]; negative: RegExp[] }> = {
  hr_leader: {
    positive: [/hrvp|chro|cho|人力资源副总裁|人力资源负责人|hrd|人力资源总监|head of hr|hr head|全模块|集团人力资源/],
    negative: [/hrbp|专员|主管|单一模块|只做招聘|只做培训/],
  },
  business_bp: {
    positive: [/hrbp|business partner|业务伙伴|bu hr|支持业务|贴近业务|业务一线|hr manager|人力资源经理/],
    negative: [/纯coe|纯ssc|纯招聘|纯培训|组织咨询|行政/],
  },
  commercial_bp: {
    positive: [/hrbp|business partner|业务伙伴|commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor|hr manager|人力资源经理/],
    negative: [/纯coe|纯ssc|纯招聘|纯培训|组织咨询|行政|纯od/],
  },
  overseas_bp: {
    positive: [/hrbp|business partner|海外hr|global hr|国际化|出海|海外|欧美|跨文化|外派|eor|gdpr|用工合规|英语|英文|海外招聘|海外人才/],
    negative: [/纯国内|纯工厂|纯行政|纯od|纯薪酬|纯招聘交付/],
  },
  ecommerce_bp: {
    positive: [/hrbp|business partner|电商|直播|主播|投手|大促|618|双11|绩效激励|销售激励|内容平台|私域|微商城/],
    negative: [/纯od|纯行政|纯制造|纯工厂|纯培训|纯招聘交付/],
  },
  customer_center_bp: {
    positive: [/hrbp|business partner|用户中心|客服|客户服务|会员|私域|微商城|用户研究|产品培训|市场部|mkt|consumer|customer|crm|人力资源经理/],
    negative: [/纯od|组织发展专家|编制管理|岗位价值|纯招聘|纯薪酬|行政/],
  },
  hard_od: {
    positive: [/硬od|组织诊断|组织架构|组织设计|组织治理|组织效能|组织效率|编制|岗位价值|岗位评估|岗位称重|人效|管控模式|od\b/],
    negative: [/hrbp|培训|td\b|ld\b|学习发展|招聘|员工关系|行政/],
  },
  coe_specialist: {
    positive: [/组织发展|薪酬|绩效|招聘|员工关系|干部管理|人才发展|数字化|coe|c&b|talent acquisition|recruiting/],
    negative: [/行政|秘书|总助/],
  },
  unknown: {
    positive: [],
    negative: [],
  },
};

const hrFocusSignalMap: Record<HrFocus, { label: string; patterns: RegExp[]; risks: RegExp[] }> = {
  hard_od: {
    label: "硬 OD/组织效能",
    patterns: [/硬od|组织诊断|组织架构|组织设计|组织治理|组织效能|组织效率|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|管控模式|od\b/],
    risks: [/hrbp|培训|td\b|ld\b|学习发展|招聘|员工关系|行政/],
  },
  overall_hr_leader: {
    label: "综合 HR 一号位",
    patterns: [/hrvp|chro|cho|人力资源副总裁|人力资源负责人|hr head|head of hr|全模块|组织.*招聘.*薪酬.*绩效|集团人力资源总监/],
    risks: [/只负责招聘|只负责薪酬|只负责培训|单一模块/],
  },
  organizational_development: {
    label: "组织发展/组织效能",
    patterns: [/组织发展|组织效能|组织架构|组织设计|岗位体系|岗位价值|岗位评估|编制|人才盘点|od\b|组织诊断|管理机制|人效/],
    risks: [/纯招聘|纯薪酬|纯员工关系/],
  },
  business_hr: {
    label: "业务型 HR 负责人",
    patterns: [/hrbp|业务伙伴|business partner|支持业务|贴近业务|业务一线|业务增长|商业团队|销售团队|bu hr/],
    risks: [/纯coe|纯ssc|后台模块/],
  },
  cadre_management: {
    label: "干部管理/继任梯队",
    patterns: [/干部|继任|领导力|人才盘点|关键人才|核心人才|人才梯队|管理干部|succession|leadership/],
    risks: [/校园招聘|基础招聘|薪酬核算/],
  },
  compensation_performance: {
    label: "薪酬绩效/激励",
    patterns: [/薪酬|绩效|激励|奖金|目标管理|人效|c&b|compensation|performance|incentive|total reward/],
    risks: [/只做招聘|只做培训|只做文化活动/],
  },
  recruiting_talent_supply: {
    label: "招聘与人才供应链",
    patterns: [/招聘|人才引进|人才供应链|人才地图|猎头|高管招聘|关键岗位|talent acquisition|recruiting|sourcing/],
    risks: [/只做员工关系|只做薪酬核算/],
  },
  group_hr_system: {
    label: "集团 HR 体系",
    patterns: [/集团|总部|业务单元|bu|hr协同|管理体系|共享服务|coe|ssc|多业务|多区域/],
    risks: [/单店|单一工厂|单一区域/],
  },
  culture_change: {
    label: "文化与组织变革",
    patterns: [/企业文化|价值观|使命|愿景|组织变革|变革管理|管理沟通|凝聚力|员工认同|culture|change management/],
    risks: [/只做行政活动|纯雇主品牌/],
  },
  hr_digital: {
    label: "HR 数字化/人力数据",
    patterns: [/数字化|hr系统|人力数据|人效分析|人才画像|管理驾驶舱|people analytics|dashboard|hris|workday|sap/],
    risks: [/只做系统录入|纯it实施/],
  },
};

const roleFamilyCorePatterns: Record<RequirementPolicy["roleFamily"], RegExp[]> = {
  hr: [/hr|human resources|人力|人事|组织发展|人才|薪酬|绩效|招聘|员工关系/],
  operator: [/战略|策略|商分|商业分析|经营|运营|品类|国家负责人|业务负责人|strategy|business analysis|operation/],
  commercial: [/commercial|sales|销售|商务|渠道|经销|区域|客户|市场/],
  procurement: [/采购|战略采购|集采|招标|询价|供应商|供应链|sourcing|procurement|supplier|vendor/],
  finance: [/finance|财务|资金|审计|税务|会计/],
  legal: [/legal|法务|合规|律师/],
  technology: [/cto|技术|研发|工程|产品|数据|算法|ai|软件|开发/],
  general: [],
};

const roleFamilyNoisePatterns: Partial<Record<RequirementPolicy["roleFamily"], RegExp[]>> = {
  // 注意：不能把 战略/策略/商分/商业分析/经营分析 列为 procurement noise——
  //「战略采购 / 商业分析师 → 采购数据」都是合理 procurement 候选人轨迹。
  procurement: [/hr|人力|人事|招聘|hrbp|行政|秘书|总助|架构师|开发|运维/],
  operator: [/行政|总助|秘书|培训|组织咨询|企业大学|hrbp|人力资源|招聘|人事/],
};

function roleFamilyCoreHit(roleFamily: RequirementPolicy["roleFamily"], text: string) {
  const patterns = roleFamilyCorePatterns[roleFamily] || [];
  return includesAny(text, patterns);
}

function roleFamilyNoiseHit(roleFamily: RequirementPolicy["roleFamily"], text: string) {
  const patterns = roleFamilyNoisePatterns[roleFamily] || [];
  return includesAny(text, patterns);
}

function salaryBand(analysis: JobAnalysis) {
  const text = compact([analysis.jobBrief.salaryBudget, analysis.intakeBuilder.structuredBrief.compensation]);
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  if (!nums.length) return null;
  const values = nums.map((num) => (num < 10000 ? num * 10000 : num));
  return { min: Math.min(...values) * 0.65, max: Math.max(...values) * 1.08 };
}

export function buildRequirementPolicy(analysis: JobAnalysis): RequirementPolicy {
  const roleText = compact([
    analysis.hunterReasoningKernel.roleNucleus,
    analysis.hunterReasoningKernel.hiringProblem,
    analysis.hunterReasoningKernel.evidenceTiers.core,
    analysis.roleProfile.roleEssence,
    analysis.roleProfile.hiringProblem,
    analysis.roleProfile.hardConstraints,
    analysis.roleProfile.successProfile,
    analysis.jobBrief.roleTitle,
    analysis.jobBrief.responsibilities,
    analysis.jobBrief.businessContext,
    analysis.intakeBuilder.structuredBrief.role,
  ]);
  const roleFamily = detectRoleFamily(roleText);
  const seniorityText = compact([
    analysis.jobBrief.roleTitle,
    analysis.intakeBuilder.structuredBrief.role,
  ]);
  const seniorityIntent = detectSeniority(seniorityText);
  const hrFocuses = roleFamily === "hr" ? detectHrFocuses(roleText) : [];
  const hrWorkMode = roleFamily === "hr" ? detectHrWorkMode(roleText) : "unknown";

  return {
    policyVersion: CODEX_ADVISOR_POLICY_VERSION,
    hardSignals: [
      analysis.jobBrief.roleTitle,
      analysis.intakeBuilder.structuredBrief.locationAndWorkModel,
      analysis.jobBrief.salaryBudget,
      ...analysis.hunterReasoningKernel.evidenceTiers.core,
      ...analysis.roleProfile.hardConstraints,
      ...analysis.roleProfile.successProfile,
    ].filter(Boolean),
    softSignals: [
      ...analysis.hunterReasoningKernel.evidenceTiers.strongPlus,
      ...analysis.roleProfile.strongSignals,
      ...analysis.talentPersona.strongMatch,
      ...analysis.jobBrief.niceToHave,
      ...analysis.jobBrief.softSignals,
    ].filter(Boolean),
    weakHypotheses: [
      ...analysis.hunterReasoningKernel.evidenceTiers.adjacent,
      ...analysis.roleProfile.weakSignals,
      ...analysis.hunterReasoningKernel.searchDiscipline.expansionPool,
      ...analysis.searchMap.targetIndustries,
      ...analysis.searchMap.targetCompanies,
      ...analysis.deepResearch.companySimilarityMap,
      ...analysis.intakeBuilder.inferredHypotheses,
    ].filter(Boolean),
    roleFamily,
    hrFocuses: roleFamily === "hr" && !hrFocuses.length ? ["overall_hr_leader"] : hrFocuses,
    hrWorkMode,
    seniorityIntent,
    searchPrinciples: [
      ...codexAdvisorSearchPrinciples,
      "人才库备注、薪酬、地点、汇报/组织变革信号优先于泛行业关键词。",
      "HRVP 不能只按 title 搜索；必须先识别本次是综合一号位、OD、业务 HR、干部、薪酬绩效、招聘供应链、集团体系、文化变革还是数字化方向。",
      "硬 OD 岗位必须优先组织诊断、组织架构设计、编制管理、岗位价值评估、组织效能/人效分析；泛 HRBP、TD/培训、招聘和 HR generalist 不能凭组织关键词排高。",
      "HRBP 岗位必须先识别服务对象和业务场景；HRD/HRVP seniority 只能在命中 BP 场景后加分，不能替代支持对象证据。",
    ],
  };
}

export function evaluateCandidateAgainstCodexPolicy(
  analysis: JobAnalysis,
  record: PersolCandidateRecord,
): CandidatePolicyFit {
  const policy = buildRequirementPolicy(analysis);
  const dynamicOperatorTerms = policy.roleFamily === "operator" ? extractDynamicOperatorTerms(analysis) : [];
  const titleText = compact([record.title, record.firstExperienceTitle]);
  const functionText = compact([record.functionPath, record.functionTags]);
  const notesText = compact([record.notes]);
  const fullText = compact([
    record.name,
    record.chineseName,
    record.englishName,
    record.companyName,
    record.title,
    record.firstExperienceTitle,
    record.functionPath,
    record.expectedSalary,
    record.status,
    record.source,
    record.notes,
    record.deepProfileText,
  ]);
  const hardHits = countHits(fullText, policy.hardSignals);
  const softHits = countHits(fullText, policy.softSignals);
  const weakHits = countHits(fullText, policy.weakHypotheses);
  const falsePositiveHits = countHits(fullText, analysis.roleProfile.falsePositiveRisks);
  const band = salaryBand(analysis);
  const reasons: string[] = [];
  const concerns: string[] = [];
  const policyTrace: string[] = [];
  let score = 0;

  if (policy.roleFamily === "hr") {
    const hrLeadershipTitle = includesAny(titleText, [/hrvp|chro|cho|人力资源副总裁|首席人才官|首席人力|hrd|人力资源总监|集团人力资源总监|人力资源负责人|hr head|head of hr/]);
    const hrCoreCandidate = includesAny(`${titleText} ${functionText} ${notesText}`, [
      /hrvp|chro|cho|hrd|hrbp|hr head|head of hr|human resources/,
      /人力资源|人事|组织发展|人才发展|薪酬|绩效|员工关系|招聘|干部管理|企业文化|hr系统|人效分析/,
    ]);
    if (includesAny(titleText, [/hrvp|chro|cho|人力资源副总裁|首席人才官|首席人力/])) {
      score += 38;
      reasons.push("强约束命中：title 达到 HRVP/CHO/CHRO 层级");
    } else if (includesAny(titleText, [/hrd|人力资源总监|集团人力资源总监|人力资源负责人|hr head|head of hr/])) {
      score += 30;
      reasons.push("强约束接近：title 为 HRD/集团 HR 负责人");
    } else if (includesAny(`${titleText} ${functionText}`, [/hrbp|组织发展|薪酬|绩效|招聘|员工关系|人力资源/])) {
      score += 16;
      reasons.push("职能命中 HR，但职位层级需要确认");
      concerns.push(
        policy.hrFocuses.includes("hard_od")
          ? "需确认硬 OD 项目深度、业务复杂度和方案设计责任"
          : policy.seniorityIntent === "executive"
            ? "title 可能未达到 HRVP/全模块负责人层级"
            : "需确认支持业务范围、HRBP 深度和实际决策影响力",
      );
    } else {
      concerns.push("未看到明确 HR 职能 title");
    }
    if (!hrCoreCandidate) {
      score -= 80;
      concerns.push("HRVP 强门槛未通过：候选人缺少 HR title/function 证据，不能因战略/组织/业务关键词进入 longlist");
    }

    let focusHitCount = 0;
    for (const focus of policy.hrFocuses) {
      const config = hrFocusSignalMap[focus];
      const focusText = `${titleText} ${functionText} ${notesText} ${fullText}`;
      const hit = includesAny(focusText, config.patterns);
      const risk = includesAny(focusText, config.risks);
      if (hit) {
        focusHitCount += 1;
        score += focus === "overall_hr_leader" ? 12 : 16;
        reasons.push(`方向命中：${config.label}`);
      }
      if (risk && !hit) {
        score -= 10;
        concerns.push(`方向风险：候选人经历可能偏离${config.label}`);
      }
    }

    const moduleHits = [
      /组织发展|组织效能|od\b/.test(fullText),
      /招聘|人才引进|talent acquisition|recruiting/.test(fullText),
      /薪酬|绩效|激励|c&b|compensation|performance/.test(fullText),
      /干部|继任|领导力|人才梯队/.test(fullText),
      /企业文化|组织变革|culture|change management/.test(fullText),
      /员工关系|er\b|劳动关系/.test(fullText),
      /hrbp|business partner|业务伙伴/.test(fullText),
    ].filter(Boolean).length;
    if (policy.hrFocuses.includes("overall_hr_leader") && moduleHits >= 3) {
      score += 12;
      reasons.push("综合 HR 一号位信号：覆盖多个 HR 模块");
    }
    if (policy.hrFocuses.length && focusHitCount === 0 && !policy.hrFocuses.includes("overall_hr_leader")) {
      score -= hrLeadershipTitle ? 8 : 18;
      concerns.push("HRVP 方向未命中：title 相关但缺少本次任务重心证据");
    }
    if (!policy.hrFocuses.includes("recruiting_talent_supply") && includesAny(`${titleText} ${functionText}`, [/招聘负责人|talent acquisition|recruiting|猎头/]) && !hrLeadershipTitle) {
      score -= 16;
      concerns.push("候选人偏招聘单模块，需确认能否承担 HRVP 综合/组织任务");
    }
  } else if (policy.roleFamily === "operator") {
    const executionText = operatorExecutionText(record);
    const strategyTitle = includesAny(titleText, [/战略|策略|商分|商业分析|经营分析|业务分析|business analysis|strategy/]);
    const operatorOwnerTitle = includesAny(titleText, [/国家负责人|国家经理|country manager|品类负责人|品类经理|category manager|业务负责人|business head|经营负责人|战略负责人|策略负责人/]);
    const operatorExecutionSignal = includesAny(executionText, [/战略|策略|商分|商业分析|数据分析|经营分析|年度规划|竞品分析|业务增量|增长|落地|推动|跨部门|项目管理|品类|国家|国际化|海外|跨境|电商/]);

    if (operatorOwnerTitle) {
      score += 36;
      reasons.push("强约束命中：title 指向国家/品类/业务/经营负责人");
    } else if (strategyTitle) {
      score += 28;
      reasons.push("强约束接近：title 为战略/商分/经营/运营相关");
    } else if (includesAny(titleText, [/运营总监|运营负责人|用户体验|治理|中台|operation/]) && operatorExecutionSignal) {
      score += 22;
      reasons.push("强约束接近：运营/中台 title 且有经营落地信号");
    } else if (includesAny(`${titleText} ${functionText}`, [/电商|跨境|海外|国际化|品类|运营|业务|策略|战略|商分|商业分析|咨询/])) {
      score += 16;
      reasons.push("职能相关，但是否具备 COO-2 业务负责人潜力需确认");
      concerns.push("title 可能未直接体现全球经营者/业务负责人路径");
    } else {
      concerns.push("未看到战略/商分/经营/品类/国家负责人相关 title");
    }
  } else if (policy.roleFamily === "commercial") {
    if (includesAny(titleText, [/commercial|sales|销售|商务|渠道|经销商|区域|大区|客户/])) {
      score += 30;
      reasons.push("强约束命中：商业/销售/渠道相关 title");
    } else {
      concerns.push("title 未明显命中商业/销售/渠道职能");
    }
  } else if (policy.roleFamily === "procurement") {
    const roleText = `${titleText} ${functionText}`;
    const functionHit = roleFamilyCoreHit(policy.roleFamily, roleText);
    const dynamicEvidenceHit = hardHits > 0 || softHits > 1;
    const noiseHit = roleFamilyNoiseHit(policy.roleFamily, roleText);

    if (functionHit) {
      score += 38;
      reasons.push("强约束命中：title/function 符合岗位职能主轴");
    } else {
      score -= 28;
      concerns.push("职能主轴未命中：title/function 与岗位主轴不一致，不能只靠行业或关键词进入 longlist");
    }
    if (dynamicEvidenceHit) {
      score += Math.min(34, hardHits * 8 + softHits * 3);
      reasons.push("动态硬证据命中：候选人履历包含 JD must-have / 关键词证据");
    } else {
      score -= 12;
      concerns.push("动态硬证据不足：需要电话确认是否具备 JD 中的关键经验");
    }
    if (noiseHit) {
      score -= 48;
      concerns.push("噪音证据命中：title/function 更像其他职能，需排除弱关键词误配");
    }
  } else {
    if (hardHits) {
      score += Math.min(30, hardHits * 8);
      reasons.push(`强约束字段命中 ${hardHits} 项`);
    }
  }

  if (policy.seniorityIntent === "executive" && policy.roleFamily !== "operator") {
    if (includesAny(titleText, [/vp|副总裁|首席|总裁|总经理|head|负责人|director|总监|cho|chro|cfo|cto|coo/])) {
      score += 14;
      reasons.push("强约束命中：高阶/负责人 title");
    } else {
      score -= 12;
      concerns.push("客户要求高阶岗位，但候选人 title seniority 不足");
    }
  }

  if (policy.roleFamily === "operator") {
    const targetSourceText = operatorTargetSourceText(record);
    const executionText = operatorExecutionText(record);
    const roleText = `${titleText} ${functionText}`;
    const juniorTitle = includesAny(titleText, [/助理经理|assistant manager|专员|specialist|主管/]);
    const adminTitle = includesAny(`${titleText} ${notesText}`, [/行政一把手|行政岗位|总助营业|总助|总经理助理|总经理秘书|董事长助理|秘书|翻译|行政/]);
    const trainingConsultingTitle = includesAny(roleText, [/企业大学|培训负责人|培训运营|领导力培训|组织咨询|业务咨询组|课程研发|培训|td\b|学习发展/]);
    const hrRoleSignal = includesAny(roleText, [
      /招聘|人力资源|hrbp|hrd|人事|薪酬|员工关系|人才发展|人才保障|人才中心|组织人才|组织发展|组织效能|od\b|people strategy|talent acquisition|recruiting|human resources/,
    ]);
    const disqualifyingTitle =
      juniorTitle ||
      adminTitle ||
      trainingConsultingTitle ||
      hrRoleSignal;
    const operatorCoreTitle = includesAny(titleText, [/战略|策略|商分|商业分析|经营分析|业务分析|国家负责人|国家经理|品类负责人|品类经理|业务负责人|经营负责人|运营总监|运营负责人|中台|strategy|business analysis|category manager|country manager|business head/]);
    const operatorExecutionSignal = hasStrongOperatorExecution(executionText);
    const targetSourceSignal = hasOperatorTargetSource(targetSourceText, dynamicOperatorTerms);
    const gameStrategy = includesAny(`${titleText} ${fullText}`, [/腾讯游戏|游戏公司|游戏战略|游戏.*战略|游族|game/]);

    if (targetSourceSignal) {
      score += 16;
      reasons.push("目标来源命中：互联网/电商/咨询/投资/消费品/跨境相关背景");
    }
    if (targetSourceSignal && operatorCoreTitle) {
      score += 14;
      reasons.push("裁判反馈命中：目标公司 + 战略/商分/经营核心 title");
    }
    if (targetSourceSignal && includesAny(titleText, [/战略分析经理|商业分析师|商分经理|策略运营|战略经理|战略规划|社区战略/])) {
      score += 10;
      reasons.push("裁判反馈命中：大厂战略/商分经理级目标 title");
    }
    if (targetSourceSignal && includesAny(titleText, [/战略分析经理/])) {
      score += 3;
      reasons.push("裁判反馈命中：战略分析经理优先于泛社区/平台策略 title");
    }
    if (operatorExecutionSignal) {
      score += 16;
      reasons.push("岗位成败关键命中：策略输出、数据分析、推动落地或增长经验");
    }
    if (includesAny(fullText, [/英语|english|海外|国际化|global|latin|拉美|出海|跨境/])) {
      score += 10;
      reasons.push("全球化/英语/出海信号");
    }
    if (disqualifyingTitle) {
      score -= adminTitle ? 90 : juniorTitle ? 58 : operatorCoreTitle && targetSourceSignal && operatorExecutionSignal ? 38 : 70;
      concerns.push(
        adminTitle
          ? "裁判反馈：行政/总助/秘书/翻译类岗位不适合全球经营者"
          : juniorTitle
            ? "裁判反馈：助理经理/专员/主管层级不足，不适合 COO-2 全球经营者"
            : "裁判反馈：培训/组织咨询/HR 类岗位不适合全球经营者主线",
      );
    }
    if (gameStrategy && !includesAny(fullText, [/电商|跨境|零售|消费品|商分|商业分析|品类|国家负责人/])) {
      score -= 18;
      concerns.push("裁判反馈：游戏战略相关但缺少跨境电商/消费经营落地证据，适合放入可验证池但不应排在 Top10 前列");
    }
    if (includesAny(titleText, [/销售总监|销售负责人|销售经理|区域销售/]) && !includesAny(fullText, [/战略|策略|经营|品类|国家|跨境|电商|商分|商业分析/])) {
      score -= 14;
      concerns.push("title 偏销售管理，缺少策略/经营/品类/国家负责人证据");
    }
    if (!operatorCoreTitle && !(targetSourceSignal && operatorExecutionSignal)) {
      score -= 38;
      concerns.push("缺少战略/商分/经营/品类/国家负责人核心证据");
    }
    if (!targetSourceSignal && !operatorExecutionSignal) {
      score -= 18;
      concerns.push("既没有目标来源公司/行业，也没有经营落地证据");
    }
  }

  if (includesAny(fullText, [/苏州|无锡|昆山|常州|上海|南京|杭州|长三角/])) {
    score += 14;
    reasons.push("强约束接近：苏州/长三角可达性");
  } else if (/苏州|长三角/.test(compact([analysis.intakeBuilder.structuredBrief.locationAndWorkModel, analysis.companyTeamBrief.confirmed]))) {
    concerns.push("地点/通勤可行性缺少证据");
  }

  if (band && record.annualSalary) {
    if (record.annualSalary >= band.min && record.annualSalary <= band.max) {
      score += 12;
      reasons.push("强约束命中：薪酬带接近项目预算");
    } else if (record.annualSalary > band.max) {
      score -= 10;
      concerns.push("薪酬可能超过客户预算");
    } else {
      concerns.push("薪酬可能低于目标层级，需要确认实际包和期望");
    }
  } else if (band) {
    concerns.push("薪酬信息缺失，无法确认预算匹配");
  }

  if (includesAny(notesText, [/替代|变革|组织调整|从0到1|搭建|集团|体系|文化|od|组织发展|绩效|激励|转型/])) {
    score += 14;
    reasons.push("岗位成败关键命中：组织变革/体系搭建/绩效文化证据");
  }

  if (record.hasNotes) {
    score += 8;
    reasons.push("人才库备注可用于复核动机、风险和案例");
  }
  if (record.mobile || record.email) score += 3;
  if (record.experienceCount >= 3) score += 3;

  if (hardHits) {
    score += Math.min(12, hardHits * 3);
    policyTrace.push(`强约束命中 ${hardHits} 项`);
  }
  if (softHits) {
    score += Math.min(10, softHits * 2);
    policyTrace.push(`软信号命中 ${softHits} 项`);
  }
  if (weakHits) {
    score += Math.min(8, weakHits);
    policyTrace.push(`弱推断/扩展信号命中 ${weakHits} 项，仅作为加分`);
  }
  if (falsePositiveHits) {
    score -= Math.min(28, falsePositiveHits * 8);
    concerns.push(`误伤风险命中 ${falsePositiveHits} 项：需确认不是相似关键词导致的误配`);
    policyTrace.push(`roleProfile 误伤风险命中 ${falsePositiveHits} 项`);
  }

  if (weakHits >= 4 && !includesAny(titleText, [/hrvp|chro|cho|hrd|人力资源总监|人力资源负责人|commercial|sales|销售|渠道|战略|策略|商分|经营|运营|品类|国家|business|strategy|category|country/])) {
    score -= 18;
    concerns.push("行业/公司关键词较强，但岗位 title 不强，避免弱推断绑架排序");
  }

  const hasRoleCore =
    reasons.some((reason) => /title|职能|强约束/.test(reason)) ||
    includesAny(`${titleText} ${functionText}`, [/hr|人力|commercial|sales|销售|渠道|采购|供应链|供应商|sourcing|procurement|strategy|战略|策略|商分|经营|运营|品类|国家|finance|财务|legal|法务|技术|研发/]);
  if (!hasRoleCore) score -= 20;

  if (policy.roleFamily === "hr") {
    const hrExactExecutive = includesAny(titleText, [/hrvp|chro|cho|人力资源副总裁|首席人才官|首席人力/]);
    const hrDirector = includesAny(titleText, [/hrd|人力资源总监|集团人力资源总监|人力资源负责人|hr head|head of hr|人力资源部\s*副总经理/]);
    const hrBpOrSpecialist = includesAny(`${titleText} ${functionText}`, [/hrbp|hr business partner|组织发展|od\b|薪酬|绩效|招聘|员工关系|人力资源|人才发展|干部管理|hr manager|hr director/]);
    const hrBpTitle = includesAny(`${titleText} ${functionText}`, [/hrbp|hr business partner|business partner|业务伙伴|bu hr|hr manager|人力资源经理/]);
    const hardOdProject = policy.hrFocuses.includes("hard_od");
    const hardOdTitle = includesAny(`${titleText} ${functionText}`, [/组织发展|组织效能|组织管理|组织干部|od\b|岗位管理|编制|人效/]);
    const hardOdEvidence = includesAny(fullText, [/硬od|组织诊断|组织架构|组织设计|组织治理|组织效能|组织效率|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|管控模式/]);
    const consultingEvidence = includesAny(fullText, [/aon|怡安|mercer|美世|wtw|韦莱|hay|合益|korn ferry|光辉|ey|pwc|毕马威|德勤|咨询/]);
    const internetHardwareEvidence = includesAny(fullText, [/字节|美团|京东|百度|阿里|腾讯|网易|滴滴|得物|小红书|快手|携程|贝壳|华为|小米|海尔|美的|oppo|vivo|大疆|顺丰|菜鸟|德邦|比亚迪|理想|吉利|蔚来|小鹏|极氪|互联网|智能|科技/]);
    const trainingOnly = includesAny(`${titleText} ${functionText}`, [/培训|td\b|ld\b|学习发展|人才发展|企业大学|课程/]) && !hardOdEvidence;
    const hrbpOnly = includesAny(`${titleText} ${functionText}`, [/hrbp|business partner|业务伙伴/]) && !hardOdEvidence;
    const focusMatches = policy.hrFocuses.filter((focus) => {
      const config = hrFocusSignalMap[focus];
      return includesAny(`${titleText} ${functionText} ${notesText} ${fullText}`, config.patterns);
    });
    const moduleHits = [
      /组织发展|组织效能|od\b/.test(fullText),
      /招聘|人才引进|talent acquisition|recruiting/.test(fullText),
      /薪酬|绩效|激励|c&b|compensation|performance/.test(fullText),
      /干部|继任|领导力|人才梯队/.test(fullText),
      /企业文化|组织变革|culture|change management/.test(fullText),
      /员工关系|er\b|劳动关系/.test(fullText),
      /hrbp|business partner|业务伙伴/.test(fullText),
      /数字化|hr系统|人效分析|people analytics|dashboard|hris/.test(fullText),
    ].filter(Boolean).length;
    const locationFit = includesAny(fullText, [/苏州|无锡|昆山|常州|上海|南京|杭州|长三角/]);
    const salaryFit = Boolean(band && record.annualSalary && record.annualSalary >= band.min && record.annualSalary <= band.max);
    const salaryHigh = Boolean(band && record.annualSalary && record.annualSalary > band.max);
    const projectEvidence = includesAny(notesText, [/替代|变革|组织调整|从0到1|搭建|集团|体系|文化|od|组织发展|绩效|激励|转型|人才盘点|干部|数字化|人效/]);
    const modeConfig = hrWorkModeSignalMap[policy.hrWorkMode];
    const modeText = `${titleText} ${functionText} ${notesText} ${fullText}`;
    const modePositiveHits = modeConfig.positive.filter((pattern) => pattern.test(modeText)).length;
    const modeNegativeHit = includesAny(modeText, modeConfig.negative);
    const bpMode = ["business_bp", "commercial_bp", "overseas_bp", "ecommerce_bp", "customer_center_bp"].includes(policy.hrWorkMode);
    const overSeniorForBp = bpMode && (hrExactExecutive || hrDirector) && !hrBpTitle;

    let calibrated = 0;
    if (hardOdProject) {
      if (hardOdTitle && hardOdEvidence) calibrated += 45;
      else if (hardOdTitle) calibrated += 34;
      else if (hardOdEvidence) calibrated += 28;
      else {
        concerns.push("硬 OD 门槛未通过：缺少组织诊断/组织架构/编制/岗位价值/人效等核心证据");
      }
      if (consultingEvidence && internetHardwareEvidence) calibrated += 16;
      else if (internetHardwareEvidence) calibrated += 12;
      else if (consultingEvidence) calibrated += 10;
      if (includesAny(fullText, [/组织变革|变革管理|管控|授权|组织治理|组织调整/])) calibrated += 8;
      if (includesAny(fullText, [/985|211|一本|清华|北大|复旦|交大|浙大|人大|中科大|厦大|藤校|硕士/])) calibrated += 4;
      if (trainingOnly) {
        calibrated -= 24;
        concerns.push("硬 OD 风险：更像 TD/培训/学习发展，不是组织架构、编制或人效主线");
      }
      if (hrbpOnly) {
        calibrated -= 18;
        concerns.push("硬 OD 风险：泛 HRBP，缺少组织诊断/编制/岗位价值评估证据");
      }
      if (includesAny(`${titleText} ${functionText}`, [/招聘|员工关系|行政/]) && !hardOdEvidence) calibrated -= 18;
      if (salaryFit) calibrated += 6;
      else if (salaryHigh) calibrated -= 8;
      if (locationFit) calibrated += 4;
      if (record.hasNotes) calibrated += 7;
      if (record.mobile || record.email) calibrated += 2;
      if (record.experienceCount >= 3) calibrated += 2;
      calibrated += Math.min(6, hardHits);
      calibrated += Math.min(4, softHits);
    } else {
      if (bpMode) {
        if (hrBpTitle) calibrated += 32;
        else if (hrDirector) calibrated += 14;
        else if (hrExactExecutive) calibrated += 8;
        else if (hrBpOrSpecialist) calibrated += 18;
      } else if (hrExactExecutive) calibrated += 30;
      else if (hrDirector) calibrated += 25;
      else if (hrBpOrSpecialist) calibrated += policy.seniorityIntent === "executive" ? 17 : 24;

      if (modePositiveHits) {
        calibrated += Math.min(30, modePositiveHits * 7);
        reasons.push(`HR 工作模式命中：${hrWorkModeLabel[policy.hrWorkMode]}`);
      } else if (bpMode) {
        calibrated -= 18;
        concerns.push(`HRBP 服务场景未命中：缺少${hrWorkModeLabel[policy.hrWorkMode]}证据`);
      }
      if (modeNegativeHit) {
        calibrated -= 14;
        concerns.push(`HR 工作模式风险：候选人经历偏离${hrWorkModeLabel[policy.hrWorkMode]}`);
      }
      if (overSeniorForBp) {
        calibrated -= 18;
        concerns.push("BP 岗位过度 seniority 风险：HRD/HRVP title 不能替代 HRBP 服务对象和场景证据");
      }
      if (bpMode && hardOdTitle && !hrBpTitle && !modePositiveHits) {
        calibrated -= 16;
        concerns.push("BP 岗位风险：候选人更像 OD/COE，不是业务 BP 主线");
      }

      calibrated += Math.min(22, focusMatches.length * 8);
      if (policy.hrFocuses.includes("overall_hr_leader")) {
        if (moduleHits >= 4) calibrated += 10;
        else if (moduleHits >= 3) calibrated += 7;
        else if (moduleHits >= 2) calibrated += 4;
      }
      if (projectEvidence) calibrated += 10;
      if (locationFit) calibrated += 7;
      else if (/苏州|总部/.test(compact([analysis.intakeBuilder.structuredBrief.locationAndWorkModel, analysis.companyTeamBrief.confirmed]))) calibrated -= 4;
      if (salaryFit) calibrated += 8;
      else if (salaryHigh) calibrated -= 8;
      if (record.hasNotes) calibrated += 5;
      if (record.mobile || record.email) calibrated += 2;
      if (record.experienceCount >= 3) calibrated += 2;
      calibrated += Math.min(4, hardHits);
      calibrated += Math.min(4, softHits);
      calibrated += Math.min(2, weakHits);

      if (bpMode && !hrBpTitle && modePositiveHits < 2) calibrated -= 14;
      if (policy.seniorityIntent === "executive" && !hrExactExecutive && !hrDirector) calibrated -= 10;
      if (!focusMatches.length && policy.hrFocuses.length && !policy.hrFocuses.includes("overall_hr_leader")) calibrated -= 8;
      if (concerns.some((concern) => /单模块|偏招聘|层级|薪酬可能超过/.test(concern))) calibrated -= 4;
    }

    score = calibrated;
    policyTrace.push(
      `HR 校准分：工作模式=${hrWorkModeLabel[policy.hrWorkMode]}，层级=${hrExactExecutive ? "HRVP/CHRO/CHO" : hrDirector ? "HRD/Head of HR" : hrBpOrSpecialist ? "HRBP/COE/HR Manager" : "未命中"}，方向命中=${focusMatches.length}，模式命中=${modePositiveHits}，模块覆盖=${moduleHits}`,
    );
  }

  const requirementGates = evaluateRequirementGates(analysis, record);
  score = applyRequirementGateScore(score, requirementGates);
  reasons.push(...requirementGates.reasons);
  concerns.push(...requirementGates.concerns);
  policyTrace.push(...requirementGates.policyTrace);
  const currentClientCompany = currentClientCompanyHit(analysis, record);
  if (currentClientCompany) {
    score = Math.min(score, 10);
    concerns.push("当前公司命中客户公司，在职员工不能作为外部候选人进入 longlist");
    policyTrace.push(`客户公司硬排除：当前公司命中 ${currentClientCompany}`);
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  let gate: CandidatePolicyFit["gate"] =
    clamped >= 92 && concerns.length <= 1
      ? "strong_fit"
      : clamped >= 72
        ? "fit"
        : clamped >= 55
          ? "borderline"
          : "reject";
  if (policy.roleFamily === "operator") {
    const blockingConcern = concerns.some((concern) => /缺少战略|偏助理|未看到战略|seniority 不足/.test(concern));
    const targetSourceText = operatorTargetSourceText(record);
    const executionText = operatorExecutionText(record);
    const roleText = `${titleText} ${functionText}`;
    const operatorCoreTitle = includesAny(titleText, [/战略|策略|商分|商业分析|经营分析|业务分析|国家负责人|国家经理|品类负责人|品类经理|业务负责人|经营负责人|中台|strategy|business analysis|category manager|country manager|business head/]);
    const targetSourceSignal = hasOperatorTargetSource(targetSourceText, dynamicOperatorTerms);
    const operatorExecutionSignal = hasStrongOperatorExecution(executionText);
    const gameStrategy = includesAny(`${titleText} ${targetSourceText} ${executionText}`, [/腾讯游戏|游戏公司|游戏战略|游戏.*战略|游族|game/]);
    const juniorTitle = includesAny(titleText, [/助理经理|assistant manager|专员|specialist|主管/]);
    const adminTitle = includesAny(`${titleText} ${notesText}`, [/行政一把手|行政岗位|总助营业|总助|总经理助理|总经理秘书|董事长助理|秘书|翻译|行政/]);
    const trainingConsultingTitle = includesAny(roleText, [/企业大学|培训负责人|培训运营|领导力培训|组织咨询|业务咨询组|课程研发|培训|td\b|学习发展/]);
    const hrRoleSignal = includesAny(roleText, [
      /招聘|人力资源|hrbp|hrd|人事|薪酬|员工关系|人才发展|人才保障|人才中心|组织人才|组织发展|组织效能|od\b|people strategy|talent acquisition|recruiting|human resources/,
    ]);
    const disqualifyingTitle =
      juniorTitle ||
      adminTitle ||
      trainingConsultingTitle ||
      hrRoleSignal;
    // 核心准入：必须有 operator title 或 (target source + execution) 任一
    if (!operatorCoreTitle && !(targetSourceSignal && operatorExecutionSignal)) {
      // 给 borderline 一个机会：有 source + execution 接近的候选人，分数足够高时降为 borderline 而非 reject
      gate = clamped >= 65 && (targetSourceSignal || operatorExecutionSignal) ? "borderline" : "reject";
    }
    // 行政 / 秘书 / 翻译类：始终 reject（无法转 COO-2 经营者）
    if (adminTitle) gate = "reject";
    // 培训/组织咨询：除非有 core title + 强 source，否则 reject
    if (trainingConsultingTitle && !(operatorCoreTitle && targetSourceSignal)) gate = "reject";
    // HR/招聘/OD function：除非显式经营者核心 title + 目标来源双命中，否则 reject
    if (hrRoleSignal && !(operatorCoreTitle && targetSourceSignal)) gate = "reject";
    // 助理/专员/主管：分数高 + 有 core title 时降级为 borderline 而非 reject（mid-senior 可发展）
    if (juniorTitle && !operatorCoreTitle) {
      gate = clamped >= 65 && targetSourceSignal ? "borderline" : "reject";
    }
    // 综合 disqualifying 兜底：保留 operatorCoreTitle + targetSourceSignal 双命中的人即可
    if (disqualifyingTitle && !(operatorCoreTitle && targetSourceSignal)) {
      gate = clamped >= 70 && operatorCoreTitle ? "borderline" : "reject";
    }
    if (blockingConcern && clamped < 100) gate = clamped >= 72 ? "borderline" : "reject";
    if (blockingConcern && clamped < 82) gate = "reject";
    if (gameStrategy && !includesAny(`${targetSourceText} ${executionText}`, [/电商|跨境|零售|消费品|商分|商业分析|品类|国家负责人/])) {
      gate = "reject";
    }
  }

  if (policy.roleFamily === "hr") {
    const hrCoreCandidate = includesAny(`${titleText} ${functionText} ${notesText}`, [
      /hrvp|chro|cho|hrd|hrbp|hr head|head of hr|human resources/,
      /人力资源|人事|组织发展|人才发展|薪酬|绩效|员工关系|招聘|干部管理|企业文化|hr系统|人效分析/,
    ]);
    const bpMode = ["business_bp", "commercial_bp", "overseas_bp", "ecommerce_bp", "customer_center_bp"].includes(policy.hrWorkMode);
    const hrBpTitle = includesAny(`${titleText} ${functionText}`, [/hrbp|hr business partner|business partner|业务伙伴|bu hr|hr manager|人力资源经理/]);
    const modeConfig = hrWorkModeSignalMap[policy.hrWorkMode];
    const modePositiveHit = includesAny(`${titleText} ${functionText} ${notesText} ${fullText}`, modeConfig.positive);
    if (!hrCoreCandidate) gate = "reject";
    if (bpMode && !hrBpTitle && !modePositiveHit) {
      gate = "reject";
      concerns.push(`HRBP 准入未通过：缺少${hrWorkModeLabel[policy.hrWorkMode]} title/function 或场景证据`);
    } else if (bpMode && !hrBpTitle && clamped < 78) {
      gate = gate === "strong_fit" ? "fit" : gate === "fit" ? "borderline" : gate;
      concerns.push("HRBP 准入待确认：title 不是明确 HRBP/HR Manager，需要验证是否实际支持业务团队");
    }
    if (policy.seniorityIntent === "executive" && !includesAny(`${titleText} ${functionText}`, [/hrvp|chro|cho|hrd|人力资源总监|集团人力资源总监|人力资源负责人|hr head|head of hr|负责人|总监/])) {
      gate = gate === "strong_fit" ? "fit" : gate === "fit" ? "borderline" : gate;
      concerns.push("HRVP 层级待确认：HR 职能相关，但一号位/负责人 title 不够明确");
    }
  }

  if (policy.roleFamily === "procurement") {
    const roleText = `${titleText} ${functionText}`;
    const functionHit = roleFamilyCoreHit(policy.roleFamily, roleText);
    const noiseHit = roleFamilyNoiseHit(policy.roleFamily, roleText);
    if (!functionHit) gate = "reject";
    if (noiseHit) gate = "reject";
    if (hardHits === 0 && softHits === 0 && clamped < 82) {
      gate = gate === "strong_fit" ? "fit" : gate === "fit" ? "borderline" : gate;
    }
  }

  if (requirementGates.reject) {
    gate = "reject";
  }
  if (currentClientCompany) {
    gate = "reject";
  }

  return {
    score: clamped,
    reasons: reasons.length ? reasons : ["基础字段有部分相关性，但缺少可解释强证据"],
    concerns,
    policyTrace: [
      `Policy：${policy.policyVersion}`,
      `角色族群：${policy.roleFamily}`,
      policy.roleFamily === "hr" ? `HR 工作模式：${hrWorkModeLabel[policy.hrWorkMode]}` : "",
      policy.roleFamily === "hr" && policy.hrFocuses.length ? `HR 方向：${policy.hrFocuses.map((focus) => hrFocusSignalMap[focus].label).join(" / ")}` : "",
      `目标层级：${policy.seniorityIntent}`,
      ...policyTrace,
      ...policy.searchPrinciples.slice(0, 2),
    ].filter(Boolean),
    gate,
  };
}
