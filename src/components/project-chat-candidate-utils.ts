import type { JobAnalysis } from "@/lib/job-schema";

import type {
  CandidateBand,
  LonglistQualityReview,
  ProjectCandidate,
  ScreeningBand,
} from "@/components/project-chat-types";

export function candidateScore(candidate: ProjectCandidate) {
  return candidate.screening?.score ?? candidate.snapshot?.matchScore ?? 0;
}

export function candidateEvidenceCount(candidate: ProjectCandidate) {
  return (
    (candidate.snapshot?.scenarioEvidence?.length ?? 0) +
    (candidate.snapshot?.companySimilarityBreakdown?.length ?? 0) +
    (candidate.snapshot?.talentDbInsights?.length ?? 0) +
    (candidate.snapshot?.matchReasons?.length ?? 0)
  );
}

export function candidateAuditText(candidate: ProjectCandidate) {
  return [
    candidate.name,
    candidate.currentCompany,
    candidate.currentTitle,
    candidate.snapshot?.functionPath,
    candidate.snapshot?.matchReasons,
    candidate.snapshot?.matchConcerns,
    candidate.snapshot?.scenarioEvidence,
    candidate.snapshot?.companySimilarityBreakdown,
    candidate.snapshot?.talentDbInsights,
    candidate.snapshot?.policyTrace,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function buildLonglistQualityReview(candidates: ProjectCandidate[], analysis?: JobAnalysis): LonglistQualityReview {
  const activeCandidates = candidates.filter((candidate) => candidate.status !== "stale_scan");
  const top = activeCandidates.slice(0, 20);
  if (!activeCandidates.length) {
    return {
      status: "empty",
      summary: candidates.length ? "当前没有本轮入榜 longlist，旧候选人已保留为未入榜状态。" : "当前还没有 longlist，无法审计候选人质量。",
      clientReady: [],
      phoneValidate: [],
      noiseRisks: [],
      missingSignals: ["补充岗位职责、服务对象、目标 title、目标公司或客户业务场景后再扫描。"],
      judgeRequests: [],
    };
  }

  const clientReady = top.filter((candidate) => candidate.snapshot?.advisorTier === "client_ready" || candidate.snapshot?.matchGate === "strong_fit");
  const phoneValidate = top.filter((candidate) => candidate.snapshot?.advisorTier === "phone_validate" || candidate.snapshot?.matchGate === "fit");
  const noiseRisks = top
    .map((candidate) => {
      const text = candidateAuditText(candidate);
      const isClientReady = candidate.snapshot?.advisorTier === "client_ready" || candidate.snapshot?.matchGate === "strong_fit";
      const reasons = [
        candidateScore(candidate) >= 85 && candidateEvidenceCount(candidate) < 3 ? "高分但场景证据不足，疑似关键词召回" : "",
        /不应排高|噪音|准入未通过|不应直接推荐|完全不适合|移出|降级/.test(text) ||
        (!isClientReady && /偏离|更像/.test(text))
          ? "policy trace 或风险项已经提示需要降级/复核"
          : "",
        /行政|秘书|总助|纯招聘|talent acquisition|recruiting|内部沟通|雇主品牌|ssc|薪酬核算|培训\/组织咨询|培训咨询/.test(text) ? "命中常见噪音职能，需要确认是否真的符合岗位主轴" : "",
        candidate.snapshot?.advisorTier === "watchlist" ? "当前只是 watchlist，不应作为客户推荐优先项" : "",
      ].filter(Boolean);
      return { candidate, reasons };
    })
    .filter((item) => item.reasons.length);

  const topText = top.map(candidateAuditText).join(" ");
  const dimensions = analysis?.scoringModel.dimensions ?? [];
  const missingSignals = dimensions
    .filter((dimension) => {
      const signals = dimension.signals.filter((signal) => signal.trim().length >= 2);
      if (!signals.length) return false;
      return signals.every((signal) => !topText.includes(signal.toLowerCase()));
    })
    .slice(0, 4)
    .map((dimension) => `Top20 缺少「${dimension.label}」的明显证据`);

  const judgeRequests = [
    ...noiseRisks.slice(0, 3).map(({ candidate }) => `${candidate.name || "未命名候选人"}：是否应降级或移出 Top20？`),
    ...phoneValidate.slice(0, 2).map((candidate) => `${candidate.name || "未命名候选人"}：电话优先验证 ${candidate.snapshot?.phoneVerification?.[0] || "服务对象和真实项目深度"}`),
  ].slice(0, 5);

  const status: LonglistQualityReview["status"] =
    clientReady.length >= 10 && noiseRisks.length <= 2
      ? "strong"
      : clientReady.length >= 4 && noiseRisks.length <= 3
        ? "usable"
        : top.length >= 5
          ? "weak"
          : "needs_input";

  const summary =
    status === "strong"
      ? `Top20 中 ${clientReady.length} 人可直接进入客户前验证池，噪音风险 ${noiseRisks.length} 个。`
      : status === "usable"
        ? `已有可用 longlist：${clientReady.length} 人接近客户可看，${phoneValidate.length} 人需要首轮电话验证。`
        : status === "weak"
          ? `当前 longlist 能用来继续验证，但 Top20 噪音/缺口偏多，需要用户裁判和补充信号。`
          : "候选人数量不足，需要更多岗位画像或目标公司信号。";

  return { status, summary, clientReady, phoneValidate, noiseRisks, missingSignals, judgeRequests };
}

export function candidateBand(candidate: ProjectCandidate, review: LonglistQualityReview): CandidateBand {
  if (review.noiseRisks.some((item) => item.candidate.id === candidate.id) || candidate.snapshot?.advisorTier === "watchlist") {
    return "hold";
  }
  if (candidate.snapshot?.advisorTier === "client_ready" || candidate.snapshot?.matchGate === "strong_fit") {
    return "client_ready";
  }
  if (candidate.snapshot?.advisorTier === "phone_validate" || candidate.snapshot?.matchGate === "fit" || candidate.snapshot?.phoneVerification?.length) {
    return "phone_validate";
  }
  return "hold";
}

export function segmentCandidates(candidates: ProjectCandidate[], review: LonglistQualityReview) {
  const activeCandidates = candidates.filter((candidate) => candidate.status !== "stale_scan");
  return {
    clientReady: activeCandidates.filter((candidate) => candidateBand(candidate, review) === "client_ready"),
    phoneValidate: activeCandidates.filter((candidate) => candidateBand(candidate, review) === "phone_validate"),
    hold: activeCandidates.filter((candidate) => candidateBand(candidate, review) === "hold"),
  };
}

export function candidateOneLine(candidate: ProjectCandidate) {
  if (candidate.screening) return screeningOneLine(candidate);
  const verification = candidate.snapshot?.phoneVerification?.[0];
  const concern = candidate.snapshot?.matchConcerns?.[0];
  const evidence = candidate.snapshot?.scenarioEvidence?.[0] || candidate.snapshot?.matchReasons?.[0];
  if (candidate.snapshot?.advisorTier === "client_ready" || candidate.snapshot?.matchGate === "strong_fit") {
    return `可电话：${evidence || "主轴匹配成立"}${concern ? `；需确认 ${concern.replace(/^需确认/, "")}` : "。"}。`;
  }
  if (verification) return `先验证：${verification}`;
  if (concern) return `暂不直推：${concern}`;
  return `待判断：${evidence || "需要补充候选人履历和备注证据"}。`;
}

export function screeningBand(candidate: ProjectCandidate): ScreeningBand {
  const screening = candidate.screening;
  if (!screening) return "judge";
  if (screening.recommendation === "不推荐" || screening.score < 60) return "hold";
  if (screening.recommendation === "谨慎推荐" || screening.score < 78 || screening.risks.length || screening.missingInfo.length) {
    return "judge";
  }
  return "advance";
}

export function segmentScreenedCandidates(candidates: ProjectCandidate[]) {
  const screened = candidates.filter((candidate) => candidate.screening);
  return {
    advance: screened.filter((candidate) => screeningBand(candidate) === "advance"),
    judge: screened.filter((candidate) => screeningBand(candidate) === "judge"),
    hold: screened.filter((candidate) => screeningBand(candidate) === "hold"),
  };
}

export function screeningOneLine(candidate: ProjectCandidate) {
  const screening = candidate.screening;
  if (!screening) return "尚未评分，先看 Longlist 快照和电话验证问题。";
  const risk = screening.risks[0];
  const gap = screening.missingInfo[0];
  const evidence = screening.evidence[0];
  if (screeningBand(candidate) === "advance") {
    return `可推进：${evidence || "评分证据完整"}${risk ? `；电话确认 ${risk}` : "。"}。`;
  }
  if (screeningBand(candidate) === "hold") {
    return `暂不推进：${risk || gap || "评分结果不支持进入推荐位"}。`;
  }
  return `需裁判：${risk || gap || screening.questions[0] || "推荐等级或分数不足以直接给客户"}。`;
}

export function judgeQueueReason(candidate: ProjectCandidate, review: LonglistQualityReview) {
  if (candidate.screening) return screeningOneLine(candidate);
  const noise = review.noiseRisks.find((item) => item.candidate.id === candidate.id);
  if (noise?.reasons[0]) return `需裁判：${noise.reasons[0]}`;
  return candidateOneLine(candidate);
}

export function candidatePersolId(candidate: ProjectCandidate) {
  const snapshotId = candidate.snapshot?.id;
  if (typeof snapshotId === "number" && Number.isFinite(snapshotId)) return snapshotId;
  const externalId = Number(candidate.externalCandidateId);
  return Number.isFinite(externalId) ? externalId : null;
}

export function compactValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "未填";
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => (typeof item === "object" && item !== null ? JSON.stringify(item) : String(item))).join(" / ")
      : "未填";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function candidateDisplayName(candidate: ProjectCandidate) {
  return candidate.name || candidate.snapshot?.name || candidate.snapshot?.chineseName || candidate.snapshot?.englishName || "未命名候选人";
}

export function candidateCompany(candidate: ProjectCandidate) {
  return candidate.currentCompany || candidate.snapshot?.companyName || "未填公司";
}

export function candidateTitle(candidate: ProjectCandidate) {
  return candidate.currentTitle || candidate.snapshot?.title || candidate.snapshot?.firstExperienceTitle || "未填职位";
}
