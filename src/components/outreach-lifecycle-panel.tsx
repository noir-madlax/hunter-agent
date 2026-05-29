"use client";

import { useState } from "react";
import {
  DECISION_STAGES,
  DROP_REASON_CODES,
  DROP_REASON_META,
  OUTREACH_CHANNELS,
  OUTREACH_RESULTS,
  COMP_REALITY_VALUES,
  type DecisionStage,
  type DropReasonCode,
  type OutreachChannel,
  type OutreachResult,
  type CompRealityVsTarget,
} from "@/lib/outreach-feedback";

interface OutreachLifecyclePanelProps {
  projectId: string;
  candidateId: string;
  initialStage: DecisionStage | null;
  initialChannel: OutreachChannel | null;
  initialResult: OutreachResult | null;
  initialDropReasonCode: DropReasonCode | null;
  initialDropReasonNote: string | null;
  initialCompReality: CompRealityVsTarget | null;
  onSaved?: () => void;
}

const STAGE_LABELS: Record<DecisionStage, string> = {
  outreached: "已触达",
  replied: "已回复",
  conversed: "已沟通",
  recommended: "已推荐",
  interviewing: "面试中",
  offer: "Offer",
  hired: "入职",
  dropped: "流失",
};

const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  wechat: "微信",
  phone: "电话",
  linkedin: "LinkedIn",
  maimai: "脉脉",
  email: "邮件",
  other: "其他",
};

const RESULT_LABELS: Record<OutreachResult, string> = {
  no_response: "无响应",
  read_no_reply: "已读不回",
  declined: "回拒",
  willing: "愿沟通",
  conversed: "已沟通",
};

const COMP_LABELS: Record<CompRealityVsTarget, string> = {
  in_budget: "预算内",
  slightly_over: "略超",
  far_over: "严重超",
  below_budget: "低于预算",
  unknown: "未知",
};

export function OutreachLifecyclePanel({
  projectId,
  candidateId,
  initialStage,
  initialChannel,
  initialResult,
  initialDropReasonCode,
  initialDropReasonNote,
  initialCompReality,
  onSaved,
}: OutreachLifecyclePanelProps) {
  const [stage, setStage] = useState<DecisionStage | "">(initialStage ?? "");
  const [channel, setChannel] = useState<OutreachChannel | "">(initialChannel ?? "");
  const [result, setResult] = useState<OutreachResult | "">(initialResult ?? "");
  const [dropCode, setDropCode] = useState<DropReasonCode | "">(initialDropReasonCode ?? "");
  const [dropNote, setDropNote] = useState<string>(initialDropReasonNote ?? "");
  const [comp, setComp] = useState<CompRealityVsTarget | "">(initialCompReality ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const isDropped = stage === "dropped";
  const canSave = stage !== "" && (!isDropped || dropCode !== "");

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId,
          toStage: stage,
          channel: channel || undefined,
          result: result || undefined,
          dropReasonCode: dropCode || undefined,
          dropReasonNote: dropNote.trim() || undefined,
          compRealityVsTarget: comp || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `请求失败 (${res.status})`);
      }
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-section lifecycle-panel">
      <div className="profile-section-head lifecycle-panel-head">
        <strong className="lifecycle-panel-title">触达 / 反哺 (Module 12)</strong>
        {savedAt ? <span className="lifecycle-panel-saved">已保存 {savedAt}</span> : null}
      </div>

      <div className="lifecycle-form-grid">
        <label className="lifecycle-field">
          <span className="lifecycle-field-label required">当前阶段 *</span>
          <select
            className="lifecycle-select"
            value={stage}
            onChange={(e) => setStage(e.target.value as DecisionStage | "")}
          >
            <option value="">—</option>
            {DECISION_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="lifecycle-field">
          <span className="lifecycle-field-label">触达渠道</span>
          <select
            className="lifecycle-select"
            value={channel}
            onChange={(e) => setChannel(e.target.value as OutreachChannel | "")}
          >
            <option value="">—</option>
            {OUTREACH_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="lifecycle-field">
          <span className="lifecycle-field-label">触达结果</span>
          <select
            className="lifecycle-select"
            value={result}
            onChange={(e) => setResult(e.target.value as OutreachResult | "")}
          >
            <option value="">—</option>
            {OUTREACH_RESULTS.map((r) => (
              <option key={r} value={r}>
                {RESULT_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="lifecycle-field">
          <span className="lifecycle-field-label">薪酬期望 vs 预算</span>
          <select
            className="lifecycle-select"
            value={comp}
            onChange={(e) => setComp(e.target.value as CompRealityVsTarget | "")}
          >
            <option value="">—</option>
            {COMP_REALITY_VALUES.map((c) => (
              <option key={c} value={c}>
                {COMP_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        {isDropped ? (
          <label className="lifecycle-field wide">
            <span className="lifecycle-field-label required">流失归因 (D1-D8) *</span>
            <select
              className="lifecycle-select"
              value={dropCode}
              onChange={(e) => setDropCode(e.target.value as DropReasonCode | "")}
            >
              <option value="">— 选择 —</option>
              {DROP_REASON_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {DROP_REASON_META[c].label}
                </option>
              ))}
            </select>
            {dropCode ? (
              <span className="lifecycle-field-hint">
                反哺：{DROP_REASON_META[dropCode].feedsBackTo}
              </span>
            ) : null}
          </label>
        ) : null}

        {isDropped ? (
          <label className="lifecycle-field wide">
            <span className="lifecycle-field-label">备注（可选）</span>
            <textarea
              className="lifecycle-textarea"
              value={dropNote}
              onChange={(e) => setDropNote(e.target.value)}
              rows={2}
              placeholder="具体细节，例如「期望年薪 130w，预算 100w」"
            />
          </label>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="lifecycle-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSave()}
          disabled={!canSave || saving}
        >
          {saving ? "保存中…" : "记录状态变更"}
        </button>
      </div>
    </section>
  );
}
