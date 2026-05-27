import { stageLabels } from "@/components/project-chat-types";
import type { FunnelStage, ProjectPayload } from "@/components/project-chat-types";

export function FunnelStrip({
  project,
  activeStage,
  onSelect,
}: {
  project: ProjectPayload;
  activeStage: FunnelStage;
  onSelect: (stage: FunnelStage) => void;
}) {
  const steps: Array<{ key: FunnelStage; label: string; value: string; count: number }> = [
    { key: "job_brief", label: "Profile", value: "JD", count: 1 },
    { key: "longlist", label: "Longlist", value: "Pool", count: project.stats.longlistCount },
    { key: "screening", label: "Screening", value: "Scored", count: project.stats.screenedCount },
    { key: "shortlist", label: "Shortlist", value: "Human", count: project.stats.shortlistCount },
    { key: "reports", label: "Report", value: "Draft", count: project.reports.length },
  ];

  return (
    <div className="funnel" role="tablist" aria-label="项目漏斗">
      {steps.map((step) => {
        const isActive = activeStage === step.key;
        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "step" : undefined}
            className={`funnel-step ${isActive ? "active" : ""}`}
            onClick={() => onSelect(step.key)}
            title={stageLabels[step.key] || step.label}
          >
            <div className="label">{step.label}</div>
            <div className="value">
              <span className="num">{step.count}</span>
              <span>{step.value}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
