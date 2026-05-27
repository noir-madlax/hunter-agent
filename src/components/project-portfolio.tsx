"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  FileText,
  Loader2,
  Search,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

type ProjectOption = {
  id: string;
  name: string;
  clientCompany: string | null;
  roleTitle: string | null;
  funnelStatus: string;
  longlistCount: number;
  screenedCount: number;
  shortlistCount: number;
  riskCount: number;
  updatedAt: string;
};

const stageLabels: Record<string, string> = {
  job_brief: "岗位画像",
  search: "搜索策略",
  longlist: "Longlist",
  screening: "AI 初筛",
  shortlist: "Shortlist",
  reports: "推荐报告",
};

const stageOrder = ["job_brief", "search", "longlist", "screening", "shortlist", "reports"];

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function urgency(project: ProjectOption) {
  if (project.riskCount >= 8) return { label: "高风险", className: "border-rose-200 bg-rose-50 text-rose-800" };
  if (project.longlistCount === 0) return { label: "待加人", className: "border-amber-200 bg-amber-50 text-amber-800" };
  if (project.shortlistCount === 0 && project.screenedCount > 0) {
    return { label: "待确认", className: "border-sky-200 bg-sky-50 text-sky-800" };
  }
  return { label: "推进中", className: "border-stone-200 bg-stone-50 text-stone-700" };
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return (
    <div className="rounded-md border border-white/15 bg-white/10 p-4 text-white">
      <div className="agent-ui flex items-center gap-2 text-xs font-semibold text-stone-300">
        <Icon size={14} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString("zh-CN")}</p>
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectOption }) {
  const risk = urgency(project);
  const stage = stageLabels[project.funnelStatus] || project.funnelStatus || "未定义";

  return (
    <Link
      href={`/projects/${project.id}`}
      className="grid gap-3 border-b border-stone-100 px-4 py-4 transition hover:bg-stone-50 lg:grid-cols-[minmax(0,1.4fr)_160px_120px_120px_120px_110px]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold text-stone-950">{project.name}</h3>
          <span className={`agent-ui rounded-md border px-2 py-1 text-[11px] font-semibold ${risk.className}`}>
            {risk.label}
          </span>
        </div>
        <p className="agent-ui mt-1 truncate text-sm text-stone-500">
          {project.clientCompany || "未填客户"} · {project.roleTitle || "未填岗位"}
        </p>
      </div>
      <div className="agent-ui text-sm text-stone-700">
        <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-semibold">{stage}</span>
      </div>
      <div className="agent-ui text-sm text-stone-600">Longlist {project.longlistCount}</div>
      <div className="agent-ui text-sm text-stone-600">已评分 {project.screenedCount}</div>
      <div className="agent-ui text-sm text-stone-600">Shortlist {project.shortlistCount}</div>
      <div className="agent-ui flex items-center justify-between gap-2 text-sm text-stone-500">
        <span>{formatDate(project.updatedAt)}</span>
        <ArrowRight size={15} />
      </div>
    </Link>
  );
}

export function ProjectPortfolio() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "项目读取失败");
        return payload.projects as ProjectOption[];
      })
      .then(setProjects)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err instanceof Error ? err.message : "项目读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return projects.filter((project) => {
      const haystack = [project.name, project.clientCompany, project.roleTitle].join(" ").toLowerCase();
      return (!text || haystack.includes(text)) && (!stage || project.funnelStatus === stage);
    });
  }, [projects, query, stage]);

  const stats = useMemo(
    () => ({
      projects: projects.length,
      longlist: projects.reduce((sum, project) => sum + project.longlistCount, 0),
      shortlist: projects.reduce((sum, project) => sum + project.shortlistCount, 0),
      risks: projects.reduce((sum, project) => sum + project.riskCount, 0),
    }),
    [projects],
  );

  const grouped = useMemo(() => {
    return stageOrder.map((key) => ({
      key,
      label: stageLabels[key],
      count: projects.filter((project) => project.funnelStatus === key).length,
    }));
  }, [projects]);

  return (
    <main className="agent-shell min-h-screen text-stone-950">
      <header className="border-b border-stone-800 bg-stone-950 px-6 py-6 text-white">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="agent-kicker text-xs font-semibold uppercase text-stone-400">Project Portfolio</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">并行招聘项目总控台</h1>
            <p className="agent-ui mt-2 max-w-3xl text-sm leading-6 text-stone-300">
              按项目阶段、风险和交付动作管理多个客户项目；从这里进入单个项目漏斗。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="项目数" value={stats.projects} icon={BriefcaseBusiness} />
            <Metric label="Longlist" value={stats.longlist} icon={UsersRound} />
            <Metric label="Shortlist" value={stats.shortlist} icon={FileText} />
            <Metric label="风险项" value={stats.risks} icon={ShieldAlert} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 p-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="agent-panel rounded-lg p-4">
            <h2 className="agent-ui text-sm font-semibold text-stone-950">组合筛选</h2>
            <label className="mt-4 block">
              <span className="agent-ui text-xs font-semibold text-stone-500">关键词</span>
              <div className="mt-1.5 flex h-10 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 focus-within:border-teal-700 focus-within:ring-4 focus-within:ring-teal-100">
                <Search size={15} className="text-stone-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="客户 / 岗位 / 项目"
                  className="agent-ui min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </label>
            <label className="mt-4 block">
              <span className="agent-ui text-xs font-semibold text-stone-500">阶段</span>
              <select
                value={stage}
                onChange={(event) => setStage(event.target.value)}
                className="agent-ui mt-1.5 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
              >
                <option value="">全部阶段</option>
                {grouped.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} ({item.count})
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="agent-panel rounded-lg p-4">
            <h2 className="agent-ui text-sm font-semibold text-stone-950">阶段分布</h2>
            <div className="mt-3 space-y-2">
              {grouped.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStage((current) => (current === item.key ? "" : item.key))}
                  className={`agent-ui flex h-9 w-full items-center justify-between rounded-md px-3 text-sm transition ${
                    stage === item.key ? "bg-stone-950 text-white" : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="font-semibold">{item.count}</span>
                </button>
              ))}
            </div>
          </section>

          <Link
            href="/"
            className="agent-ui inline-flex h-10 w-full items-center justify-center rounded-md bg-teal-800 px-3 text-sm font-semibold text-white transition hover:bg-teal-900"
          >
            创建 / 解析新项目
          </Link>
        </aside>

        <section className="agent-panel overflow-hidden rounded-lg">
          <div className="flex flex-col gap-2 border-b border-stone-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-950">项目队列</h2>
              <p className="agent-ui mt-1 text-sm text-stone-500">当前显示 {filtered.length} / {projects.length} 个项目。</p>
            </div>
            <div className="agent-ui flex items-center gap-2 text-xs text-stone-500">
              <Clock3 size={14} />
              按最近更新时间排序
            </div>
          </div>

          {error ? (
            <div className="m-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center text-stone-500">
              <Loader2 className="mr-2 size-5 animate-spin" />
              正在读取项目组合
            </div>
          ) : filtered.length ? (
            <div>
              {filtered.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="agent-ui flex min-h-[360px] items-center justify-center text-center text-sm text-stone-500">
              没有匹配项目。调整筛选或创建新项目。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
