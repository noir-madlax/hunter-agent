export const policyCalibrationSummary = {
  name: "Codex 裁判样本蒸馏与回归",
  principle: "把用户在 Codex 会话中明确裁判过的正/负样本转成可执行排序规则和回归检查。",
  examples: [
    {
      scenario: "SHEIN 全球经营者",
      positiveSignals: ["字节策略", "美团商分", "小红书战略分析", "跨境/电商/消费业务落地", "年轻高潜", "业务转型意愿"],
      negativeSignals: ["行政岗位", "总助/秘书包装战略", "培训/组织咨询", "HR 主线", "只有游戏战略且缺少电商/消费经营证据"],
      judgeNotes: [
        "田嘉平/小红书战略分析经理可以进 Top10。",
        "张宇康/腾讯游戏战略经理合适但不应进 Top10。",
        "徐利华行政岗位不适合。",
        "宋先生/唯品会业务咨询组负责人偏培训/组织咨询，不适合。",
        "张梓恩/总助营业战略完全不适合。",
      ],
    },
    {
      scenario: "名气家 HRVP",
      positiveSignals: ["HRVP/CHO/CHRO", "集团 HR 负责人", "综合 HR 一号位", "组织效能", "干部/绩效/薪酬/人才梯队", "苏州/长三角可落地"],
      negativeSignals: ["战略/商分候选人", "非 HR 职能", "单模块招聘且无 HR 一号位证据", "人力行政包装"],
      judgeNotes: ["HRVP 变体必须先拆方向，再按方向重排；不能让战略/业务关键词污染 HR longlist。"],
    },
    {
      scenario: "依视路 Commercial HRBP",
      positiveSignals: ["HRBP/HR Manager", "Commercial/Sales/渠道支持", "MNC/外企英文环境", "医疗/医药/器械/眼科生态", "长三角落地"],
      negativeSignals: ["纯战略/商分", "无 HRBP 证据", "互联网泛 HR 且缺少商业/渠道支持"],
      judgeNotes: ["经销商团队、医疗眼科生态、GM 变化等是项目特定信号，只能在相关客户项目中启用。"],
    },
    {
      scenario: "SHEIN 硬 OD",
      positiveSignals: ["组织诊断", "组织架构设计", "编制管理", "岗位价值评估", "人效分析", "头部人力咨询", "大型互联网/科技/研产销复杂组织"],
      negativeSignals: ["纯培训/学习发展", "纯 HRBP", "纯招聘", "只有组织关键词但无架构/编制/人效项目"],
      judgeNotes: [
        "TD/培训背景不是一票否决；如果备注中有组织诊断、架构设计、编制、岗位价值或人效项目，可以保留为电话验证样本。",
        "硬 OD 排序必须看项目深度、组织复杂度和方案落地责任，不能只看 title 是否叫 OD。",
      ],
    },
  ],
  guardrails: [
    "裁判样本用于抽象排序逻辑，不把单个姓名硬编码为业务结论。",
    "每次策略调整后运行 npm run policy:eval，确保已校准项目不退化。",
    "如果用户给出新的正/负样本，先转成通用规则，再补充 benchmark。",
  ],
};
