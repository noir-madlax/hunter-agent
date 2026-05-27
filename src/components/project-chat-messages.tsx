import type { ReactNode } from "react";
import { Check, ChevronRight, ClipboardList, Loader2, Search, Sparkles, X } from "lucide-react";

import type {
  AgentLoopTask,
  AgentRunPayload,
  FollowUpOption,
  FollowUpQuestion,
  ReasoningStepStatus,
} from "@/components/project-chat-types";
import { AnimatedMarkdownText } from "@/components/project-chat-markdown";

export function Message({
  role,
  title,
  time = "",
  timestamp,
  children,
}: {
  role: "agent" | "user" | "system";
  title?: string;
  time?: string;
  timestamp?: string;
  children: ReactNode;
}) {
  const roleClass = role === "system" ? "ctx" : role;
  const roleLabel = role === "system" ? "system" : role === "agent" ? "assistant" : "you";
  const entryClass = role === "system" ? "entry context" : `entry ${role}`;

  return (
    <div className={entryClass}>
      <div className="entry-gutter">
        <span className={`role ${roleClass}`}>{roleLabel}</span>
        {timestamp ? (
          <span className="entry-time" suppressHydrationWarning>
            {timestamp}
          </span>
        ) : null}
        {time ? <span className="entry-phase">{time}</span> : null}
      </div>
      <div className="entry-body">
        {title ? <div className="entry-title">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

export type ToolCardStatus = "running" | "done" | "failed" | "pending";

export function ToolCard({
  title,
  tool,
  status,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  tool?: string;
  status: ToolCardStatus;
  summary?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const statusIcon =
    status === "running" ? (
      <Loader2 className="spin" size={12} />
    ) : status === "done" ? (
      <Check size={12} />
    ) : status === "failed" ? (
      <X size={12} />
    ) : null;

  const hasBody = Boolean(children);

  return (
    <details className={`tool-card tool-card-${status}`} open={defaultOpen && hasBody}>
      <summary className="tool-card-head">
        <span className={`tool-card-status tool-card-status-${status}`}>{statusIcon}</span>
        <span className="tool-card-title">{title}</span>
        {tool ? <span className="tool-card-tool">{tool}</span> : null}
        {summary ? <span className="tool-card-summary">{summary}</span> : null}
        {hasBody ? <ChevronRight size={12} className="tool-card-chevron" /> : null}
      </summary>
      {hasBody ? <div className="tool-card-body">{children}</div> : null}
    </details>
  );
}

export function LoadingLine({ text }: { text: string }) {
  return (
    <div className="transcript-loading">
      <Loader2 className="spin" size={14} />
      <span>{text}</span>
    </div>
  );
}

export function statusText(status: string) {
  if (status === "done") return "成功";
  if (status === "active" || status === "in_progress") return "进行中";
  if (status === "failed") return "失败";
  if (status === "waiting_user") return "待用户";
  if (status === "manual_required") return "待人工";
  return status || "Pending";
}

export function evidenceSourceLabel(sourceType: string) {
  if (sourceType === "talent_db") return "资料库";
  if (sourceType === "company_similarity") return "相似公司";
  if (sourceType === "deep_research") return "Research";
  if (sourceType === "client_gap") return "待确认";
  if (sourceType === "longlist_quality_audit") return "质量审计";
  return sourceType || "引用";
}

export function ThinkingReferences({
  skills,
  research,
  sources,
}: {
  skills: string[];
  research: string[];
  sources: string[];
}) {
  const visibleSkills = skills.slice(0, 6);
  const visibleResearch = research.slice(0, 5);
  const visibleSources = sources.slice(0, 6);

  if (!visibleSkills.length && !visibleResearch.length && !visibleSources.length) return null;

  return (
    <div className="thinking-references">
      {visibleSkills.length ? (
        <div className="thinking-ref-section">
          <div className="thinking-ref-title">
            <Sparkles size={13} />
            Agent skills
          </div>
          <div className="thinking-skill-row">
            {visibleSkills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </div>
      ) : null}
      {visibleResearch.length ? (
        <div className="thinking-ref-section">
          <div className="thinking-ref-title">
            <Search size={13} />
            搜索 / Research 线索
          </div>
          <ul className="thinking-ref-list">
            {visibleResearch.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {visibleSources.length ? (
        <div className="thinking-ref-section">
          <div className="thinking-ref-title">
            <ClipboardList size={13} />
            资料库 / 项目引用
          </div>
          <ul className="thinking-ref-list">
            {visibleSources.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AgentRunTrace({ run, defaultOpen = false }: { run: AgentRunPayload; defaultOpen?: boolean }) {
  const steps = run.steps.slice(0, 8);
  const evidences = run.evidences.slice(0, 6);
  if (!steps.length && !evidences.length) return null;

  return (
    <details className="thinking-panel completed" open={defaultOpen}>
      <summary className="thinking-head">
        <span>
          <Sparkles size={14} />
          Thinking process
        </span>
        <small>{steps.length} steps · {evidences.length} citations</small>
      </summary>
      <div className="thinking-content">
        {steps.length ? (
          <div className="thinking-section">
            <div className="thinking-section-title">流程</div>
            <ul className="reasoning-steps">
              {steps.map((step) => (
                <li key={step.id} className={step.status}>
                  <span className="reasoning-dot" />
                  <div>
                    <div className="reasoning-label">
                      {step.skillName}
                      <span className="thinking-status">{statusText(step.status)}</span>
                    </div>
                    <div className="reasoning-detail">
                      {typeof step.output === "object" && step.output
                        ? Object.entries(step.output)
                            .slice(0, 2)
                            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.length : String(value).slice(0, 80)}`)
                            .join(" · ")
                        : "步骤已完成。"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {evidences.length ? (
          <div className="thinking-section">
            <div className="thinking-section-title">引用</div>
            <ul className="thinking-citation-list">
              {evidences.map((evidence) => (
                <li key={evidence.id}>
                  <span>{evidenceSourceLabel(evidence.sourceType)}</span>
                  <div>
                    <strong>{evidence.sourceName || "未命名来源"}</strong>
                    <p>{evidence.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function ReasoningProcess({
  steps,
  active,
  summary,
  skills,
  sources,
  research,
}: {
  steps: Array<{ label: string; detail: string; status: ReasoningStepStatus }>;
  active: boolean;
  skills: string[];
  sources: string[];
  research: string[];
  summary?: string;
}) {
  if (!active) return null;

  const visibleSteps = steps.slice(0, 6);

  return (
    <Message role="agent" title="正在处理" time="loading">
      <details className="thinking-panel live" open>
        <summary className="thinking-head">
          <span>
            <Loader2 className="spin" size={14} />
            Thinking
          </span>
          <small>{summary || "正在更新项目上下文"}</small>
        </summary>
        <div className="thinking-content">
          <div className="thinking-section">
            <LoadingLine text={summary || "正在更新项目上下文"} />
            {visibleSteps.length ? (
              <ul className="reasoning-steps">
                {visibleSteps.map((step) => (
                  <li key={step.label} className={step.status}>
                    <span className="reasoning-dot" />
                    <div>
                      <div className="reasoning-label">
                        {step.label}
                        <span className="thinking-status">{statusText(step.status)}</span>
                      </div>
                      <div className="reasoning-detail">{step.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <ThinkingReferences skills={skills} research={research} sources={sources} />
        </div>
      </details>
    </Message>
  );
}

export function AgentLoopProcess({ tasks, answer, active }: { tasks: AgentLoopTask[]; answer: string; active: boolean }) {
  if (!tasks.length && !answer) return null;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const activeTask = tasks.find((task) => task.status === "active");

  function taskStatus(task: AgentLoopTask): ToolCardStatus {
    if (task.status === "active") return "running";
    if (task.status === "done") return "done";
    if (task.status === "failed") return "failed";
    return "pending";
  }

  return (
    <>
      <Message role="agent" title="Thinking" time={active ? "loading" : failedCount ? "needs-review" : "done"}>
        <div className="agent-loop-cards">
          <div className="agent-loop-meta">
            {active ? <Loader2 className="spin" size={13} /> : <Sparkles size={13} />}
            <span>Agent loop</span>
            <small>
              {activeTask ? `${activeTask.label} 进行中` : `${doneCount} 成功${failedCount ? ` · ${failedCount} 失败` : ""}`}
            </small>
          </div>
          {tasks.map((task) => (
            <ToolCard
              key={task.id}
              title={task.label}
              tool={task.tool}
              status={taskStatus(task)}
              summary={task.result ? task.result.split("\n")[0].slice(0, 80) : task.status === "active" ? "执行中" : "等待执行"}
              defaultOpen={task.status === "active"}
            >
              {task.result ? <div className="tool-card-result">{task.result}</div> : null}
            </ToolCard>
          ))}
        </div>
      </Message>
      {answer ? (
        <Message role="agent" title="Answer" time={active ? "loading" : "done"}>
          <AnimatedMarkdownText content={answer} enabled streaming={active} animate={!active} />
        </Message>
      ) : null}
    </>
  );
}

export function QuestionPrompt({
  prompt,
  compact = false,
  onUseOption,
  onFreeform,
}: {
  prompt: FollowUpQuestion;
  compact?: boolean;
  onUseOption: (option: FollowUpOption) => void;
  onFreeform: () => void;
}) {
  return (
    <div className={`question-prompt ${compact ? "compact" : ""}`}>
      <div className="question-kicker">
        <Sparkles size={13} />
        <span>{prompt.eyebrow}</span>
      </div>
      <div className="question-title">{prompt.question}</div>
      <p>{prompt.reason}</p>
      <div className="question-options">
        {prompt.options.map((option, idx) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onUseOption(option)}
            title={idx < 9 ? `按 ${idx + 1} 选择` : undefined}
          >
            {idx < 9 ? <span className="question-chip-number">{idx + 1}</span> : null}
            {option.label}
          </button>
        ))}
        <button type="button" className="manual" onClick={onFreeform} title="Esc 取消，回到输入">
          <span className="question-chip-number">⌫</span>
          手动输入
        </button>
      </div>
    </div>
  );
}
