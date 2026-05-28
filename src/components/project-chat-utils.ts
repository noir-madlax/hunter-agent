import { APP_TIME_ZONE, MESSAGE_PREVIEW_MAX_LENGTH } from "@/components/project-chat-types";
import type { FunnelStage } from "@/components/project-chat-types";

export function funnelStatusPillClass(status: string): string {
  if (status === "shortlist" || status === "reports") return "pill-good";
  if (status === "removed" || status === "rejected") return "pill-bad";
  return "pill-neutral";
}

export function scoreBandPillClass(score: number | null | undefined): string {
  if (score == null) return "pill-neutral";
  if (score >= 75) return "pill-good";
  if (score >= 60) return "pill-neutral";
  return "pill-warn";
}

export function toFunnelStage(value: string): FunnelStage {
  if (value === "longlist" || value === "screening" || value === "shortlist" || value === "reports") {
    return value;
  }
  return "job_brief";
}

export function readStageFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("stage") || "";
}

export function cleanFetchInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof window === "undefined") return input;

  if (typeof input === "string") {
    if (input.startsWith("/")) return `${window.location.protocol}//${window.location.host}${input}`;

    try {
      const url = new URL(input, window.location.href);
      url.username = "";
      url.password = "";
      return url.toString();
    } catch {
      return input;
    }
  }

  if (input instanceof URL) {
    const url = new URL(input.toString());
    url.username = "";
    url.password = "";
    return url;
  }

  return input;
}

export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort(new DOMException(`请求超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待。`, "TimeoutError"));
  }, timeoutMs);
  try {
    return await fetch(cleanFetchInput(input), { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export function truncateMessagePreview(content: string, maxLength = MESSAGE_PREVIEW_MAX_LENGTH) {
  const normalized = content.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}\n\n...`;
}

type CandidateJudgementPayload = {
  type?: string;
  decision?: unknown;
  candidateId?: unknown;
  externalCandidateId?: unknown;
  name?: unknown;
  company?: unknown;
  title?: unknown;
  reason?: unknown;
};

function displayValue(value: unknown, fallback = "未填") {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return text || fallback;
}

export function formatCandidateJudgementInsight(content: string) {
  const marker = "候选人裁判JSON：";
  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) return content;

  const jsonText = content.slice(markerIndex + marker.length).trim();
  if (!jsonText) return content;

  try {
    const parsed = JSON.parse(jsonText) as CandidateJudgementPayload;
    if (parsed.type !== "candidate_judgement") return content;

    const decision = displayValue(parsed.decision, "未填判断");
    const name = displayValue(parsed.name, "未命名候选人");
    const company = displayValue(parsed.company);
    const title = displayValue(parsed.title);
    const externalCandidateId = displayValue(parsed.externalCandidateId, "-");
    const candidateId = displayValue(parsed.candidateId, "-");
    const reason = displayValue(parsed.reason, "未填写原因");

    return [
      `候选人裁判：${decision}`,
      "",
      `- 候选人：${name}`,
      `- 公司：${company}`,
      `- 职位：${title}`,
      `- 人才库 ID：${externalCandidateId}`,
      `- 系统 ID：${candidateId}`,
      `- 原因：${reason}`,
    ].join("\n");
  } catch {
    return content;
  }
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: APP_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function formatDateTime(value: string | Date = new Date()) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function timeValue(value: string | Date) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
