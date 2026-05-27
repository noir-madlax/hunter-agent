import { DEFAULT_AGENT_SKILLS, normalizeJobAnalysis, type JobAnalysis } from "@/lib/job-schema";

function includesAny(input: string, terms: string[]) {
  return terms.some((term) => input.toLowerCase().includes(term.toLowerCase()));
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function detectHrvpFocus(rawInput: string) {
  if (includesAny(rawInput, ["组织发展", "组织效能", "组织架构", "岗位体系", "管理机制"])) return "组织发展方向";
  if (includesAny(rawInput, ["业务型", "业务高管伙伴", "业务一线", "业务增长"])) return "业务型 HR 负责人";
  if (includesAny(rawInput, ["干部", "继任", "领导力", "关键人才梯队"])) return "干部管理方向";
  if (includesAny(rawInput, ["薪酬", "绩效", "激励", "目标管理", "奖金", "人效"])) return "薪酬绩效方向";
  if (includesAny(rawInput, ["招聘", "人才供应链", "人才引进", "人才地图", "猎头"])) return "招聘与人才供应链方向";
  if (includesAny(rawInput, ["集团", "总部", "业务单元", "HR协同", "管理体系"])) return "集团 HR 体系方向";
  if (includesAny(rawInput, ["企业文化", "组织变革", "使命", "愿景", "价值观"])) return "企业文化与组织变革方向";
  if (includesAny(rawInput, ["数字化", "HR系统", "人力数据", "人效分析", "人才画像", "驾驶舱"])) return "人力资源数字化方向";
  if (includesAny(rawInput, ["综合管理", "全面统筹", "全面负责", "各模块"])) return "综合管理型 HR 一号位";
  return "综合 HRVP";
}

export function buildFallbackJobAnalysis(rawInput: string): JobAnalysis {
  const isHrbp = includesAny(rawInput, ["hrbp", "human resources", "人力", "HR"]);
  const isHrvp = includesAny(rawInput, ["HRVP", "CHRO", "CHO", "人力资源副总裁", "HR一号位", "人力资源一号位"]);
  const hrvpFocus = detectHrvpFocus(rawInput);
  const isCommercial = includesAny(rawInput, [
    "commercial",
    "sales",
    "channel",
    "wholesale",
    "经销",
    "批发",
    "销售",
    "渠道",
  ]);
  const hasEnglish = includesAny(rawInput, ["英文", "英语", "english"]);
  const hasReorg = includesAny(rawInput, ["re-org", "reorg", "组织变革", "变革"]);
  const isShanghai = includesAny(rawInput, ["上海", "Shanghai"]);
  const isMnc = includesAny(rawInput, ["外企", "外资", "mnc", "foreign", "英文环境"]);
  const isEssilorLuxottica = includesAny(rawInput, ["Essilor", "Luxottica", "依视路", "陆逊梯卡"]);
  const isDealerTeam = includesAny(rawInput, ["经销商", "dealer", "distributor", "渠道"]);
  const hasClinicSignal = includesAny(rawInput, ["诊所", "眼科", "Optegra", "医疗", "视光"]);
  const isOverseasBp = includesAny(rawInput, ["欧美海外", "海外BP", "海外 HRBP", "出海", "跨文化", "外派", "EOR", "GDPR", "欧洲", "德国", "西班牙"]);
  const isEcommerceBp = includesAny(rawInput, ["电商BP", "电商 BP", "电商", "直播", "主播", "投手", "618", "双11", "大促", "私域", "微商城"]);
  const isCustomerCenterBp = includesAny(rawInput, ["用户中心", "客服", "客户服务", "用户研究", "产品培训", "会员运营", "私域运营", "运动市场部"]);
  const isOutdoorConsumer = includesAny(rawInput, ["户外", "运动", "跑步", "越野", "攀登", "攀岩", "登山", "徒步", "FUGA", "品牌", "门店", "零售"]);

  const roleTitle = isHrvp
    ? `HRVP / 人力资源副总裁（${hrvpFocus}）`
    : isOverseasBp
      ? "海外 / 跨文化 HRBP"
      : isEcommerceBp
        ? "电商业务 HRBP"
        : isCustomerCenterBp
          ? "用户中心 / 服务团队 HRBP"
    : isCommercial
    ? "Commercial HRBP Manager / Assistant Manager"
    : isHrbp
      ? "HRBP Manager / Assistant Manager"
      : "Target Role";

  const mustHave = isHrvp
    ? unique([
        "HRVP/CHRO/HRD/Head of HR 或接近层级的人力资源负责人经验",
        "能参与经营决策，并把业务战略转成组织、人才、绩效和激励动作",
        hrvpFocus,
        "苏州总部办公可落地，薪酬期望需在 100-150 万人民币以内",
      ])
    : unique([
    isHrbp ? "HRBP 实战经验，能直接支持业务 leader" : "与目标岗位强相关的职能经验",
    isCommercial ? "销售、渠道、经销商或批发业务支持经验" : "",
    isOverseasBp ? "海外组织、本地雇佣、外派、跨文化或海外合规支持经验" : "",
    isEcommerceBp ? "支持过电商、直播、投手、运营、大促或私域/会员团队" : "",
    isCustomerCenterBp ? "支持过客服、用户研究、会员、私域、产品培训或用户运营团队" : "",
    hasEnglish || isOverseasBp ? "英文可用于跨国团队沟通" : "英文能力需进一步确认",
    "本科及以上学历",
    "能用具体业务场景说明 HR 动作带来的影响",
      ]);

  const strongMatch = isHrvp
    ? unique([
        "做过组织架构调整、干部管理、绩效激励、人才梯队或企业文化落地",
        "有总部型、集团型或多业务单元 HR 管理复杂度",
        "能用业务语言和 CEO/业务高管讨论组织效能与关键人才",
        hrvpFocus.includes("数字化") ? "HR 系统、人力数据、人效分析或管理驾驶舱落地经验" : "",
        hrvpFocus.includes("招聘") ? "高管招聘、人才地图、猎头资源管理和关键岗位招聘经验" : "",
        hrvpFocus.includes("薪酬") ? "目标管理、绩效评价、奖金分配和核心人才激励经验" : "",
        hrvpFocus.includes("干部") ? "干部标准、继任计划、领导力发展和核心人才培养经验" : "",
        hrvpFocus.includes("组织发展") ? "组织诊断、岗位体系、管理机制优化和人才盘点经验" : "",
      ])
    : unique([
    isOutdoorConsumer ? "户外、运动、消费品牌、零售或多门店业务背景" : "",
    hasClinicSignal ? "医疗器械、医药、眼科、诊所或专业服务生态背景" : "",
    isOverseasBp ? "出海业务、海外团队、跨文化协作、外派或海外合规经验" : "",
    isEcommerceBp ? "电商、直播、内容平台、私域、会员或高流动运营团队支持经验" : "",
    isCustomerCenterBp ? "客服、用户体验、会员、私域、用户研究或服务质量相关组织支持经验" : "",
    isCommercial || isDealerTeam ? "销售、渠道、区域、KA、经销商或复杂商业组织支持经验" : "",
    isMnc ? "外企、全球化或英文工作环境背景" : "",
    "做过绩效 review、激励项目或组织调整",
    "支持过多区域、多业务单元或复杂业务团队",
    "数据敏感度高，能把业务问题转成组织和人才动作",
      ]);

  const riskSignals = isHrvp
    ? unique([
        "title 是 HRD/负责人但实际只负责招聘、薪酬或培训单一模块",
        "缺少 CEO/业务高管协同和组织变革落地案例",
        "薪酬超过 150 万或不接受苏州总部",
        "缺少本次 HRVP 方向的关键证据，需要电话验证",
      ])
    : unique([
    isCommercial || isDealerTeam ? "只支持门店零售而非批发/经销/区域销售渠道" : "",
    isOverseasBp ? "只有英文或外企背景，但没有真实海外组织、外派、合规或本地雇佣案例" : "",
    isEcommerceBp ? "只有泛 HRBP 经验，缺少直播、投手、运营、大促或电商团队证据" : "",
    isCustomerCenterBp ? "只有泛后台 HR 经验，缺少用户中心、服务团队或体验指标证据" : "",
    "title 是 HRBP 但实际偏 COE 或 SSC",
    "英文水平、薪资期望、通勤便利性未验证",
    hasReorg ? "" : "组织变革或 re-org 操盘经验未明确",
      ]);

  const scoringDimensions = [
    { label: "核心职能匹配", weight: 24, signals: [roleTitle, ...mustHave] },
    { label: "业务场景与行业匹配", weight: 18, signals: ["客户行业", "业务模式", "目标公司", ...strongMatch] },
    { label: "关键业绩与案例证据", weight: 18, signals: ["业绩", "结果", "组织变化", "项目案例", "可量化成果"] },
    { label: "管理影响力与协同复杂度", weight: 14, signals: ["团队管理", "高管协同", "跨部门", "决策链", "影响力"] },
    { label: "薪酬动机与落地风险", weight: 14, signals: ["薪酬", "期望", "动机", "到岗", "竞业", "反 offer"] },
    { label: "信息完整度与可验证性", weight: 12, signals: ["备注", "联系方式", "履历", "面试反馈", "客户确认"] },
  ];
  if (isDealerTeam || isCommercial) {
    scoringDimensions.push({ label: "渠道/销售组织支持经验", weight: 12, signals: ["dealer", "distributor", "channel", "经销商", "渠道", "区域销售"] });
  }
  if (isOverseasBp) {
    scoringDimensions.push({ label: "海外/跨文化 BP 场景", weight: 12, signals: ["海外", "出海", "外派", "EOR", "GDPR", "本地雇佣", "英文工作"] });
  }
  if (isEcommerceBp) {
    scoringDimensions.push({ label: "电商业务 BP 场景", weight: 12, signals: ["电商", "直播", "投手", "运营", "618", "双11", "大促", "私域", "会员"] });
  }
  if (isCustomerCenterBp) {
    scoringDimensions.push({ label: "用户/服务团队 BP 场景", weight: 12, signals: ["客服", "用户研究", "产品培训", "会员运营", "私域运营", "用户体验", "服务质量"] });
  }
  if (isHrvp) {
    scoringDimensions.push({ label: `HRVP 任务重心：${hrvpFocus}`, weight: 18, signals: [hrvpFocus, "组织效能", "干部管理", "绩效激励", "人才梯队", "业务高管协同"] });
  }
  if (hasClinicSignal) {
    scoringDimensions.push({ label: "医疗/专业服务生态相似度", weight: 12, signals: ["medical", "ophthalmology", "clinic", "医疗", "眼科", "诊所", "药房"] });
  }
  const scoringTotal = scoringDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const normalizedScoringDimensions = scoringDimensions.map((dimension, index) => {
    const weight = Math.round((dimension.weight / scoringTotal) * 100);
    return { ...dimension, weight: index === 0 ? weight + (100 - scoringDimensions.reduce((sum, item) => sum + Math.round((item.weight / scoringTotal) * 100), 0)) : weight };
  });
  const nonHrvpCompanySignals = [
    {
      name: isEssilorLuxottica ? "依视路陆逊梯卡" : "客户公司",
      type: "company" as const,
      sourceStatus: isEssilorLuxottica ? "客户提供/待公开补证" : "待确认",
      publicEvidence: isEssilorLuxottica ? "已识别客户名称，需继续补充财报、PR、组织和业务线资料。" : "客户公司信息不足。",
      talentDbEvidence: "需扫描客户公司同岗/相邻岗历史候选人、面试反馈和组织变化记录。",
      impact: "决定目标公司池、候选人画像和电话验证重点。",
      nextVerification: "补齐客户公司业务线/部门、团队结构、汇报关系、关键利益相关人和岗位成功标准。",
    },
    isDealerTeam || isCommercial
      ? {
          name: "销售 / 渠道 / 商业团队",
          type: "team" as const,
          sourceStatus: isDealerTeam ? "客户提供" : "待确认",
          publicEvidence: isDealerTeam ? "原始需求出现经销商、渠道或销售组织信号。" : "尚未确认商业团队具体渠道结构。",
          talentDbEvidence: "需扫描销售、渠道、区域、KA、经销商相关 HRBP 样本。",
          impact: "将评分重点从泛 HRBP 调整到商业组织支持和业务负责人买单。",
          nextVerification: "向客户确认团队覆盖人数、区域、渠道类型和业务 leader。",
        }
      : null,
    isOverseasBp
      ? {
          name: "海外 / 跨文化团队",
          type: "team" as const,
          sourceStatus: "客户提供/待确认边界",
          publicEvidence: "原始需求出现海外、出海、跨文化、外派或海外合规相关信号。",
          talentDbEvidence: "需扫描海外 HRBP、出海业务、外派管理、EOR/GDPR、本地雇佣和英文工作场景样本。",
          impact: "候选人排序优先看真实海外组织支持，而不是泛外企或英文背景。",
          nextVerification: "确认国家/区域、总部外派与本地雇佣比例、合规边界和英文面试强度。",
        }
      : null,
    isEcommerceBp
      ? {
          name: "电商 / 直播 / 运营团队",
          type: "team" as const,
          sourceStatus: "客户提供/待确认边界",
          publicEvidence: "原始需求出现电商、主播、投手、运营、大促、私域或会员相关信号。",
          talentDbEvidence: "需扫描电商 HRBP、直播/投手/运营团队支持、大促人力调配和高流动治理样本。",
          impact: "候选人排序优先看电商业务节奏和绩效激励经验。",
          nextVerification: "确认支持团队人数、岗位组成、流失率、大促节奏和激励机制。",
        }
      : null,
    isCustomerCenterBp
      ? {
          name: "用户中心 / 服务团队",
          type: "team" as const,
          sourceStatus: "客户提供/待确认边界",
          publicEvidence: "原始需求出现客服、用户研究、产品培训、会员、私域或用户运营相关信号。",
          talentDbEvidence: "需扫描用户中心、客服、会员、私域、CRM、用户体验和服务质量相关 HRBP 样本。",
          impact: "候选人排序优先看服务质量、人效、排班、体验指标和年轻团队管理经验。",
          nextVerification: "确认用户中心包含哪些团队、核心指标、排班/人效机制和业务负责人。",
        }
      : null,
    hasClinicSignal
      ? {
          name: "医疗 / 眼科 / 专业服务生态",
          type: "market" as const,
          sourceStatus: "客户提供/公开待补证",
          publicEvidence: "原始需求出现医疗、眼科、诊所或视光相关信号。",
          talentDbEvidence: "需扫描医药、医疗器械、眼科、诊所、药房、医院集团 HRBP 样本。",
          impact: "提高医疗/眼科/医疗器械/诊所生态候选人的优先级。",
          nextVerification: "确认该生态是否直接影响岗位服务团队、绩效目标或组织设计。",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const nonHrvpSimilarityMap = unique([
    isOutdoorConsumer ? "强相似：户外、运动、消费品牌、零售门店或多场景产品矩阵公司。" : "",
    isOverseasBp ? "强相似：有出海、海外本地团队、外派管理、跨文化协作或海外合规复杂度的公司。" : "",
    isEcommerceBp ? "强相似：电商、直播、内容平台、私域、会员运营或大促节奏明显的公司。" : "",
    isCustomerCenterBp ? "强相似：用户中心、客服、会员、私域、用户研究或服务质量指标复杂的组织。" : "",
    isCommercial || isDealerTeam ? "强相似：销售、渠道、区域、KA、经销商或多门店商业组织。" : "",
    hasClinicSignal ? "强相似：医疗、眼科、医疗器械、诊所、医院或专业服务生态。" : "",
    isMnc || hasEnglish ? "可迁移：外企、全球化或英文工作环境，但必须继续验证服务对象是否一致。" : "",
    "谨慎备选：只有公司/行业相似但 title、function 或项目案例不贴合的候选人，只能进入电话验证池。",
  ]);
  const nonHrvpClientQuestions = unique([
    "这个岗位最先解决的三个业务/组织问题是什么？请按优先级排序。",
    "岗位是替代还是新增？现任/前任或当前组织最大的缺口是什么？",
    isCommercial || isDealerTeam ? "该岗位服务的销售/渠道/经销商/区域团队具体属于哪个业务线？覆盖哪些区域和指标？" : "",
    isOverseasBp ? "海外团队覆盖哪些国家？总部外派、本地雇佣、EOR/contractor 和劳动合规分别是什么边界？" : "",
    isEcommerceBp ? "电商团队包含主播、投手、运营、内容、私域或会员哪些岗位？大促和高流失如何影响 HRBP 工作？" : "",
    isCustomerCenterBp ? "用户中心包含客服、用户研究、产品培训、会员、私域或市场哪些团队？核心体验/效率指标是什么？" : "",
    hasClinicSignal ? "医疗/眼科/诊所/专业服务生态是否直接影响本岗位的组织和人才需求？" : "",
    "业务负责人、HR 汇报线和面试决策人分别是谁？各自的决策权重是什么？",
  ]);
  const nonHrvpFirstRoundOrder = unique([
    isOverseasBp ? "海外/出海 HRBP，明确做过跨文化、外派、本地雇佣或海外合规" : "",
    isEcommerceBp ? "电商业务 HRBP，明确支持过直播、投手、运营、大促或私域/会员团队" : "",
    isCustomerCenterBp ? "用户中心/服务团队 HRBP，明确支持客服、会员、私域、用户研究或体验指标" : "",
    isCommercial || isDealerTeam ? "Commercial / Sales / Channel HRBP，现岗或最近一段经历高度贴合" : "",
    "BU HRBP / Regional HRBP / HR Manager，需验证实际 BP 深度和服务对象",
    "COE/SSC/TA/TD 背景仅在业务支持证据充分时进入备选",
  ]);
  const nonHrvpQualificationQuestions = unique([
    "当前支持的业务团队、人数、地域和核心 stakeholder 是谁？",
    isCommercial || isDealerTeam ? "是否直接支持过销售、渠道、区域、KA 或经销商团队？请举一个业务问题转 HR 动作的案例。" : "",
    isOverseasBp ? "是否支持过海外团队、外派、本地雇佣、EOR/contractor、GDPR 或海外劳动合规？" : "",
    isEcommerceBp ? "是否支持过电商、直播、投手、运营、大促、私域或会员团队？流失率和激励怎么处理？" : "",
    isCustomerCenterBp ? "是否处理过客服/用户中心的服务质量、人效、排班、体验指标或绩效激励问题？" : "",
    "当前薪资结构、期望薪资、到岗周期和工作地点接受度如何？",
  ]);
  const nonHrvpRiskChecks = unique([
    "title 是 HRBP 但实际偏 TA、SSC、C&B、OD 或 TD",
    isCommercial || isDealerTeam ? "商业/渠道经验只停留在早期或支持深度不足" : "",
    isOverseasBp ? "只有英文或外企背景，但没有真实海外组织支持案例" : "",
    isEcommerceBp ? "只有泛运营或泛 HRBP，没有电商团队和大促高流动场景" : "",
    isCustomerCenterBp ? "只有泛后台 HR，没有用户中心/服务质量/体验指标场景" : "",
    "薪资、地点、英文或业务 stakeholder 复杂度无法通过案例验证",
  ]);
  const nonHrvpTargetIndustries = unique([
    isOutdoorConsumer ? "户外 / 运动 / 消费品牌 / 零售总部" : "",
    isOverseasBp ? "出海业务 / 跨境业务 / 海外本地团队 / 全球化品牌" : "",
    isEcommerceBp ? "电商 / 直播 / 内容平台 / 私域会员 / 高流动运营团队" : "",
    isCustomerCenterBp ? "用户中心 / 客服 / 会员 / 用户研究 / 服务运营" : "",
    isCommercial || isDealerTeam ? "销售 / 渠道 / 经销商 / 区域 / KA 商业组织" : "",
    hasClinicSignal ? "医疗 / 眼科 / 医疗器械 / 诊所 / 专业服务生态" : "",
    !isOutdoorConsumer && !isOverseasBp && !isEcommerceBp && !isCustomerCenterBp && !isCommercial && !hasClinicSignal ? "与客户业务模式相似的总部型业务团队" : "",
  ]);
  const nonHrvpTargetCompanies = unique([
    isOutdoorConsumer ? "运动户外、消费品牌、零售总部和多门店业务公司" : "",
    isOverseasBp ? "有欧美/海外团队、出海业务、外派管理或本地雇佣复杂度的公司" : "",
    isEcommerceBp ? "电商平台、品牌电商、直播电商、内容平台和私域会员业务公司" : "",
    isCustomerCenterBp ? "用户中心、客服中心、会员运营、CRM 或用户体验复杂的公司" : "",
    isCommercial || isDealerTeam ? "支持销售、渠道、经销商、区域或 KA 组织的公司" : "",
    hasClinicSignal ? "医疗器械、眼科、诊所、医院集团或生命科学公司" : "",
    isMnc ? "外企、全球化或英文工作环境公司" : "",
  ]);
  const nonHrvpTargetTitles = unique([
    isOverseasBp ? "Overseas HRBP / Global HRBP / International HRBP" : "",
    isEcommerceBp ? "E-commerce HRBP / 电商 HRBP / 直播业务 HRBP" : "",
    isCustomerCenterBp ? "用户中心 HRBP / 客服 HRBP / 会员运营 HRBP" : "",
    isCommercial || isDealerTeam ? "Commercial HRBP / Sales HRBP / Channel HRBP / Regional HRBP" : "",
    "HRBP Manager",
    "HR Business Partner",
    "People Partner",
    "HR Manager",
  ]);
  const nonHrvpKeywords = unique([
    "HRBP",
    "HR Business Partner",
    isOverseasBp ? "overseas / global / EOR / GDPR / expatriate / 跨文化 / 外派" : "",
    isEcommerceBp ? "e-commerce / live streaming / 直播 / 投手 / 大促 / 私域 / 会员" : "",
    isCustomerCenterBp ? "customer service / CRM / 用户中心 / 客服 / 会员 / 用户体验" : "",
    isCommercial || isDealerTeam ? "commercial / sales / channel / dealer / distributor / KA / 区域销售" : "",
    hasClinicSignal ? "medical / healthcare / ophthalmology / clinic / 医疗 / 眼科" : "",
    isOutdoorConsumer ? "outdoor / sports / retail / consumer brand / 户外 / 运动 / 零售" : "",
  ]);

  return normalizeJobAnalysis({
    projectName: isHrvp ? `名气家 HRVP - ${hrvpFocus}` : roleTitle,
    intakeBuilder: {
      inputType: rawInput.length > 500 ? "JD/电话纪要混合输入" : "客户关键词/简短需求",
      knownSignals: unique([
        isHrvp ? `岗位方向包含 HRVP / 人力资源副总裁，任务重心为${hrvpFocus}` : isHrbp ? "岗位方向包含 HRBP / 人力资源业务伙伴" : "",
        isCommercial ? "业务方向包含 Commercial / Sales / Channel / Wholesale" : "",
        includesAny(rawInput, ["苏州"]) ? "地点线索包含苏州总部" : isShanghai ? "地点线索包含上海" : "",
        hasEnglish || isMnc ? "客户偏好外企或英文环境" : "",
        isHrvp ? "已出现 100-150 万人民币薪资预算线索" : includesAny(rawInput, ["40", "50", "薪资", "w"]) ? "已出现薪资预算线索" : "",
        includesAny(rawInput, ["250"]) ? "已出现支持人数约 250 人的线索" : "",
      ]),
      inferredHypotheses: isHrvp ? [
        "这是 HR 一号位/准一号位项目，不应按普通 HRBP 或单模块 COE 搜索。",
        `本轮 Codex 判断先按${hrvpFocus}重排候选人优先级；其他 HRVP 经验只能作为基础层级信号。`,
        "替代职位更看过往组织问题修复和高管协同；新增职位更看体系搭建和从 0 到 1 的能力。",
      ] : [
        "该岗位不是纯 HR operations，而是需要贴近商业业务 leader 的 HRBP 角色",
        isOverseasBp
          ? "第一轮寻访应优先有真实海外组织支持、外派/本地雇佣/合规经验的 HRBP，不把英文或外企背景当成充分证据"
          : isEcommerceBp
            ? "第一轮寻访应优先有电商、直播、投手、运营、大促或私域/会员团队支持证据的 HRBP"
            : isCustomerCenterBp
              ? "第一轮寻访应优先有用户中心、客服、会员、私域、用户研究或服务质量指标经验的 HRBP"
              : isCommercial
                ? "第一轮寻访应优先 Commercial / Sales / Channel HRBP，而不是泛外企 HR"
                : "第一轮寻访应先确认服务对象，再扩展相似公司和可迁移候选人",
        "若客户只给关键词，当前输出只能作为 brief 草稿，不能直接作为候选人推荐口径",
      ],
      structuredBrief: {
        role: roleTitle,
        clientCompany: includesAny(rawInput, ["名气家"]) ? "名气家信息服务有限公司" : isEssilorLuxottica ? "EssilorLuxottica / 依视路陆逊梯卡" : "待确认客户公司",
        businessContext: isHrvp
          ? `苏州总部 HRVP 项目，核心是${hrvpFocus}，需要支撑经营决策、组织效能和关键人才体系。`
          : isOverseasBp
            ? "海外 / 出海团队 HRBP 支持场景，需确认国家范围、总部外派、本地雇佣、海外合规和英文工作强度"
          : isEcommerceBp
            ? "电商业务 HRBP 支持场景，需确认主播/投手/运营/私域/会员团队边界、大促节奏和高流动治理"
          : isCustomerCenterBp
            ? "用户中心 / 服务团队 HRBP 支持场景，需确认客服、用户研究、产品培训、会员、私域和体验指标边界"
          : isCommercial
          ? "商业 / 销售 / 渠道团队 HRBP 支持场景，需进一步确认业务线和渠道结构"
          : "业务场景待确认，需要先问清岗位支持对象和组织痛点",
        teamScope: includesAny(rawInput, ["250"]) ? "支持全国约 250 人" : "支持人数、地域和团队结构待确认",
        locationAndWorkModel: includesAny(rawInput, ["苏州"]) ? "苏州总部" : isShanghai ? "上海 onsite" : "地点和办公方式待确认",
        compensation: isHrvp
          ? "100-150 万人民币以内"
          : includesAny(rawInput, ["40", "50", "薪资", "w"])
          ? "预算存在 40-50w 或相近线索，需确认 base/bonus/总包口径"
          : "薪资预算待确认",
        reportingLine: includesAny(rawInput, ["Assistant Director", "汇报"])
          ? "汇报线已有线索，需确认完整矩阵"
          : "汇报对象和矩阵关系待确认",
        mustHave,
        unknowns: isHrvp ? [
          "公司当前业务规模、组织架构和 HR 团队配置",
          "岗位是替代还是新增，以及现任/前任不匹配点",
          "CEO/业务高管对 HRVP 的前三个成功标准",
          `本次${hrvpFocus}的权重是否高于综合 HR 一号位能力`,
        ] : [
          "客户公司和具体业务线",
          "岗位新增/替换原因",
          "服务对象、团队结构和关键 stakeholder",
          "薪资结构、职级范围和面试英文强度",
        ],
      },
      collectionTasks: [
        "把客户原始需求补成一页 intake brief，而不是直接开始找人",
        "向客户确认业务线、团队结构、岗位背景、成功标准和硬性排除项",
        "确认薪资预算口径、汇报线、面试流程和英文使用场景",
        "把待确认信息分成：必须确认后才能寻访、可边找边验证、推荐前必须验证",
      ],
    },
    jobBrief: {
      roleTitle,
      clientCompany: includesAny(rawInput, ["名气家"]) ? "名气家信息服务有限公司" : isEssilorLuxottica ? "EssilorLuxottica / 依视路陆逊梯卡" : "Client Company",
      companyBackground:
        isHrvp ? "客户为苏州总部型公司，当前需求指向 HRVP/HR 一号位层级，需要围绕经营决策、组织能力和关键人才体系交付。" : "客户公司和业务阶段需要继续补齐；当前先按已知业务场景建立可验证 HRBP 画像。",
      businessContext:
        isHrvp
          ? `岗位核心不是泛 HRVP title，而是${hrvpFocus}下的组织和人才交付。`
          : isOverseasBp
            ? "岗位需要贴近海外/出海业务，支持跨文化协作、总部外派、本地雇佣、海外合规和核心岗位招聘。"
          : isEcommerceBp
            ? "岗位需要贴近电商团队，支持直播/投手/运营/私域/会员、大促人力调配、高流动治理和绩效激励。"
          : isCustomerCenterBp
            ? "岗位需要贴近用户中心/服务团队，支持客服、会员、私域、用户研究、产品培训、体验指标和人效管理。"
          : isDealerTeam || hasClinicSignal
          ? "岗位需要贴近销售/渠道/专业解决方案业务，支持绩效激励、组织调整和相关生态扩展。"
          : "岗位需要贴近业务一线，支持绩效、激励、组织调整和关键人才决策。",
      reportingLine: "待客户确认完整汇报线",
      salaryBudget: isHrvp
        ? "100-150 万人民币以内"
        : includesAny(rawInput, ["35w", "40", "50", "薪资"])
        ? "AM 约 35w，Manager 约 40-50w"
        : "待确认",
      responsibilities: isHrvp ? [
        "参与公司战略及经营管理决策",
        "推动组织架构、干部管理、绩效激励、人才梯队和企业文化相关交付",
        `围绕${hrvpFocus}形成可落地的人力资源解决方案`,
        "提升组织效能，支持业务持续发展",
      ] : [
        "支持商业业务 leader 的组织和人才议题",
        "参与绩效 review、激励项目和组织调整",
        "理解渠道业务挑战并转化为 HR 解决方案",
        "识别关键岗位风险并推动落地动作",
      ],
      mustHave,
      niceToHave: strongMatch,
      exclusions: isHrvp ? ["行政/办公室负责人误判为 HRVP", "纯招聘/纯薪酬/纯培训单模块且无一号位经验", "薪酬显著超过 150 万且无下降动机", "不接受苏州总部"] : ["title/function 与 HRBP 主轴不符", "只有行业或公司相似但没有服务对象证据", "纯 TA/SSC/C&B/TD/行政，除非客户确认可迁移"],
      softSignals: ["积极主动", "业务敏感度高", "落地不漂浮", "沟通成熟"],
      openQuestions: isHrvp ? [
        "该 HRVP 向谁汇报？CEO/老板/集团 HR 的决策权重分别是多少？",
        "替代或新增的真实原因是什么？前任/现任最大的缺口是什么？",
        `本次${hrvpFocus}是必须强项，还是进入后第一阶段重点？`,
        "HR 团队规模、COE/SSC/BP 配置和业务单元边界是什么？",
        "100-150 万是现金总包、base+bonus，还是含长期激励？",
      ] : [
        "客户公司所属行业、产品线和商业模式是什么？",
        "目标团队组织结构、地域覆盖和核心业务挑战是什么？",
        "岗位是新增还是替换？前任/现任不匹配点是什么？",
        "目标团队最看重候选人哪段业务场景经验？",
        "英文面试强度和使用频率如何？",
        "薪资预算对 base、bonus 和总包的口径是什么？",
      ],
    },
    companyTeamBrief: {
      confirmed: unique([
        isHrvp ? `岗位是 HRVP / 人力资源副总裁，任务重心为${hrvpFocus}` : isCommercial ? "岗位支持 Commercial / Sales / Channel 相关业务场景" : "",
        includesAny(rawInput, ["苏州"]) ? "工作地点为苏州总部" : isShanghai ? "工作地点为上海，需 onsite" : "",
        hasEnglish || isMnc ? "客户优先外企 / 英文工作环境候选人" : "",
        includesAny(rawInput, ["250"]) ? "支持团队规模约 250 人" : "",
      ]),
      missing: isHrvp ? [
        "名气家业务模式、公司规模、组织架构和未来增长方向",
        "HRVP 汇报线、老板/CEO 风格和业务高管的真实痛点",
        "当前 HR 团队配置、模块成熟度和需要优先修复的问题",
        "岗位替代/新增背景、成功标准、面试流程和薪酬结构",
      ] : [
        "客户公司行业、产品组合和目标业务线",
        "Commercial 团队结构、地域划分和销售渠道类型",
        "HRBP 团队配置、COE/SSC 支持方式和汇报矩阵",
        "岗位新增/替换原因、当前业务痛点和 6 个月内最重要交付",
      ],
      clientQuestions: isHrvp ? [
        "这个 HRVP 最先要解决的是组织、干部、绩效、招聘、文化、集团体系还是数字化？请按优先级排序。",
        "如果是替代，前任不能满足的是业务贴身、专业深度、管理风格还是老板信任？",
        "HRVP 需要管理多大团队？哪些模块已有负责人，哪些需要亲自下场？",
        "公司当前组织阶段是扩张、调整、降本增效、集团化，还是接班梯队建设？",
      ] : [
        "这个 HRBP 主要支持哪类 Commercial 人群：KA、渠道、批发、零售、区域销售还是职能团队？",
        "目前 Commercial leader 对 HRBP 最大不满或最大期待是什么？",
        "销售激励、绩效 review、组织调整分别由谁牵头，HRBP 的参与深度到哪里？",
        "英文使用频率是日常汇报、跨区会议，还是只在面试中验证？",
      ],
    },
    talentPersona: {
      summary:
        isHrvp ? `优先寻找 HRVP/CHRO/HRD 层级，既能承担 HR 一号位复杂度，又在${hrvpFocus}上有强案例的人。` : `优先寻找${roleTitle}，必须能证明服务对象、业务节奏和实际 HRBP 交付，而不是只看公司名或行业标签。`,
      mustHave,
      strongMatch,
      riskSignals,
      evidenceToCollect: [
        "候选人支持的业务链路和渠道类型",
        "绩效 review、激励项目、re-org 的实际角色",
        "与业务 leader 处理分歧的真实案例",
        "英文口语、薪资期望、可到岗时间",
      ],
    },
    searchMap: {
      targetIndustries: isHrvp ? [
        "总部型消费/服务/互联网/科技公司",
        "多业务单元或集团化民营企业",
        "处在增长、组织调整或管理升级阶段的公司",
      ] : nonHrvpTargetIndustries,
      targetCompanies: isHrvp ? [
        "同规模总部型公司",
        "苏州/长三角成长型企业",
        "集团化或多 BU 组织",
        "业务增长和组织升级明显的民营企业",
      ] : nonHrvpTargetCompanies,
      targetTitles: isHrvp ? [
        "HRVP",
        "CHRO",
        "CHO",
        "Head of HR",
        "HRD",
        "集团人力资源总监",
        "人力资源负责人",
        `${hrvpFocus}负责人`,
      ] : nonHrvpTargetTitles,
      keywords: isHrvp ? [
        "HRVP",
        "CHRO",
        "人力资源副总裁",
        "人力资源负责人",
        hrvpFocus,
        "组织效能",
        "干部管理",
        "绩效激励",
        "人才梯队",
      ] : nonHrvpKeywords,
      excludedIndustries: isHrvp ? ["行政负责人", "单一模块低层级 HR", "纯咨询未落地"] : ["职能不相关", "只有行业相似无 HRBP 证据", "纯招聘/行政/SSC/薪酬核算"],
      sourcingChannels: ["谷露", "微信", "猎聘", "LinkedIn", "候选人转介绍"],
      outreachAngle:
        isHrvp ? `强调这是苏州总部 HRVP 角色，能参与经营决策，并在${hrvpFocus}上有明确交付空间。` : "强调岗位连接核心业务团队，能参与绩效、激励、组织调整和关键人才议题；具体卖点按客户已确认业务场景表达。",
    },
    booleanSearch: {
      precise: isHrvp
        ? `("HRVP" OR "CHRO" OR "Head of HR" OR "HRD" OR "人力资源负责人") AND ("${hrvpFocus}" OR 组织 OR 干部 OR 绩效 OR 激励 OR 人才) AND (苏州 OR 上海 OR 南京 OR 杭州 OR 长三角)`
        : `("HRBP" OR "HR Business Partner" OR "People Partner" OR "HR Manager") AND (${nonHrvpKeywords.slice(2).join(" OR ") || "业务"})`,
      expanded: isHrvp
        ? '("人力资源总监" OR "集团人力资源总监" OR "HR Head" OR "CHO") AND (组织效能 OR 干部管理 OR 薪酬绩效 OR 业务HR OR 文化变革 OR HR数字化)'
        : `("HRBP" OR "People Partner" OR "HR Manager") AND (${nonHrvpTargetIndustries.join(" OR ") || "业务团队"})`,
      excludeNoise: isHrvp
        ? '("HRVP" OR "HRD" OR "人力资源负责人") NOT 行政 NOT 秘书 NOT 单一招聘 NOT payroll NOT HR专员'
        : '("HRBP" OR "HR Business Partner") NOT recruiter NOT "talent acquisition" NOT C&B NOT payroll NOT 行政 NOT SSC',
      platformNotes: [
        isHrvp ? "LinkedIn Recruiter：先用 HRVP/CHRO/Head of HR/HRD 控制层级，再用任务重心关键词二次过滤。" : "LinkedIn Recruiter：优先用 title + 服务对象/业务场景关键词，再按实际支持团队人工筛选。",
        "猎聘/脉脉：适合补充中文 title 和本地活跃候选人，但需要账号和平台权限",
        "API 数据源：只做公开数据小样本验证，不抓联系方式，不批量拉取个人资料",
      ],
    },
    sourcingGuardrails: [
      "使用平台原生搜索、筛选、保存功能，保持人工节奏",
      "不批量打开详情页，不批量抓取或导出候选人隐私数据",
      "不绕过登录、验证码、风控、付费墙或平台限制",
      "不自动群发消息；触达前先由顾问确认话术和发送对象",
      "第三方 API 只用于公开字段的小样本验证，失败时回到平台内低频人工筛选",
    ],
    screeningPlan: {
      firstRoundOrder: isHrvp ? [
        `HRVP/CHRO/HRD 中明确做过${hrvpFocus}的人`,
        "综合 HR 一号位，覆盖组织、干部、绩效、招聘、文化或集团体系多个模块",
        "强业务型 HR 负责人，可验证 CEO/业务高管协同和组织效能案例",
        "单模块专家仅在方向高度贴合且有升级到一号位潜力时进入备选",
      ] : nonHrvpFirstRoundOrder,
      qualificationQuestions: isHrvp ? [
        "你现在是否是公司 HR 一号位或接近一号位？向谁汇报，管理哪些 HR 模块？",
        `请讲一个与${hrvpFocus}最相关的完整案例：背景、你的动作、业务结果和阻力是什么？`,
        "你参与经营决策的深度到哪里？和 CEO/业务高管发生分歧时如何推进？",
        "当前薪资结构、期望薪资、苏州总部接受度和到岗周期如何？",
      ] : nonHrvpQualificationQuestions,
      riskChecks: isHrvp ? [
        "title 高但实际只负责单一 HR 模块，缺少一号位视角",
        `没有${hrvpFocus}的可验证案例，只能算泛 HR 相关`,
        "缺少老板/CEO/业务高管协同经验，无法承担替代或新增岗位压力",
        "薪酬超过 150 万、地点不接受苏州或动机不足",
      ] : nonHrvpRiskChecks,
    },
    deepResearch: {
      operatingRules: [
        "所有客户提供事实、公开资料和人才库信息必须分开标注来源状态。",
        "每出现一个新人物、组织、合作方或竞品名，都同时触发公网检索和人才库扫描。",
        "人才库命中必须看公司、职位、履历和备注上下文；同名但无法匹配时标为噪音。",
        "人才库反馈可用于判断组织变化、面试体验、薪酬动机和候选人顾虑，但不能替代客户确认。",
      ],
      companySignals: isHrvp ? [
        {
          name: includesAny(rawInput, ["名气家"]) ? "名气家信息服务有限公司" : "客户公司",
          type: "company",
          sourceStatus: includesAny(rawInput, ["名气家"]) ? "客户提供/待公开补证" : "待确认",
          publicEvidence: "已获得客户公司、地点、薪资和岗位性质线索；仍需补充业务规模、组织阶段和老板/CEO 风格。",
          talentDbEvidence: "需扫描名气家、苏州/长三角总部型公司、HRVP/CHRO/HRD 和相邻岗位历史候选人。",
          impact: `决定 HRVP 候选人是偏综合一号位、${hrvpFocus}专家升级，还是业务型 HR 负责人迁移。`,
          nextVerification: "补齐公司业务模式、组织架构、HR 团队配置、汇报线、岗位替代/新增原因和成功标准。",
        },
        {
          name: `HRVP 任务重心：${hrvpFocus}`,
          type: "team",
          sourceStatus: "客户提供/AI 结构化",
          publicEvidence: "原始需求中出现对应职责关键词，但任务权重和第一阶段交付仍需客户确认。",
          talentDbEvidence: `人才库扫描需优先寻找 title 层级接近且有${hrvpFocus}案例的人，而不是泛 HR title。`,
          impact: "Longlist 排序会按任务重心动态调整；同样是 HRD，方向不匹配会降权。",
          nextVerification: "让客户在综合一号位能力与本方向专业深度之间排序，并确认必须强项。",
        },
      ] : nonHrvpCompanySignals,
      peopleNodes: [
        {
          name: "关键利益相关人 / 决策链节点",
          type: "person",
          sourceStatus: "待确认",
          publicEvidence: "需通过 PR、官网、新闻稿或客户访谈确认姓名、职责和时间线。",
          talentDbEvidence: "每出现一个领导姓名，都要同步扫描人才库中的本人、同名噪音、面试反馈和组织评价。",
          impact: "领导偏好会影响候选人风格：强业务推进型、流程严谨型、变革型或稳定运营型。",
          nextVerification: "向客户确认直接业务 stakeholder、HR 汇报线、面试官名单和决策链。",
        },
      ],
      talentDbScanProtocol: [
        "先查客户公司 + 岗位名，找曾在同公司同岗位/相邻岗位工作过的人。",
        "再查业务线/部门、团队范围、汇报关系、关键利益相关人、合作方和竞品公司，补充组织结构和领导偏好。",
        "对高匹配候选人提取画像锚点，再做 lookalike 扩展。",
        "所有结论输出为：公开信息、人才库命中、可信度、对岗位判断影响、下一步验证。",
      ],
      companySimilarityMap: isHrvp ? [
        "强相似：苏州/长三角总部型、集团化、多业务单元、处在管理升级或组织调整阶段的公司。",
        "可迁移：业务增长快、组织复杂度高、需要 HR 一号位参与经营决策的民营/消费/服务/科技公司。",
        "谨慎备选：纯外企模块负责人、纯咨询顾问、单一招聘/薪酬负责人，除非有一号位或强落地证据。",
      ] : nonHrvpSimilarityMap,
      clientQuestions: isHrvp ? [
        "这个 HRVP 最先解决的三个业务/组织问题是什么？请按优先级排序。",
        "岗位是替代还是新增？前任/现任或当前组织最大的缺口是什么？",
        "HRVP 的汇报对象、业务高管协同对象和最终决策人分别是谁？",
        `本次${hrvpFocus}是硬性强项，还是入职后可补齐的阶段性任务？`,
      ] : nonHrvpClientQuestions,
    },
    workflowBlueprint: [
      { label: "岗位输入/编辑", status: "done", output: "解析 JD 或电话纪要，形成可编辑 JobBrief" },
      { label: "公司/部门 Deep Research", status: "active", output: "自动补齐客户公司、业务线/部门、团队范围、关键利益相关人、合作方和竞品信息" },
      { label: "人才画像/搜索策略", status: "done", output: "生成 must-have、nice-to-have、deal-breaker、目标公司和关键词" },
      { label: "人才库预筛选", status: "active", output: "系统自动查客户公司同岗/相邻岗历史样本，再查竞品和相似业务样本" },
      { label: "Longlist 快照", status: "active", output: "系统在信息足够后扫描人才库，保存稳定候选人快照" },
      { label: "AI 评分", status: "manual_required", output: "顾问点击开始/重跑 AI 评分后，项目 longlist 内最多 50 人全量评分" },
      { label: "顾问确认 Shortlist", status: "manual_required", output: "AI 排序后由顾问人工确认 shortlist" },
      { label: "推荐报告草稿", status: "manual_required", output: "顾问确认 shortlist 后显式触发报告草稿生成" },
    ],
    skillLibrary: DEFAULT_AGENT_SKILLS,
    scoringModel: {
      recommendationLevels: ["强烈推荐", "推荐", "谨慎推荐", "不推荐"],
      capPerProject: 50,
      requiredOutputs: ["推荐等级", "综合分", "证据", "风险点", "信息缺口", "建议追问"],
      dimensions: normalizedScoringDimensions,
    },
    deliveryWorkflow: [
      { label: "原始需求输入", status: "done", output: "接收 JD、电话纪要或客户关键词" },
      { label: "结构化补齐", status: "active", output: "把粗糙需求整理成 intake brief 草稿和收集任务" },
      { label: "职位诊断", status: "done", output: "拆分 must-have、nice-to-have、deal-breaker 和风险点" },
      { label: "公司/团队背景补齐", status: "active", output: isHrvp ? "形成客户追问问题，补齐公司组织阶段、汇报线、HR 团队和成功标准" : "形成客户追问问题，补齐商业团队和岗位背景" },
      { label: "候选人画像", status: "done", output: isHrvp ? `定义 HRVP 层级与${hrvpFocus}并重的优先画像` : "定义 MNC Commercial/Sales HRBP 优先画像" },
      { label: "人才地图", status: "done", output: "按强匹配、可迁移、备选方向组织公司池" },
      { label: "搜索策略", status: "done", output: "产出 LinkedIn/猎聘/脉脉/API 可用关键词和 Boolean" },
      { label: "低频寻访", status: "manual_required", output: "平台内人工筛选和保存，不批量抓取" },
      { label: "初筛排序", status: "manual_required", output: "顾问触发评分后按岗位贴合、动机、薪资、风险形成 shortlist 建议" },
      { label: "触达话术", status: "manual_required", output: "发送前由顾问确认对象和内容" },
      { label: "推荐报告", status: "manual_required", output: "顾问确认 shortlist 后输出推荐结论、证据和风险" },
    ],
    nextActions: isHrvp ? [
      "先确认 HRVP 汇报线、岗位替代/新增原因和前三个成功标准",
      `用 HRVP/CHRO/HRD 层级 + ${hrvpFocus}关键词扫描人才库`,
      "电话初筛先验证一号位复杂度、老板协同、方向案例和苏州/薪酬可行性",
      "把单模块候选人与综合一号位候选人分池评估，不混排",
    ] : [
      "先向客户补齐公司/团队背景和岗位成功标准",
      "用目标 title 和行业关键词建立第一版 longlist",
      "电话初筛先确认渠道业务经验和英文水平",
      "深访重点验证绩效、激励、组织调整三个案例",
      "推荐报告中同步披露行业、渠道、英文和薪资风险",
    ],
  });
}
