"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Filter,
  Loader2,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import type { CandidateSearchResult, PersolCandidateProfile, PersolCandidateRecord } from "@/lib/persol-report-data";

type CandidateRecord = Omit<PersolCandidateRecord, "searchText">;
type SortKey = "lastUpdateDate" | "lastContactDate" | "dateAdded" | "age" | "name";
type SortOrder = "asc" | "desc";
type ProjectOption = {
  id: string;
  name: string;
  clientCompany: string | null;
  roleTitle: string | null;
  longlistCount: number;
};

const pageSizes = [25, 50, 100];

const rawFieldLabels: Record<string, string> = {
  id: "候选人 ID",
  __name__: "显示名",
  chineseName: "中文名",
  englishName: "英文名",
  title: "当前职位",
  company: "当前公司 ID",
  mobile: "手机",
  email: "邮箱",
  wechat: "微信",
  address: "地址",
  age: "年龄",
  gender: "性别",
  annualSalary: "当前年薪",
  expected_salary: "期望薪资",
  hopeannual: "期望年薪",
  gllueextcurrentcompensationdetail: "薪酬明细",
  functions: "职能",
  citys: "城市",
  locations: "地点",
  industrys: "行业",
  source: "来源",
  last_status: "最近状态",
  last_status_date: "状态时间",
  lastContactDate: "最后联系",
  lastUpdateDate: "最后更新",
  dateAdded: "新增时间",
  cmbConsultantRank: "顾问评级",
  owner: "Owner",
  addedBy: "新增人",
  lastUpdateBy: "最后更新人",
  txtKoseki: "籍贯",
  cmbMarryStatus: "婚姻状态",
  cmbSinKiGuBun: "新规区分",
  txrNoteNeiBu: "内部备注",
  temp_note: "临时备注",
  gllueextpersonal_data_consent: "个人信息授权",
  gllueextreason_not_sent: "未发送原因",
  candidateeducation_set: "教育经历 ID",
  candidateexperience_set: "工作经历 ID",
  candidateproject_set: "项目经历 ID",
  candidatelanguage_set: "语言能力 ID",
  candidateskill_set: "技能 ID",
  candidateowner_set: "候选人 Owner ID",
  accessSource: "访问来源",
  accessLevel: "访问权限",
  is_hide: "隐藏状态",
  hideable: "可隐藏",
  unhideable: "不可隐藏",
};

const primaryRawFields = [
  "id",
  "__name__",
  "chineseName",
  "englishName",
  "title",
  "company",
  "mobile",
  "email",
  "wechat",
  "address",
  "age",
  "gender",
  "annualSalary",
  "expected_salary",
  "hopeannual",
  "gllueextcurrentcompensationdetail",
  "functions",
  "citys",
  "locations",
  "industrys",
  "source",
  "last_status",
  "last_status_date",
  "lastContactDate",
  "lastUpdateDate",
  "dateAdded",
  "cmbConsultantRank",
  "owner",
  "addedBy",
  "lastUpdateBy",
  "txtKoseki",
  "cmbMarryStatus",
  "cmbSinKiGuBun",
  "txrNoteNeiBu",
  "temp_note",
  "gllueextpersonal_data_consent",
  "gllueextreason_not_sent",
  "candidateeducation_set",
  "candidateexperience_set",
  "candidateproject_set",
  "candidatelanguage_set",
  "candidateskill_set",
  "candidateowner_set",
];

function formatDate(value: string) {
  if (!value) return "未填";
  return value.slice(0, 16);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "未填";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatRawValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未填";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return "未填";
    return value.map((item) => formatRawValue(item)).join(", ");
  }
  return JSON.stringify(value, null, 2);
}

function getRawFieldEntries(rawDetail: Record<string, unknown> | null) {
  if (!rawDetail) return [];
  const ordered = primaryRawFields
    .filter((key) => key in rawDetail)
    .map((key) => [key, rawDetail[key]] as const);
  const orderedKeys = new Set(primaryRawFields);
  const extra = Object.entries(rawDetail)
    .filter(([key]) => !orderedKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
  return [...ordered, ...extra];
}

function statLabel(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--ha-line-soft)] py-3 last:border-0">
      <dt className="text-xs font-semibold text-[var(--ha-ink-3)]">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-[var(--ha-ink-1)]">{value || "未填"}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="metric">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-[var(--ha-ink-3)]" />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center text-center">
      <div>
        {loading ? (
          <Loader2 className="mx-auto size-8 animate-spin text-[var(--ha-ink-3)]" />
        ) : (
          <Search className="mx-auto size-8 text-[var(--ha-ink-3)]" />
        )}
        <p className="mt-3 text-sm font-semibold text-[var(--ha-ink-1)]">
          {loading ? "正在读取候选人索引" : "没有匹配记录"}
        </p>
        <p className="mt-1 text-xs text-[var(--ha-ink-3)]">
          {loading ? "首次加载会把报表索引放入服务端缓存。" : "调整关键词、备注或年龄筛选后再试。"}
        </p>
      </div>
    </div>
  );
}

function RawField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-3 ${wide ? "md:col-span-2" : ""}`}>
      <dt className="text-xs font-semibold text-[var(--ha-ink-3)]">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[var(--ha-ink-1)]">{value}</dd>
    </div>
  );
}

function ProfileSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UsersRound;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-[var(--ha-ink-3)]" />
        <h3 className="text-sm font-semibold text-[var(--ha-ink)]">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CandidateProfileModal({
  profile,
  loading,
  error,
  onClose,
}: {
  profile: PersolCandidateProfile | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const record = profile?.record ?? null;
  const rawEntries = getRawFieldEntries(profile?.rawDetail ?? null);
  const internalNotes = [profile?.rawDetail?.txrNoteNeiBu, profile?.rawDetail?.temp_note]
    .map(formatRawValue)
    .filter((item) => item !== "未填");

  return (
    <div className="fixed inset-0 z-50 bg-[#18171a]/45 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl bg-[var(--ha-bg)] shadow-2xl ring-1 ring-[var(--ha-line)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-5 py-4">
          <div>
            <p className="agent-kicker text-xs font-semibold uppercase text-[var(--ha-accent)]">Candidate Full Resume</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal text-[var(--ha-ink)]">
              {record ? `${record.name || record.chineseName || "未命名候选人"} · 完整简历档案` : "完整简历档案"}
            </h2>
            <p className="mt-1 text-sm text-[var(--ha-ink-2)]">
              {record
                ? `${record.companyName || "未填公司"} · ${record.title || record.firstExperienceTitle || "未填职位"}`
                : "正在读取候选人档案"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] text-[var(--ha-ink-2)] transition hover:bg-[var(--ha-bg-hover)]"
            aria-label="关闭完整简历窗口"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center text-center">
              <div>
                <Loader2 className="mx-auto size-8 animate-spin text-[var(--ha-ink-3)]" />
                <p className="mt-3 text-sm font-semibold text-[var(--ha-ink-1)]">正在读取完整档案</p>
                <p className="mt-1 text-xs text-[var(--ha-ink-3)]">首次读取会缓存本地候选人详情索引。</p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-[var(--ha-bad)]/30 bg-[var(--ha-bad-soft)] p-4 text-sm text-[var(--ha-bad)]">{error}</div>
          ) : record ? (
            <div className="space-y-4">
              {/* 数据治理智能看板 */}
              {(() => {
                const govSalary = record.governedSalary;
                const govNotes = record.governedNotes;
                const govExps = profile?.deepProfile?.governedExperiences;
                if (!govSalary && !govNotes && (!govExps || govExps.length === 0)) return null;

                return (
                  <section className="rounded-lg border border-[var(--ha-accent)] bg-[var(--ha-accent-soft)]/20 p-5">
                    <div className="flex items-center justify-between border-b border-[var(--ha-accent)]/30 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-[var(--ha-accent-ink)]">⭐ 数据治理智能看板 (Smart Governance)</span>
                      </div>
                      <span className="rounded bg-[var(--ha-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ha-accent)]">
                        已完成数据治理
                      </span>
                    </div>

                    <div className="mt-4 space-y-4">
                      {/* 薪资结构化 */}
                      {govSalary && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-[var(--ha-ink-2)]">💰 薪资结构化解析</h4>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-3">
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ha-ink-3)]">Base 薪资</dt>
                              <dd className="mt-1 text-sm font-semibold text-[var(--ha-ink-1)]">
                                {govSalary.base
                                  ? `${(govSalary.base.monthly / 1000).toFixed(1)}k * ${govSalary.base.months}薪`
                                  : "未提取到基本月薪"}
                              </dd>
                              {govSalary.base && (
                                <p className="mt-1 text-xs text-[var(--ha-ink-2)]">
                                  年化: {Math.round(govSalary.base.annualizedBase / 10000)} 万/年
                                </p>
                              )}
                            </div>
                            <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-3">
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ha-ink-3)]">年终/奖金</dt>
                              <dd className="mt-1 text-sm font-semibold text-[var(--ha-ink-1)]">
                                {govSalary.bonus
                                  ? `${(govSalary.bonus.annualizedBonus / 10000).toFixed(1)} 万/年`
                                  : "无"}
                              </dd>
                              {govSalary.bonus?.rawText && (
                                <p className="mt-1 truncate text-xs text-[var(--ha-ink-2)]" title={govSalary.bonus.rawText}>
                                  原文: {govSalary.bonus.rawText}
                                </p>
                              )}
                            </div>
                            <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-3">
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ha-ink-3)]">股权期权</dt>
                              <dd className="mt-1 text-sm font-semibold text-[var(--ha-ink-1)]">
                                {govSalary.equity
                                  ? govSalary.equity.percentage
                                    ? `${govSalary.equity.percentage}% 股份`
                                    : govSalary.equity.annualizedValue !== null
                                      ? `${(govSalary.equity.annualizedValue / 10000).toFixed(1)} 万/年`
                                      : "无"
                                  : "无"}
                              </dd>
                              {govSalary.equity && (
                                <p className="mt-1 text-xs text-[var(--ha-ink-2)]">
                                  {govSalary.equity.totalValue ? `总: ${Math.round(govSalary.equity.totalValue / 10000)}万 (${govSalary.equity.vestingYears}年)` : govSalary.equity.type}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--ha-bg-soft)] px-3 py-2 text-xs text-[var(--ha-ink-1)]">
                            <span>治理估算总年薪: <strong className="text-sm font-bold text-[var(--ha-accent)]">{govSalary.annualizedTotal ? `${(govSalary.annualizedTotal / 10000).toFixed(1)} 万` : "暂无估算"}</strong></span>
                            <span className="text-[var(--ha-ink-3)]">原薪资: {record.annualSalary || "无"} | 期望: {record.expectedSalary || "无"}</span>
                          </div>
                        </div>
                      )}

                      {/* 意向与标签 */}
                      {govNotes && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-[var(--ha-ink-2)]">🎯 意向信号与标签</h4>
                          <div className="flex flex-wrap gap-2">
                            {govNotes.seekingStatus === 'active' && (
                              <span className="rounded bg-[var(--ha-good-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ha-good)]">求职意向: 积极活跃</span>
                            )}
                            {govNotes.seekingStatus === 'passive' && (
                              <span className="rounded bg-[var(--ha-warn-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ha-warn)]">求职意向: 稳定/不看机会</span>
                            )}
                            {govNotes.seekingStatus === 'unknown' && (
                              <span className="rounded bg-[var(--ha-bg-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ha-ink-2)]">求职意向: 未知/待沟通</span>
                            )}

                            {govNotes.extractedTags && govNotes.extractedTags.length > 0 ? (
                              govNotes.extractedTags.map((tag: string) => (
                                <span key={tag} className="rounded bg-[var(--ha-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ha-accent)]">
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-[var(--ha-ink-3)]">（未提取到特定行为信号）</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 合并工作经历时间线 */}
                      {govExps && govExps.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-[var(--ha-ink-2)]">📅 融合合并后工作履历时间线 (去重去噪)</h4>
                          <div className="space-y-2">
                            {govExps.map((exp, idx) => (
                              <div key={`${exp.company}-${idx}`} className="flex gap-3 rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-3">
                                <div className="mt-1.5 flex flex-col items-center">
                                  <span className={`size-2 rounded-full ${idx === 0 ? 'bg-[var(--ha-good)]' : 'bg-[var(--ha-line)]'}`} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ha-ink-1)]">
                                    <span>{exp.company}</span>
                                    <span className="font-normal text-[var(--ha-ink-2)]">{exp.period || "无时间"}</span>
                                  </div>
                                  {exp.title && <p className="mt-0.5 text-xs text-[var(--ha-ink-2)]">{exp.title}</p>}
                                  {exp.description && (
                                    <details className="mt-1">
                                      <summary className="cursor-pointer text-[11px] font-semibold text-[var(--ha-accent)]">查看工作描述</summary>
                                      <p className="mt-1 whitespace-pre-wrap rounded border-l-2 border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-2 text-[11px] leading-5 text-[var(--ha-ink-2)]">
                                        {exp.description}
                                      </p>
                                    </details>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 时序备注时间线 */}
                      {govNotes?.timeline && govNotes.timeline.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-[var(--ha-ink-2)]">💬 结构化分类互动备注 Timeline</h4>
                          <div className="space-y-2">
                            {govNotes.timeline.slice(0, 4).map((note, idx) => (
                              <div key={`${note.id}-${idx}`} className="rounded border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-3">
                                <div className="flex justify-between text-[10.5px] text-[var(--ha-ink-2)]">
                                  <span className="font-bold text-[var(--ha-accent)]">{note.category}</span>
                                  <span>{note.dateAdded}</span>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-[var(--ha-ink-1)]">{note.content}</p>
                              </div>
                            ))}
                            {govNotes.timeline.length > 4 && (
                              <p className="text-center text-xs font-medium italic text-[var(--ha-ink-3)]">
                                还有 {govNotes.timeline.length - 4} 条历史互动备注，可在下方“备注”中查看全文。
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })()}

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <ProfileSection title="基础信息" icon={UserRound}>
                  <dl className="grid gap-3 md:grid-cols-2">
                    <DetailLine label="中文名" value={record.chineseName || record.name} />
                    <DetailLine label="英文名" value={record.englishName} />
                    <DetailLine label="年龄 / 性别" value={`${record.age ?? "未填"} / ${record.gender || "未填"}`} />
                    <DetailLine label="当前公司" value={record.companyName} />
                    <DetailLine label="当前职位" value={record.title || record.firstExperienceTitle} />
                    <DetailLine label="职能路径" value={record.functionPath} />
                    <DetailLine label="手机" value={record.mobile} />
                    <DetailLine label="邮箱" value={record.email} />
                    <DetailLine label="微信" value={formatRawValue(profile?.rawDetail?.wechat)} />
                    <DetailLine label="地址" value={formatRawValue(profile?.rawDetail?.address)} />
                  </dl>
                </ProfileSection>

                <ProfileSection title="薪酬与状态" icon={BriefcaseBusiness}>
                  <dl className="grid gap-3">
                    <DetailLine label="当前年薪" value={formatNumber(record.annualSalary)} />
                    <DetailLine label="期望薪资" value={record.expectedSalary || formatRawValue(profile?.rawDetail?.hopeannual)} />
                    <DetailLine label="薪酬明细" value={record.compensationDetail} />
                    <DetailLine label="来源 / 状态" value={`${record.source || "未填"} / ${record.status || "未填"}`} />
                    <DetailLine label="新增 / 更新" value={`${formatDate(record.dateAdded)} / ${formatDate(record.lastUpdateDate)}`} />
                    <DetailLine label="最后联系" value={formatDate(record.lastContactDate)} />
                  </dl>
                </ProfileSection>
              </div>

              <ProfileSection title="履历结构" icon={FileText}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3">
                    <div className="text-xs font-semibold text-[var(--ha-ink-2)]">工作经历</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--ha-ink-1)]">{record.experienceCount}</div>
                  </div>
                  <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3">
                    <div className="text-xs font-semibold text-[var(--ha-ink-2)]">教育经历</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--ha-ink-1)]">{record.educationCount}</div>
                  </div>
                  <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3">
                    <div className="text-xs font-semibold text-[var(--ha-ink-2)]">项目经历</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--ha-ink-1)]">{record.projectCount}</div>
                  </div>
                  <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3">
                    <div className="text-xs font-semibold text-[var(--ha-ink-2)]">语言能力</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--ha-ink-1)]">{record.languageCount}</div>
                  </div>
                  <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3">
                    <div className="text-xs font-semibold text-[var(--ha-ink-2)]">技能</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--ha-ink-1)]">{record.skillCount}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {record.functionTags.length ? (
                    record.functionTags.map((tag) => (
                      <span key={tag} className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ha-ink-2)]">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[var(--ha-ink-3)]">未填职能标签</span>
                  )}
                </div>
              </ProfileSection>

              {/* 自我评价 */}
              {profile?.deepProfile?.selfAssessment && (
                <ProfileSection title="自我评价" icon={UserRound}>
                  <p className="whitespace-pre-wrap rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3 text-xs leading-relaxed text-[var(--ha-ink-1)]">
                    {profile.deepProfile.selfAssessment}
                  </p>
                </ProfileSection>
              )}

              {/* 工作经历明细 */}
              {profile?.deepProfile?.experiences && profile.deepProfile.experiences.length > 0 && (
                <ProfileSection title="工作经历明细" icon={BriefcaseBusiness}>
                  <div className="space-y-3">
                    {profile.deepProfile.experiences.map((exp, index) => (
                      <div key={index} className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-sm font-bold text-[var(--ha-ink-1)]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{exp.company}</span>
                            {exp.title && <span className="font-normal text-xs text-[var(--ha-ink-2)]">| {exp.title}</span>}
                          </div>
                          <span className="text-xs font-normal text-[var(--ha-ink-2)] shrink-0">{exp.period}</span>
                        </div>
                        {exp.description && (
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--ha-ink-2)] border-t border-[var(--ha-line-soft)] pt-2">
                            {exp.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ProfileSection>
              )}

              {/* 教育经历明细 */}
              {profile?.deepProfile?.educations && profile.deepProfile.educations.length > 0 && (
                <ProfileSection title="教育经历明细" icon={FileText}>
                  <div className="space-y-3">
                    {profile.deepProfile.educations.map((edu, index) => (
                      <div key={index} className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-sm font-bold text-[var(--ha-ink-1)]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{edu.school}</span>
                            {(edu.major || edu.degree) && (
                              <span className="font-normal text-xs text-[var(--ha-ink-2)]">
                                | {edu.major} {edu.degree && `(${edu.degree})`}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-normal text-[var(--ha-ink-2)] shrink-0">{edu.period}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ProfileSection>
              )}

              {/* 项目经历明细 */}
              {profile?.deepProfile?.projects && profile.deepProfile.projects.length > 0 && (
                <ProfileSection title="项目经历明细" icon={Building2}>
                  <div className="space-y-3">
                    {profile.deepProfile.projects.map((proj, index) => (
                      <div key={index} className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-sm font-bold text-[var(--ha-ink-1)]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{proj.name}</span>
                            {proj.role && <span className="font-normal text-xs text-[var(--ha-ink-2)]">| {proj.role}</span>}
                          </div>
                          <span className="text-xs font-normal text-[var(--ha-ink-2)] shrink-0">{proj.period}</span>
                        </div>
                        {proj.description && (
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--ha-ink-2)] border-t border-[var(--ha-line-soft)] pt-2">
                            {proj.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ProfileSection>
              )}

              <ProfileSection title="备注" icon={CalendarClock}>
                {record.notes.length || internalNotes.length ? (
                  <div className="space-y-3">
                    {record.notes.map((note, index) => (
                      <p
                        key={`${record.id}-public-note-${index}`}
                        className="whitespace-pre-wrap rounded-md border border-[var(--ha-warn)]/30 bg-[var(--ha-warn-soft)] p-3 text-sm leading-6 text-[var(--ha-ink-1)]"
                      >
                        {note}
                      </p>
                    ))}
                    {internalNotes.map((note, index) => (
                      <p
                        key={`${record.id}-internal-note-${index}`}
                        className="whitespace-pre-wrap rounded-md border border-[var(--ha-accent)]/30 bg-[var(--ha-accent-soft)]/40 p-3 text-sm leading-6 text-[var(--ha-ink-1)]"
                      >
                        {note}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3 text-sm text-[var(--ha-ink-3)]">暂无备注。</p>
                )}
              </ProfileSection>

              <ProfileSection title="原始字段" icon={Database}>
                <p className="mb-3 text-xs leading-5 text-[var(--ha-ink-2)]">
                  下面展示本地 `candidate_detail_bulk.jsonl` 中该候选人的全部可用字段，便于核查未结构化到摘要区的信息。
                </p>
                {rawEntries.length ? (
                  <dl className="grid gap-3 md:grid-cols-2">
                    {rawEntries.map(([key, value]) => {
                      const formatted = formatRawValue(value);
                      return (
                        <RawField
                          key={key}
                          label={`${rawFieldLabels[key] ?? key} · ${key}`}
                          value={formatted}
                          wide={formatted.length > 120 || formatted.includes("\n")}
                        />
                      );
                    })}
                  </dl>
                ) : (
                  <p className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3 text-sm text-[var(--ha-ink-3)]">
                    没有找到原始详情记录。
                  </p>
                )}
              </ProfileSection>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PersolReportWindow() {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [hasNotes, setHasNotes] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [sort, setSort] = useState<SortKey>("lastUpdateDate");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<CandidateSearchResult | null>(null);
  const [selected, setSelected] = useState<CandidateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<number>>(new Set());
  const [addingToProject, setAddingToProject] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<PersolCandidateProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [railExpanded, setRailExpanded] = useState(true);
  const [railTab, setRailTab] = useState<"detail" | "stats">("stats");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort,
      order,
    });

    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (source) params.set("source", source);
    if (status) params.set("status", status);
    if (hasNotes) params.set("hasNotes", hasNotes);
    if (minAge) params.set("minAge", minAge);
    if (maxAge) params.set("maxAge", maxAge);

    const loadingTimer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);

    fetch(`/api/persol-candidates?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "报表读取失败");
        return payload as CandidateSearchResult;
      })
      .then((payload) => {
        setData(payload);
        setSelected((current) => {
          if (current && payload.records.some((record) => record.id === current.id)) return current;
          return payload.records[0] ?? null;
        });
      })
      .catch((fetchError) => {
        if (fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "报表读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      window.clearTimeout(loadingTimer);
      controller.abort();
    };
  }, [debouncedSearch, source, status, hasNotes, minAge, maxAge, sort, order, page, pageSize]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "项目列表读取失败");
        return payload.projects as ProjectOption[];
      })
      .then((payload) => {
        setProjects(payload);
        setSelectedProjectId((current) => current || payload[0]?.id || "");
      })
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") {
          setAddStatus(fetchError instanceof Error ? fetchError.message : "项目列表读取失败");
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!profileOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [profileOpen]);

  const sourceOptions = data?.metadata.sources ?? [];
  const statusOptions = data?.metadata.statuses ?? [];
  const records = data?.records ?? [];
  const metadata = data?.metadata;
  const matched = data?.matchedSummary;

  const activeFilterCount = useMemo(
    () => [debouncedSearch, source, status, hasNotes, minAge, maxAge].filter(Boolean).length,
    [debouncedSearch, source, status, hasNotes, minAge, maxAge],
  );

  function resetFilters() {
    setSearchText("");
    setDebouncedSearch("");
    setSource("");
    setStatus("");
    setHasNotes("");
    setMinAge("");
    setMaxAge("");
    setSort("lastUpdateDate");
    setOrder("desc");
    setPage(1);
  }

  function toggleCandidate(candidateId: number) {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }

  async function addSelectedToProject() {
    if (!selectedProjectId || selectedCandidateIds.size === 0) return;
    const candidates = records.filter((record) => selectedCandidateIds.has(record.id));

    setAddingToProject(true);
    setAddStatus(null);

    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "加入项目失败");
      }

      setAddStatus(`已加入 ${payload.added} 人，更新 ${payload.updated} 人`);
      setSelectedCandidateIds(new Set());
    } catch (err) {
      setAddStatus(err instanceof Error ? err.message : "加入项目失败");
    } finally {
      setAddingToProject(false);
    }
  }

  async function openFullProfile(candidate: CandidateRecord | null) {
    if (!candidate) return;

    setProfileOpen(true);
    setProfileLoading(true);
    setProfileError(null);
    setProfile(null);

    try {
      const response = await fetch(`/api/persol-candidates/${candidate.id}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "完整档案读取失败");
      }

      setProfile(payload as PersolCandidateProfile);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "完整档案读取失败");
    } finally {
      setProfileLoading(false);
    }
  }

  return (
    <main className={`hunter-agent ${sidebarExpanded ? "" : "sidebar-collapsed"} ${railExpanded ? "" : "rail-collapsed"}`}>
      {profileOpen ? (
        <CandidateProfileModal
          profile={profile}
          loading={profileLoading}
          error={profileError}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>
          {sidebarExpanded ? (
            <div className="brand-meta">
              <div className="brand-title">Talent DB</div>
              <div className="brand-sub">Console</div>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
            title={sidebarExpanded ? "收起筛选栏" : "展开筛选栏"}
          >
            {sidebarExpanded ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        </div>

        {sidebarExpanded ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4">
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 text-[var(--ha-ink-2)]">
                <Filter size={15} />
                <h2 className="text-xs font-bold uppercase tracking-wider">筛选条件</h2>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-2 text-[11px] font-semibold text-[var(--ha-ink-2)] transition hover:bg-[var(--ha-bg-hover)]"
              >
                <RefreshCw size={11} />
                重置
              </button>
            </div>

            <div className="space-y-3 mt-2">
              <label className="block">
                <span className="text-xs font-semibold text-[var(--ha-ink-2)]">关键词</span>
                <div className="mt-1.5 flex h-9 items-center gap-2 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 focus-within:border-[var(--ha-accent)]">
                  <Search size={13} className="text-[var(--ha-ink-3)]" />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="姓名/公司/职位/手机/备注"
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none text-[var(--ha-ink-1)]"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[var(--ha-ink-2)]">来源</span>
                <select
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value);
                    setPage(1);
                  }}
                  className="mt-1.5 h-9 w-full rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 text-xs font-semibold text-[var(--ha-ink-1)] outline-none focus:border-[var(--ha-accent)]"
                >
                  <option value="">全部来源</option>
                  {sourceOptions.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.label || "未填"} ({option.count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[var(--ha-ink-2)]">状态</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                  className="mt-1.5 h-9 w-full rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 text-xs font-semibold text-[var(--ha-ink-1)] outline-none focus:border-[var(--ha-accent)]"
                >
                  <option value="">全部状态</option>
                  {statusOptions.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.label || "未填"} ({option.count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[var(--ha-ink-2)]">顾问备注</span>
                <select
                  value={hasNotes}
                  onChange={(event) => {
                    setHasNotes(event.target.value);
                    setPage(1);
                  }}
                  className="mt-1.5 h-9 w-full rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 text-xs font-semibold text-[var(--ha-ink-1)] outline-none focus:border-[var(--ha-accent)]"
                >
                  <option value="">全部</option>
                  <option value="yes">有备注</option>
                  <option value="no">无备注</option>
                </select>
              </label>

              <div>
                <span className="text-xs font-semibold text-[var(--ha-ink-2)]">年龄区间</span>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <input
                    value={minAge}
                    onChange={(event) => {
                      setMinAge(event.target.value.replace(/\D/g, ""));
                      setPage(1);
                    }}
                    placeholder="最小"
                    inputMode="numeric"
                    className="h-9 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 text-xs font-semibold text-[var(--ha-ink-1)] outline-none focus:border-[var(--ha-accent)]"
                  />
                  <input
                    value={maxAge}
                    onChange={(event) => {
                      setMaxAge(event.target.value.replace(/\D/g, ""));
                      setPage(1);
                    }}
                    placeholder="最大"
                    inputMode="numeric"
                    className="h-9 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 text-xs font-semibold text-[var(--ha-ink-1)] outline-none focus:border-[var(--ha-accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[1fr_96px] gap-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--ha-ink-2)]">排序</span>
                  <select
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value as SortKey);
                      setPage(1);
                    }}
                    className="mt-1.5 h-9 w-full rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 text-xs font-semibold text-[var(--ha-ink-1)] outline-none focus:border-[var(--ha-accent)]"
                  >
                    <option value="lastUpdateDate">更新时间</option>
                    <option value="lastContactDate">联系时间</option>
                    <option value="dateAdded">新增时间</option>
                    <option value="age">年龄</option>
                    <option value="name">姓名</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--ha-ink-2)]">方向</span>
                  <select
                    value={order}
                    onChange={(event) => {
                      setOrder(event.target.value as SortOrder);
                      setPage(1);
                    }}
                    className="mt-1.5 h-9 w-full rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-3 text-xs font-semibold text-[var(--ha-ink-1)] outline-none focus:border-[var(--ha-accent)]"
                  >
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] p-3 text-xs text-[var(--ha-ink-2)]">
              <p className="font-semibold text-[var(--ha-ink-1)]">当前筛选</p>
              <p className="mt-1">{activeFilterCount} 个条件 · 每页 {pageSize} 条</p>
              <p className="mt-2 leading-relaxed text-[11px] text-[var(--ha-ink-3)]">
                关键词会同时检索姓名、公司、职位、联系方式、函数路径和备注摘要。
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 gap-4">
            <button
              type="button"
              onClick={() => setSidebarExpanded(true)}
              className="size-8 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] flex items-center justify-center text-[var(--ha-ink-2)] hover:text-[var(--ha-ink)] transition"
              title="展开筛选栏"
            >
              <Filter size={15} />
            </button>
          </div>
        )}
      </aside>

      <section className="main">
        <header className="main-header">
          <div className="crumbs">
            <span>人才库</span>
            <ChevronRight size={13} />
            <span className="now">报表控制台</span>
          </div>

          <div className="flex items-center gap-2">
            {selectedCandidateIds.size > 0 && (
              <div className="flex items-center gap-2 animate-fade-in mr-2">
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="h-8 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-2 text-xs font-semibold text-[var(--ha-ink-1)] outline-none"
                >
                  <option value="">选择项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.longlistCount})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addSelectedToProject}
                  disabled={addingToProject || !selectedProjectId}
                  className="btn btn-accent mini"
                >
                  {addingToProject ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  加入项目 ({selectedCandidateIds.size})
                </button>
              </div>
            )}

            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ha-ink-2)]">
              <ArrowDownUp size={12} />
              <span>{sort} · {order}</span>
            </div>

            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-8 rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-2 text-xs font-semibold text-[var(--ha-ink-1)] outline-none"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size} / 页
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={loading || (data?.page ?? page) <= 1}
                className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] text-[var(--ha-ink-2)] transition hover:bg-[var(--ha-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="上一页"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(current + 1, data?.totalPages ?? current + 1))}
                disabled={loading || (data?.page ?? page) >= (data?.totalPages ?? 1)}
                className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-card)] text-[var(--ha-ink-2)] transition hover:bg-[var(--ha-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="下一页"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </header>

        <div className="feed-wrap">
          <div className="flex flex-col gap-4 w-full min-w-0">
            {error ? (
              <div className="rounded-lg border border-[var(--ha-bad)]/30 bg-[var(--ha-bad-soft)] px-4 py-3 text-sm text-[var(--ha-bad)]">
                {error}
              </div>
            ) : null}
            {addStatus ? (
              <div className="rounded-lg border border-[var(--ha-good)]/30 bg-[var(--ha-good-soft)] px-4 py-3 text-sm text-[var(--ha-good)] flex items-center justify-between">
                <span>{addStatus}</span>
                {selectedProjectId ? (
                  <a href={`/projects/${selectedProjectId}`} className="font-semibold underline text-[var(--ha-accent)]">
                    打开项目漏斗
                  </a>
                ) : null}
              </div>
            ) : null}

            {records.length === 0 ? (
              <EmptyState loading={loading} />
            ) : (
              <div className="overflow-auto rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] shadow-sm max-h-[calc(100vh-160px)]">
                <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--ha-bg-soft)] text-xs font-semibold text-[var(--ha-ink-2)] shadow-[inset_0_-1px_0_var(--ha-line)]">
                    <tr>
                      <th className="px-4 py-3 w-10 bg-[var(--ha-bg-soft)]">
                        <span className="sr-only">选择</span>
                      </th>
                      <th className="px-4 py-3 bg-[var(--ha-bg-soft)]">候选人</th>
                      <th className="px-4 py-3 bg-[var(--ha-bg-soft)]">公司 / 职位</th>
                      <th className="px-4 py-3 bg-[var(--ha-bg-soft)]">联系方式</th>
                      <th className="px-4 py-3 bg-[var(--ha-bg-soft)]">年龄</th>
                      <th className="px-4 py-3 bg-[var(--ha-bg-soft)]">薪资</th>
                      <th className="px-4 py-3 bg-[var(--ha-bg-soft)]">来源</th>
                      <th className="px-4 py-3 bg-[var(--ha-bg-soft)]">更新时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ha-line-soft)]">
                    {records.map((record) => {
                      const isSelected = selected?.id === record.id;
                      const checked = selectedCandidateIds.has(record.id);
                      return (
                        <tr
                          key={record.id}
                          onClick={() => {
                            setSelected(record);
                            setRailTab("detail");
                          }}
                          className={`cursor-pointer transition ${
                            isSelected ? "bg-[var(--ha-accent-soft)] font-medium" : "bg-[var(--ha-bg-card)] hover:bg-[var(--ha-bg-hover)]"
                          }`}
                        >
                          <td className="px-4 py-3.5 align-top" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCandidate(record.id)}
                              className="size-4 rounded border-[var(--ha-line)] text-[var(--ha-accent)] focus:ring-[var(--ha-accent)]"
                              aria-label={`选择 ${record.name || record.chineseName}`}
                            />
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            <div className="font-semibold text-[var(--ha-ink)]">{record.name || record.chineseName}</div>
                            <div className="mt-1 font-mono text-[10.5px] text-[var(--ha-ink-3)]">#{record.id}</div>
                            {record.hasNotes ? (
                              <span className="mt-2 inline-flex rounded bg-[var(--ha-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ha-accent)]">
                                有备注
                              </span>
                            ) : null}
                          </td>
                          <td className="max-w-[280px] px-4 py-3.5 align-top">
                            <div className="line-clamp-1 font-medium text-[var(--ha-ink-1)]">{record.companyName || "未填公司"}</div>
                            <div className="mt-1 line-clamp-1 text-xs text-[var(--ha-ink-2)]">{record.title || record.firstExperienceTitle}</div>
                            <div className="mt-1 line-clamp-1 text-[11px] text-[var(--ha-ink-3)]">{record.functionPath || "未填职能路径"}</div>
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            <div className="flex items-center gap-1.5 text-[var(--ha-ink-1)]">
                              <Phone size={12} className="text-[var(--ha-ink-3)]" />
                              {record.mobile || "未填"}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ha-ink-2)]">
                              <Mail size={12} className="text-[var(--ha-ink-3)]" />
                              <span className="max-w-[160px] truncate">{record.email || "未填"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 align-top text-[var(--ha-ink-1)]">
                            {record.age ?? "未填"} <span className="text-xs text-[var(--ha-ink-3)]">{record.gender}</span>
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            <div className="text-[var(--ha-ink-1)]">{formatNumber(record.annualSalary)}</div>
                            <div className="mt-1 text-xs text-[var(--ha-ink-3)]">期望 {record.expectedSalary || "未填"}</div>
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            <span className="inline-flex rounded-md border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ha-ink-2)]">
                              {record.source || "未填"}
                            </span>
                            <div className="mt-1 text-xs text-[var(--ha-ink-3)]">{record.status || "未填状态"}</div>
                          </td>
                          <td className="px-4 py-3.5 align-top text-xs text-[var(--ha-ink-3)]">
                            {record.logUpdateDate ? (
                              <div className="font-semibold text-[var(--ha-accent)]">日志 {formatDate(record.logUpdateDate)}</div>
                            ) : null}
                            <div className="mt-0.5">更新 {formatDate(record.lastUpdateDate)}</div>
                            <div className="mt-0.5">联系 {formatDate(record.lastContactDate)}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-[var(--ha-ink-2)] mt-2">
              <div>
                第 {data?.page ?? page} / {data?.totalPages ?? 1} 页 · 共 {statLabel(data?.total ?? 0)} 条命中记录
              </div>
              <div className="flex items-center gap-1.5">
                <span>每页显示</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-7 rounded border border-[var(--ha-line)] bg-[var(--ha-bg-card)] px-1.5 outline-none font-semibold text-[var(--ha-ink-1)]"
                >
                  {pageSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span>条</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="rail flex flex-col h-full overflow-hidden">
        {!railExpanded ? (
          <button
            type="button"
            className="rail-expand"
            onClick={() => setRailExpanded(true)}
            title="展开右侧看板"
            aria-label="展开右侧看板"
          >
            <PanelLeftOpen size={15} />
          </button>
        ) : (
          <>
            <div className="rail-tabs">
              {selected && (
                <button
                  type="button"
                  className={`rail-tab ${railTab === "detail" ? "active" : ""}`}
                  onClick={() => setRailTab("detail")}
                >
                  <UserRound size={13} />
                  候选人详情
                </button>
              )}
              <button
                type="button"
                className={`rail-tab ${railTab === "stats" || !selected ? "active" : ""}`}
                onClick={() => setRailTab("stats")}
              >
                <Database size={13} />
                数据库统计
              </button>
              <button
                type="button"
                className="rail-collapse"
                onClick={() => setRailExpanded(false)}
                title="收起右侧看板"
                aria-label="收起右侧看板"
              >
                <PanelLeftClose size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {railTab === "stats" || !selected ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-[var(--ha-ink)]">人才库整体指标</h3>
                    <p className="mt-1 text-xs text-[var(--ha-ink-3)]">全局统计与匹配数据概要</p>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <Metric label="总记录" value={statLabel(metadata?.total ?? 0)} icon={UsersRound} />
                      <Metric label="当前命中" value={statLabel(data?.total ?? 0)} icon={Search} />
                      <Metric label="有备注" value={statLabel(matched?.withNotes ?? metadata?.withNotes ?? 0)} icon={FileText} />
                      <Metric label="深度详情" value={statLabel(metadata?.withDeepDetail ?? 0)} icon={BriefcaseBusiness} />
                    </div>
                  </div>

                  {selected ? (
                    <button
                      type="button"
                      onClick={() => setRailTab("detail")}
                      className="w-full btn btn-outline"
                    >
                      返回查看候选人 #{selected.id} {selected.name || selected.chineseName}
                    </button>
                  ) : (
                    <div className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-5 text-center text-xs text-[var(--ha-ink-3)]">
                      请在左侧列表中点击候选人查看详细信息并执行“查看完整简历”等操作。
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-[var(--ha-ink)]">{selected.name || selected.chineseName}</h3>
                        <p className="mt-1 text-sm text-[var(--ha-ink-2)]">{selected.title || "未填职位"}</p>
                      </div>
                      <span className="shrink-0 rounded bg-[var(--ha-ink-1)] px-2 py-0.5 font-mono text-[11px] text-[var(--ha-bg)]">
                        #{selected.id}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openFullProfile(selected)}
                      className="mt-4 w-full btn btn-accent"
                    >
                      <FileText size={14} />
                      查看完整简历
                    </button>
                  </div>

                  <dl className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-3 divide-y divide-[var(--ha-line-soft)]">
                    <DetailLine label="公司" value={selected.companyName} />
                    <DetailLine label="英文名" value={selected.englishName} />
                    <DetailLine label="手机" value={selected.mobile} />
                    <DetailLine label="邮箱" value={selected.email} />
                    <DetailLine label="年龄 / 性别" value={`${selected.age ?? "未填"} / ${selected.gender}`} />
                    <DetailLine label="当前年薪" value={formatNumber(selected.annualSalary)} />
                    <DetailLine label="期望薪资" value={selected.expectedSalary} />
                    <DetailLine label="薪酬明细" value={selected.compensationDetail} />
                    <DetailLine label="职能路径" value={selected.functionPath} />
                    <DetailLine label="职能编码" value={selected.functionCodes.join(", ")} />
                    <DetailLine label="城市编码" value={selected.cityCodes.join(", ")} />
                    <DetailLine label="行业编码" value={selected.industryCodes.join(", ")} />
                    <DetailLine
                      label="履历结构"
                      value={`${selected.experienceCount} 段经历 · ${selected.educationCount} 段教育 · ${selected.projectCount} 个项目 · ${selected.languageCount} 项语言`}
                    />
                    <DetailLine label="来源 / 状态" value={`${selected.source || "未填"} / ${selected.status || "未填"}`} />
                    <DetailLine label="新增时间" value={formatDate(selected.dateAdded)} />
                    <DetailLine label="最后联系" value={formatDate(selected.lastContactDate)} />
                    <DetailLine label="最后更新" value={formatDate(selected.lastUpdateDate)} />
                    {selected.logUpdateDate && <DetailLine label="日志更新" value={formatDate(selected.logUpdateDate)} />}
                  </dl>

                  <section className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-4 shadow-sm space-y-2">
                    <div className="flex items-center gap-1.5 text-[var(--ha-ink-2)] border-b border-[var(--ha-line-soft)] pb-2">
                      <CalendarClock size={14} />
                      <h3 className="text-xs font-bold uppercase tracking-wider">备注摘要</h3>
                    </div>
                    {selected.notes.length ? (
                      <div className="space-y-2 pt-1">
                        {selected.notes.map((note, index) => (
                          <p
                            key={`${selected.id}-${index}`}
                            className="whitespace-pre-wrap rounded-md border border-[var(--ha-warn)]/20 bg-[var(--ha-warn-soft)] p-2.5 text-xs leading-normal text-[var(--ha-ink-1)]"
                          >
                            {note}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="pt-1 text-xs text-[var(--ha-ink-3)]">
                        暂无顾问备注。
                      </p>
                    )}
                  </section>

                  <section className="rounded-lg border border-[var(--ha-line)] bg-[var(--ha-bg-card)] p-4 shadow-sm space-y-2">
                    <div className="flex items-center gap-1.5 text-[var(--ha-ink-2)] border-b border-[var(--ha-line-soft)] pb-2">
                      <Building2 size={14} />
                      <h3 className="text-xs font-bold uppercase tracking-wider">职能标签</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selected.functionTags.length ? (
                        selected.functionTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded border border-[var(--ha-line)] bg-[var(--ha-bg-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ha-ink-2)]"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--ha-ink-3)]">暂无职能标签</span>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </main>
  );
}
