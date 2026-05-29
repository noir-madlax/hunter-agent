import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, FileText, Mail, Phone, Star, X } from "lucide-react";

import { stageLabels } from "@/components/project-chat-types";
import type { CandidateProfilePayload, ProjectCandidate } from "@/components/project-chat-types";
import { funnelStatusPillClass } from "@/components/project-chat-utils";
import {
  candidateCompany,
  candidateDisplayName,
  candidateTitle,
  compactValue,
} from "@/components/project-chat-candidate-utils";
import { OutreachLifecyclePanel } from "@/components/outreach-lifecycle-panel";
import type {
  DecisionStage,
  DropReasonCode,
  OutreachChannel,
  OutreachResult,
  CompRealityVsTarget,
} from "@/lib/outreach-feedback";

function profileRows(candidate: ProjectCandidate, profile: CandidateProfilePayload | null) {
  const snapshot = profile?.record || candidate.snapshot;
  return [
    ["姓名", candidateDisplayName(candidate)],
    ["公司", candidateCompany(candidate)],
    ["职位", candidateTitle(candidate)],
    ["职能路径", snapshot?.functionPath],
    ["年龄 / 性别", [snapshot?.age, snapshot?.gender].filter((item) => item !== null && item !== undefined && item !== "").join(" / ")],
    ["薪资", snapshot?.annualSalary],
    ["期望薪资", snapshot?.expectedSalary],
    ["来源 / 状态", [snapshot?.source, snapshot?.status].filter(Boolean).join(" / ")],
    ["最近联系", snapshot?.lastContactDate],
    ["最近更新", snapshot?.lastUpdateDate],
    ["日志更新", snapshot?.logUpdateDate],
    ["加入项目", candidate.addedToProjectAt],
  ];
}

function rawDetailRows(rawDetail: Record<string, unknown> | null) {
  if (!rawDetail) return [];
  return Object.entries(rawDetail).sort(([a], [b]) => a.localeCompare(b));
}

type ProfileFieldRow = [string, unknown];

type ProfileDataSection = {
  title: string;
  source: string;
  rows: ProfileFieldRow[];
};

type ConsultantNoteItem = {
  source: string;
  content: string;
};

type ResumeArtifact = {
  title: string;
  date: string;
  source: string;
  html: string | null;
  metadata: Record<string, unknown>;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tableRowsFromRecord(record: Record<string, unknown> | null | undefined, excludedKeys: string[] = []): ProfileFieldRow[] {
  if (!record) return [];
  const excluded = new Set(excludedKeys);
  return Object.entries(record).filter(([key]) => !excluded.has(key));
}

function tableRowsFromArray(items: Array<Record<string, unknown>> | undefined, titleKey: string) {
  return (items ?? []).map((item, index) => {
    const title = compactValue(item[titleKey] ?? item.name ?? item.id ?? `#${index + 1}`);
    return [`${index + 1}. ${title}`, item] as ProfileFieldRow;
  });
}

function renderFieldValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "未填";
  if (Array.isArray(value) || isObjectRecord(value)) return JSON.stringify(value, null, 2);
  return String(value);
}

function buildProfileDataSections(candidate: ProjectCandidate, profile: CandidateProfilePayload | null): ProfileDataSection[] {
  const snapshot = profile?.record || candidate.snapshot;
  const deepProfile = profile?.deepProfile ?? null;
  const sections: ProfileDataSection[] = [
    {
      title: "项目候选人记录",
      source: "Project Candidate",
      rows: [
        ["projectCandidateId", candidate.id],
        ["name", candidate.name],
        ["currentCompany", candidate.currentCompany],
        ["currentTitle", candidate.currentTitle],
        ["status", candidate.status],
        ["funnelStatus", candidate.funnelStatus],
        ["externalSource", candidate.externalSource],
        ["externalCandidateId", candidate.externalCandidateId],
        ["addedToProjectAt", candidate.addedToProjectAt],
        ["rawProfile", candidate.rawProfile],
      ],
    },
    {
      title: "基础表字段",
      source: "persol-report-data.records / candidate_list + detail summary",
      rows: tableRowsFromRecord(snapshot, ["notes", "searchText"]),
    },
    {
      title: "列表表原始字段",
      source: "candidate_list.jsonl",
      rows: tableRowsFromRecord(profile?.rawList),
    },
    {
      title: "详情表字段",
      source: profile?.rawDetailSource || "candidate_detail_bulk.jsonl",
      rows: rawDetailRows(profile?.rawDetail ?? null),
    },
  ];

  if (deepProfile) {
    sections.push(
      {
        title: "深度履历元数据",
        source: "persol-profile-index / candidate_deep",
        rows: [
          ["id", deepProfile.id],
          ["selfAssessment", deepProfile.selfAssessment],
          ["candidateMeta", deepProfile.candidateMeta],
        ],
      },
      {
        title: "工作经历",
        source: "deepProfile.experiences",
        rows: tableRowsFromArray(deepProfile.experiences, "company"),
      },
      {
        title: "教育经历",
        source: "deepProfile.educations",
        rows: tableRowsFromArray(deepProfile.educations, "school"),
      },
      {
        title: "项目经历",
        source: "deepProfile.projects",
        rows: tableRowsFromArray(deepProfile.projects, "name"),
      },
      {
        title: "附件 / 原始简历文件",
        source: "deepProfile.attachments",
        rows: tableRowsFromArray(deepProfile.attachments, "name"),
      },
      {
        title: "推荐 / 投递历史",
        source: "deepProfile.jobSubmissions",
        rows: tableRowsFromArray(deepProfile.jobSubmissions, "jobTitle"),
      },
    );
  } else {
    sections.push({
      title: "深度履历元数据",
      source: "persol-profile-index / candidate_deep",
      rows: [["deepProfile", "未读取到深度履历表记录"]],
    });
  }

  return sections;
}

function collectConsultantNotes(candidate: ProjectCandidate, profile: CandidateProfilePayload | null): ConsultantNoteItem[] {
  const snapshot = profile?.record || candidate.snapshot;
  const notes: ConsultantNoteItem[] = [];
  for (const note of snapshot?.notes ?? []) {
    notes.push({ source: "基础表 notes", content: note });
  }

  for (const [key, value] of Object.entries(profile?.rawDetail ?? {})) {
    if (!/note|remark|comment|memo|备注/i.test(key)) continue;
    const text = renderFieldValue(value);
    if (text !== "未填") notes.push({ source: `详情表 ${key}`, content: text });
  }
  for (const [key, value] of Object.entries(profile?.rawList ?? {})) {
    if (!/note|remark|comment|memo|备注/i.test(key)) continue;
    const text = renderFieldValue(value);
    if (text !== "未填") notes.push({ source: `列表表 ${key}`, content: text });
  }

  const seen = new Set<string>();
  return notes.filter((item) => {
    const key = `${item.source}:${item.content}`.replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value) || /&lt;\/?[a-z]/i.test(value);
}

function parseDateValue(value: string) {
  const time = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(time) ? time : 0;
}

function collectResumeArtifacts(profile: CandidateProfilePayload | null): ResumeArtifact[] {
  const artifacts: ResumeArtifact[] = [];

  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isObjectRecord(value)) return;

    const title = compactValue(value.originname ?? value.name ?? value.__name__ ?? value.title ?? path);
    const ext = String(value.ext ?? "").toLowerCase();
    const category = String(value.category ?? value.tag ?? "");
    const html = typeof value.html === "string" && value.html.trim() ? value.html : null;
    const date = compactValue(value.dateAdded ?? value.lastUpdateDate ?? value.updatedAt ?? "");
    const isResumeFile = ext === "html" || /原始简历|Original CV|resume|cv/i.test(`${title} ${category}`);
    if (isResumeFile || html) {
      artifacts.push({
        title,
        date: date === "未填" ? "" : date,
        source: path,
        html,
        metadata: value,
      });
    }

    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && /html/i.test(key) && child.trim() && looksLikeHtml(child)) {
        artifacts.push({
          title: `${path}.${key}`,
          date,
          source: `${path}.${key}`,
          html: child,
          metadata: { [key]: child },
        });
      } else if (Array.isArray(child) || isObjectRecord(child)) {
        visit(child, `${path}.${key}`);
      }
    }
  }

  visit(profile?.deepProfile ?? null, "deepProfile");
  visit(profile?.rawList ?? null, "rawList");
  visit(profile?.rawDetail ?? null, "rawDetail");

  return artifacts.sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date));
}

function ProfileFieldTable({ rows }: { rows: ProfileFieldRow[] }) {
  if (!rows.length) return <p className="kv muted">暂无字段。</p>;
  return (
    <div className="raw-field-list complete">
      {rows.map(([key, value], index) => (
        <div key={`${key}-${index}`}>
          <span>{key}</span>
          <code>{renderFieldValue(value)}</code>
        </div>
      ))}
    </div>
  );
}

function ResumePreview({ title, html }: { title: string; html: string }) {
  const [mounted, setMounted] = useState(false);
  const sizeKb = Math.round(new Blob([html]).size / 1024);
  if (!mounted) {
    return (
      <button type="button" className="resume-preview-toggle" onClick={() => setMounted(true)}>
        <FileText size={14} />
        展开原始简历 HTML ({sizeKb} KB)
      </button>
    );
  }
  return (
    <div className="resume-preview-wrap">
      <button type="button" className="resume-preview-collapse" onClick={() => setMounted(false)} title="收起原始简历">
        收起 ({sizeKb} KB)
      </button>
      <iframe
        className="resume-html-frame"
        title={`${title} 原始简历HTML`}
        srcDoc={html}
        sandbox=""
        loading="lazy"
      />
    </div>
  );
}

export function CandidateProfileDrawer({
  projectId,
  candidate,
  profile,
  loading,
  error,
  actionLoading,
  judging,
  index,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onToggleShortlist,
  onJudge,
}: {
  projectId: string | null;
  candidate: ProjectCandidate | null;
  profile: CandidateProfilePayload | null;
  loading: boolean;
  error: string | null;
  actionLoading: string | null;
  judging: boolean;
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onToggleShortlist: (candidate: ProjectCandidate) => void;
  onJudge: (candidate: ProjectCandidate, decision: "保留" | "降级" | "移出") => void;
}) {
  if (!candidate) return null;
  const snapshot = profile?.record || candidate.snapshot;
  const screening = candidate.screening;
  const dataSections = buildProfileDataSections(candidate, profile);
  const consultantNotes = collectConsultantNotes(candidate, profile);
  const resumeArtifacts = collectResumeArtifacts(profile);
  const latestResume = resumeArtifacts[0] ?? null;
  const isShortlist = candidate.funnelStatus === "shortlist";

  return (
    <div className="candidate-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="candidate-drawer" role="dialog" aria-modal="true" aria-label="候选人履历" onClick={(event) => event.stopPropagation()}>
        <header className="candidate-drawer-head">
          <div>
            <div className="drawer-kicker">
              Candidate Profile
              {total > 1 ? <span className="drawer-kicker-index">{index + 1} / {total}</span> : null}
            </div>
            <h2>{candidateDisplayName(candidate)}</h2>
            <p>
              {candidateCompany(candidate)} · {candidateTitle(candidate)}
            </p>
          </div>
          <div className="drawer-head-actions">
            <button type="button" className="icon-btn ghost" onClick={onPrev} disabled={!hasPrev} aria-label="上一位候选人" title="上一位 (←)">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="icon-btn ghost" onClick={onNext} disabled={!hasNext} aria-label="下一位候选人" title="下一位 (→)">
              <ChevronRight size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭候选人履历" title="关闭 (Esc)">
              <X size={17} />
            </button>
          </div>
        </header>

        <section className="candidate-summary-grid has-four-cols">
          <div>
            <span>评分</span>
            <strong>{screening?.score ?? snapshot?.matchScore ?? "待评"}</strong>
          </div>
          <div>
            <span>推荐</span>
            <strong>{screening?.recommendation || snapshot?.advisorTier || snapshot?.matchGate || "待判断"}</strong>
          </div>
          <div>
            <span>状态</span>
            <strong>
              <span className={`pill ${funnelStatusPillClass(candidate.funnelStatus)}`}>
                {stageLabels[candidate.funnelStatus] || candidate.funnelStatus}
              </span>
            </strong>
          </div>
          <div>
            <span>日志更新日期</span>
            <strong>{snapshot?.logUpdateDate || snapshot?.lastContactDate || snapshot?.lastUpdateDate || "无"}</strong>
          </div>
        </section>

        <div className="candidate-contact-row">
          <button type="button" className="btn btn-outline mini" disabled={!snapshot?.mobile}>
            <Phone size={13} />
            {snapshot?.mobile || "无电话"}
          </button>
          <button type="button" className="btn btn-outline mini" disabled={!snapshot?.email}>
            <Mail size={13} />
            {snapshot?.email || "无邮箱"}
          </button>
          <button
            type="button"
            className="btn btn-outline mini"
            onClick={() => navigator.clipboard?.writeText(`${candidateDisplayName(candidate)} ${snapshot?.mobile || ""} ${snapshot?.email || ""}`.trim())}
          >
            <Copy size={13} />
            复制
          </button>
        </div>

        <div className="candidate-drawer-actions">
          <button type="button" className="btn btn-primary" onClick={() => onToggleShortlist(candidate)} disabled={!screening || actionLoading === candidate.id}>
            <Star size={14} />
            {isShortlist ? "移出 Shortlist" : "确认 Shortlist"}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onJudge(candidate, "保留")} disabled={judging}>
            保留
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onJudge(candidate, "降级")} disabled={judging}>
            降级
          </button>
          <button type="button" className="btn btn-outline danger" onClick={() => onJudge(candidate, "移出")} disabled={judging}>
            移出
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {loading ? (
          <div className="drawer-skeleton" aria-busy="true" aria-label="正在读取人才库完整档案">
            <div className="skeleton-line skeleton-line-lg" />
            <div className="skeleton-grid">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line-sm" />
          </div>
        ) : null}

        {projectId ? (
          <OutreachLifecyclePanel
            key={`outreach-${candidate.id}`}
            projectId={projectId}
            candidateId={candidate.id}
            initialStage={(candidate.decisionStage as DecisionStage | null) ?? null}
            initialChannel={(candidate.outreachChannel as OutreachChannel | null) ?? null}
            initialResult={(candidate.outreachResult as OutreachResult | null) ?? null}
            initialDropReasonCode={(candidate.dropReasonCode as DropReasonCode | null) ?? null}
            initialDropReasonNote={candidate.dropReasonNote ?? null}
            initialCompReality={(candidate.compRealityVsTarget as CompRealityVsTarget | null) ?? null}
          />
        ) : null}

        <div className="candidate-drawer-body">
          {/* 数据治理智能看板 */}
          {(() => {
            const govSalary = snapshot?.governedSalary;
            const govNotes = snapshot?.governedNotes;
            const govExps = profile?.deepProfile?.governedExperiences;
            if (!govSalary && !govNotes && (!govExps || govExps.length === 0)) return null;

            return (
              <section className="profile-section profile-major-section governance-panel" style={{ border: '1px solid var(--ha-line)', borderRadius: '8px', padding: '16px', marginBottom: '20px', backgroundColor: 'var(--ha-bg-soft)' }}>
                <div className="profile-section-head" style={{ borderBottomColor: 'var(--ha-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--ha-accent)', fontWeight: 'bold', fontSize: '11px' }}>⭐ 数据治理智能看板 (Smart Governance)</span>
                  <span className="pill" style={{ backgroundColor: 'var(--ha-accent)', color: '#fff', fontSize: '9px', padding: '2px 8px', borderRadius: '4px', textTransform: 'none', letterSpacing: 'normal' }}>已完成数据治理</span>
                </div>
                
                {/* Salary Section */}
                {govSalary && (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ha-ink-2)' }}>💰 薪资结构化解析</div>
                    <div className="profile-kv-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                      <div>
                        <span>Base 薪资</span>
                        <strong>
                          {govSalary.base
                            ? `${(govSalary.base.monthly / 1000).toFixed(1)}k * ${govSalary.base.months}薪`
                            : "未提取到基本月薪"}
                        </strong>
                        {govSalary.base && (
                          <small style={{ fontSize: '10px', color: 'var(--ha-ink-3)', display: 'block', marginTop: '2px' }}>
                            年化: {Math.round(govSalary.base.annualizedBase / 10000)} 万/年
                          </small>
                        )}
                      </div>
                      <div>
                        <span>年终/奖金</span>
                        <strong>
                          {govSalary.bonus
                            ? `${(govSalary.bonus.annualizedBonus / 10000).toFixed(1)} 万/年`
                            : "无"}
                        </strong>
                        {govSalary.bonus?.rawText && (
                          <small style={{ fontSize: '10px', color: 'var(--ha-ink-3)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }} title={govSalary.bonus.rawText}>
                            原文: {govSalary.bonus.rawText}
                          </small>
                        )}
                      </div>
                      <div>
                        <span>股权期权</span>
                        <strong>
                          {govSalary.equity
                            ? govSalary.equity.percentage
                              ? `${govSalary.equity.percentage}% 股份`
                              : govSalary.equity.annualizedValue !== null
                                ? `${(govSalary.equity.annualizedValue / 10000).toFixed(1)} 万/年`
                                : "无"
                            : "无"}
                        </strong>
                        {govSalary.equity && (
                          <small style={{ fontSize: '10px', color: 'var(--ha-ink-3)', display: 'block', marginTop: '2px' }}>
                            {govSalary.equity.totalValue ? `总: ${Math.round(govSalary.equity.totalValue / 10000)}万 (${govSalary.equity.vestingYears}年)` : govSalary.equity.type}
                          </small>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--ha-ink-2)', padding: '6px 8px', backgroundColor: 'var(--ha-bg-card)', borderRadius: '4px', border: '1px solid var(--ha-line-soft)' }}>
                      <span>治理估算总年薪: <strong style={{ color: 'var(--ha-accent)', fontSize: '12px' }}>{govSalary.annualizedTotal ? `${(govSalary.annualizedTotal / 10000).toFixed(1)} 万` : "暂无估算"}</strong></span>
                      <span style={{ fontSize: '10px', color: 'var(--ha-ink-3)' }}>原薪资: {snapshot?.annualSalary || "无"} | 期望: {snapshot?.expectedSalary || "无"}</span>
                    </div>
                  </div>
                )}

                {/* Tag / Intentions Section */}
                {govNotes && (
                  <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ha-ink-2)' }}>🎯 意向信号与标签</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {/* Seeking status */}
                      {govNotes.seekingStatus === 'active' && (
                        <span className="pill" style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: '11px', borderRadius: '4px', padding: '2px 8px', border: '1px solid #bbf7d0', textTransform: 'none', letterSpacing: 'normal' }}>求职意向: 积极活跃</span>
                      )}
                      {govNotes.seekingStatus === 'passive' && (
                        <span className="pill" style={{ backgroundColor: '#fef3c7', color: '#d97706', fontSize: '11px', borderRadius: '4px', padding: '2px 8px', border: '1px solid #fde68a', textTransform: 'none', letterSpacing: 'normal' }}>求职意向: 稳定/不看机会</span>
                      )}
                      {govNotes.seekingStatus === 'unknown' && (
                        <span className="pill" style={{ backgroundColor: '#f3f4f6', color: '#4b5563', fontSize: '11px', borderRadius: '4px', padding: '2px 8px', border: '1px solid #e5e7eb', textTransform: 'none', letterSpacing: 'normal' }}>求职意向: 未知/待沟通</span>
                      )}

                      {/* Extracted tags */}
                      {govNotes.extractedTags && govNotes.extractedTags.length > 0 ? (
                        govNotes.extractedTags.map((tag: string) => (
                          <span key={tag} className="pill" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '11px', borderRadius: '4px', padding: '2px 8px', border: '1px solid #bae6fd', textTransform: 'none', letterSpacing: 'normal' }}>
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--ha-ink-3)', alignSelf: 'center' }}>（未提取到特定行为信号）</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Experiences Timeline Section */}
                {govExps && govExps.length > 0 && (
                  <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ha-ink-2)' }}>📅 融合合并后工作履历时间线 (去重去噪)</div>
                    <div className="resume-timeline" style={{ gap: '8px' }}>
                      {govExps.map((exp, idx) => (
                        <div key={`${exp.company}-${idx}`} className="timeline-item" style={{ padding: '8px 12px' }}>
                          <div className="timeline-dot" style={{ backgroundColor: idx === 0 ? 'var(--ha-good)' : 'var(--ha-line)' }} />
                          <div style={{ flex: 1 }}>
                            <strong style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <span>{exp.company}</span>
                              <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--ha-ink-3)' }}>{exp.period || "无时间"}</span>
                            </strong>
                            {exp.title && <div style={{ fontSize: '12px', color: 'var(--ha-ink-2)', marginTop: '2px' }}>{exp.title}</div>}
                            {exp.description && (
                              <details style={{ marginTop: '4px' }}>
                                <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--ha-accent)' }}>查看工作内容描述</summary>
                                <div style={{ fontSize: '11px', color: 'var(--ha-ink-2)', whiteSpace: 'pre-wrap', padding: '6px', borderLeft: '2px solid var(--ha-line)', marginTop: '4px', backgroundColor: 'var(--ha-bg-soft)' }}>
                                  {exp.description}
                                </div>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Structured Note Timeline */}
                {govNotes?.timeline && govNotes.timeline.length > 0 && (
                  <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ha-ink-2)' }}>💬 结构化分类互动备注 Timeline</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {govNotes.timeline.slice(0, 4).map((note, idx) => (
                        <div key={`${note.id}-${idx}`} style={{ padding: '8px 10px', border: '1px solid var(--ha-line-soft)', borderRadius: '4px', backgroundColor: 'var(--ha-bg-card)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--ha-ink-3)', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--ha-accent)' }}>{note.category}</span>
                            <span>{note.dateAdded}</span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ha-ink-2)', lineHeight: 1.4, wordBreak: 'break-all' }}>{note.content}</div>
                        </div>
                      ))}
                      {govNotes.timeline.length > 4 && (
                        <div style={{ fontSize: '11px', color: 'var(--ha-ink-3)', textAlign: 'center', fontStyle: 'italic' }}>
                          还有 {govNotes.timeline.length - 4} 条历史互动备注，可在下方“2. 顾问备注”中查阅全文。
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })()}

          <section className="profile-section profile-major-section">
            <div className="profile-section-head">
              <span>1. 基础履历信息</span>
              <b>{dataSections.reduce((total, section) => total + section.rows.length, 0)} 个字段</b>
            </div>
            <div className="profile-kv-grid">
              {profileRows(candidate, profile).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{compactValue(value)}</strong>
                </div>
              ))}
            </div>
            {dataSections.map((section, sectionIndex) => (
              <details className="raw-collapse" key={`${section.title}-${sectionIndex}`} open={sectionIndex < 2}>
                <summary>
                  {section.title}
                  <small>{section.source} · {section.rows.length} 字段</small>
                </summary>
                <ProfileFieldTable rows={section.rows} />
              </details>
            ))}
          </section>

          <section className="profile-section profile-major-section">
            <div className="profile-section-head">
              <span>2. 顾问备注</span>
              <b>{consultantNotes.length} 条</b>
            </div>
            {consultantNotes.length ? (
              <div className="profile-record-list">
                {consultantNotes.map((item, noteIndex) => (
                  <div key={`${item.source}-${noteIndex}`}>
                    <strong>{item.source}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="kv muted">暂无顾问备注。</p>
            )}
          </section>

          <section className="profile-section profile-major-section">
            <div className="profile-section-head">
              <span>3. 原始简历HTML</span>
              <b>{resumeArtifacts.length ? `最新 1 / 共 ${resumeArtifacts.length} 份` : "无 HTML"}</b>
            </div>
            {latestResume ? (
              <>
                <div className="profile-record-list">
                  <div>
                    <strong>{latestResume.title}</strong>
                    <p>{[latestResume.date, latestResume.source].filter(Boolean).join(" · ") || "未记录时间 / 来源"}</p>
                  </div>
                </div>
                {latestResume.html ? (
                  <ResumePreview title={latestResume.title} html={latestResume.html} />
                ) : (
                  <div className="profile-data-gap">
                    <b>本地导出里没有 HTML 正文</b>
                    <p>当前记录只包含原始简历附件元数据；如果后续导入字段里包含 html 正文，这里会自动显示最新一份。</p>
                  </div>
                )}
                <details className="raw-collapse" open>
                  <summary>最新简历附件原始字段</summary>
                  <ProfileFieldTable rows={tableRowsFromRecord(latestResume.metadata)} />
                </details>
              </>
            ) : (
              <p className="kv muted">未读取到原始简历 HTML 或原始简历附件。</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
