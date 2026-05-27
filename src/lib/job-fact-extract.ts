import type { JobAnalysis } from "@/lib/job-schema";

type ExplicitJobFacts = {
  clientCompany?: string;
  companyAddress?: string;
  locationAndWorkModel?: string;
  salaryBudget?: string;
  ageLimit?: string;
};

const placeholderCompanyPattern = /^(client company|客户公司|待确认客户公司|保密客户|unknown|n\/a)$/i;

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function withoutPlaceholders(items: string[], patterns: RegExp[]) {
  return items.filter((item) => !patterns.some((pattern) => pattern.test(item)));
}

function normalizeCompanyName(value: string) {
  return value
    .replace(/^客户(?:公司)?\s*[:：]\s*/i, "")
    .replace(/[，,。；;].*$/, "")
    .replace(/\s*(专注于|是一家|为一家|公司介绍|总部|地址).*$/, "")
    .trim();
}

function extractClientCompany(rawInput: string) {
  const patterns = [
    /客户(?:公司)?\s*[:：]\s*([^\n，,。；;]+)/i,
    /公司(?:名称|名)?\s*[:：]\s*([^\n，,。；;]+)/i,
    /客户是\s*([^\n，,。；;]+)/i,
  ];
  for (const pattern of patterns) {
    const match = rawInput.match(pattern);
    const company = normalizeCompanyName(match?.[1] || "");
    if (company && company.length >= 2 && !placeholderCompanyPattern.test(company)) return company;
  }
  return undefined;
}

function extractCompanyAddress(rawInput: string) {
  const match = rawInput.match(/(?:公司)?地址\s*[:：]\s*([^\n]+)/i);
  return match?.[1]?.trim();
}

function cityFromAddress(address: string | undefined, rawInput: string) {
  const text = `${address || ""} ${rawInput}`;
  const cities = ["北京", "上海", "广州", "深圳", "苏州", "杭州", "南京", "成都", "武汉", "西安", "厦门", "宁波", "无锡", "佛山", "东莞"];
  return cities.find((city) => new RegExp(`${city}市?|${city}`).test(text));
}

function extractSalaryBudget(rawInput: string) {
  const patterns = [
    /(\d+(?:\.\d+)?\s*(?:万|w|W)\s*(?:[-~到至]\s*\d+(?:\.\d+)?\s*(?:万|w|W))?(?:\s*[=＝]\s*\d+\s*\+\s*\d+)?)/,
    /(?:预算|薪酬|薪资|年薪|package)\s*[:：]?\s*([^\n，,。；;]+)/i,
  ];
  for (const pattern of patterns) {
    const match = rawInput.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function extractAgeLimit(rawInput: string) {
  const match = rawInput.match(/(?:年纪|年龄|age)\s*(?:在|要求)?\s*(\d{2})\s*岁?以内/i);
  return match ? `${match[1]}岁以内` : undefined;
}

export function extractExplicitJobFacts(rawInput: string): ExplicitJobFacts {
  const clientCompany = extractClientCompany(rawInput);
  const companyAddress = extractCompanyAddress(rawInput);
  const city = cityFromAddress(companyAddress, rawInput);
  const salaryBudget = extractSalaryBudget(rawInput);
  const ageLimit = extractAgeLimit(rawInput);

  return {
    clientCompany,
    companyAddress,
    locationAndWorkModel: city
      ? `${city} onsite${companyAddress ? ` / 公司地址：${companyAddress}` : ""}`
      : companyAddress
        ? `公司地址：${companyAddress}`
        : undefined,
    salaryBudget,
    ageLimit,
  };
}

export function applyExplicitJobFacts(analysis: JobAnalysis, rawInput: string): JobAnalysis {
  const facts = extractExplicitJobFacts(rawInput);
  if (!facts.clientCompany && !facts.companyAddress && !facts.salaryBudget && !facts.ageLimit) return analysis;

  const clientCompany = facts.clientCompany || analysis.jobBrief.clientCompany || analysis.intakeBuilder.structuredBrief.clientCompany;
  const locationAndWorkModel = facts.locationAndWorkModel || analysis.intakeBuilder.structuredBrief.locationAndWorkModel;
  const salaryBudget = facts.salaryBudget || analysis.jobBrief.salaryBudget || analysis.intakeBuilder.structuredBrief.compensation;
  const currentProjectName = analysis.projectName || "";
  const projectName =
    facts.clientCompany && (placeholderCompanyPattern.test(currentProjectName) || currentProjectName.toLowerCase().includes("client company"))
      ? `${facts.clientCompany}-${analysis.jobBrief.roleTitle || analysis.intakeBuilder.structuredBrief.role || "招聘项目"}`
      : currentProjectName;

  const confirmedFacts = unique([
    ...analysis.companyTeamBrief.confirmed,
    facts.clientCompany ? `客户公司已确认：${facts.clientCompany}` : "",
    facts.companyAddress ? `公司地址已确认：${facts.companyAddress}` : "",
    facts.locationAndWorkModel ? `工作地点/办公模式已确认：${facts.locationAndWorkModel}` : "",
    facts.salaryBudget ? `薪酬预算已确认：${facts.salaryBudget}` : "",
    facts.ageLimit ? `年龄边界已确认：${facts.ageLimit}` : "",
  ]);

  const missing = withoutPlaceholders(analysis.companyTeamBrief.missing, [
    /客户公司|公司行业|产品组合|具体业务线/,
    /地点|地址|办公|城市|地域/,
    /薪酬|薪资|预算/,
  ]);
  const unknowns = withoutPlaceholders(analysis.intakeBuilder.structuredBrief.unknowns, [
    /客户公司|具体业务线/,
    /地点|地址|办公|城市|地域/,
    /薪资|薪酬|预算/,
  ]);
  const openQuestions = withoutPlaceholders(analysis.jobBrief.openQuestions, [
    /客户公司|公司名称/,
    /地点|地址|办公|城市|地域/,
    /薪资|薪酬|预算/,
  ]);
  const clientQuestions = withoutPlaceholders(analysis.companyTeamBrief.clientQuestions, [
    /客户公司|公司名称/,
    /地点|地址|办公|城市|地域/,
    /薪资|薪酬|预算/,
  ]);

  const companySignals = facts.clientCompany
    ? [
        {
          name: facts.clientCompany,
          type: "company" as const,
          sourceStatus: "客户提供",
          publicEvidence: facts.companyAddress ? `客户提供公司地址：${facts.companyAddress}` : "客户已提供公司名称，公开资料仍需补证。",
          talentDbEvidence: "人才库扫描应优先查客户公司、相似公司、出海/户外/零售与海外 HRBP 样本。",
          impact: "客户公司和地址是项目硬事实，不能再作为待确认项；Longlist 需以该地点和业务场景校准。",
          nextVerification: "继续确认业务线、服务团队边界、关键 stakeholder 和面试决策链。",
        },
        ...analysis.deepResearch.companySignals.filter((signal) => signal.name !== facts.clientCompany),
      ]
    : analysis.deepResearch.companySignals;

  const locationGuardrail = facts.locationAndWorkModel
    ? `地点硬约束：${facts.locationAndWorkModel}；非本地候选人必须有明确迁移、通勤或异地接受证据，否则不得进入客户可看。`
    : "";
  const ageGuardrail = facts.ageLimit ? `年龄边界：${facts.ageLimit}，超出需明确客户可放宽。` : "";

  return {
    ...analysis,
    projectName,
    intakeBuilder: {
      ...analysis.intakeBuilder,
      knownSignals: unique([
        ...analysis.intakeBuilder.knownSignals,
        facts.clientCompany ? `客户公司：${facts.clientCompany}` : "",
        facts.locationAndWorkModel ? `地点/办公：${facts.locationAndWorkModel}` : "",
        facts.salaryBudget ? `薪酬预算：${facts.salaryBudget}` : "",
        facts.ageLimit ? `年龄：${facts.ageLimit}` : "",
      ]),
      structuredBrief: {
        ...analysis.intakeBuilder.structuredBrief,
        clientCompany,
        locationAndWorkModel,
        compensation: salaryBudget,
        unknowns,
      },
    },
    jobBrief: {
      ...analysis.jobBrief,
      clientCompany,
      salaryBudget,
      exclusions: unique([
        ...analysis.jobBrief.exclusions,
        locationGuardrail,
        ageGuardrail,
      ]),
      openQuestions,
    },
    companyTeamBrief: {
      ...analysis.companyTeamBrief,
      confirmed: confirmedFacts,
      missing,
      clientQuestions,
    },
    talentPersona: {
      ...analysis.talentPersona,
      riskSignals: unique([
        ...analysis.talentPersona.riskSignals,
        locationGuardrail,
        ageGuardrail,
      ]),
    },
    searchMap: {
      ...analysis.searchMap,
      targetCompanies: unique([clientCompany, ...analysis.searchMap.targetCompanies]),
      keywords: unique([
        ...analysis.searchMap.keywords,
        facts.locationAndWorkModel ? facts.locationAndWorkModel.split(/[ /：:]/)[0] : "",
      ]),
    },
    sourcingGuardrails: unique([
      ...analysis.sourcingGuardrails,
      locationGuardrail,
      ageGuardrail,
    ]),
    deepResearch: {
      ...analysis.deepResearch,
      companySignals,
      clientQuestions: withoutPlaceholders(analysis.deepResearch.clientQuestions, [
        /客户公司|公司名称/,
        /地点|地址|办公|城市|地域/,
        /薪资|薪酬|预算/,
      ]),
    },
  };
}
