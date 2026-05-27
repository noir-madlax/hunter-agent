export const CODEX_ADVISOR_POLICY_VERSION = "codex-advisor-policy-2026-05-24";

export const codexAdvisorEvidenceHierarchy = [
  "客户明确输入",
  "客户后续补充",
  "人才库证据",
  "公开信息",
  "LLM 推断",
];

export const codexAdvisorSearchPrinciples = [
  "客户明确输入的岗位、地点、薪酬、替代/新增背景和 must-have 是强约束。",
  "先判岗位职能主轴，再判服务对象、业务场景、层级和落地约束；行业、公司名和相似公司只能在主轴成立后加分。",
  "LLM 推断出的目标公司、相似公司、行业标签和组织假设只能用于扩展搜索，不能替代 title/function/备注中的硬证据。",
  "职位强但行业弱可以进入可验证池；行业强但职位弱必须降权或排除。",
  "高匹配候选人的画像锚点可以用于 lookalike 扩展，但 lookalike 不能绕过 must-have。",
  "每个 longlist 候选人都必须能解释：进入理由、风险/缺口、强约束命中、弱推断命中和电话验证点。",
  "用户裁判反馈必须沉淀为通用规则和 benchmark，不把单个客户、姓名或公司写成不可迁移的硬编码特例。",
];

export const codexAdvisorPolicyPrompt = [
  `Codex 顾问判断 Policy 版本：${CODEX_ADVISOR_POLICY_VERSION}`,
  `证据优先级固定为：${codexAdvisorEvidenceHierarchy.join(" > ")}。排序冲突时，永远让更高优先级证据压过低优先级推断。`,
  "工作循环：先拆岗位主轴 -> 再拆业务场景/服务对象 -> 再确定准入门槛 -> 再找强证据 -> 再用弱假设扩展 -> 最后输出风险和电话验证题。",
  "Longlist 不是关键词命中列表。候选人必须先通过职能/title/function 准入，再看公司相似、行业迁移、薪酬地点和备注证据。",
  "动态评分不是只调数值权重。客户每补充一次需求，都要重新判断：哪些维度新增、哪些维度移除、哪些硬条件降为电话验证、哪些弱假设被证实或推翻。",
  "HR 类岗位必须先识别工作模式：HR 一号位、业务 HRBP、商业/渠道 HRBP、海外/跨文化 HRBP、电商业务 HRBP、用户/服务团队 HRBP、硬 OD/组织效能、COE 专项。HRD/HRVP seniority 不能替代 BP 服务对象证据；组织设计词不能把明确 HRBP 岗误判成 OD；真正硬 OD 岗必须优先组织诊断、架构、编制、岗位价值、人效和变革证据。",
  "经营者/战略类岗位必须优先目标来源和执行证据：战略/商分/经营分析/策略运营 + 业务落地/增长/品类/国家/中台经验。行政、总助、秘书、培训、组织咨询和 HR 主线是常见噪音；游戏战略可进入可验证池，但缺少电商/消费/跨境经营证据时不应排 Top10。",
  "采购/供应链类岗位必须以采购、供应链、供应商管理、招标、询价、合同、成本和交付为主轴。AI、云计算、算力、互联网等行业词不能让 HR、行政、战略、项目经理或技术岗进入 longlist。",
  "Commercial/Sales/渠道类岗位必须先确认支持对象：经销商、渠道、区域销售、KA、零售、电商或专业解决方案。MNC/医疗/消费/零售等公司背景只是场景加分，不能替代商业组织支持证据。",
  "电话前输出必须像顾问：不是把清单甩给用户，而是给出 1 个当前判断、2-4 个关键缺口、可点击/可选择的追问，以及每个候选人的验证话术。",
  "Benchmark 样本只作为回归标准：SHEIN 全球经营者、SHEIN 硬 OD、依视路 Commercial HRBP、名气家 HRVP、算力采购等案例用于防止能力退化，不把样本名字硬编码为业务规则。",
].join("\n");

export const codexAdvisorSkillCards = [
  {
    name: "Codex 顾问判断 Policy",
    trigger: "每次解析岗位、补充客户信息、刷新 Longlist、评分或生成报告前",
    output: "统一证据优先级、岗位主轴、准入门槛、加分/降权/封顶逻辑和电话验证点",
    guardrail: "客户确认事实和人才库证据压过 LLM 推断；行业/公司相似只能加分，不能替代职能准入",
  },
  {
    name: "岗位主轴与服务对象拆解",
    trigger: "岗位名称、JD、电话纪要或客户补充出现后",
    output: "识别角色族群、工作模式、服务对象、核心业务场景、层级意图和强/弱信号",
    guardrail: "不要把同一职能族群的不同工作模式混排；例如 HRBP、HRVP、硬 OD、COE 不能互相替代",
  },
  {
    name: "弱推断降权与噪音排除",
    trigger: "候选人因目标公司、行业词、相似公司或泛关键词被召回时",
    output: "判断该候选人是强匹配、可验证、边缘还是噪音，并说明封顶或排除原因",
    guardrail: "公司好、行业近、备注多都不能绕过 title/function/实际职责证据",
  },
  {
    name: "用户裁判反馈蒸馏",
    trigger: "用户指出候选人适合、不适合、应进 Top10 或不应进 Top10 时",
    output: "把反馈转成通用加分、降权、封顶、排除和 benchmark 规则",
    guardrail: "不把单个姓名写成硬规则；只保留可迁移的判断逻辑",
  },
  {
    name: "场景证据排序",
    trigger: "多个候选人都通过基础职能准入，但业务贴合度不同",
    output: "按服务对象、业务阶段、组织复杂度、管理/交付案例、薪酬地点和动机风险重排",
    guardrail: "HRBP title、战略 title 或采购 title 只是入口；排序必须看具体业务场景证据",
  },
  {
    name: "Longlist 质量审计",
    trigger: "每次自动刷新 Longlist 或用户要求对比 Codex / Agent 输出时",
    output: "审计 Top10 是否可交付、是否混入噪音、是否缺少关键场景证据、哪些样本需要用户裁判",
    guardrail: "审计结论只基于项目画像、候选人快照、人才库备注和 policy trace；不能编造候选人经历",
  },
  {
    name: "Policy Benchmark 回归",
    trigger: "调整 policy、longlist、prompt、skillLibrary 或评分逻辑后",
    output: "用已裁判案例验证排序没有退化，并暴露冲突样本",
    guardrail: "Benchmark 用来保护通用能力，不作为客户特例规则来源",
  },
];
