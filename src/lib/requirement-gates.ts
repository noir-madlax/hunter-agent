import type { JobAnalysis } from "@/lib/job-schema";
import type { PersolCandidateRecord } from "@/lib/persol-report-data";

type CandidateLike = Partial<Omit<PersolCandidateRecord, "searchText">> & {
  searchText?: string;
};

export type RequirementGateResult = {
  reject: boolean;
  scoreAdjustment: number;
  maxScore: number;
  reasons: string[];
  concerns: string[];
  missingInfo: string[];
  policyTrace: string[];
  hardFailures: string[];
};

type CityRule = {
  name: string;
  codes: string[];
  aliases: RegExp[];
  nearby: RegExp[];
  conflicts: RegExp[];
};

type CoreEvidenceCheck = {
  label: string;
  project: RegExp;
  full: RegExp;
  negative?: RegExp;
  partial?: RegExp;
  partialMaxScore?: number;
  missingMaxScore: number;
};

const cityRules: CityRule[] = [
  {
    name: "广州",
    codes: ["90"],
    aliases: [/广州|广州市|天河|黄埔|番禺|白云|越秀|海珠|荔湾|花都|南沙|增城|从化/],
    nearby: [/深圳|佛山|东莞|珠三角|华南|广东/],
    conflicts: [/上海|北京|天津|苏州|杭州|南京|成都|武汉|西安|厦门|宁波|无锡/],
  },
  {
    name: "上海",
    codes: ["102"],
    aliases: [/上海|上海市|浦东|徐汇|闵行|长宁|静安|黄浦|张江|嘉定|宝山/],
    nearby: [/苏州|杭州|南京|无锡|昆山|常州|宁波|长三角/],
    conflicts: [/北京|天津|广州|深圳|成都|武汉|西安|厦门/],
  },
  {
    name: "深圳",
    codes: ["306"],
    aliases: [/深圳|深圳市|南山|福田|宝安|龙岗|龙华/],
    nearby: [/广州|佛山|东莞|珠三角|华南|广东/],
    conflicts: [/上海|北京|天津|苏州|杭州|南京|成都|武汉|西安|厦门|宁波|无锡/],
  },
  {
    name: "苏州",
    codes: ["160"],
    aliases: [/苏州|苏州市|昆山|常熟|太仓|吴江|张家港/],
    nearby: [/上海|杭州|南京|无锡|常州|宁波|长三角/],
    conflicts: [/北京|天津|广州|深圳|成都|武汉|西安|厦门/],
  },
  {
    name: "杭州",
    codes: ["212"],
    aliases: [/杭州|杭州市|滨江|余杭|西湖|萧山/],
    nearby: [/上海|苏州|南京|无锡|宁波|长三角/],
    conflicts: [/北京|天津|广州|深圳|成都|武汉|西安|厦门/],
  },
  {
    name: "北京",
    codes: ["1"],
    aliases: [/北京|北京市|朝阳|海淀|东城|西城|丰台/],
    nearby: [/华北/],
    conflicts: [/上海|天津|广州|深圳|苏州|杭州|南京|成都|武汉|西安|厦门/],
  },
];

function compact(values: Array<string | string[] | number | Array<number | string> | null | undefined>) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLowerCase();
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function numberCodes(values: Array<number | string> | undefined) {
  return (values || []).map((value) => String(value));
}

function textOfAnalysis(analysis: JobAnalysis) {
  return compact([
    analysis.projectName,
    analysis.intakeBuilder.knownSignals,
    analysis.intakeBuilder.structuredBrief.locationAndWorkModel,
    analysis.intakeBuilder.structuredBrief.teamScope,
    analysis.intakeBuilder.structuredBrief.compensation,
    analysis.intakeBuilder.structuredBrief.mustHave,
    analysis.jobBrief.roleTitle,
    analysis.jobBrief.businessContext,
    analysis.jobBrief.salaryBudget,
    analysis.jobBrief.mustHave,
    analysis.jobBrief.exclusions,
    analysis.companyTeamBrief.confirmed,
    analysis.talentPersona.mustHave,
    analysis.talentPersona.riskSignals,
    analysis.searchMap.excludedIndustries,
    analysis.sourcingGuardrails,
  ]);
}

function textOfCandidate(record: CandidateLike) {
  const codeText = [...numberCodes(record.cityCodes), ...numberCodes(record.locationCodes)]
    .map((code) => cityRules.find((rule) => rule.codes.includes(code))?.name || code)
    .join(" ");
  return compact([
    record.name,
    record.chineseName,
    record.englishName,
    record.companyName,
    record.title,
    record.firstExperienceTitle,
    record.functionPath,
    record.functionTags,
    record.expectedSalary,
    record.status,
    record.source,
    record.notes,
    record.deepProfileText,
    codeText,
    record.searchText,
  ]);
}

function coreScenarioText(analysis: JobAnalysis) {
  return compact([
    analysis.hunterReasoningKernel.roleNucleus,
    analysis.hunterReasoningKernel.hiringProblem,
    analysis.hunterReasoningKernel.evidenceTiers.core,
    analysis.hunterReasoningKernel.searchDiscipline.primaryPool,
    analysis.jobBrief.roleTitle,
  ]);
}

function isHrProjectText(projectText: string) {
  return /hrbp|hr\s*bp|business partner|human resources|人力资源|人事|业务伙伴|组织发展|组织效能|薪酬|绩效|招聘|人才发展|员工关系/.test(projectText);
}

function detectProjectCity(projectText: string) {
  return cityRules.find((rule) => rule.aliases.some((pattern) => pattern.test(projectText)));
}

function detectProjectCities(projectText: string) {
  return cityRules.filter((rule) => rule.aliases.some((pattern) => pattern.test(projectText)));
}

function locationStrict(projectText: string) {
  return /onsite|驻场|固定|总部|公司地址|硬约束|工作地点|办公|base|本地|通勤|不得进入|不能接受|不接受|愿意.*工作|能够.*工作/.test(projectText);
}

function explicitLocationNegative(city: string, candidateText: string) {
  const cityName = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${cityName}.{0,8}(不考虑|不接受|不去|不看|不方便)|不去.{0,8}${cityName}|${cityName}.{0,6}机会.{0,6}不|[^，。；;\\s]+only`).test(candidateText);
}

function explicitLocationAcceptance(city: CityRule, candidateText: string) {
  const cityName = city.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`${cityName}.{0,12}(可以|接受|没问题|愿意|open|考虑|base)`).test(candidateText)) {
    return true;
  }
  return /能搬家|愿意搬家|可搬家|愿意.{0,8}relocate|异地.{0,8}(接受|可以|open)|工作地点灵活/.test(candidateText);
}

function directLocationEvidence(city: CityRule, record: CandidateLike, candidateText: string) {
  const codes = [...numberCodes(record.cityCodes), ...numberCodes(record.locationCodes)];
  if (codes.some((code) => city.codes.includes(code))) return true;
  const companyText = compact([record.companyName]);
  if (city.aliases.some((pattern) => pattern.test(companyText))) return true;

  const cityName = city.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const contextual = new RegExp(
    `(住在|定居|常驻|目前在|现在在|工作地点|坐标|家在).{0,12}${cityName}|${cityName}.{0,12}(工作|办公|base|定居|常驻|通勤)`,
  );
  return contextual.test(candidateText);
}

function applyLocationGate(result: RequirementGateResult, analysis: JobAnalysis, record: CandidateLike, projectText: string, candidateText: string) {
  const acceptedCities = detectProjectCities(projectText);
  const city = acceptedCities[0] || detectProjectCity(projectText);
  if (!city) return;

  const strict = locationStrict(projectText);
  const directCity = acceptedCities.find((item) => directLocationEvidence(item, record, candidateText));
  const relocationCity = acceptedCities.find((item) => explicitLocationAcceptance(item, candidateText));
  const directHit = Boolean(directCity);
  const nearbyHit = acceptedCities.some((item) => item.nearby.some((pattern) => pattern.test(candidateText)));
  const conflictHit = !acceptedCities.some((item) => directLocationEvidence(item, record, candidateText)) &&
    city.conflicts.some((pattern) => pattern.test(candidateText));
  const negative = acceptedCities.some((item) => explicitLocationNegative(item.name, candidateText));
  const acceptedRelocation = Boolean(relocationCity);

  if (negative) {
    result.reject = true;
    result.scoreAdjustment -= 60;
    result.maxScore = Math.min(result.maxScore, 40);
    result.concerns.push(`地点硬约束未通过：项目要求${city.name}，候选人记录显示不接受${city.name}或只看其他城市。`);
    result.hardFailures.push(`地点不接受${city.name}`);
    result.policyTrace.push(`RequirementGate: location=${city.name} negative`);
    return;
  }

  if (directHit || acceptedRelocation) {
    result.scoreAdjustment += strict ? 8 : 4;
    const hitCity = directCity?.name || relocationCity?.name || city.name;
    result.reasons.push(`地点硬约束命中：${hitCity}或明确接受${hitCity}落地。`);
    result.policyTrace.push(`RequirementGate: location=${hitCity} pass`);
    return;
  }

  if (strict) {
    result.scoreAdjustment -= conflictHit ? 42 : nearbyHit ? 20 : 34;
    result.maxScore = Math.min(result.maxScore, conflictHit ? 54 : nearbyHit ? 66 : 58);
    result.concerns.push(`地点硬约束待验证：项目要求${city.name}现场/本地落地，候选人缺少${city.name}、迁移或通勤接受证据。`);
    result.missingInfo.push(`${city.name}工作地点接受度、通勤/迁移方案`);
    result.policyTrace.push(`RequirementGate: location=${city.name} missing`);
  }
}

function parseAgeLimit(projectText: string) {
  const maxPatterns = [
    /(?:年龄|年纪|age)[^0-9]{0,8}(\d{2})\s*岁?\s*(?:以内|以下|封顶|上限)/,
    /(?:不超过|小于|低于)\s*(\d{2})\s*岁?/,
    /(\d{2})\s*岁?\s*(?:以内|以下)/,
  ];
  for (const pattern of maxPatterns) {
    const match = projectText.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function applyAgeGate(result: RequirementGateResult, projectText: string, record: CandidateLike) {
  const maxAge = parseAgeLimit(projectText);
  if (!maxAge) return;
  if (typeof record.age !== "number") {
    result.maxScore = Math.min(result.maxScore, 82);
    result.concerns.push(`年龄边界待验证：客户要求${maxAge}岁以内，候选人年龄缺失。`);
    result.missingInfo.push(`年龄是否在${maxAge}岁以内`);
    result.policyTrace.push("RequirementGate: age missing");
    return;
  }
  if (record.age > maxAge) {
    result.reject = true;
    result.scoreAdjustment -= 55;
    result.maxScore = Math.min(result.maxScore, 45);
    result.concerns.push(`年龄硬约束未通过：客户要求${maxAge}岁以内，候选人${record.age}岁。`);
    result.hardFailures.push(`年龄超过${maxAge}岁`);
    result.policyTrace.push("RequirementGate: age fail");
  } else {
    result.reasons.push(`年龄边界通过：${record.age}岁在${maxAge}岁以内。`);
    result.policyTrace.push("RequirementGate: age pass");
  }
}

export function salaryBandFromAnalysis(analysis: JobAnalysis) {
  const text = compact([analysis.jobBrief.salaryBudget, analysis.intakeBuilder.structuredBrief.compensation]);
  if (!text || /待确认|unknown|n\/a/.test(text)) return null;

  const values: number[] = [];
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:万|w)/gi)) {
    values.push(Number(match[1]) * 10000);
  }
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*k\s*(?:x|×|\*)\s*(\d{1,2})/gi)) {
    values.push(Number(match[1]) * 1000 * Number(match[2]));
  }
  if (!values.length && /百万|年薪|预算|package|薪酬|薪资/.test(text)) {
    for (const match of text.matchAll(/(\d+(?:\.\d+)?)/g)) {
      const num = Number(match[1]);
      if (Number.isFinite(num) && num >= 10) values.push(num < 10000 ? num * 10000 : num);
    }
  }
  if (!values.length) return null;
  return { min: Math.min(...values) * 0.75, max: Math.max(...values) * 1.12 };
}

function applySalaryGate(result: RequirementGateResult, analysis: JobAnalysis, record: CandidateLike) {
  const band = salaryBandFromAnalysis(analysis);
  if (!band) return;
  if (typeof record.annualSalary !== "number" || record.annualSalary <= 0) {
    result.maxScore = Math.min(result.maxScore, 86);
    result.concerns.push("薪酬硬约束待验证：候选人当前年薪缺失，无法确认是否落在客户预算。");
    result.missingInfo.push("当前年薪、期望薪酬、最低接受线");
    result.policyTrace.push("RequirementGate: salary missing");
    return;
  }
  if (record.annualSalary > band.max) {
    const farAbove = record.annualSalary > band.max * 1.25;
    result.scoreAdjustment -= farAbove ? 24 : 12;
    result.maxScore = Math.min(result.maxScore, farAbove ? 64 : 76);
    result.concerns.push(`薪酬预算风险：候选人当前年薪约${Math.round(record.annualSalary / 10000)}万，高于项目预算上沿。`);
    result.missingInfo.push("是否愿意降薪或接受客户薪酬结构");
    result.policyTrace.push("RequirementGate: salary high");
  } else if (record.annualSalary >= band.min) {
    result.scoreAdjustment += 5;
    result.reasons.push("薪酬带通过：当前年薪与项目预算大致可落地。");
    result.policyTrace.push("RequirementGate: salary pass");
  }
}

function applyEducationGate(result: RequirementGateResult, projectText: string, candidateText: string, record: CandidateLike) {
  const wantsBachelor = /本科及以上|本科以上|统招本科|bachelor/.test(projectText);
  const wantsMaster = /硕士及以上|研究生|master|mba/.test(projectText);
  if (!wantsBachelor && !wantsMaster) return;

  const hasBachelor = /本科|学士|bachelor|硕士|研究生|master|mba|博士|phd/.test(candidateText);
  const hasMaster = /硕士|研究生|master|mba|博士|phd/.test(candidateText);
  const hasLowerDegree = /大专|专科|高中|中专/.test(candidateText);
  if ((wantsMaster && hasMaster) || (wantsBachelor && hasBachelor)) {
    result.reasons.push("学历要求有可见证据。");
    result.policyTrace.push("RequirementGate: education pass");
    return;
  }
  if (hasLowerDegree) {
    result.scoreAdjustment -= 28;
    result.maxScore = Math.min(result.maxScore, 58);
    result.concerns.push(`学历硬约束风险：项目要求${wantsMaster ? "硕士及以上" : "本科及以上"}，候选人记录出现较低学历线索。`);
    result.hardFailures.push("学历可能不达标");
    result.policyTrace.push("RequirementGate: education low");
    return;
  }
  if (!record.educationCount) {
    result.maxScore = Math.min(result.maxScore, 78);
  }
  result.concerns.push(`学历要求待验证：项目要求${wantsMaster ? "硕士及以上" : "本科及以上"}，候选人快照缺少学历层级证据。`);
  result.missingInfo.push(`${wantsMaster ? "硕士及以上" : "本科及以上"}学历证明`);
  result.policyTrace.push("RequirementGate: education missing");
}

function applySeniorityGate(result: RequirementGateResult, projectText: string, candidateText: string) {
  const targetManager = /主管到经理|主管.*经理|经理级别|manager\/assistant manager|assistant manager|非高阶|不是高阶|不是.*一号位|非.*一号位|不.*hrvp|不.*hrd|排除.*hrvp|hrvp或hrd/.test(projectText);
  if (!targetManager) return;
  const tooSenior = /hrvp|chro|cho|hrd|人力资源总监|总监|负责人|head of hr|hr head|director|副总裁|vp\b/.test(candidateText);
  if (!tooSenior) return;
  result.scoreAdjustment -= 28;
  result.maxScore = Math.min(result.maxScore, 62);
  result.concerns.push("层级硬约束风险：项目要求主管到经理/非高阶一号位，候选人 title 偏 HRD/负责人/高阶。");
  result.hardFailures.push("层级高于项目目标");
  result.policyTrace.push("RequirementGate: seniority too high");
}

function applyExcludedIndustryGate(result: RequirementGateResult, analysis: JobAnalysis, record: CandidateLike) {
  const coreText = compact([record.companyName, record.title, record.firstExperienceTitle, record.functionPath, record.functionTags]);
  const exclusions = unique([...analysis.searchMap.excludedIndustries, ...analysis.jobBrief.exclusions])
    .map((item) => item.replace(/^(完全|纯|非|不愿意|不接受|不看|排除)/, "").trim())
    .filter((item) => item.length >= 2 && !/地点|薪酬|年龄|title|function|职能|证据|不愿意/.test(item));

  for (const exclusion of exclusions) {
    const escaped = exclusion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(escaped, "i").test(coreText)) {
      result.reject = true;
      result.scoreAdjustment -= 50;
      result.maxScore = Math.min(result.maxScore, 50);
      result.concerns.push(`排除项命中：候选人核心履历出现「${exclusion}」，与项目 excludedIndustries / exclusions 冲突。`);
      result.hardFailures.push(`排除项：${exclusion}`);
      result.policyTrace.push(`RequirementGate: exclusion=${exclusion}`);
      return;
    }
  }
}

function applyScenarioGate(result: RequirementGateResult, analysis: JobAnalysis, candidateText: string) {
  const projectText = coreScenarioText(analysis);
  if (!isHrProjectText(projectText)) return;

  const scenarios = [
    {
      label: "用户/服务团队 HRBP",
      project: /用户中心|客服|客户服务|用户研究|产品培训|会员运营|私域运营|微商城|mkt|市场团队|消费者|customer|member|crm/,
      candidate: /用户中心|客服|客户服务|用户研究|产品培训|会员|私域|微商城|mkt|市场|consumer|customer|crm|服务质量|体验/,
      maxScore: 72,
    },
    {
      label: "电商业务 HRBP",
      project: /电商\s*bp|电商业务|hrbp.*电商|电商.*hrbp|直播|主播|投手|大促|618|双11|内容平台|e-?commerce/,
      candidate: /电商|直播|主播|投手|大促|618|双11|内容平台|私域|微商城|e-?commerce|amazon/,
      maxScore: 74,
    },
    {
      label: "海外/跨文化 HRBP",
      project: /海外|出海|国际化|跨文化|外派|eor|gdpr|欧美|oversea|global\s*(hr|hrbp|bp|people)/,
      candidate: /海外|出海|国际化|跨文化|外派|eor|gdpr|欧美|global|oversea|英文|英语/,
      maxScore: 76,
    },
    {
      label: "商业/渠道 HRBP",
      project: /commercial.{0,12}hrbp|hrbp.{0,12}commercial|经销.{0,12}hrbp|hrbp.{0,12}经销|渠道.{0,12}hrbp|hrbp.{0,12}渠道|销售.{0,12}hrbp|hrbp.{0,12}销售|dealer.{0,12}hrbp|distributor.{0,12}hrbp/,
      candidate: /commercial|sales|销售|经销|渠道|区域|大区|ka|零售|门店|dealer|distributor/,
      maxScore: 78,
    },
  ];

  for (const scenario of scenarios) {
    if (!scenario.project.test(projectText)) continue;
    if (scenario.candidate.test(candidateText)) {
      result.reasons.push(`服务场景命中：${scenario.label}。`);
      result.policyTrace.push(`RequirementGate: scenario=${scenario.label} pass`);
    } else {
      result.scoreAdjustment -= 16;
      result.maxScore = Math.min(result.maxScore, scenario.maxScore);
      result.concerns.push(`服务场景硬证据不足：项目要求${scenario.label}，候选人缺少对应业务对象证据。`);
      result.missingInfo.push(`${scenario.label}的真实支持对象、人数、案例和业务负责人`);
      result.policyTrace.push(`RequirementGate: scenario=${scenario.label} missing`);
    }
  }
}

function applyCoreEvidenceCoverageGate(result: RequirementGateResult, analysis: JobAnalysis, candidateText: string) {
  const projectText = coreScenarioText(analysis);
  const checks: CoreEvidenceCheck[] = [
    {
      label: "欧美/欧洲市场与当地合规实操",
      project: /(欧美|欧洲|德国|西班牙|法国|意大利|英国|欧盟|gdpr|eor|contractor|当地合规|海外合规|劳动法规|劳动法)/,
      full: /(欧美|欧洲|德国|西班牙|法国|意大利|英国|欧盟|eu\b|europe|gdpr|eor|contractor|当地合规|海外合规|劳动法规|劳动法)/,
      negative: /(无|没有|未|非|缺乏|不具备).{0,12}(欧美|欧洲|德国|西班牙|法国|意大利|英国|欧盟|gdpr|eor|contractor|劳动法|合规)|(欧美|欧洲).{0,10}(经验|经历|市场|合规).{0,10}(无|没有|缺乏|不具备)|非欧美/,
      partial: /(北美|美国|新加坡|亚太|东南亚|海外|出海|global|oversea|跨文化|外派|英语|英文)/,
      partialMaxScore: 67,
      missingMaxScore: 58,
    },
    {
      label: "英语可作为工作语言",
      project: /(流利.{0,8}英|英(语|文).{0,12}工作语言|工作语言.{0,12}英(语|文)|全英文|english)/,
      full: /(英语|英文|全英文|口语|外企|cet-?6|六级|雅思|托福|toeic|ielts|toefl|english)/,
      negative: /(英语|英文|口语).{0,10}(差|弱|不好|不流利|不能|无法|不行)|英(语|文).{0,8}(简单沟通|一般|基础)|无.{0,8}英(语|文)/,
      missingMaxScore: 76,
    },
    {
      label: "0-1 组织搭建/组织设计/高端招聘",
      project: /(0\s*[-到至]?\s*1|从0|从 0|组织设计|组织架构|组织调整|高端人才|猎聘|人才规划|团队搭建|体系搭建)/,
      full: /(0\s*[-到至]?\s*1|从0|从 0|组织设计|组织架构|组织调整|reorg|高端|猎聘|人才规划|团队搭建|体系搭建|组建|搭建|招聘)/,
      missingMaxScore: 72,
    },
    {
      label: "经销商/渠道/区域销售团队支持",
      project: /(经销商|经销|渠道|区域销售|dealer|distributor|专业解决方案)/,
      full: /(经销|渠道|代理商|分销|区域销售|大区|全渠道|医院.{0,8}药店|药店|dealer|distributor|wholesale|批发)/,
      negative: /(无|没有|未|缺乏|不具备).{0,12}(经销|渠道|区域销售|代理商|分销|dealer|distributor)|(经销|渠道|区域销售).{0,10}(无|没有|缺乏|不具备)/,
      partial: /(commercial|sales|销售|零售|门店|retail|ka|医院|2b|b2b)/,
      partialMaxScore: 67,
      missingMaxScore: 58,
    },
    {
      label: "销售激励/佣金/绩效方案设计",
      project: /(销售激励|激励|佣金|提成|奖金|绩效方案|绩效管理)/,
      full: /(销售激励|激励|佣金|提成|奖金|绩效|kpi|考核|绩效方案|绩效管理)/,
      negative: /(无|没有|未|缺乏|不具备).{0,12}(销售激励|激励|佣金|提成|奖金|绩效方案)|(销售激励|佣金|提成).{0,10}(无|没有|缺乏|不具备)/,
      missingMaxScore: 72,
    },
  ];

  for (const check of checks) {
    if (!check.project.test(projectText)) continue;
    const hasNegativeEvidence = check.negative?.test(candidateText) ?? false;
    if (check.full.test(candidateText) && !hasNegativeEvidence) {
      result.reasons.push(`核心证据命中：${check.label}。`);
      result.policyTrace.push(`RequirementGate: core=${check.label} pass`);
      continue;
    }
    if (check.partial?.test(candidateText)) {
      result.maxScore = Math.min(result.maxScore, check.partialMaxScore ?? check.missingMaxScore);
      result.scoreAdjustment -= 8;
      result.concerns.push(`核心证据未坐实：${check.label}只有相邻或弱线索，电话验证前不得进入客户可看。`);
      result.missingInfo.push(`${check.label}的直接负责范围、具体案例和可验证证据`);
      result.policyTrace.push(`RequirementGate: core=${check.label} partial`);
      continue;
    }
    result.maxScore = Math.min(result.maxScore, check.missingMaxScore);
    result.scoreAdjustment -= 16;
    result.concerns.push(`核心证据缺失：缺少${check.label}，只能进入电话验证或备选池。`);
    result.missingInfo.push(`${check.label}的直接负责范围、具体案例和可验证证据`);
    result.policyTrace.push(`RequirementGate: core=${check.label} missing`);
  }

  if (/非远程支持|不是远程|直接负责|实地|当地团队/.test(projectText) && /远程/.test(candidateText)) {
    result.maxScore = Math.min(result.maxScore, 58);
    result.scoreAdjustment -= 18;
    result.concerns.push("核心证据冲突：项目要求直接负责/非远程支持，但候选人记录出现远程支持线索。");
    result.missingInfo.push("是否直接负责当地团队，而非远程支持或间接协作");
    result.policyTrace.push("RequirementGate: core=direct ownership remote risk");
  }
}

export function evaluateRequirementGates(analysis: JobAnalysis, record: CandidateLike): RequirementGateResult {
  const result: RequirementGateResult = {
    reject: false,
    scoreAdjustment: 0,
    maxScore: 100,
    reasons: [],
    concerns: [],
    missingInfo: [],
    policyTrace: [],
    hardFailures: [],
  };
  const projectText = textOfAnalysis(analysis);
  const candidateText = textOfCandidate(record);

  applyLocationGate(result, analysis, record, projectText, candidateText);
  applyAgeGate(result, projectText, record);
  applySalaryGate(result, analysis, record);
  applyEducationGate(result, projectText, candidateText, record);
  applySeniorityGate(result, projectText, candidateText);
  applyExcludedIndustryGate(result, analysis, record);
  applyScenarioGate(result, analysis, candidateText);
  applyCoreEvidenceCoverageGate(result, analysis, candidateText);

  result.reasons = unique(result.reasons);
  result.concerns = unique(result.concerns);
  result.missingInfo = unique(result.missingInfo);
  result.policyTrace = unique(result.policyTrace);
  result.hardFailures = unique(result.hardFailures);
  return result;
}

export function applyRequirementGateScore(score: number, gates: RequirementGateResult) {
  if (gates.reject) return 0;
  return Math.max(0, Math.min(gates.maxScore, Math.round(score + gates.scoreAdjustment)));
}
