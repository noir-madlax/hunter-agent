import type { ReactNode } from "react";
import { ChevronRight, Loader2, Search, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  LonglistQualityReview,
  ProjectCandidate,
  ProjectOption,
} from "@/components/project-chat-types";
import {
  candidateCompany,
  candidateDisplayName,
  candidateOneLine,
  candidateTitle,
  screeningOneLine,
} from "@/components/project-chat-candidate-utils";

export function ProjectBadge({ project }: { project: ProjectOption }) {
  if (project.riskCount >= 8) {
    return <span className="pill pill-bad">高风险</span>;
  }
  if (project.longlistCount === 0) {
    return <span className="pill pill-warn">待加人</span>;
  }
  if (project.shortlistCount === 0 && project.screenedCount > 0) {
    return <span className="pill pill-good">待确认</span>;
  }
  return <span className="pill pill-neutral">推进中</span>;
}

export function BoardCard({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="rail-block" open={defaultOpen}>
      <summary className="rail-h">
        <span>
          <Icon size={13} /> {title}
        </span>
        <ChevronRight size={12} className="rail-h-chevron" />
      </summary>
      <div className="rail-block-content">{children}</div>
    </details>
  );
}

export function SmallList({ items, limit = 4 }: { items: string[]; limit?: number }) {
  const shown = items.slice(0, limit);
  if (!shown.length) return <p className="kv muted">暂无内容</p>;

  return (
    <ul className="bullets">
      {shown.map((item, itemIndex) => (
        <li key={`${item}-${itemIndex}`}>{item}</li>
      ))}
    </ul>
  );
}

export function CandidateCompactCard({ candidate, onOpen }: { candidate: ProjectCandidate; onOpen?: (candidate: ProjectCandidate) => void }) {
  return (
    <li>
      <div>
        <div className="dr-label">{candidateDisplayName(candidate)}</div>
        <div className="dr-sub">
          {candidateCompany(candidate)} · {candidateTitle(candidate)}
        </div>
      </div>
      <span className="pill pill-neutral">{candidate.snapshot?.matchScore ?? candidate.screening?.score ?? "待评"}</span>
      <div className="candidate-rationale">
        <strong>{candidate.snapshot?.advisorTier || candidate.snapshot?.matchGate || candidate.funnelStatus}</strong>
        <p className="candidate-one-line">{candidateOneLine(candidate)}</p>
        {candidate.snapshot?.scenarioEvidence?.length ? <div className="note">场景证据：{candidate.snapshot.scenarioEvidence.slice(0, 2).join("；")}</div> : null}
        {candidate.snapshot?.talentDbInsights?.length ? <div className="note">人才库：{candidate.snapshot.talentDbInsights.slice(0, 2).join("；")}</div> : null}
        {candidate.snapshot?.matchConcerns?.length ? <div className="note">风险：{candidate.snapshot.matchConcerns.slice(0, 2).join("；")}</div> : null}
        {onOpen ? (
          <button type="button" className="btn btn-outline mini" onClick={() => onOpen(candidate)}>
            <UserRound size={13} />
            查看履历
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function LonglistSegment({
  title,
  subtitle,
  candidates,
  empty,
  onOpen,
}: {
  title: string;
  subtitle: string;
  candidates: ProjectCandidate[];
  empty: string;
  onOpen?: (candidate: ProjectCandidate) => void;
}) {
  return (
    <div className="longlist-segment">
      <div className="segment-head">
        <div>
          <div className="dr-label">{title}</div>
          <div className="dr-sub">{subtitle}</div>
        </div>
        <span className="pill pill-neutral">{candidates.length}</span>
      </div>
      {candidates.length ? (
        <ul className="dr-list card">
          {candidates.map((candidate) => (
            <CandidateCompactCard key={candidate.id} candidate={candidate} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="kv muted segment-empty">{empty}</p>
      )}
    </div>
  );
}

export function ScreeningSegment({
  title,
  subtitle,
  candidates,
  empty,
  onOpen,
}: {
  title: string;
  subtitle: string;
  candidates: ProjectCandidate[];
  empty: string;
  onOpen?: (candidate: ProjectCandidate) => void;
}) {
  return (
    <div className="longlist-segment">
      <div className="segment-head">
        <div>
          <div className="dr-label">{title}</div>
          <div className="dr-sub">{subtitle}</div>
        </div>
        <span className="pill pill-neutral">{candidates.length}</span>
      </div>
      {candidates.length ? (
        <ul className="dr-list card">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <div>
                <div className="dr-label">
                  {candidateDisplayName(candidate)} · {candidate.screening?.recommendation}
                </div>
                <div className="dr-sub">{candidateCompany(candidate)} · {candidateTitle(candidate)}</div>
                <p className="candidate-one-line">{screeningOneLine(candidate)}</p>
                {candidate.screening?.evidence.length ? <div className="note">证据：{candidate.screening.evidence.slice(0, 2).join("；")}</div> : null}
                {onOpen ? (
                  <button type="button" className="btn btn-outline mini" onClick={() => onOpen(candidate)}>
                    <UserRound size={13} />
                    查看履历
                  </button>
                ) : null}
              </div>
              <span className="pill pill-neutral">{candidate.screening?.score}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="kv muted segment-empty">{empty}</p>
      )}
    </div>
  );
}

export function QualityReviewBlock({
  review,
  compact = false,
  onRescan,
  loading = false,
}: {
  review: LonglistQualityReview;
  compact?: boolean;
  onRescan?: () => void;
  loading?: boolean;
}) {
  const statusLabel: Record<LonglistQualityReview["status"], string> = {
    empty: "待扫描",
    needs_input: "信号不足",
    weak: "需复盘",
    usable: "可用",
    strong: "较强",
  };
  const pillClass = review.status === "strong" || review.status === "usable" ? "pill-good" : review.status === "weak" ? "pill-warn" : "pill-neutral";

  return (
    <div className="quality-review">
      <div className="quality-head">
        <div>
          <div className="dr-label">Codex-style 审计</div>
          <p className="kv compact">{review.summary}</p>
        </div>
        <div className="quality-actions">
          <span className={`pill ${pillClass}`}>{statusLabel[review.status]}</span>
          {onRescan ? (
            <button type="button" className="btn btn-outline mini" onClick={onRescan} disabled={loading}>
              {loading ? <Loader2 className="spin" size={13} /> : <Search size={13} />}
              重扫
            </button>
          ) : null}
        </div>
      </div>
      <div className="quality-grid">
        <div>
          <div className="rail-subtitle">客户可看</div>
          <strong>{review.clientReady.length}</strong>
        </div>
        <div>
          <div className="rail-subtitle">电话验证</div>
          <strong>{review.phoneValidate.length}</strong>
        </div>
        <div>
          <div className="rail-subtitle">噪音风险</div>
          <strong>{review.noiseRisks.length}</strong>
        </div>
      </div>
      {!compact && review.noiseRisks.length ? (
        <div className="rail-subsection">
          <div className="rail-subtitle">需质疑样本</div>
          <SmallList
            items={review.noiseRisks.map(({ candidate, reasons }) => `${candidate.name || "未命名候选人"}：${reasons[0]}`)}
            limit={4}
          />
        </div>
      ) : null}
      {!compact && review.missingSignals.length ? (
        <div className="rail-subsection">
          <div className="rail-subtitle">可能缺口</div>
          <SmallList items={review.missingSignals} limit={4} />
        </div>
      ) : null}
      {!compact && review.judgeRequests.length ? (
        <div className="note">建议裁判：{review.judgeRequests.slice(0, 2).join("；")}</div>
      ) : null}
    </div>
  );
}
