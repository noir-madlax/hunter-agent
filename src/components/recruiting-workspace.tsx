"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Map,
  MessagesSquare,
  Route,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";

import type { JobAnalysis } from "@/lib/job-schema";

type ParseResponse = {
  projectId: string;
  mode: "openai" | "deepseek";
  analysis: JobAnalysis;
};

type SourceType = "source" | "mixed" | "inferred" | "confirm";
type ResultTab = "intake" | "diagnosis" | "search" | "screening";

const sampleBrief = `客户只给了几个关键信息：
Commercial HRBP，上海 onsite，40-50w，外企英文环境。
汇报 Commercial HRBP Assistant Director，支持全国约 250 人。
希望候选人有 5年以上 HRBP，最好支持过 Commercial / Sales 团队，懂销售激励、绩效、人才盘点、ER 和劳动法。`;

function Section({
  icon: Icon,
  title,
  source,
  children,
}: {
  icon: typeof Target;
  title: string;
  source?: SourceType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <Icon size={17} />
          </span>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        </div>
        {source ? <SourceBadge type={source} /> : null}
      </div>
      {children}
    </section>
  );
}

function SourceBadge({ type }: { type: SourceType }) {
  const config = {
    source: {
      label: "来自原文",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    },
    mixed: {
      label: "原文+AI归纳",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    inferred: {
      label: "AI推断",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    confirm: {
      label: "待确认",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    },
  }[type];

  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function FieldLabel({ children, source }: { children: React.ReactNode; source: SourceType }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <p className="text-xs font-semibold uppercase text-slate-400">{children}</p>
      <SourceBadge type={source} />
    </div>
  );
}

function ListBlock({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">暂无明确内容</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-6 text-slate-700">
          <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function TextBlock({ value }: { value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
      {value}
    </div>
  );
}

function WorkflowList({ items }: { items: JobAnalysis["deliveryWorkflow"] }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">暂无流程数据</p>;
  }

  const statusConfig = {
    done: "border-emerald-200 bg-emerald-50 text-emerald-800",
    in_progress: "border-sky-200 bg-sky-50 text-sky-800",
    pending: "border-slate-200 bg-slate-50 text-slate-600",
    active: "border-sky-200 bg-sky-50 text-sky-800",
    waiting_user: "border-amber-200 bg-amber-50 text-amber-800",
    manual_required: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const statusLabel = {
    done: "已完成",
    in_progress: "进行中",
    pending: "需人工确认",
    active: "自动执行中",
    waiting_user: "等待补充",
    manual_required: "需人工确认",
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusConfig[item.status]}`}
            >
              {statusLabel[item.status]}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">{item.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.output}</p>
        </div>
      ))}
    </div>
  );
}

export function RecruitingWorkspace() {
  const [rawInput, setRawInput] = useState(sampleBrief);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("intake");
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const progress = useMemo(
    () => [
      { label: "原始需求", done: Boolean(rawInput.trim()) },
      { label: "结构化补齐", done: Boolean(result) },
      { label: "职位诊断", done: Boolean(result) },
      { label: "候选人画像", done: Boolean(result) },
      { label: "人才地图", done: Boolean(result) },
      { label: "搜索策略", done: Boolean(result) },
      { label: "初筛排序", done: false },
      { label: "推荐报告", done: false },
    ],
    [rawInput, result],
  );

  async function parseJob() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "岗位解析失败");
      }

      setResult(payload);
      setActiveTab("intake");
    } catch (err) {
      setError(err instanceof Error ? err.message : "岗位解析失败");
    } finally {
      setLoading(false);
    }
  }

  async function uploadJD(file: File | undefined) {
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-jd", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "JD 文件上传失败");
      }

      setRawInput(payload.text);
      setResult(null);
      setUploadStatus(`${payload.fileName} · 已提取 ${payload.charCount} 字`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "JD 文件上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const analysis = result?.analysis;
  const resultTabs: { id: ResultTab; label: string; icon: typeof FileText }[] = [
    { id: "intake", label: "需求采集", icon: FileText },
    { id: "diagnosis", label: "职位诊断", icon: ClipboardList },
    { id: "search", label: "搜寻策略", icon: Search },
    { id: "screening", label: "初筛推进", icon: ShieldCheck },
  ];

  return (
    <main className="agent-shell min-h-screen text-stone-950">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-stone-800 bg-stone-950 px-5 py-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-teal-300 text-stone-950">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold">Boss Agent</p>
              <p className="agent-ui text-xs text-stone-400">Recruiting Delivery MVP</p>
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            {progress.map((item, index) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm"
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs ${
                    item.done
                      ? "bg-emerald-400 text-slate-950"
                      : index === 3
                        ? "bg-white/10 text-slate-300"
                        : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={item.done ? "text-white" : "text-slate-400"}>
                  {item.label}
                </span>
              </div>
            ))}
          </nav>

          <div className="mt-10 rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium">当前范围</p>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              本轮跑通职位诊断、背景补齐、画像、mapping、搜索策略和初筛准备。候选人触达前需要顾问确认。
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-b border-stone-200 bg-white px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="agent-kicker text-xs font-semibold uppercase">Recruiting Agent Intake</p>
                <h1 className="mt-1 text-xl font-semibold tracking-normal text-stone-950">
                  猎头交付 Agent 工作台
                </h1>
                <p className="agent-ui mt-1 text-sm text-stone-500">
                  从客户几个关键词或 JD 开始，帮助顾问补齐结构化需求，再生成搜寻策略。
                </p>
              </div>
              {result ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/projects/${result.projectId}`}
                    className="agent-ui inline-flex h-10 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                  >
                    打开项目漏斗
                  </a>
                  <div className="agent-ui rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-600">
                    Project ID: <span className="font-mono">{result.projectId}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/projects"
                    className="agent-ui inline-flex h-10 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    查看项目组合
                  </Link>
                  <a
                    href="/reports/persol"
                    className="agent-ui inline-flex h-10 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                  >
                    打开人才库
                  </a>
                </div>
              )}
            </div>
          </header>

          <div className="grid flex-1 gap-6 p-6 xl:grid-cols-[440px_1fr]">
            <section className="flex min-h-[640px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="size-5 text-emerald-700" />
                      <h2 className="font-semibold">客户原始线索 / JD / 电话纪要</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      可以只输入几个关键词，也可以粘贴完整 JD；系统会先整理成 intake brief 和待收集清单。
                    </p>
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md,.docx"
                      className="hidden"
                      onChange={(event) => uploadJD(event.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || loading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload size={16} />}
                      上传 JD
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <textarea
                  value={rawInput}
                  onChange={(event) => setRawInput(event.target.value)}
                  className="min-h-[430px] flex-1 resize-none rounded-md border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
                {error ? (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1">{error}</span>
                    <button
                      type="button"
                      onClick={parseJob}
                      disabled={loading || uploading || !rawInput.trim()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw size={14} />}
                      重试
                    </button>
                  </div>
                ) : null}
                {uploadStatus ? (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    <span>{uploadStatus}</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={parseJob}
                  disabled={loading || uploading}
                  className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Search size={16} />}
                  生成需求采集表
                  <ArrowRight size={16} />
                </button>
              </div>
            </section>

            <div className="min-w-0 space-y-6">
              {!analysis ? (
                <div className="flex min-h-[640px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
                  <div className="max-w-sm text-center">
                    <Target className="mx-auto size-10 text-slate-400" />
                    <h2 className="mt-4 text-lg font-semibold text-slate-900">
                      等待生成结构化需求
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      点击左侧按钮后，这里会先展示 intake brief 草稿，再进入职位诊断、人才画像和搜寻策略。
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-emerald-950">
                          {analysis.projectName}
                        </p>
                        <p className="mt-1 text-sm text-emerald-800">
                          {analysis.jobBrief.clientCompany} · {analysis.jobBrief.roleTitle}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <p>
                        标记说明：带有 <strong>AI推断</strong> 或 <strong>原文+AI归纳</strong>{" "}
                        的内容不是客户最终确认信息，建议在推荐或触达候选人前由顾问复核。
                      </p>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <SourceBadge type="source" />
                        <SourceBadge type="mixed" />
                        <SourceBadge type="inferred" />
                        <SourceBadge type="confirm" />
                      </div>
                    </div>
                  </div>

                  <div className="sticky top-0 z-10 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                    <div className="grid gap-2 md:grid-cols-4">
                      {resultTabs.map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveTab(item.id)}
                            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                              active
                                ? "bg-slate-950 text-white"
                                : "bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <Icon size={16} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activeTab === "intake" ? (
                    <>
                      <Section icon={FileText} title="需求采集与结构化" source="mixed">
                    <div className="mb-5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        输入类型：{analysis.intakeBuilder.inputType}
                      </span>
                      <SourceBadge type="mixed" />
                    </div>
                    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <FieldLabel source="mixed">角色</FieldLabel>
                            <TextBlock value={analysis.intakeBuilder.structuredBrief.role} />
                          </div>
                          <div>
                            <FieldLabel source="confirm">客户公司</FieldLabel>
                            <TextBlock value={analysis.intakeBuilder.structuredBrief.clientCompany} />
                          </div>
                          <div>
                            <FieldLabel source="mixed">业务背景</FieldLabel>
                            <TextBlock value={analysis.intakeBuilder.structuredBrief.businessContext} />
                          </div>
                          <div>
                            <FieldLabel source="mixed">团队范围</FieldLabel>
                            <TextBlock value={analysis.intakeBuilder.structuredBrief.teamScope} />
                          </div>
                          <div>
                            <FieldLabel source="source">地点 / 办公方式</FieldLabel>
                            <TextBlock value={analysis.intakeBuilder.structuredBrief.locationAndWorkModel} />
                          </div>
                          <div>
                            <FieldLabel source="mixed">薪资</FieldLabel>
                            <TextBlock value={analysis.intakeBuilder.structuredBrief.compensation} />
                          </div>
                          <div>
                            <FieldLabel source="confirm">汇报线</FieldLabel>
                            <TextBlock value={analysis.intakeBuilder.structuredBrief.reportingLine} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">Must-have 草稿</p>
                            <SourceBadge type="mixed" />
                          </div>
                          <ListBlock items={analysis.intakeBuilder.structuredBrief.mustHave} />
                        </div>
                      </div>
                      <div className="space-y-5">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">已知线索</p>
                            <SourceBadge type="source" />
                          </div>
                          <ListBlock items={analysis.intakeBuilder.knownSignals} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">合理假设</p>
                            <SourceBadge type="inferred" />
                          </div>
                          <ListBlock items={analysis.intakeBuilder.inferredHypotheses} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">待收集任务</p>
                            <SourceBadge type="confirm" />
                          </div>
                          <ListBlock items={analysis.intakeBuilder.collectionTasks} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-5">
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">Unknowns</p>
                        <SourceBadge type="confirm" />
                      </div>
                      <ChipList items={analysis.intakeBuilder.structuredBrief.unknowns} />
                    </div>
                      </Section>

                      <Section icon={Route} title="标准交付流程" source="mixed">
                        <WorkflowList items={analysis.deliveryWorkflow} />
                      </Section>
                    </>
                  ) : null}

                  {activeTab === "diagnosis" ? (
                    <>
                      <Section icon={ClipboardList} title="职位诊断" source="mixed">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <FieldLabel source="mixed">业务场景</FieldLabel>
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          {analysis.jobBrief.businessContext}
                        </p>
                      </div>
                      <div>
                        <FieldLabel source="confirm">汇报线</FieldLabel>
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          {analysis.jobBrief.reportingLine}
                        </p>
                      </div>
                      <div>
                        <FieldLabel source="mixed">薪资预算</FieldLabel>
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          {analysis.jobBrief.salaryBudget}
                        </p>
                      </div>
                      <div>
                        <FieldLabel source="inferred">软性标签</FieldLabel>
                        <div className="mt-2">
                          <ChipList items={analysis.jobBrief.softSignals} />
                        </div>
                        </div>
                      </div>
                      </Section>

                      <Section icon={MessagesSquare} title="公司 / 团队背景补齐" source="confirm">
                    <div className="grid gap-6 xl:grid-cols-3">
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">已确认</p>
                          <SourceBadge type="source" />
                        </div>
                        <ListBlock items={analysis.companyTeamBrief.confirmed} />
                      </div>
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">缺口</p>
                          <SourceBadge type="confirm" />
                        </div>
                        <ListBlock items={analysis.companyTeamBrief.missing} />
                      </div>
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">客户追问</p>
                          <SourceBadge type="confirm" />
                        </div>
                        <ListBlock items={analysis.companyTeamBrief.clientQuestions} />
                      </div>
                    </div>
                      </Section>

                      <Section icon={Target} title="人才画像" source="inferred">
                      <p className="mb-4 text-sm leading-6 text-slate-700">
                        {analysis.talentPersona.summary}
                      </p>
                      <div className="space-y-5">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">Must-have</p>
                            <SourceBadge type="mixed" />
                          </div>
                          <ListBlock items={analysis.talentPersona.mustHave} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">风险点</p>
                            <SourceBadge type="inferred" />
                          </div>
                          <ListBlock items={analysis.talentPersona.riskSignals} />
                        </div>
                      </div>
                      </Section>
                    </>
                  ) : null}

                  {activeTab === "search" ? (
                    <>
                      <Section icon={Map} title="搜寻地图" source="inferred">
                      <div className="space-y-5">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">目标行业</p>
                            <SourceBadge type="inferred" />
                          </div>
                          <ChipList items={analysis.searchMap.targetIndustries} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">目标 Title</p>
                            <SourceBadge type="mixed" />
                          </div>
                          <ChipList items={analysis.searchMap.targetTitles} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">搜索关键词</p>
                            <SourceBadge type="inferred" />
                          </div>
                          <ChipList items={analysis.searchMap.keywords} />
                        </div>
                      </div>
                      </Section>

                      <Section icon={Search} title="Boolean Search" source="mixed">
                    <div className="grid gap-4 xl:grid-cols-3">
                      <div>
                        <FieldLabel source="mixed">精准搜索</FieldLabel>
                        <TextBlock value={analysis.booleanSearch.precise} />
                      </div>
                      <div>
                        <FieldLabel source="inferred">扩展搜索</FieldLabel>
                        <TextBlock value={analysis.booleanSearch.expanded} />
                      </div>
                      <div>
                        <FieldLabel source="inferred">排除干扰</FieldLabel>
                        <TextBlock value={analysis.booleanSearch.excludeNoise} />
                      </div>
                    </div>
                    <div className="mt-5">
                      <div className="mb-3 flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">平台建议</p>
                        <SourceBadge type="mixed" />
                      </div>
                      <ListBlock items={analysis.booleanSearch.platformNotes} />
                    </div>
                      </Section>

                      <Section icon={Building2} title="目标公司" source="inferred">
                        <ChipList items={analysis.searchMap.targetCompanies} />
                      </Section>
                    </>
                  ) : null}

                  {activeTab === "screening" ? (
                    <div className="grid gap-6 xl:grid-cols-2">
                      <Section icon={ShieldCheck} title="平台风控规则" source="mixed">
                      <ListBlock items={analysis.sourcingGuardrails} />
                      </Section>

                      <Section icon={ClipboardList} title="初筛计划" source="mixed">
                      <div className="space-y-5">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">第一轮排序逻辑</p>
                            <SourceBadge type="mixed" />
                          </div>
                          <ListBlock items={analysis.screeningPlan.firstRoundOrder} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">初筛问题</p>
                            <SourceBadge type="mixed" />
                          </div>
                          <ListBlock items={analysis.screeningPlan.qualificationQuestions} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">风险检查</p>
                            <SourceBadge type="inferred" />
                          </div>
                          <ListBlock items={analysis.screeningPlan.riskChecks} />
                        </div>
                      </div>
                      </Section>

                      <Section icon={Building2} title="下一步动作" source="inferred">
                        <div className="mb-3 flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">下一步动作</p>
                          <SourceBadge type="inferred" />
                        </div>
                        <ListBlock items={analysis.nextActions} />
                      </Section>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
