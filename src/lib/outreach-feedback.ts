// Module 12: Outreach Conversion Feedback Loop — application-layer constants & helpers.
// SQLite has no enums, so the allowed values for the string columns added in
// migration 20260527000000_outreach_feedback_loop live here and are validated at the
// application boundary.

// ---------------------------------------------------------------------------
// D1-D8 drop-reason taxonomy (see skills/headhunter/modules/12-outreach-conversion-feedback.md)
// ---------------------------------------------------------------------------

export const DROP_REASON_CODES = [
  "D1", // 画像偏离 — actual background diverges from persona
  "D2", // 动机不匹配 — not in market / direction mismatch
  "D3", // 薪酬不匹配 — expectation materially exceeds budget
  "D4", // 地点/外派不接受 — relocation / overseas refusal
  "D5", // 客户公司印象差 — brand / leader perception
  "D6", // 流程过慢/反 Offer — client-side process drag, counter-offer lost
  "D7", // 文化不匹配 — stakeholder style / intensity
  "D8", // 触达本身失败 — unreachable after >=3 attempts
] as const;
export type DropReasonCode = (typeof DROP_REASON_CODES)[number];

export const DROP_REASON_META: Record<
  DropReasonCode,
  { label: string; feedsBackTo: string }
> = {
  D1: { label: "画像偏离", feedsBackTo: "Stage 1 信号反演 — 雇主成功范本判定错了" },
  D2: { label: "动机不匹配", feedsBackTo: "Stage 2 候选人留存层 — 动机筛选前置" },
  D3: { label: "薪酬不匹配", feedsBackTo: "客户预算复议 + Stage 5 Rubric 薪酬维度降权" },
  D4: { label: "地点/外派不接受", feedsBackTo: "Stage 1 跨度暗示重读" },
  D5: { label: "客户公司印象差", feedsBackTo: "Stage 2 雇主预期层 + stakeholder 市场口碑研究" },
  D6: { label: "流程过慢/反 Offer", feedsBackTo: "Stage 6 next-step — 客户进度警报，非画像调整" },
  D7: { label: "文化不匹配", feedsBackTo: "Stage 2 失败模式 — 调整目标公司池" },
  D8: { label: "触达本身失败", feedsBackTo: "Stage 3 库的数据质量 — 体检结论更新" },
};

// ---------------------------------------------------------------------------
// Outreach lifecycle stages
// ---------------------------------------------------------------------------

export const DECISION_STAGES = [
  "outreached",
  "replied",
  "conversed",
  "recommended",
  "interviewing",
  "offer",
  "hired",
  "dropped",
] as const;
export type DecisionStage = (typeof DECISION_STAGES)[number];

export const OUTREACH_CHANNELS = [
  "wechat",
  "phone",
  "linkedin",
  "maimai",
  "email",
  "other",
] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_RESULTS = [
  "no_response",
  "read_no_reply",
  "declined",
  "willing",
  "conversed",
] as const;
export type OutreachResult = (typeof OUTREACH_RESULTS)[number];

export const COMP_REALITY_VALUES = [
  "in_budget",
  "slightly_over",
  "far_over",
  "below_budget",
  "unknown",
] as const;
export type CompRealityVsTarget = (typeof COMP_REALITY_VALUES)[number];

// ---------------------------------------------------------------------------
// Validators (throw on invalid; for use at API boundary)
// ---------------------------------------------------------------------------

export function isDropReasonCode(v: unknown): v is DropReasonCode {
  return typeof v === "string" && (DROP_REASON_CODES as readonly string[]).includes(v);
}
export function isDecisionStage(v: unknown): v is DecisionStage {
  return typeof v === "string" && (DECISION_STAGES as readonly string[]).includes(v);
}
export function isOutreachChannel(v: unknown): v is OutreachChannel {
  return typeof v === "string" && (OUTREACH_CHANNELS as readonly string[]).includes(v);
}
export function isOutreachResult(v: unknown): v is OutreachResult {
  return typeof v === "string" && (OUTREACH_RESULTS as readonly string[]).includes(v);
}
export function isCompReality(v: unknown): v is CompRealityVsTarget {
  return typeof v === "string" && (COMP_REALITY_VALUES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Feedback loop trigger rules (Module 12 Step 3)
// Given an aggregated reason distribution, return the recommended actions.
// ---------------------------------------------------------------------------

export interface ReasonDistribution {
  total: number; // total dropped count in the window
  counts: Partial<Record<DropReasonCode, number>>;
  tierAHitRate?: number; // 0-1
  d3AvgOverBudgetPct?: number; // 0-1; e.g. 0.3 = 30% over
}

export interface RecommendedAction {
  target: "stage_1" | "stage_2" | "stage_3" | "stage_5" | "stage_6" | "client_alert";
  code: DropReasonCode | "TierA_low";
  description: string;
  // True if this is a CLIENT-side alert (not a persona change), e.g. D6 >= 25%.
  clientAlert?: boolean;
}

export function recommendActions(d: ReasonDistribution): RecommendedAction[] {
  const out: RecommendedAction[] = [];
  const total = d.total || 0;
  const pct = (code: DropReasonCode) => (total ? (d.counts[code] ?? 0) / total : 0);

  if ((d.tierAHitRate ?? 1) < 0.2 && pct("D1") >= 0.5) {
    out.push({
      target: "stage_1",
      code: "TierA_low",
      description:
        "Tier A 命中率 <20% 且 D1 占比 >=50% — 雇主成功范本判定错了，Stage 1 信号反演重做。",
    });
  }
  if (pct("D2") >= 0.4) {
    out.push({
      target: "stage_2",
      code: "D2",
      description: "D2 占比 >=40% — 动机筛选问题必须前置到首聊。",
    });
  }
  if ((d.d3AvgOverBudgetPct ?? 0) >= 0.3) {
    out.push({
      target: "stage_5",
      code: "D3",
      description: "D3 平均超预算 >=30% — 回客户预算复议 + Rubric 薪酬维度降权。",
    });
  }
  if (pct("D4") >= 0.3) {
    out.push({
      target: "stage_1",
      code: "D4",
      description: "D4 占比 >=30% — Stage 1 跨度暗示重读，确认外派是否真要。",
    });
  }
  if (pct("D6") >= 0.25) {
    out.push({
      target: "client_alert",
      code: "D6",
      description: "D6 占比 >=25% — 不是人的问题，是客户流程慢。警报客户，不调画像。",
      clientAlert: true,
    });
  }
  if (pct("D7") >= 0.3) {
    out.push({
      target: "stage_2",
      code: "D7",
      description: "D7 集中 — 失败模式预演已验证，调整目标公司池。",
    });
  }
  if (pct("D8") >= 0.5) {
    out.push({
      target: "stage_3",
      code: "D8",
      description: "D8 占比 >=50% — 库的数据质量比预估低，Stage 3 体检结论更新。",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reflow guard: minimum 5 samples before any persona change (Module 12 Guardrail 1)
// ---------------------------------------------------------------------------

export const MIN_SAMPLES_FOR_REFLOW = 5;

export function canTriggerReflow(droppedCount: number): boolean {
  return droppedCount >= MIN_SAMPLES_FOR_REFLOW;
}
