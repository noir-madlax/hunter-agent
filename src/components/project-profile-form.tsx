"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, Building2, Loader2, MapPin, RotateCcw, UserRound } from "lucide-react";

type ProfileDraft = {
  projectName: string;
  clientCompany: string;
  roleTitle: string;
  location: string;
  salaryBudget: string;
  reportingLine: string;
  businessContext: string;
  responsibilities: string;
  mustHave: string;
  niceToHave: string;
  exclusions: string;
  notes: string;
};

const initialDraft: ProfileDraft = {
  projectName: "",
  clientCompany: "",
  roleTitle: "",
  location: "",
  salaryBudget: "",
  reportingLine: "",
  businessContext: "",
  responsibilities: "",
  mustHave: "",
  niceToHave: "",
  exclusions: "",
  notes: "",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="profile-field">
      <span>
        {label}
        {required ? <b>*</b> : null}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="profile-field">
      <span>{label}</span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function ProjectProfileForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawInput = useMemo(() => {
    return [
      `项目名称：${draft.projectName || `${draft.clientCompany} ${draft.roleTitle}`.trim() || "新招聘项目"}`,
      `客户公司：${draft.clientCompany || "待确认"}`,
      `岗位名称：${draft.roleTitle || "待确认"}`,
      `地点/工作模式：${draft.location || "待确认"}`,
      `薪酬预算：${draft.salaryBudget || "待确认"}`,
      `汇报线：${draft.reportingLine || "待确认"}`,
      `业务背景：${draft.businessContext || "待确认"}`,
      `职责范围：${draft.responsibilities || "待确认"}`,
      `Must-have：${draft.mustHave || "待确认"}`,
      `Nice-to-have：${draft.niceToHave || "待确认"}`,
      `排除项：${draft.exclusions || "待确认"}`,
      `补充备注：${draft.notes || "无"}`,
    ].join("\n");
  }, [draft]);

  const canSubmit = Boolean(draft.clientCompany.trim() && draft.roleTitle.trim() && draft.businessContext.trim());

  function update<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function createProject() {
    if (!canSubmit) {
      setError("请至少填写客户公司、岗位名称和业务背景。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "项目创建失败");
      router.push(`/projects/${payload.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目创建失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="profile-page">
      <aside className="profile-side">
        <div className="brand">
          <div className="brand-mark">H</div>
          <div>
            <div className="brand-title">Hunter Agent</div>
            <div className="brand-sub">new project profile</div>
          </div>
        </div>
        <div className="profile-steps">
          <div className="active">
            <BriefcaseBusiness size={15} />
            项目 Profile
          </div>
          <div>
            <UserRound size={15} />
            人才画像
          </div>
          <div>
            <MapPin size={15} />
            搜索策略
          </div>
        </div>
      </aside>

      <section className="profile-main">
        <header className="profile-header">
          <div>
            <p>New Project</p>
            <h1>填写项目 Profile</h1>
          </div>
          <button type="button" onClick={createProject} disabled={!canSubmit || loading} className="profile-submit">
            {loading ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}
            创建项目
          </button>
        </header>

        {error ? (
          <div className="profile-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" onClick={createProject} disabled={!canSubmit || loading}>
              {loading ? <Loader2 className="spin" size={14} /> : <RotateCcw size={14} />}
              重试
            </button>
          </div>
        ) : null}

        <div className="profile-form">
          <section>
            <div className="profile-section-title">
              <Building2 size={16} />
              基本信息
            </div>
            <div className="profile-grid">
              <Field label="项目名称" value={draft.projectName} onChange={(value) => update("projectName", value)} placeholder="可留空，系统自动生成" />
              <Field label="客户公司" required value={draft.clientCompany} onChange={(value) => update("clientCompany", value)} placeholder="例如：依视路陆逊梯卡" />
              <Field label="岗位名称" required value={draft.roleTitle} onChange={(value) => update("roleTitle", value)} placeholder="例如：Commercial HRBP" />
              <Field label="地点/工作模式" value={draft.location} onChange={(value) => update("location", value)} placeholder="例如：上海 onsite" />
              <Field label="薪酬预算" value={draft.salaryBudget} onChange={(value) => update("salaryBudget", value)} placeholder="例如：40-50w/年" />
              <Field label="汇报线" value={draft.reportingLine} onChange={(value) => update("reportingLine", value)} placeholder="例如：汇报给 HRD / GM" />
            </div>
          </section>

          <section>
            <div className="profile-section-title">
              <BriefcaseBusiness size={16} />
              岗位 Profile
            </div>
            <TextField label="业务背景" value={draft.businessContext} onChange={(value) => update("businessContext", value)} placeholder="说明团队、业务变化、招聘原因、关键上下文。" />
            <TextField label="职责范围" value={draft.responsibilities} onChange={(value) => update("responsibilities", value)} placeholder="一行一个职责，或直接粘贴客户原文。" />
            <TextField label="Must-have" value={draft.mustHave} onChange={(value) => update("mustHave", value)} placeholder="一行一个硬性要求。" />
            <TextField label="Nice-to-have" value={draft.niceToHave} onChange={(value) => update("niceToHave", value)} placeholder="一行一个加分项。" rows={3} />
            <TextField label="排除项/风险信号" value={draft.exclusions} onChange={(value) => update("exclusions", value)} placeholder="例如：不接受纯 COE、英文弱、不接受 onsite。" rows={3} />
            <TextField label="补充备注" value={draft.notes} onChange={(value) => update("notes", value)} placeholder="客户口头信息、待确认问题、领导偏好等。" rows={3} />
          </section>
        </div>
      </section>
    </main>
  );
}
