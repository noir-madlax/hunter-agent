"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  BadgeCheck,
  BookOpenCheck,
  ClipboardList,
  FileText,
  Loader2,
  Network,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Star,
  UsersRound,
  Workflow,
} from "lucide-react";

import type { JobAnalysis } from "@/lib/job-schema";

type FunnelTab = "brief" | "research" | "search" | "workflow" | "longlist" | "screening" | "shortlist" | "reports";

type ProjectCandidate = {
  id: string;
  name: string | null;
  currentCompany: string | null;
  currentTitle: string | null;
  status: string;
  funnelStatus: string;
  externalCandidateId: string | null;
  snapshot: {
    id: number;
    mobile?: string;
    email?: string;
    age?: number | null;
    gender?: string;
    expectedSalary?: string;
    annualSalary?: number | null;
    notes?: string[];
    functionPath?: string;
  } | null;
  screening: null | {
    id: string;
    recommendation: string;
    score: number;
    modelMode: string;
    dimensionScores: Record<string, number>;
    evidence: string[];
    risks: string[];
    missingInfo: string[];
    questions: string[];
  };
};

type ProjectReport = {
  id: string;
  candidateId: string | null;
  title: string;
  markdown: string;
  updatedAt: string;
};

type ProjectPayload = {
  id: string;
  name: string;
  clientCompany: string | null;
  roleTitle: string | null;
  funnelStatus: string;
  stats: {
    longlistCount: number;
    screenedCount: number;
    shortlistCount: number;
    riskCount: number;
  };
  analysis: JobAnalysis;
  candidates: ProjectCandidate[];
  reports: ProjectReport[];
};

type ProjectOption = {
  id: string;
  name: string;
  clientCompany: string | null;
  roleTitle: string | null;
  funnelStatus: string;
  longlistCount: number;
  riskCount: number;
  updatedAt: string;
};

const tabs: { id: FunnelTab; label: string; icon: typeof ClipboardList }[] = [
  { id: "brief", label: "岗位画像", icon: ClipboardList },
  { id: "research", label: "Deep Research", icon: Network },
  { id: "search", label: "搜索策略", icon: Search },
  { id: "workflow", label: "流程 / Skills", icon: Workflow },
  { id: "longlist", label: "Longlist", icon: UsersRound },
  { id: "screening", label: "AI 初筛", icon: ShieldCheck },
  { id: "shortlist", label: "Shortlist", icon: Star },
  { id: "reports", label: "推荐报告", icon: FileText },
];

const recommendationWeight: Record<string, number> = {
  强烈推荐: 4,
  推荐: 3,
  谨慎推荐: 2,
  不推荐: 1,
};

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/15 bg-white/10 p-4 text-white shadow-sm">
      <p className="agent-ui text-xs font-semibold text-stone-300">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString("zh-CN")}</p>
    </div>
  );
}

function SourceBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="agent-ui inline-flex w-fit rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
      {children}
    </span>
  );
}

function CompactList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-700">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="agent-ui inline-flex w-fit rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-600">
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="agent-ui flex items-center gap-2 text-xs font-semibold text-stone-500">
        {label}
        <SourceBadge>可编辑</SourceBadge>
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 min-h-28 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-6 text-stone-900 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
        />
      )}
    </label>
  );
}

function CandidateRow({
  candidate,
  onShortlist,
  shortlistAction,
}: {
  candidate: ProjectCandidate;
  onShortlist: (candidateId: string, action: "add" | "remove") => void;
  shortlistAction: "add" | "remove";
}) {
  return (
    <tr className={candidate.funnelStatus === "shortlist" ? "bg-emerald-50" : "bg-white"}>
      <td className="border-b border-slate-100 px-4 py-3 align-top">
        <div className="font-semibold text-slate-950">{candidate.name || "未命名候选人"}</div>
        <div className="mt-1 font-mono text-xs text-slate-500">人才库 {candidate.externalCandidateId || "-"}</div>
      </td>
      <td className="border-b border-slate-100 px-4 py-3 align-top">
        <div className="font-medium text-slate-800">{candidate.currentCompany || "未填公司"}</div>
        <div className="mt-1 text-sm text-slate-500">{candidate.currentTitle || "未填职位"}</div>
        <div className="mt-1 line-clamp-1 text-xs text-slate-400">{candidate.snapshot?.functionPath || "未填职能路径"}</div>
      </td>
      <td className="border-b border-slate-100 px-4 py-3 align-top text-sm text-slate-600">
        <div>{candidate.snapshot?.mobile || "未填手机"}</div>
        <div className="mt-1 text-xs text-slate-500">{candidate.snapshot?.email || "未填邮箱"}</div>
      </td>
      <td className="border-b border-slate-100 px-4 py-3 align-top">
        {candidate.status === "stale_scan" ? (
          <span className="text-xs font-semibold text-amber-700">本轮未进 Top50</span>
        ) : candidate.screening ? (
          <>
            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
              {candidate.screening.recommendation} · {candidate.screening.score}
            </span>
            <p className="mt-1 text-xs text-slate-500">{candidate.screening.modelMode}</p>
          </>
        ) : candidate.status === "unscored_limit" ? (
          <span className="text-xs font-semibold text-amber-700">未评分：超过项目上限</span>
        ) : (
          <span className="text-xs text-slate-500">待评分</span>
        )}
      </td>
      <td className="border-b border-slate-100 px-4 py-3 align-top">
        <button
          type="button"
          onClick={() => onShortlist(candidate.id, shortlistAction)}
          disabled={!candidate.screening}
          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {shortlistAction === "add" ? "确认 shortlist" : "移出 shortlist"}
        </button>
      </td>
    </tr>
  );
}

export function ProjectFunnelWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [draft, setDraft] = useState<JobAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<FunnelTab>("brief");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "项目读取失败");
      setProject(payload.project);
      setDraft(payload.project.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目读取失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProject();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProject]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "项目列表读取失败");
        return payload.projects as ProjectOption[];
      })
      .then(setProjects)
      .catch(() => {
        setProjects([]);
      });

    return () => controller.abort();
  }, []);

  const sortedCandidates = useMemo(() => {
    return [...(project?.candidates ?? [])].sort((a, b) => {
      const staleDelta = Number(a.status === "stale_scan") - Number(b.status === "stale_scan");
      if (staleDelta) return staleDelta;
      const recDelta = (recommendationWeight[b.screening?.recommendation || ""] ?? 0) - (recommendationWeight[a.screening?.recommendation || ""] ?? 0);
      if (recDelta) return recDelta;
      return (b.screening?.score ?? -1) - (a.screening?.score ?? -1);
    });
  }, [project]);

  const shortlist = sortedCandidates.filter((candidate) => candidate.funnelStatus === "shortlist");
  function updateDraft(mutator: (analysis: JobAnalysis) => JobAnalysis) {
    setDraft((current) => (current ? mutator(structuredClone(current)) : current));
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: draft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "项目保存失败");
      setProject(payload.project);
      setDraft(payload.project.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function runScreening() {
    setActionLoading("screening");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/screening/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rerun: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "初筛失败");
      await loadProject();
      setActiveTab("screening");
      if (payload.failed) {
        setError(`初筛部分完成：成功 ${payload.screened} 人，失败 ${payload.failed} 人。可重跑或查看服务端日志定位失败候选人。`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "初筛失败");
    } finally {
      setActionLoading(null);
    }
  }

  async function updateShortlist(candidateId: string, action: "add" | "remove") {
    setActionLoading(candidateId);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/shortlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: [candidateId], action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "shortlist 更新失败");
      await loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "shortlist 更新失败");
    } finally {
      setActionLoading(null);
    }
  }

  async function generateReports() {
    setActionLoading("reports");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: shortlist.map((candidate) => candidate.id) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "报告生成失败");
      setProject(payload.project);
      setActiveTab("reports");
    } catch (err) {
      setError(err instanceof Error ? err.message : "报告生成失败");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading || !project || !draft) {
    return (
      <main className="agent-shell flex min-h-screen items-center justify-center text-stone-600">
        <Loader2 className="mr-2 size-5 animate-spin" />
        正在加载项目漏斗
      </main>
    );
  }

  return (
    <main className="agent-shell min-h-screen text-stone-950">
      <header className="border-b border-stone-800 bg-stone-950 px-6 py-5 text-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="agent-kicker text-xs font-semibold uppercase text-stone-400">Recruiting Agent Cockpit</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">{project.name}</h1>
            <p className="agent-ui mt-2 text-sm text-stone-300">
              {project.clientCompany || "未填客户"} · {project.roleTitle || "未填岗位"} · Project ID {project.id}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Longlist" value={project.stats.longlistCount} />
            <Stat label="已评分" value={project.stats.screenedCount} />
            <Stat label="Shortlist" value={project.stats.shortlistCount} />
            <Stat label="待确认风险" value={project.stats.riskCount} />
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-128px)] xl:grid-cols-[270px_minmax(0,1fr)_330px]">
        <aside className="border-b border-stone-200 bg-white p-5 xl:border-b-0 xl:border-r">
          <div className="agent-ui mb-4 rounded-md border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-semibold uppercase text-stone-500">Agent flow</p>
            <p className="mt-1 text-sm leading-5 text-stone-700">围绕研究、判断、交付推进，不做自动触达。</p>
          </div>
          <div className="agent-ui mb-4 rounded-md border border-stone-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase text-stone-500">Project queue</p>
              <Link href="/projects" className="text-xs font-semibold text-teal-800 hover:text-teal-950">
                全部
              </Link>
            </div>
            <select
              value={project.id}
              onChange={(event) => {
                if (event.target.value && event.target.value !== project.id) {
                  window.location.href = `/projects/${event.target.value}`;
                }
              }}
              className="mt-2 h-10 w-full rounded-md border border-stone-300 bg-stone-50 px-3 text-sm outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
            >
              {projects.length ? (
                projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · L{item.longlistCount} R{item.riskCount}
                  </option>
                ))
              ) : (
                <option value={project.id}>{project.name}</option>
              )}
            </select>
          </div>
          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`agent-ui flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                    active ? "bg-stone-950 text-white shadow-sm" : "text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="agent-ui inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal-800 px-3 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={16} />}
              保存画像编辑
            </button>
            <button
              type="button"
              onClick={runScreening}
              disabled={actionLoading === "screening" || project.stats.longlistCount === 0}
              className="agent-ui inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionLoading === "screening" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={16} />}
              自动评分 longlist
            </button>
            <button
              type="button"
              onClick={generateReports}
              disabled={actionLoading === "reports" || shortlist.length === 0}
              className="agent-ui inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionLoading === "reports" ? <Loader2 className="size-4 animate-spin" /> : <FileText size={16} />}
              生成推荐报告
            </button>
          </div>
        </aside>

        <section className="min-w-0 p-5">
          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {activeTab === "brief" ? (
            <div className="agent-panel space-y-5 rounded-lg p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field
                  label="项目名称"
                  value={draft.projectName}
                  onChange={(value) => updateDraft((analysis) => ({ ...analysis, projectName: value }))}
                />
                <Field
                  label="岗位名称"
                  value={draft.jobBrief.roleTitle}
                  onChange={(value) =>
                    updateDraft((analysis) => ({
                      ...analysis,
                      jobBrief: { ...analysis.jobBrief, roleTitle: value },
                      intakeBuilder: {
                        ...analysis.intakeBuilder,
                        structuredBrief: { ...analysis.intakeBuilder.structuredBrief, role: value },
                      },
                    }))
                  }
                />
                <Field
                  label="客户公司"
                  value={draft.jobBrief.clientCompany}
                  onChange={(value) =>
                    updateDraft((analysis) => ({ ...analysis, jobBrief: { ...analysis.jobBrief, clientCompany: value } }))
                  }
                />
                <Field
                  label="薪资预算"
                  value={draft.jobBrief.salaryBudget}
                  onChange={(value) =>
                    updateDraft((analysis) => ({ ...analysis, jobBrief: { ...analysis.jobBrief, salaryBudget: value } }))
                  }
                />
              </div>
              <Field
                label="业务场景"
                value={draft.jobBrief.businessContext}
                textarea
                onChange={(value) =>
                  updateDraft((analysis) => ({ ...analysis, jobBrief: { ...analysis.jobBrief, businessContext: value } }))
                }
              />
              <div className="grid gap-4 lg:grid-cols-3">
                <Field
                  label="Must-have"
                  value={listToText(draft.talentPersona.mustHave)}
                  textarea
                  onChange={(value) =>
                    updateDraft((analysis) => ({
                      ...analysis,
                      talentPersona: { ...analysis.talentPersona, mustHave: textToList(value) },
                    }))
                  }
                />
                <Field
                  label="Nice-to-have / Strong match"
                  value={listToText(draft.talentPersona.strongMatch)}
                  textarea
                  onChange={(value) =>
                    updateDraft((analysis) => ({
                      ...analysis,
                      talentPersona: { ...analysis.talentPersona, strongMatch: textToList(value) },
                    }))
                  }
                />
                <Field
                  label="Deal-breaker / 风险"
                  value={listToText(draft.talentPersona.riskSignals)}
                  textarea
                  onChange={(value) =>
                    updateDraft((analysis) => ({
                      ...analysis,
                      talentPersona: { ...analysis.talentPersona, riskSignals: textToList(value) },
                    }))
                  }
                />
              </div>
            </div>
          ) : null}

          {activeTab === "research" ? (
            <div className="space-y-5">
              <section className="agent-panel rounded-lg p-5">
                <div className="flex items-center gap-2">
                  <Network size={18} className="text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-950">Deep Research 操作规则</h2>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {draft.deepResearch.operatingRules.map((rule) => (
                    <div key={rule} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      {rule}
                    </div>
                  ))}
                </div>
              </section>

              <section className="agent-panel rounded-lg p-5">
                <h2 className="text-sm font-semibold text-slate-950">公司 / 团队 / 市场信号</h2>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {draft.deepResearch.companySignals.map((node) => (
                    <article key={`${node.name}-${node.sourceStatus}`} className="rounded-md border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-950">{node.name}</h3>
                        <StatusPill>{node.type}</StatusPill>
                        <StatusPill>{node.sourceStatus}</StatusPill>
                      </div>
                      <dl className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">公开信息</dt>
                          <dd>{node.publicEvidence}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">人才库扫描</dt>
                          <dd>{node.talentDbEvidence}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">岗位影响</dt>
                          <dd>{node.impact}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">下一步验证</dt>
                          <dd>{node.nextVerification}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>

              <section className="agent-panel rounded-lg p-5">
                <h2 className="text-sm font-semibold text-slate-950">人物节点扫描</h2>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {draft.deepResearch.peopleNodes.map((node) => (
                    <article key={`${node.name}-${node.sourceStatus}`} className="rounded-md border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-950">{node.name}</h3>
                        <StatusPill>{node.sourceStatus}</StatusPill>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{node.impact}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{node.nextVerification}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-3">
                <div className="agent-panel rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-slate-950">人才库扫描协议</h2>
                  <div className="mt-4">
                    <CompactList items={draft.deepResearch.talentDbScanProtocol} />
                  </div>
                </div>
                <div className="agent-panel rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-slate-950">公司相似度</h2>
                  <div className="mt-4">
                    <CompactList items={draft.deepResearch.companySimilarityMap} />
                  </div>
                </div>
                <div className="agent-panel rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-slate-950">客户追问</h2>
                  <div className="mt-4">
                    <CompactList items={draft.deepResearch.clientQuestions} />
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "search" ? (
            <div className="agent-panel space-y-5 rounded-lg p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field
                  label="目标行业"
                  value={listToText(draft.searchMap.targetIndustries)}
                  textarea
                  onChange={(value) =>
                    updateDraft((analysis) => ({ ...analysis, searchMap: { ...analysis.searchMap, targetIndustries: textToList(value) } }))
                  }
                />
                <Field
                  label="目标公司"
                  value={listToText(draft.searchMap.targetCompanies)}
                  textarea
                  onChange={(value) =>
                    updateDraft((analysis) => ({ ...analysis, searchMap: { ...analysis.searchMap, targetCompanies: textToList(value) } }))
                  }
                />
                <Field
                  label="目标 Title"
                  value={listToText(draft.searchMap.targetTitles)}
                  textarea
                  onChange={(value) =>
                    updateDraft((analysis) => ({ ...analysis, searchMap: { ...analysis.searchMap, targetTitles: textToList(value) } }))
                  }
                />
                <Field
                  label="搜索关键词"
                  value={listToText(draft.searchMap.keywords)}
                  textarea
                  onChange={(value) =>
                    updateDraft((analysis) => ({ ...analysis, searchMap: { ...analysis.searchMap, keywords: textToList(value) } }))
                  }
                />
              </div>
              <Field
                label="排除项"
                value={listToText(draft.searchMap.excludedIndustries)}
                textarea
                onChange={(value) =>
                  updateDraft((analysis) => ({ ...analysis, searchMap: { ...analysis.searchMap, excludedIndustries: textToList(value) } }))
                }
              />
            </div>
          ) : null}

          {activeTab === "workflow" ? (
            <div className="space-y-5">
              <section className="agent-panel rounded-lg p-5">
                <div className="flex items-center gap-2">
                  <Workflow size={18} className="text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-950">项目漏斗工作流</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  {draft.workflowBlueprint.map((step, index) => (
                    <div key={`${step.label}-${index}`} className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-[48px_180px_120px_minmax(0,1fr)] md:items-center">
                      <div className="flex size-9 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">{index + 1}</div>
                      <div className="font-semibold text-slate-950">{step.label}</div>
                      <StatusPill>
                        {step.status === "done"
                          ? "已完成"
                          : step.status === "in_progress" || step.status === "active"
                            ? "自动执行中"
                            : step.status === "waiting_user"
                              ? "等待补充"
                              : "需人工确认"}
                      </StatusPill>
                      <div className="text-sm leading-6 text-slate-600">{step.output}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="agent-panel rounded-lg p-5">
                <div className="flex items-center gap-2">
                  <BookOpenCheck size={18} className="text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-950">Agent 能力清单</h2>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {draft.skillLibrary.map((skill) => (
                    <article key={skill.name} className="rounded-md border border-slate-200 p-4">
                      <h3 className="font-semibold text-slate-950">{skill.name}</h3>
                      <dl className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">触发条件</dt>
                          <dd>{skill.trigger}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">产出</dt>
                          <dd>{skill.output}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">Guardrail</dt>
                          <dd>{skill.guardrail}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>

              <section className="agent-panel rounded-lg p-5">
                <h2 className="text-sm font-semibold text-slate-950">评分模型</h2>
                <p className="mt-1 text-xs text-slate-500">
                  每项目评分上限 {draft.scoringModel.capPerProject} 人，推荐等级：{draft.scoringModel.recommendationLevels.join(" / ")}
                </p>
                <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="px-4 py-3">维度</th>
                        <th className="px-4 py-3">权重</th>
                        <th className="px-4 py-3">信号</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.scoringModel.dimensions.map((dimension) => (
                        <tr key={dimension.label}>
                          <td className="border-t border-slate-100 px-4 py-3 font-medium text-slate-800">{dimension.label}</td>
                          <td className="border-t border-slate-100 px-4 py-3 text-slate-600">{dimension.weight}%</td>
                          <td className="border-t border-slate-100 px-4 py-3 text-slate-600">{dimension.signals.join(" / ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {["longlist", "screening", "shortlist"].includes(activeTab) ? (
            <div className="agent-panel overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                <div>
                  <h2 className="agent-ui text-sm font-semibold">
                    {activeTab === "shortlist" ? "已确认 Shortlist" : activeTab === "screening" ? "AI 初筛排序" : "Longlist 候选池"}
                  </h2>
                  <p className="agent-ui mt-1 text-xs text-stone-500">每项目自动评分上限 50 人，超过上限仍保留在 longlist。</p>
                </div>
                <ArrowUpDown size={16} className="text-stone-400" />
              </div>
              <div className="max-h-[calc(100vh-260px)] overflow-auto">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="agent-ui sticky top-0 bg-stone-50 text-xs font-semibold text-stone-500">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3">候选人</th>
                      <th className="border-b border-slate-200 px-4 py-3">公司 / 职位</th>
                      <th className="border-b border-slate-200 px-4 py-3">联系方式</th>
                      <th className="border-b border-slate-200 px-4 py-3">评分</th>
                      <th className="border-b border-slate-200 px-4 py-3">动作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeTab === "shortlist" ? shortlist : sortedCandidates).map((candidate) => (
                      <CandidateRow
                        key={candidate.id}
                        candidate={candidate}
                        shortlistAction={candidate.funnelStatus === "shortlist" ? "remove" : "add"}
                        onShortlist={updateShortlist}
                      />
                    ))}
                  </tbody>
                </table>
                {sortedCandidates.length === 0 ? (
                  <div className="agent-ui p-10 text-center text-sm text-stone-500">还没有候选人。系统会在项目信息足够后自动扫描人才库并更新 Longlist。</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "reports" ? (
            <div className="space-y-4">
              {project.reports.length ? (
                project.reports.map((report) => (
                  <article key={report.id} className="agent-panel rounded-lg p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-base font-semibold text-stone-950">{report.title}</h2>
                      <span className="agent-ui text-xs text-stone-500">{new Date(report.updatedAt).toLocaleString("zh-CN")}</span>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-md border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-800">
                      {report.markdown}
                    </pre>
                  </article>
                ))
              ) : (
                <div className="agent-ui rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
                  暂无推荐报告。确认 shortlist 后点击“生成推荐报告”。
                </div>
              )}
            </div>
          ) : null}
        </section>

        <aside className="border-t border-stone-200 bg-white p-5 xl:border-l xl:border-t-0">
          <div className="flex items-center gap-2">
            <BadgeCheck size={17} className="text-stone-500" />
            <h2 className="agent-ui text-sm font-semibold">Agent 判断</h2>
          </div>
          <div className="mt-4 space-y-4">
            <div className="agent-panel-muted rounded-md p-3">
              <p className="agent-ui text-xs font-semibold text-stone-500">推荐等级分布</p>
              {["强烈推荐", "推荐", "谨慎推荐", "不推荐"].map((level) => (
                <div key={level} className="mt-2 flex items-center justify-between text-sm">
                  <span>{level}</span>
                  <span className="font-semibold">
                    {project.candidates.filter((candidate) => candidate.screening?.recommendation === level).length}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              AI 初筛基于项目画像和人才库快照生成，属于“原文+AI归纳 / AI推断”。正式推荐前需要顾问复核证据、动机、薪酬和风险。
            </div>
            <div className="agent-panel-muted rounded-md p-3">
              <p className="agent-ui text-xs font-semibold text-stone-500">Deep Research 状态</p>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>公司/团队信号</span>
                  <span className="font-semibold">{draft.deepResearch.companySignals.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>人物节点</span>
                  <span className="font-semibold">{draft.deepResearch.peopleNodes.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Agent 能力</span>
                  <span className="font-semibold">{draft.skillLibrary.length}</span>
                </div>
              </div>
            </div>
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3">
              <p className="agent-ui text-xs font-semibold text-teal-900">下一步动作</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-teal-950">
                {draft.nextActions.slice(0, 4).map((action) => (
                  <li key={action} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-700" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
            <a
              href="/reports/persol"
              className="agent-ui inline-flex h-10 w-full items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
            >
              查看人才库报表
            </a>
          </div>
        </aside>
      </div>
    </main>
  );
}
