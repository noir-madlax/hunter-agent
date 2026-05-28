"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  AlertTriangle,
  BriefcaseBusiness,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";

import { classifyProjectGaps } from "@/lib/intake-gaps";
import { FeedbackLoopsClient } from "@/app/projects/[id]/feedback-loops/feedback-loops-client";

import {
  CREATION_LOOP_STORAGE_KEY,
  recommendationWeight,
  stageLabels,
} from "@/components/project-chat-types";
import type {
  AgentLoopTask,
  CandidateProfilePayload,
  ConversationEntry,
  FailedInsightRetry,
  FollowUpOption,
  FollowUpQuestion,
  FunnelStage,
  ProjectCandidate,
  ProjectCreationStreamEvent,
  ProjectInsightStreamEvent,
  ProjectOption,
  ProjectPayload,
} from "@/components/project-chat-types";

import {
  cleanFetchInput,
  fetchWithTimeout,
  formatCandidateJudgementInsight,
  formatDate,
  formatDateTime,
  readStageFromUrl,
  scoreBandPillClass,
  timeValue,
  toFunnelStage,
  truncateMessagePreview,
} from "@/components/project-chat-utils";

import {
  BoardCard,
  LonglistSegment,
  ProjectBadge,
  QualityReviewBlock,
  ScreeningSegment,
  SmallList,
} from "@/components/project-chat-rail-cards";

import {
  AnimatedMarkdownText,
  CollapsibleMarkdownText,
  MarkdownText,
  markdownBullets,
  markdownValue,
} from "@/components/project-chat-markdown";

import {
  buildLonglistQualityReview,
  candidateCompany,
  candidateDisplayName,
  candidateOneLine,
  candidatePersolId,
  candidateScore,
  candidateTitle,
  judgeQueueReason,
  screeningOneLine,
  segmentCandidates,
  segmentScreenedCandidates,
} from "@/components/project-chat-candidate-utils";

import { CandidateProfileDrawer } from "@/components/project-chat-candidate-drawer";
import { FunnelStrip } from "@/components/project-chat-funnel";
import { ConfirmDialog } from "@/components/project-chat-confirm-dialog";
import {
  AgentLoopProcess,
  AgentRunTrace,
  LoadingLine,
  Message,
  QuestionPrompt,
  ReasoningProcess,
  evidenceSourceLabel,
  statusText,
} from "@/components/project-chat-messages";

export function ProjectChatWorkspace({
  initialProjectId,
  initialProject,
  initialProjects,
  initialNewProjectMode,
}: {
  initialProjectId?: string;
  initialProject?: ProjectPayload | null;
  initialProjects?: ProjectOption[];
  initialNewProjectMode?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectOption[]>(initialProjects || []);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || initialProject?.id || "");
  const [project, setProject] = useState<ProjectPayload | null>(initialProject || null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [activeStage, setActiveStage] = useState<FunnelStage>("job_brief");
  const [railTab, setRailTab] = useState<"context" | "candidates" | "feedback">("context");
  const [composerMenu, setComposerMenu] = useState<"commands" | "mentions" | null>(null);
  const [composerMenuIndex, setComposerMenuIndex] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [railExpanded, setRailExpanded] = useState(true);
  const [newProjectModeState, setNewProjectMode] = useState(Boolean(initialNewProjectMode));
  const [loadingProjects, setLoadingProjects] = useState(!initialProjects?.length);
  const [loadingProject, setLoadingProject] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingInsightCount, setPendingInsightCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<ProjectCandidate | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfilePayload | null>(null);
  const [candidateProfileLoading, setCandidateProfileLoading] = useState(false);
  const [candidateProfileError, setCandidateProfileError] = useState<string | null>(null);
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const [draftClarifications, setDraftClarifications] = useState<ConversationEntry[]>([]);
  const [streamStatusMessages, setStreamStatusMessages] = useState<string[]>([]);
  const [creationLoopTasks, setCreationLoopTasks] = useState<AgentLoopTask[]>([]);
  const [creationAnswer, setCreationAnswer] = useState("");
  const [submittedDraftTitle, setSubmittedDraftTitle] = useState("");
  const [failedInsightRetry, setFailedInsightRetry] = useState<FailedInsightRetry | null>(null);
  const [liveAgentRunId, setLiveAgentRunId] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const feedWrapRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollFeedRef = useRef(true);
  const autoScannedProjectIdsRef = useRef<Set<string>>(new Set());
  const hydratedProjectRefreshRef = useRef<Set<string>>(new Set());
  const lastSeenAgentRunIdRef = useRef(initialProject?.agentRuns?.[0]?.id || "");
  const creationLoopTasksRef = useRef<AgentLoopTask[]>([]);
  const creationAnswerRef = useRef("");
  const activeStageProjectRef = useRef("");
  const activeStageStorageKey = selectedProjectId ? `hunter-agent:${selectedProjectId}:active-stage` : "";
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [markdownMode, setMarkdownMode] = useState(true);
  const [actionElapsedSeconds, setActionElapsedSeconds] = useState(0);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [judgingCandidateId, setJudgingCandidateId] = useState<string | null>(null);

  const isFeedNearBottom = useCallback(() => {
    const feed = feedWrapRef.current;
    if (!feed) return true;
    return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 96;
  }, []);

  const scrollFeedToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const feed = feedWrapRef.current;
    if (!feed) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior });
    shouldAutoScrollFeedRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const handleFeedScroll = useCallback(() => {
    const nearBottom = isFeedNearBottom();
    shouldAutoScrollFeedRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, [isFeedNearBottom]);

  const resizeComposer = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, []);
  const latestAgentRunId = project?.agentRuns?.[0]?.id || "";
  const projectCandidateCount = project?.candidates.length || 0;
  const projectMemoryCount = project?.projectMemories.length || 0;
  const projectReportCount = project?.reports.length || 0;
  const projectLonglistCount = project?.stats.longlistCount || 0;
  const projectRiskCount = project?.stats.riskCount || 0;
  const projectScreenedCount = project?.stats.screenedCount || 0;
  const projectShortlistCount = project?.stats.shortlistCount || 0;
  const urlNewProjectMode = initialNewProjectMode || searchParams.get("new") === "1";
  const newProjectMode = newProjectModeState || urlNewProjectMode;

  const updateProjectState = useCallback((nextProject: ProjectPayload, options?: { animateLatestRun?: boolean }) => {
    const nextRunId = nextProject.agentRuns?.[0]?.id || "";
    if (options?.animateLatestRun && nextRunId && nextRunId !== lastSeenAgentRunIdRef.current) {
      setLiveAgentRunId(nextRunId);
    } else if (!options?.animateLatestRun) {
      setLiveAgentRunId("");
    }
    lastSeenAgentRunIdRef.current = nextRunId;
    setProject(nextProject);
  }, []);

  const openCandidateProfile = useCallback(async (candidate: ProjectCandidate) => {
    setSelectedCandidate(candidate);
    setCandidateProfile(null);
    setCandidateProfileError(null);

    const persolId = candidatePersolId(candidate);
    if (!persolId) {
      setCandidateProfileError("当前候选人缺少外部档案标识，只能查看项目内快照。");
      return;
    }

    setCandidateProfileLoading(true);
    try {
      const response = await fetchWithTimeout(`/api/persol-candidates/${persolId}`, undefined, 18000);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "候选人完整档案读取失败");
      setCandidateProfile(payload as CandidateProfilePayload);
    } catch (err) {
      setCandidateProfileError(err instanceof Error ? err.message : "候选人完整档案读取失败");
    } finally {
      setCandidateProfileLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/projects");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "项目列表读取失败");
      const nextProjects = payload.projects as ProjectOption[];
      setProjects(nextProjects);
      const fallbackProjectId = nextProjects[0]?.id || "";
      setSelectedProjectId((current) => {
        if (current && nextProjects.some((item) => item.id === current)) return current;
        if (initialProjectId && nextProjects.some((item) => item.id === initialProjectId)) return initialProjectId;
        return fallbackProjectId;
      });
      const isDraftRoute = new URLSearchParams(window.location.search).get("new") === "1";
      if (!initialProjectId && fallbackProjectId && !isDraftRoute && window.location.pathname === "/projects") {
        router.replace(`/projects/${fallbackProjectId}${window.location.search}`, { scroll: false });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目列表读取失败");
    } finally {
      setLoadingProjects(false);
    }
  }, [initialProjectId, router]);

  useEffect(() => {
    if (!urlNewProjectMode || newProjectModeState) return;
    setNewProjectMode(true);
    setConversationLog([]);
    setDraftClarifications([]);
    setCreationLoopTasks([]);
    setCreationAnswer("");
    setSubmittedDraftTitle("");
    setMessage("");
    window.requestAnimationFrame(resizeComposer);
    setError(null);
    setComposerMenu(null);
  }, [newProjectModeState, resizeComposer, urlNewProjectMode]);

  const loadProject = useCallback(async (id: string, options?: { silent?: boolean; animateLatestRun?: boolean }) => {
    if (!id) return;
    if (!options?.silent) setLoadingProject(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(`/api/projects/${id}`);
      const payload = await response.json();
      if (response.status === 404) {
        setProject(null);
        setSelectedProjectId("");
        router.replace("/projects", { scroll: false });
        return;
      }
      if (!response.ok) throw new Error(payload.error || "项目读取失败");
      const nextProject = payload.project as ProjectPayload;
      updateProjectState(nextProject, { animateLatestRun: options?.animateLatestRun });
      const queryStage = readStageFromUrl();
      const storedStage = window.localStorage.getItem(`hunter-agent:${nextProject.id}:active-stage`);
      const nextStage = toFunnelStage(queryStage || storedStage || nextProject.funnelStatus);
      setActiveStage(nextStage);
      setRailTab(nextStage === "job_brief" ? "context" : "candidates");
      activeStageProjectRef.current = nextProject.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目读取失败");
    } finally {
      if (!options?.silent) setLoadingProject(false);
    }
  }, [router, updateProjectState]);

  const scanLonglist = useCallback(async (id: string, silent = false) => {
    if (!id) return null;
    if (!silent) setActionLoading("longlist-scan");
    setError(null);
    try {
      // Persol 62k 全表扫 + LLM 评分链可能 30s-2min，禁用 12s 超时
      const response = await fetch(cleanFetchInput(`/api/projects/${id}/longlist/scan`), { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "人才库自动扫描失败");
      if (payload.project) updateProjectState(payload.project as ProjectPayload);
      await loadProjects();
      return payload as { added: number; updated: number; matched: number; project: ProjectPayload | null };
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "人才库自动扫描失败");
      return null;
    } finally {
      if (!silent) setActionLoading(null);
    }
  }, [loadProjects, updateProjectState]);

  useEffect(() => {
    if (!project || newProjectMode || project.id === activeStageProjectRef.current) return;
    const queryStage = readStageFromUrl();
    const storedStage = window.localStorage.getItem(`hunter-agent:${project.id}:active-stage`);
    const nextStage = toFunnelStage(queryStage || storedStage || project.funnelStatus);
    setActiveStage(nextStage);
    setRailTab(nextStage === "job_brief" ? "context" : "candidates");
    activeStageProjectRef.current = project.id;
  }, [newProjectMode, project]);

  useEffect(() => {
    if (!activeStageStorageKey || newProjectMode || !project || project.id !== selectedProjectId) return;
    window.localStorage.setItem(activeStageStorageKey, activeStage);

    const url = new URL(window.location.href);
    if (url.searchParams.get("stage") === activeStage) return;
    url.searchParams.set("stage", activeStage);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
  }, [activeStage, activeStageStorageKey, newProjectMode, project, router, selectedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!sidebarExpanded) setSidebarExpanded(true);
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarExpanded]);

  useEffect(() => {
    window.localStorage.setItem("hunter-agent:markdown-mode", markdownMode ? "on" : "off");
  }, [markdownMode]);

  useEffect(() => {
    window.localStorage.setItem("hunter-agent:rail-expanded", railExpanded ? "on" : "off");
  }, [railExpanded]);

  useEffect(() => {
    const stored = window.localStorage.getItem("hunter-agent:rail-expanded");
    if (stored === "off") setRailExpanded(false);
    const md = window.localStorage.getItem("hunter-agent:markdown-mode");
    if (md === "off") setMarkdownMode(false);
  }, []);

  useEffect(() => {
    creationLoopTasksRef.current = creationLoopTasks;
  }, [creationLoopTasks]);

  useEffect(() => {
    creationAnswerRef.current = creationAnswer;
  }, [creationAnswer]);

  useEffect(() => {
    if (!selectedProjectId || creationLoopTasks.length || creationAnswer) return;
    const raw = window.sessionStorage.getItem(CREATION_LOOP_STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as { projectId?: string; tasks?: AgentLoopTask[]; answer?: string; createdAt?: number };
      if (stored.projectId !== selectedProjectId) return;
      if (stored.createdAt && Date.now() - stored.createdAt > 10 * 60 * 1000) {
        window.sessionStorage.removeItem(CREATION_LOOP_STORAGE_KEY);
        return;
      }
      setCreationLoopTasks(stored.tasks || []);
      setCreationAnswer(stored.answer || "");
    } catch {
      window.sessionStorage.removeItem(CREATION_LOOP_STORAGE_KEY);
    }
  }, [creationAnswer, creationLoopTasks.length, selectedProjectId]);

  useEffect(() => {
    if (!actionLoading) {
      const resetTimer = window.setTimeout(() => setActionElapsedSeconds(0), 0);
      return () => window.clearTimeout(resetTimer);
    }

    const startedAt = Date.now();
    const resetTimer = window.setTimeout(() => setActionElapsedSeconds(0), 0);
    const timer = window.setInterval(() => {
      setActionElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(timer);
    };
  }, [actionLoading]);

  useEffect(() => {
    if (newProjectMode) return;
    const timer = window.setTimeout(() => {
      if (project?.id === selectedProjectId) return;
      if (selectedProjectId) void loadProject(selectedProjectId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProject, newProjectMode, project?.id, selectedProjectId]);

  useEffect(() => {
    if (newProjectMode || !selectedProjectId || loadingProject) return;
    if (hydratedProjectRefreshRef.current.has(selectedProjectId)) return;
    hydratedProjectRefreshRef.current.add(selectedProjectId);
    const timer = window.setTimeout(() => {
      void loadProject(selectedProjectId, { silent: true, animateLatestRun: true });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [loadProject, loadingProject, newProjectMode, selectedProjectId]);

  useEffect(() => {
    if (newProjectMode || !project || actionLoading) return;
    if (project.stats.longlistCount > 0 || autoScannedProjectIdsRef.current.has(project.id)) return;
    const hasLonglistSignals = Boolean(
      project.analysis.jobBrief.roleTitle ||
        project.analysis.searchMap.targetTitles.length ||
        project.analysis.talentPersona.mustHave.length,
    );
    if (!hasLonglistSignals) return;
    autoScannedProjectIdsRef.current.add(project.id);
    const timer = window.setTimeout(() => {
      void scanLonglist(project.id, true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [actionLoading, newProjectMode, project, scanLonglist]);

  useEffect(() => {
    resizeComposer();
  }, [message, newProjectMode, resizeComposer]);

  useEffect(() => {
    shouldAutoScrollFeedRef.current = true;
    const frame = window.requestAnimationFrame(() => scrollFeedToLatest("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [newProjectMode, scrollFeedToLatest, selectedProjectId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (shouldAutoScrollFeedRef.current || isFeedNearBottom()) {
        scrollFeedToLatest("smooth");
        return;
      }
      setShowJumpToLatest(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    actionLoading,
    conversationLog.length,
    draftClarifications.length,
    isFeedNearBottom,
    latestAgentRunId,
    loadingProject,
    projectCandidateCount,
    project?.id,
    projectLonglistCount,
    projectMemoryCount,
    projectReportCount,
    projectRiskCount,
    projectScreenedCount,
    projectShortlistCount,
    scrollFeedToLatest,
  ]);

  const filteredProjects = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return projects;
    return projects.filter((item) => [item.name, item.clientCompany, item.roleTitle].join(" ").toLowerCase().includes(text));
  }, [projects, query]);
  const draftCombinedInput = [message.trim(), ...draftClarifications.map((entry) => entry.content)].filter(Boolean).join("\n");
  const projectListCount = filteredProjects.length + (newProjectMode ? 1 : 0);
  const draftTitleSource = submittedDraftTitle || draftCombinedInput;
  const draftProjectTitle = draftTitleSource.trim().split(/\n/)[0]?.trim() || "未命名项目";
  const isCreatingDraftProject = actionLoading === "create-project";
  const draftProjectPill = isCreatingDraftProject ? "创建中" : "草稿";
  const draftProjectStatus = isCreatingDraftProject ? "Agent 正在创建项目 · 流程执行中" : "初始化对话 · 等待创建";
  const draftProjectMeta = isCreatingDraftProject ? `处理中 ${actionElapsedSeconds}s` : "未保存";

  const sortedCandidates = useMemo(() => {
    return [...(project?.candidates ?? [])].sort((a, b) => {
      const staleDelta = Number(a.status === "stale_scan") - Number(b.status === "stale_scan");
      if (staleDelta) return staleDelta;
      const recDelta = (recommendationWeight[b.screening?.recommendation || ""] ?? 0) - (recommendationWeight[a.screening?.recommendation || ""] ?? 0);
      if (recDelta) return recDelta;
      return candidateScore(b) - candidateScore(a);
    });
  }, [project]);

  const drawerNavigation: { index: number; total: number; hasPrev: boolean; hasNext: boolean; prev: ProjectCandidate | null; next: ProjectCandidate | null } = useMemo(() => {
    const list = sortedCandidates;
    const total = list.length;
    if (!selectedCandidate || total === 0) {
      return { index: -1, total, hasPrev: false, hasNext: false, prev: null as ProjectCandidate | null, next: null as ProjectCandidate | null };
    }
    const index = list.findIndex((item) => item.id === selectedCandidate.id);
    return {
      index,
      total,
      hasPrev: index > 0,
      hasNext: index >= 0 && index < total - 1,
      prev: index > 0 ? list[index - 1] : null,
      next: index >= 0 && index < total - 1 ? list[index + 1] : null,
    };
  }, [selectedCandidate, sortedCandidates]);

  useEffect(() => {
    if (!selectedCandidate) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || (target as HTMLElement).isContentEditable);
      if (event.key === "Escape") {
        setSelectedCandidate(null);
        return;
      }
      if (isTyping) return;
      if (event.key === "ArrowLeft" && drawerNavigation.prev) {
        event.preventDefault();
        void openCandidateProfile(drawerNavigation.prev);
      } else if (event.key === "ArrowRight" && drawerNavigation.next) {
        event.preventDefault();
        void openCandidateProfile(drawerNavigation.next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCandidate, drawerNavigation, openCandidateProfile]);

  const longlistQualityReview = useMemo(
    () => buildLonglistQualityReview(sortedCandidates, project?.analysis),
    [project?.analysis, sortedCandidates],
  );
  const longlistSegments = useMemo(
    () => segmentCandidates(sortedCandidates, longlistQualityReview),
    [longlistQualityReview, sortedCandidates],
  );
  const screeningSegments = useMemo(() => segmentScreenedCandidates(sortedCandidates), [sortedCandidates]);
  const judgeQueueCandidates = useMemo(() => {
    const source =
      activeStage === "screening"
        ? [...screeningSegments.judge, ...screeningSegments.hold]
        : [...longlistQualityReview.noiseRisks.map((item) => item.candidate), ...longlistSegments.phoneValidate];
    return source.filter((candidate, index, list) => list.findIndex((item) => item.id === candidate.id) === index).slice(0, 6);
  }, [activeStage, longlistQualityReview.noiseRisks, longlistSegments.phoneValidate, screeningSegments.hold, screeningSegments.judge]);

  const shortlist = sortedCandidates.filter((candidate) => candidate.funnelStatus === "shortlist");

  const currentOption = projects.find((item) => item.id === selectedProjectId);
  const analysis = project?.analysis;
  const isCreatingProjectFlow = newProjectMode && actionLoading === "create-project";
  const composerPlaceholder = newProjectMode
    ? "直接输入或粘贴客户给到的项目需求，例如：客户公司、岗位名称、地点、薪酬、业务背景、must-have、补充备注。"
    : "新的客户信息、候选人反馈、判断假设或对 Agent 的提问。发送后会写入项目认知，使用 / 触发命令、@ 提及候选人。";
  const sendLabel = newProjectMode ? "创建项目" : "发送";
  const canCreateProject = draftCombinedInput.length >= 8;
  const newProjectHref = "/projects?new=1";
  const composerModeLabel = newProjectMode ? "new-project" : "project-input";
  function changeStage(stage: FunnelStage) {
    setActiveStage(stage);
    setRailTab(stage === "job_brief" ? "context" : "candidates");
  }

  const commandItems = [
    { token: "/profile", label: "查看岗位画像" },
    { token: "/research", label: "查看右侧 Deep Research" },
    { token: "/longlist", label: "查看 Longlist" },
    { token: "/rescan", label: "重扫并审计 Longlist" },
    { token: "/screening", label: "查看 AI 初筛" },
    { token: "/shortlist", label: "查看 Shortlist" },
    { token: "/report", label: "查看推荐报告" },
    { token: "/run-screening", label: "开始/重跑 AI 评分" },
    { token: "/generate-report", label: "生成推荐报告" },
  ];
  const composerFollowUpQuestion = isCreatingProjectFlow
    ? null
    : newProjectMode
      ? message.trim().length >= 8
        ? getDraftFollowUpQuestion()
        : null
      : message.trim().length > 0 && message.trim().length < 80
        ? getProjectFollowUpQuestion()
        : null;

  const composerMenuOptions = useMemo<Array<{ key: string; label: string; sub: string; pick: () => void }>>(() => {
    if (!composerMenu || newProjectMode) return [];
    const query = currentTriggerToken();
    if (composerMenu === "commands") {
      const filtered = query
        ? commandItems.filter((command) =>
            command.token.toLowerCase().includes(query) || command.label.toLowerCase().includes(query),
          )
        : commandItems;
      return filtered.map((command) => ({
        key: command.token,
        label: command.token,
        sub: command.label,
        pick: () => runCommand(command),
      }));
    }
    const candidatePool = query
      ? sortedCandidates.filter((candidate) => {
          const haystack = `${candidate.name || ""} ${candidate.currentCompany || ""} ${candidate.currentTitle || ""}`.toLowerCase();
          return haystack.includes(query);
        })
      : sortedCandidates;
    return candidatePool.slice(0, 8).map((candidate) => ({
      key: candidate.id,
      label: `@${candidate.name || "未命名候选人"}`,
      sub: `${candidate.currentCompany || "未填公司"} · ${candidate.currentTitle || "未填职位"}`,
      pick: () => mentionCandidate(candidate),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerMenu, message, newProjectMode, sortedCandidates]);

  useEffect(() => {
    setComposerMenuIndex(0);
  }, [composerMenu, composerMenuOptions.length]);

  function openProject(id: string) {
    setNewProjectMode(false);
    setConversationLog([]);
    setDraftClarifications([]);
    setCreationLoopTasks([]);
    setCreationAnswer("");
    setSubmittedDraftTitle("");
    setSelectedProjectId(id);
    router.push(`/projects/${id}`);
  }

  function startNewProject() {
    setNewProjectMode(true);
    setConversationLog([]);
    setDraftClarifications([]);
    setCreationLoopTasks([]);
    setCreationAnswer("");
    setSubmittedDraftTitle("");
    updateComposerMessage("");
    setError(null);
    setComposerMenu(null);
    router.replace(newProjectHref, { scroll: false });
  }

  function exitNewProjectMode() {
    setNewProjectMode(false);
    setConversationLog([]);
    setDraftClarifications([]);
    setCreationLoopTasks([]);
    setCreationAnswer("");
    setSubmittedDraftTitle("");
    updateComposerMessage("");
    setError(null);
    if (selectedProjectId) {
      router.replace(`/projects/${selectedProjectId}`, { scroll: false });
    }
  }

  async function createProjectFromAgent() {
    if (!canCreateProject) {
      setError("请先输入至少一个可识别的项目线索，例如客户公司、岗位名称或业务背景。");
      return;
    }

    setActionLoading("create-project");
    setStreamStatusMessages(["已收到原始需求，正在解析岗位画像。"]);
    setCreationLoopTasks([]);
    setCreationAnswer("");
    setError(null);
    let createdProjectId = "";
    const rawInput = draftCombinedInput;
    setSubmittedDraftTitle(rawInput.trim().split(/\n/)[0]?.trim() || "未命名项目");
    appendUserMessage(message.trim(), "原始项目需求");
    try {
      const response = await fetch(cleanFetchInput("/api/parse-job"), {
        method: "POST",
        headers: { Accept: "application/x-ndjson", "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "项目创建失败");
      }

      if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
        const payload = await response.json();
        createdProjectId = payload.projectId;
        updateComposerMessage("");
        setNewProjectMode(false);
        setDraftClarifications([]);
        await loadProjects();
        setSelectedProjectId(payload.projectId);
        router.push(`/projects/${payload.projectId}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ProjectCreationStreamEvent;

          if (event.type === "task") {
            upsertCreationTask(event);
            setStreamStatusMessages((current) => [event.result || `${event.label}：${statusText(event.status)}`, ...current].filter(Boolean).slice(0, 5));
          }

          if (event.type === "project_created") {
            createdProjectId = event.projectId;
            updateComposerMessage("");
            setDraftClarifications([]);
            setSelectedProjectId(event.projectId);
            void loadProjects();
          }

          if (event.type === "project") {
            createdProjectId = event.project.id;
            updateProjectState(event.project, { animateLatestRun: true });
            void loadProjects();
          }

          if (event.type === "answer_delta") {
            createdProjectId = event.projectId;
            const next = creationAnswerRef.current + event.delta;
            creationAnswerRef.current = next;
            setCreationAnswer(next);
          }

          if (event.type === "answer") {
            createdProjectId = event.projectId;
            creationAnswerRef.current = event.message;
            setCreationAnswer(event.message);
            rememberCreationLoop(event.projectId, creationLoopTasksRef.current, event.message);
          }

          if (event.type === "done") {
            createdProjectId = event.projectId;
            rememberCreationLoop(event.projectId, creationLoopTasksRef.current, creationAnswerRef.current);
          }

          if (event.type === "error") {
            if (event.projectId) createdProjectId = event.projectId;
            throw new Error(event.message || "项目创建失败");
          }
        }

        if (done) break;
      }

      if (createdProjectId) {
        rememberCreationLoop(createdProjectId, creationLoopTasksRef.current, creationAnswerRef.current);
        setNewProjectMode(false);
        setDraftClarifications([]);
        setSelectedProjectId(createdProjectId);
        router.push(`/projects/${createdProjectId}?stage=job_brief`);
        window.setTimeout(() => void loadProject(createdProjectId, { silent: true, animateLatestRun: true }), 1200);
        window.setTimeout(() => void loadProjects(), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目创建失败");
    } finally {
      setActionLoading(null);
      window.setTimeout(() => setStreamStatusMessages([]), 1200);
    }
  }

  function deleteCurrentProject() {
    if (!project) return;
    setConfirmDeleteOpen(true);
  }

  async function performDeleteProject() {
    if (!project) return;
    setConfirmDeleteOpen(false);
    setActionLoading("delete-project");
    setError(null);
    try {
      const response = await fetchWithTimeout(`/api/projects/${project.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "项目删除失败");
      setProject(null);
      setSelectedProjectId("");
      await loadProjects();
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目删除失败");
    } finally {
      setActionLoading(null);
    }
  }

  async function runScreening() {
    if (!project) return;
    setActionLoading("screening");
    setError(null);
    try {
      // 50 候选 × LLM 串行可能跑 10+ 分钟，禁用 12s 超时；保持长连接直到后端返回
      const response = await fetch(cleanFetchInput(`/api/projects/${project.id}/screening/run`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rerun: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "初筛失败");
      await loadProject(project.id);
      await loadProjects();
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
    if (!project) return;
    setActionLoading(candidateId);
    setError(null);
    try {
      const response = await fetchWithTimeout(`/api/projects/${project.id}/shortlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: [candidateId], action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "shortlist 更新失败");
      await loadProject(project.id);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "shortlist 更新失败");
    } finally {
      setActionLoading(null);
    }
  }

  function judgeCandidate(candidate: ProjectCandidate, decision: "保留" | "降级" | "移出") {
    const label = `${candidate.name || "未命名候选人"} / ${candidate.currentCompany || "未填公司"} / ${candidate.currentTitle || "未填职位"}`;
    const reason =
      decision === "保留"
        ? "人工裁判：保留在当前项目，作为可继续验证候选人。"
        : decision === "降级"
          ? "人工裁判：降级为电话验证或备选，不应排在 Top 推荐位。"
          : "人工裁判：移出当前推荐判断，后续同类信号应降权。";
    const payload = {
      type: "candidate_judgement",
      decision,
      candidateId: candidate.id,
      externalCandidateId: candidate.externalCandidateId || candidate.snapshot?.id || "",
      name: candidate.name || candidate.snapshot?.name || "",
      company: candidate.currentCompany || candidate.snapshot?.companyName || "",
      title: candidate.currentTitle || candidate.snapshot?.title || candidate.snapshot?.firstExperienceTitle || "",
      reason,
    };
    setJudgingCandidateId(candidate.id);
    submitInsight(`${label}：${reason}\n\n候选人裁判JSON：${JSON.stringify(payload)}`, "候选人裁判");
    window.setTimeout(() => setJudgingCandidateId((current) => (current === candidate.id ? null : current)), 1500);
  }

  function toggleCandidateShortlist(candidate: ProjectCandidate) {
    void updateShortlist(candidate.id, candidate.funnelStatus === "shortlist" ? "remove" : "add");
  }

  async function generateReports() {
    if (!project) return;
    setActionLoading("reports");
    setError(null);
    try {
      // 多人报告生成可能 30s+；禁用 12s 超时
      const response = await fetch(cleanFetchInput(`/api/projects/${project.id}/reports`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: shortlist.map((candidate) => candidate.id) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "报告生成失败");
      updateProjectState(payload.project);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "报告生成失败");
    } finally {
      setActionLoading(null);
    }
  }

  function queueInsightWrite(projectId: string, cleanInsight: string) {
    setPendingInsightCount((current) => current + 1);
    setActionLoading("message");
    setStreamStatusMessages(["用户输入已进入对话，正在调用 LLM 更新项目认知。"]);
    setError(null);
    setFailedInsightRetry(null);
    window.setTimeout(() => {
      void persistInsight(projectId, cleanInsight);
    }, 0);
  }

  async function persistInsight(projectId: string, cleanInsight: string) {
    let keepReasoningVisible = false;
    try {
      const response = await fetch(cleanFetchInput(`/api/projects/${projectId}`), {
        method: "PATCH",
        headers: { Accept: "application/x-ndjson", "Content-Type": "application/json" },
        body: JSON.stringify({ insight: cleanInsight }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "项目更新失败");
      }

      if (response.body && response.headers.get("content-type")?.includes("application/x-ndjson")) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ProjectInsightStreamEvent;
            if (event.type === "error") throw new Error(event.message || "项目更新失败");
            if (event.type === "memory_saved" || event.type === "project") {
              updateProjectState(event.project, { animateLatestRun: true });
              void loadProjects();
            }
            if (event.type === "answer_delta") {
              setStreamStatusMessages((current) => {
                const head = current.slice(0, -1);
                const tail = (current[current.length - 1] || "") + event.delta;
                return [...head, tail].slice(-5);
              });
              continue;
            }
            setStreamStatusMessages((current) => [...current, event.message].filter(Boolean).slice(-5));
          }

          if (done) break;
        }
      } else {
        const payload = await response.json();
        updateProjectState(payload.project, { animateLatestRun: true });
        await loadProjects();
        keepReasoningVisible = payload.mode === "queued";
        if (keepReasoningVisible) {
          window.setTimeout(() => void loadProject(projectId, { silent: true, animateLatestRun: true }), 1800);
          window.setTimeout(() => void loadProject(projectId, { silent: true, animateLatestRun: true }), 5200);
          window.setTimeout(() => void loadProject(projectId, { silent: true, animateLatestRun: true }), 12000);
          window.setTimeout(() => void loadProjects(), 5200);
        }
      }
      setFailedInsightRetry(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "项目更新失败");
      setFailedInsightRetry({ projectId, insight: cleanInsight });
      setStreamStatusMessages((current) => [...current, err instanceof Error ? err.message : "项目更新失败"].slice(-5));
    } finally {
      const settle = () => {
        setPendingInsightCount((current) => {
          const next = Math.max(0, current - 1);
          if (next === 0) {
            setActionLoading(null);
            window.setTimeout(() => setStreamStatusMessages([]), 1200);
          }
          return next;
        });
      };
      if (keepReasoningVisible) {
        window.setTimeout(settle, 2600);
      } else {
        settle();
      }
    }
  }

  function submitInsight(insight: string, title: string) {
    if (!project || !analysis || !insight.trim()) return;
    const cleanInsight = insight.trim();
    appendUserMessage(cleanInsight, title);
    queueInsightWrite(project.id, cleanInsight);
  }

  function addInsight() {
    if (!project || !analysis || !message.trim()) return;
    const cleanMessage = message.trim();
    const directCommand = commandItems.find((command) => cleanMessage === command.token);
    if (directCommand) {
      updateComposerMessage("");
      setComposerMenu(null);
      executeCommandToken(directCommand.token);
      return;
    }
    const title = "项目输入";
    updateComposerMessage("");
    setComposerMenu(null);
    appendUserMessage(cleanMessage, title);
    queueInsightWrite(project.id, cleanMessage);
  }

  function focusComposer() {
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function updateComposerMessage(value: string) {
    setMessage(value);
    window.requestAnimationFrame(resizeComposer);
  }

  function appendUserMessage(content: string, title: string) {
    if (!content.trim()) return;
    const displayContent = formatCandidateJudgementInsight(content);
    setConversationLog((current) => [
      ...(current.at(-1)?.content === displayContent && current.at(-1)?.title === title
        ? current.slice(0, -1)
        : current),
      {
        id: `${Date.now()}-${current.length}`,
        content: displayContent,
        title,
        time: "now",
        timestamp: formatDateTime(),
      },
    ]);
  }

  function upsertCreationTask(event: Extract<ProjectCreationStreamEvent, { type: "task" }>) {
    setCreationLoopTasks((current) => {
      const nextTask: AgentLoopTask = {
        id: event.id,
        label: event.label,
        tool: event.tool,
        status: event.status,
        result: event.result || "",
      };
      const existingIndex = current.findIndex((task) => task.id === event.id);
      const nextTasks = existingIndex === -1 ? [...current, nextTask] : current.map((task, index) => (index === existingIndex ? { ...task, ...nextTask } : task));
      creationLoopTasksRef.current = nextTasks;
      return nextTasks;
    });
  }

  function rememberCreationLoop(projectId: string, tasks: AgentLoopTask[], answer: string) {
    if (!projectId || !tasks.length) return;
    window.sessionStorage.setItem(
      CREATION_LOOP_STORAGE_KEY,
      JSON.stringify({
        projectId,
        tasks,
        answer,
        createdAt: Date.now(),
      }),
    );
  }

  function classifyFollowUpSignal(signal: string) {
    const text = signal.toLowerCase();
    if (/客户|公司|client|company|企业/.test(text)) return "company";
    if (/岗位|职位|职级|title|role|position/.test(text)) return "role";
    if (/地点|城市|工作模式|办公|onsite|hybrid|remote|总部/.test(text)) return "location";
    if (/薪|预算|package|salary|compensation|年薪/.test(text)) return "salary";
    if (/汇报|上级|report|领导|决策|面试|负责人|stakeholder/.test(text)) return "reporting";
    if (/团队|部门|业务线|支持范围|人数|边界/.test(text)) return "team";
    if (/替代|新增|原因|背景|痛点|挑战|success|成功/.test(text)) return "background";
    if (/must|要求|画像|经验|能力|行业|英文/.test(text)) return "mustHave";
    return "generic";
  }

  function buildFollowUpQuestion(signal: string, sourceQuestion?: string): FollowUpQuestion {
    const kind = classifyFollowUpSignal(signal);
    const baseQuestion = sourceQuestion || signal;
    const question = baseQuestion.endsWith("？") || baseQuestion.endsWith("?") ? baseQuestion : `${baseQuestion}？`;
    const common = {
      id: `${kind}-${question}`,
      eyebrow: "需要你判断",
      question,
      reason: "信息不足时先做一个可撤销假设，不阻塞项目推进；后续客户确认后可以覆盖。",
      freeformPrompt: `关于「${question.replace(/[？?]$/, "")}」：`,
    };

    if (kind === "company") {
      return {
        ...common,
        question: "客户公司是否已经可以确认？",
        options: [
          { label: "已确认客户公司", value: "客户公司已确认：" },
          { label: "保密客户，先推进", value: "客户公司暂不披露，先按保密项目推进。" },
          { label: "待客户确认", value: "客户公司待客户确认。" },
        ],
      };
    }

    if (kind === "role") {
      return {
        ...common,
        question: "目标岗位名称目前按哪个版本推进？",
        options: [
          { label: "使用客户原话", value: "目标岗位名称按客户原话推进：" },
          { label: "先按职能方向", value: "目标岗位名称待确认，先按当前职能方向推进。" },
          { label: "替代职位待确认", value: "这是替代职位，具体 title 待客户确认。" },
        ],
      };
    }

    if (kind === "location") {
      return {
        ...common,
        question: "工作地点和办公模式先按哪个假设？",
        options: [
          { label: "固定 onsite", value: "工作地点/模式已确认：" },
          { label: "可接受 hybrid", value: "工作模式暂按 hybrid/弹性办公可讨论推进。" },
          { label: "待客户确认", value: "地点和办公模式待客户确认。" },
        ],
      };
    }

    if (kind === "salary") {
      return {
        ...common,
        question: "薪酬预算现在是否可以作为筛选边界？",
        options: [
          { label: "预算固定", value: "薪酬预算可作为筛选边界：" },
          { label: "预算可谈", value: "薪酬预算可谈，先不作为硬性淘汰条件。" },
          { label: "待确认", value: "薪酬预算待客户确认。" },
        ],
      };
    }

    if (kind === "reporting") {
      return {
        ...common,
        question: "这个岗位的汇报线和决策人先按哪个方向判断？",
        options: [
          { label: "业务负责人主导", value: "汇报/决策暂按业务负责人主导。" },
          { label: "HR 负责人主导", value: "汇报/决策暂按 HR 负责人主导。" },
          { label: "双线/待确认", value: "汇报线和面试决策链暂按双线/待确认处理。" },
        ],
      };
    }

    if (kind === "team") {
      return {
        ...common,
        question: "服务团队边界先按哪个范围理解？",
        options: [
          { label: "销售/商业团队", value: "团队范围暂按销售/商业团队支持理解。" },
          { label: "总部职能团队", value: "团队范围暂按总部职能团队支持理解。" },
          { label: "范围待确认", value: "团队边界、人数和区域范围待客户确认。" },
        ],
      };
    }

    if (kind === "background") {
      return {
        ...common,
        question: "招聘背景先按什么场景处理？",
        options: [
          { label: "替代岗位", value: "招聘背景为替代岗位，需要确认前任离开原因和风险。" },
          { label: "新增岗位", value: "招聘背景为新增岗位，需要确认业务扩张目标和成功标准。" },
          { label: "待确认", value: "岗位新增/替代原因和成功标准待客户确认。" },
        ],
      };
    }

    if (kind === "mustHave") {
      return {
        ...common,
        question: "第一轮寻访优先看哪类硬条件？",
        options: [
          { label: "行业背景优先", value: "第一轮寻访优先行业/业务场景匹配。" },
          { label: "职能能力优先", value: "第一轮寻访优先岗位职能能力和结果经验。" },
          { label: "文化/语言优先", value: "第一轮寻访优先文化环境、语言和跨团队协作匹配。" },
        ],
      };
    }

    return {
      ...common,
      question,
      options: [
        { label: "已确认", value: `${question.replace(/[？?]$/, "")}：已确认。` },
        { label: "待客户确认", value: `${question.replace(/[？?]$/, "")}：待客户确认。` },
        { label: "先按假设推进", value: `${question.replace(/[？?]$/, "")}：先按当前假设推进，后续复核。` },
      ],
    };
  }

  function getDraftFollowUpQuestion() {
    const text = draftCombinedInput.trim();
    if (!text || message.trim().length < 8) return null;
    if (text.length >= 160) return null;
    if (!/(客户|客户公司|公司|集团|有限|股份|inc|ltd|llc|company)\s*[:：]?/i.test(text)) return buildFollowUpQuestion("客户公司");
    if (!/(招聘|招|岗位|职位|title|role|vp|总裁|总监|经理|负责人|hr|bp)/i.test(text)) return buildFollowUpQuestion("目标岗位");
    if (!/(上海|北京|深圳|广州|广州市|天河|苏州|杭州|南京|成都|地点|地址|公司地址|总部|onsite|hybrid|remote|远程|办公)/i.test(text)) return buildFollowUpQuestion("地点/工作模式");
    if (!/(\d+\s*(万|w|k)|薪|预算|salary|package|compensation)/i.test(text)) return buildFollowUpQuestion("薪酬预算");
    if (!/(替代|新增|replacement|新设|背景|原因|业务|团队|组织|汇报|report|领导|上级)/i.test(text)) return buildFollowUpQuestion("招聘背景");
    return null;
  }

  function getProjectFollowUpQuestion() {
    if (!analysis) return null;
    const knownText = [
      analysis.projectName,
      analysis.jobBrief.clientCompany,
      analysis.intakeBuilder.structuredBrief.clientCompany,
      analysis.intakeBuilder.structuredBrief.locationAndWorkModel,
      analysis.jobBrief.salaryBudget,
      analysis.companyTeamBrief.confirmed,
    ]
      .flat()
      .join(" ");
    const hasCompany = !/^(client company|客户公司|待确认客户公司)$/i.test((analysis.jobBrief.clientCompany || "").trim()) && /[A-Za-z\u4e00-\u9fa5]{2,}/.test(analysis.jobBrief.clientCompany || "");
    const hasLocation = /(上海|北京|深圳|广州|广州市|天河|苏州|杭州|南京|成都|地址|公司地址|onsite|hybrid|remote|远程|办公)/i.test(knownText);
    const hasSalary = /(\d+\s*(万|w|k)|薪|预算|salary|package|compensation)/i.test(knownText);
    const isResolved = (item: string) => {
      const kind = classifyFollowUpSignal(item);
      if (kind === "company" && hasCompany) return true;
      if (kind === "location" && hasLocation) return true;
      if (kind === "salary" && hasSalary) return true;
      return false;
    };
    const question = analysis.companyTeamBrief.clientQuestions.find((item) => item && !isResolved(item));
    const signal = analysis.companyTeamBrief.missing.find((item) => item && !isResolved(item)) || question;
    if (!signal) return null;
    return buildFollowUpQuestion(signal, question);
  }

  function applyFollowUpOption(option: FollowUpOption) {
    if (newProjectMode) {
      const entry = {
        id: `choice-${draftClarifications.length}-${option.label}`,
        content: option.value,
        title: "选择补充",
        time: "choice",
        timestamp: formatDateTime(),
      };
      setDraftClarifications((current) => [...current, entry]);
      setConversationLog((current) => [...current, entry]);
      return;
    }

    void submitInsight(option.value, "选择补充");
  }

  function applyFollowUpFreeform(prompt: FollowUpQuestion) {
    void prompt;
  }

  function replaceTrailingTrigger(value: string, trigger: "/" | "@", replacement: string) {
    const trimmedRight = value.replace(/\s+$/, "");
    if (trimmedRight.endsWith(trigger)) {
      return `${trimmedRight.slice(0, -1)}${replacement}`;
    }
    return `${value}${value.endsWith(" ") || !value ? "" : " "}${replacement}`;
  }

  function handleMessageChange(value: string) {
    updateComposerMessage(value);
    const lastToken = value.split(/\s+/).pop() || "";
    if (lastToken.startsWith("/")) {
      setComposerMenu("commands");
      return;
    }
    if (lastToken.startsWith("@")) {
      setComposerMenu("mentions");
      return;
    }
    setComposerMenu(null);
  }

  function currentTriggerToken() {
    const lastToken = message.split(/\s+/).pop() || "";
    if (lastToken.startsWith("/") || lastToken.startsWith("@")) return lastToken.slice(1).toLowerCase();
    return "";
  }

  function openComposerMenu(menu: "commands" | "mentions") {
    setComposerMenu(menu);
    focusComposer();
  }

  function executeCommandToken(token: string) {
    if (token === "/profile") changeStage("job_brief");
    if (token === "/research") {
      setRailTab("context");
      changeStage("job_brief");
    }
    if (token === "/longlist") changeStage("longlist");
    if (token === "/rescan" && project?.id) void scanLonglist(project.id);
    if (token === "/screening") changeStage("screening");
    if (token === "/shortlist") changeStage("shortlist");
    if (token === "/report") changeStage("reports");
    if (token === "/run-screening") void runScreening();
    if (token === "/generate-report") void generateReports();
  }

  function runCommand(command: (typeof commandItems)[number]) {
    executeCommandToken(command.token);
    setMessage((current) => replaceTrailingTrigger(current, "/", `${command.token} `));
    setComposerMenu(null);
    focusComposer();
  }

  function mentionCandidate(candidate: ProjectCandidate) {
    const name = candidate.name || candidate.currentTitle || "候选人";
    setMessage((current) => replaceTrailingTrigger(current, "@", `@${name} `));
    setComposerMenu(null);
    focusComposer();
  }

  function getNextInformationFocus() {
    const gapBuckets = classifyProjectGaps(analysis?.companyTeamBrief.missing ?? []);
    if (gapBuckets.blocking.length) return `优先补齐关键阻塞：${gapBuckets.blocking.slice(0, 3).join("；")}。`;
    if (gapBuckets.nonBlocking.length) return `可边找边验证：${gapBuckets.nonBlocking.slice(0, 3).join("；")}。`;
    return "基础信息足够先推进 Longlist；后续再补业务线/部门、团队范围、汇报关系、替代/新增原因、关键利益相关人和成功标准。";
  }

  function getReasoningSteps() {
    if (actionLoading === "create-project") {
      return [
        { label: "解析项目 Profile", detail: "读取客户公司、岗位、业务背景、地点、薪酬和 must-have。", status: "active" as const },
        { label: "自动执行 Agent Skills", detail: "创建 JobBrief、TalentPersona、SearchMap、Deep Research，并在信息足够时扫描人才库生成 Longlist。", status: "active" as const },
        { label: "等待顾问判断", detail: "创建完成后进入项目详情页；AI 评分前停止，等待顾问显式触发。", status: "manual_required" as const },
      ];
    }

    if (!project || !analysis) return [];

    if (actionLoading === "message") {
      return [
        { label: "写入项目记忆", detail: streamStatusMessages[0] || "用户输入已先进入对话，后台正在写入项目记忆。", status: "done" as const },
        { label: "自动更新项目认知", detail: streamStatusMessages[streamStatusMessages.length - 1] || "用 LLM 更新组织上下文、Deep Research、人才画像、搜索策略和评分假设。", status: "active" as const },
        { label: "刷新人才库扫描", detail: "结构化记忆保存后自动刷新 Longlist；AI 评分仍需顾问显式触发。", status: "manual_required" as const },
      ];
    }

    if (actionLoading === "screening") {
      return [
        { label: "读取 Longlist", detail: `最多处理前 50 人；当前 longlist ${project.stats.longlistCount} 人。`, status: "done" as const },
        { label: "逐人评分", detail: "LLM 读取候选人快照、岗位画像和 Deep Research，输出等级、分数、证据、风险、缺口和追问。", status: "active" as const },
        { label: "等待顾问确认", detail: "保存最新评分后，Shortlist 建议会按推荐等级和分数排序，但最终由顾问确认。", status: "manual_required" as const },
      ];
    }

    if (actionLoading === "longlist-scan") {
      return [
        { label: "检查项目信息", detail: "确认岗位名称、客户公司、人才画像或关键词是否足够触发人才库扫描。", status: "done" as const },
        { label: "扫描人才库", detail: "按岗位/title、HR 资深度、公司/行业关键词和备注命中度检索候选人库。", status: "active" as const },
        { label: "更新 Longlist", detail: "保存候选人快照到当前项目，避免后续人才库变化影响交付记录。", status: "active" as const },
      ];
    }

    if (actionLoading === "reports") {
      return [
        { label: "读取 Shortlist", detail: `当前人工确认 shortlist ${project.stats.shortlistCount} 人。`, status: "done" as const },
        { label: "组织推荐证据", detail: "合并岗位画像、候选人快照、评分证据、风险点和建议追问。", status: "active" as const },
        { label: "等待顾问复核", detail: "输出给顾问复核的推荐报告，不自动触达客户或候选人。", status: "manual_required" as const },
      ];
    }

    if (activeStage === "job_brief") {
      return [
        { label: "识别岗位输入", detail: `当前输入类型：${analysis.intakeBuilder.inputType}；先区分已确认事实和待确认假设。`, status: "done" as const },
        { label: "自动整理岗位画像", detail: "抽取客户公司、目标岗位、地点/工作模式、薪酬、汇报线和 must-have。", status: "done" as const },
        { label: "等待用户补充", detail: getNextInformationFocus(), status: "waiting_user" as const },
      ];
    }

    if (activeStage === "longlist") {
      return [
        { label: "读取候选池", detail: `当前 longlist ${project.stats.longlistCount} 人，候选人以加入项目时的快照为准。`, status: "done" as const },
        { label: "自动检查快照质量", detail: "重点看公司、title、职能路径、备注、薪酬、联系方式和履历结构完整度。", status: "done" as const },
        { label: "等待显式评分", detail: "未评分候选人不会自动进入 LLM 评分；点击开始/重跑 AI 评分后处理前 50 人。", status: "manual_required" as const },
      ];
    }

    if (activeStage === "screening") {
      return [
        { label: "读取评分结果", detail: `当前已评分 ${project.stats.screenedCount} 人，风险/缺口 ${project.stats.riskCount} 项。`, status: "done" as const },
        { label: "比较候选人", detail: "按推荐等级、综合分、证据强度、风险点和信息完整度排序。", status: "active" as const },
        { label: "等待顾问动作", detail: "把不确定项转成首轮电话问题，而不是直接当成淘汰理由。", status: "waiting_user" as const },
      ];
    }

    if (activeStage === "shortlist") {
      return [
        { label: "读取 AI 排序", detail: "系统只给建议，最终 shortlist 由顾问人工确认。", status: "done" as const },
        { label: "确认推荐价值", detail: "重点看客户当前岗位最关键的业务场景、组织挑战、管理层偏好、候选人可迁移经验和风险缺口。", status: "active" as const },
        { label: "等待生成报告", detail: "进入报告前需确认风险、薪酬、动机和可追问问题。", status: "manual_required" as const },
      ];
    }

    return [
      { label: "读取 Shortlist", detail: `当前已有报告草稿 ${project.reports.length} 份。`, status: "done" as const },
      { label: "组织交付材料", detail: "报告基于岗位画像、候选人快照、评分证据和顾问备注生成。", status: "active" as const },
      { label: "等待顾问复核", detail: "第一版只做交付判断和报告准备，不自动触达或约面。", status: "manual_required" as const },
    ];
  }

  function getReasoningAudit() {
    if (actionLoading === "create-project") {
      return {
        skills: ["岗位解析与结构化", "客户公司/部门 Deep Research", "组织与业务上下文补齐", "人才画像/搜索策略生成"],
        research: ["从原始项目需求抽取客户公司、岗位、地点、薪酬和替代/新增背景。", "创建后继续补充业务线/部门、团队范围、汇报关系、关键利益相关人、相似公司和人才库扫描方向。"],
        sources: ["用户刚输入的原始项目需求", "LLM 解析输出；失败时使用本地解析兜底", "系统内置招聘项目漏斗规则"],
      };
    }

    const researchItems =
      analysis
        ? [
            ...[...analysis.deepResearch.companySignals, ...analysis.deepResearch.peopleNodes].map((node) => `${node.name}：${node.sourceStatus}；${node.impact}`),
            ...analysis.deepResearch.talentDbScanProtocol.map((item) => `人才库扫描：${item}`),
            ...analysis.deepResearch.companySimilarityMap.map((item) => `公司相似度：${item}`),
          ].slice(0, 8)
        : [];
    const researchSources =
      analysis
        ? [...analysis.deepResearch.companySignals, ...analysis.deepResearch.peopleNodes]
            .slice(0, 5)
            .map((node) => `${node.name}：${node.sourceStatus}${node.talentDbEvidence ? `；人才库：${node.talentDbEvidence}` : ""}`)
        : [];
    const skillNames = analysis?.skillLibrary.map((skill) => skill.name).slice(0, 6) ?? [];
    const baseSources = [
      "用户输入：原始 JD、客户补充信息和顾问判断",
      "项目结构化数据：JobBrief、TalentPersona、SearchMap、Deep Research",
    ];

    if (project?.stats.longlistCount) {
      baseSources.push(`候选人库快照：当前 Longlist ${project.stats.longlistCount} 人`);
    }
    if (project?.stats.screenedCount) {
      baseSources.push(`评分结果：当前已评分 ${project.stats.screenedCount} 人`);
    }

    const latestEvidence = (project?.agentRuns?.[0]?.evidences ?? [])
      .slice(0, 6)
      .map((evidence) =>
        [
          `${evidenceSourceLabel(evidence.sourceType)}：${evidence.sourceName || "未命名来源"}`,
          evidence.sourceStatus,
          evidence.content,
        ]
          .filter(Boolean)
          .join("；"),
      );

    return {
      skills: skillNames.length ? skillNames : ["岗位画像维护", "Research 自动补充", "项目漏斗推进"],
      research: [...streamStatusMessages, ...researchItems].filter(Boolean),
      sources: [...baseSources, ...researchSources, ...latestEvidence],
    };
  }

  function getReasoningSummary() {
    const timer = actionLoading ? ` · 已等待 ${actionElapsedSeconds}s` : "";
    if (actionLoading === "create-project") return `正在解析岗位画像、Research 与 Longlist${timer} · 点击展开`;
    if (actionLoading === "message") return `${streamStatusMessages[streamStatusMessages.length - 1] || "正在吸收新信息并刷新项目认知"}${timer} · 点击展开`;
    if (actionLoading === "longlist-scan") return `正在扫描人才库并更新 Longlist${timer} · 点击展开`;
    if (actionLoading === "screening") return `正在执行 AI 评分${timer} · 点击展开`;
    if (actionLoading === "reports") return `正在生成推荐报告草稿${timer} · 点击展开`;
    if (!project) return "可审计推理摘要 · 点击展开";
    if (activeStage === "job_brief") return "已解析岗位画像 → 已补齐 Research → 等待你确认缺口 · 点击展开";
    if (activeStage === "longlist") return `已扫描人才库 → Longlist ${project.stats.longlistCount} 人 → ${longlistQualityReview.noiseRisks.length} 人需裁判 · 点击展开`;
    if (activeStage === "screening") return `已读取 Longlist → 已评分 ${project.stats.screenedCount} 人 → 等待人工确认 · 点击展开`;
    if (activeStage === "shortlist") return `已读取 AI 排序 → Shortlist ${project.stats.shortlistCount} 人 → 等待生成报告 · 点击展开`;
    return `已生成报告草稿 ${project.reports.length} 份 → 等待顾问复核 · 点击展开`;
  }

  function getStageStatusText() {
    if (!project) return "";
    if (activeStage === "job_brief") return "当前对话正在整理岗位画像、客户上下文和待补齐信息。";
    if (activeStage === "longlist") return "当前对话正在展示人才库扫描结果、候选人分层和可验证信号。";
    if (activeStage === "screening") return "当前对话正在展示 AI 评分分层，右侧人工裁判队列与评分口径保持一致。";
    if (activeStage === "shortlist") return "当前对话正在展示顾问人工确认后的 shortlist。";
    return "当前对话正在展示推荐报告草稿和待复核交付材料。";
  }

  function renderStageActionBar() {
    if (!project) return null;
    if (activeStage === "job_brief") {
      return (
        <div className="agent-cta">
          <div className="rail-subtitle">下一步</div>
          <div className="agent-cta-actions">
            <button type="button" className="btn btn-primary" onClick={() => changeStage("longlist")} disabled={project.stats.longlistCount === 0}>
              <UsersRound size={14} />
              查看 Longlist
            </button>
            <button type="button" className="btn btn-outline" onClick={() => focusComposer()}>
              <BriefcaseBusiness size={14} />
              补充客户信息
            </button>
          </div>
        </div>
      );
    }
    if (activeStage === "longlist") {
      return (
        <div className="agent-cta">
          <div className="rail-subtitle">下一步</div>
          <div className="agent-cta-actions">
            <button type="button" className="btn btn-outline" onClick={() => void scanLonglist(project.id)} disabled={actionLoading === "longlist-scan"}>
              {actionLoading === "longlist-scan" ? <Loader2 className="spin" size={14} /> : <Search size={14} />}
              重扫 Longlist
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void runScreening()} disabled={actionLoading === "screening" || project.stats.longlistCount === 0}>
              {actionLoading === "screening" ? <Loader2 className="spin" size={14} /> : <ShieldCheck size={14} />}
              开始 AI 评分
            </button>
          </div>
        </div>
      );
    }
    if (activeStage === "screening") {
      return (
        <div className="agent-cta">
          <div className="rail-subtitle">下一步</div>
          <div className="agent-cta-actions">
            <button type="button" className="btn btn-primary" onClick={() => setRailTab("candidates")}>
              <AlertTriangle size={14} />
              查看需裁判候选人
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => void runScreening()}
              disabled={actionLoading === "screening" || project.stats.longlistCount === 0}
            >
              {actionLoading === "screening" ? <Loader2 className="spin" size={14} /> : <ShieldCheck size={14} />}
              重跑评分
            </button>
            <button type="button" className="btn btn-outline" onClick={() => changeStage("shortlist")}>
              <Star size={14} />
              进入 Shortlist
            </button>
          </div>
        </div>
      );
    }
    if (activeStage === "shortlist") {
      return (
        <div className="agent-cta">
          <div className="rail-subtitle">下一步</div>
          <div className="agent-cta-actions">
            <button type="button" className="btn btn-primary" onClick={() => void generateReports()} disabled={actionLoading === "reports" || shortlist.length === 0}>
              {actionLoading === "reports" ? <Loader2 className="spin" size={14} /> : <FileText size={14} />}
              生成推荐报告
            </button>
            <button type="button" className="btn btn-outline" onClick={() => changeStage("longlist")}>
              <UsersRound size={14} />
              回看候选人
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="agent-cta">
        <div className="rail-subtitle">下一步</div>
        <div className="agent-cta-actions">
          <button type="button" className="btn btn-outline" onClick={() => changeStage("job_brief")}>
            <BriefcaseBusiness size={14} />
            回到岗位画像
          </button>
        </div>
      </div>
    );
  }

  function renderProjectDialogue() {
    if (!project) return null;

    const dialogueEvents = [
      ...(project.projectMemories ?? [])
      .filter((memory) => memory.role === "user")
      .slice()
        .slice(0, 12)
        .map((memory) => ({ kind: "memory" as const, id: memory.id, createdAt: memory.createdAt, memory })),
      ...(project.agentRuns ?? [])
        .slice(0, 8)
        .map((run) => ({ kind: "run" as const, id: run.id, createdAt: run.createdAt, run })),
    ]
      .sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt))
      .slice(-18);

    return (
      <>
        {dialogueEvents.map((event) => {
          if (event.kind === "memory") {
            return (
              <Message key={event.id} role="user" title={event.memory.title || "用户输入"} time="memory" timestamp={formatDateTime(event.memory.createdAt)}>
                <MarkdownText content={truncateMessagePreview(formatCandidateJudgementInsight(event.memory.content))} enabled />
              </Message>
            );
          }

          return (
            <Message
              key={event.id}
              role="agent"
              title={event.run.trigger === "project_created" ? "已创建项目" : "已更新项目"}
              time="done"
              timestamp={formatDateTime(event.run.createdAt)}
            >
              <AnimatedMarkdownText
                enabled
                animate={event.id === liveAgentRunId}
                content={[
                  event.run.summary || "已更新岗位画像、项目上下文和当前漏斗状态。",
                  event.run.steps.length
                    ? `\n已完成：${event.run.steps
                        .slice(0, 4)
                        .map((step) => step.skillName)
                        .join("、")}${event.run.steps.length > 4 ? "。" : "。"}`
                    : "",
                ]
                .filter(Boolean)
                .join("\n")}
              />
              <AgentRunTrace run={event.run} defaultOpen={event.id === liveAgentRunId} />
            </Message>
          );
        })}
      </>
    );
  }

  function renderStageMessages() {
    if (!project || !analysis) return null;
    if (markdownMode) return renderMarkdownStageMessages();

    if (activeStage === "job_brief") {
      return (
        <>
          <Message role="agent" title="原始需求结构" time="intake">
            <p>{analysis.intakeBuilder.structuredBrief.businessContext || analysis.jobBrief.businessContext || "业务背景待补齐。"}</p>
            <div className="card">
              <div className="card-head">
                <span>已识别字段</span>
                <span>{analysis.intakeBuilder.inputType}</span>
              </div>
              <ul className="dr-list">
                <li>
                  <div>
                    <div className="dr-label">客户公司</div>
                    <div className="dr-sub">{analysis.jobBrief.clientCompany || project.clientCompany || "待确认"}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <div className="dr-label">目标岗位</div>
                    <div className="dr-sub">{analysis.jobBrief.roleTitle || project.roleTitle || "待确认"}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <div className="dr-label">地点/工作模式</div>
                    <div className="dr-sub">{analysis.intakeBuilder.structuredBrief.locationAndWorkModel || "待确认"}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <div className="dr-label">薪酬预算</div>
                    <div className="dr-sub">{analysis.jobBrief.salaryBudget || analysis.intakeBuilder.structuredBrief.compensation || "待确认"}</div>
                  </div>
                </li>
              </ul>
            </div>
          </Message>

          <Message role="agent" title="岗位需求" time="brief">
            <p>{analysis.jobBrief.companyBackground}</p>
            <div className="card">
              <div className="card-head">
                <span>Must-have</span>
                <span>{analysis.jobBrief.mustHave.length} 项</span>
              </div>
              <SmallList items={analysis.jobBrief.mustHave} limit={8} />
            </div>
            {analysis.jobBrief.responsibilities.length ? (
              <div className="card">
                <div className="card-head">
                  <span>职责范围</span>
                  <span>{analysis.jobBrief.responsibilities.length} 项</span>
                </div>
                <SmallList items={analysis.jobBrief.responsibilities} limit={6} />
              </div>
            ) : null}
          </Message>

          <Message role="agent" title="客户确认" time="confirm">
            <div className="card">
              <div className="card-head">
                <span>已确认信息</span>
                <span>{analysis.companyTeamBrief.confirmed.length} 条</span>
              </div>
              <SmallList items={analysis.companyTeamBrief.confirmed} limit={8} />
            </div>
            <div className="card">
              <div className="card-head">
                <span>项目上下文</span>
                <span>context</span>
              </div>
              <ul className="dr-list">
                <li>
                  <div>
                    <div className="dr-label">公司/团队缺口</div>
                    <div className="dr-sub">{analysis.companyTeamBrief.missing.slice(0, 4).join("；") || "暂无明显缺口"}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <div className="dr-label">自动 Research</div>
                    <div className="dr-sub">
                      {[...analysis.deepResearch.companySignals, ...analysis.deepResearch.peopleNodes]
                        .slice(0, 3)
                        .map((node) => `${node.name}（${node.sourceStatus}）`)
                        .join("；") || "等待更多公司/人物信息"}
                    </div>
                  </div>
                </li>
                <li>
                  <div>
                    <div className="dr-label">人才库扫描依据</div>
                    <div className="dr-sub">{analysis.deepResearch.talentDbScanProtocol.slice(0, 2).join("；") || "等待岗位画像补齐"}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <div className="dr-label">评分模型版本</div>
                    <div className="dr-sub">
                      {project.scoringModelVersions?.[0]
                        ? `v${project.scoringModelVersions[0].version} · ${project.scoringModelVersions[0].reason || "动态模型"}`
                        : "尚未记录版本"}
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </Message>

        </>
      );
    }

    if (activeStage === "longlist") {
      return (
        <Message role="agent" title="Longlist 候选池" time="pool">
          <QualityReviewBlock
            review={longlistQualityReview}
            onRescan={project?.id ? () => void scanLonglist(project.id) : undefined}
            loading={actionLoading === "longlist-scan"}
          />
          {sortedCandidates.length ? (
            <div className="longlist-segments">
              <LonglistSegment
                title="客户可看"
                subtitle="主轴成立，适合进入客户前验证池。"
                candidates={longlistSegments.clientReady}
                empty="暂时没有可直接给客户前验证的人选。"
                onOpen={openCandidateProfile}
              />
              <LonglistSegment
                title="电话验证"
                subtitle="方向接近，但需要先确认服务对象、项目深度、薪酬或动机。"
                candidates={longlistSegments.phoneValidate}
                empty="暂时没有只需电话验证的人选。"
                onOpen={openCandidateProfile}
              />
              <LonglistSegment
                title="暂不推进 / 噪音"
                subtitle="证据不足、方向偏离或需要你裁判后再决定。"
                candidates={longlistSegments.hold}
                empty="当前没有明显噪音或暂不推进人选。"
                onOpen={openCandidateProfile}
              />
            </div>
          ) : (
            <p className="kv muted">当前 Longlist 暂无候选人。系统会在岗位名称、人才画像或关键词足够后自动扫描人才库；如果仍无结果，说明需要更多可扫描信号或人才库暂无足够匹配。</p>
          )}
        </Message>
      );
    }

    if (activeStage === "screening") {
      const screenedCandidates = sortedCandidates.filter((candidate) => candidate.screening);
      return (
        <Message role="agent" title="AI 初筛结果" time="score">
          {screenedCandidates.length ? (
            <div className="longlist-segments">
              <ScreeningSegment
                title="可进入客户前验证"
                subtitle="评分与证据都支持继续推进，风险可通过电话补齐。"
                candidates={screeningSegments.advance}
                empty="暂无可直接推进的评分候选人。"
                onOpen={openCandidateProfile}
              />
              <ScreeningSegment
                title="需人工裁判"
                subtitle="分数、风险或信息缺口不足以直接进入推荐位。右侧裁判队列与此处保持一致。"
                candidates={screeningSegments.judge}
                empty="暂无需要人工裁判的评分候选人。"
                onOpen={openCandidateProfile}
              />
              <ScreeningSegment
                title="暂不推荐"
                subtitle="评分结果明确不支持当前项目，除非顾问另有证据。"
                candidates={screeningSegments.hold}
                empty="暂无明确不推荐的评分候选人。"
                onOpen={openCandidateProfile}
              />
            </div>
          ) : (
            <p className="kv muted">当前 longlist 尚未评分。Longlist 由系统自动扫描人才库生成后，可在右侧点击开始/重跑 AI 评分。</p>
          )}
        </Message>
      );
    }

    if (activeStage === "shortlist") {
      return (
        <Message role="agent" title="Shortlist 确认" time="shortlist">
          {shortlist.length ? (
            <ul className="dr-list card">
              {shortlist.map((candidate) => (
                <li key={candidate.id}>
                  <div>
                    <div className="dr-label">{candidate.name || "未命名候选人"}</div>
                    <div className="dr-sub">
                      {candidate.currentCompany || "未填公司"} · {candidate.currentTitle || "未填职位"}
                    </div>
                  </div>
                  <span className="pill pill-good">{candidate.screening?.score ?? "已确认"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="kv muted">还没有人工确认 Shortlist。请先完成评分，再从右侧候选人排序中确认。</p>
          )}
        </Message>
      );
    }

    return (
      <Message role="agent" title="推荐报告草稿" time="report">
        {project.reports.length ? (
          <div>
            {project.reports.map((report) => (
              <div key={report.id} className="report">
                <div>
                  <div className="r-title">{report.title}</div>
                  <div className="r-meta">{formatDate(report.updatedAt)}</div>
                </div>
                <span className="pill pill-good">draft</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="kv muted">暂无报告草稿。确认 Shortlist 后可生成推荐报告。</p>
        )}
      </Message>
    );
  }

  function renderMarkdownStageMessages() {
    if (!project || !analysis) return null;

    if (activeStage === "job_brief") {
      const researchNodes = [...analysis.deepResearch.companySignals, ...analysis.deepResearch.peopleNodes]
        .slice(0, 6)
        .map((node) => `${node.name}：${node.sourceStatus}；${node.impact || node.nextVerification || "等待补充验证"}`);
      const scoringVersion = project.scoringModelVersions?.[0]
        ? `v${project.scoringModelVersions[0].version} · ${project.scoringModelVersions[0].reason || "动态模型"}`
        : "尚未记录版本";
      return (
        <>
          <Message role="agent" title="岗位画像" time="profile">
            <MarkdownText
              enabled
              content={[
                "## 原始需求结构",
                analysis.intakeBuilder.structuredBrief.businessContext || analysis.jobBrief.businessContext || "业务背景待补齐。",
                "",
                "### 已识别字段",
                `- 客户公司：${markdownValue(analysis.jobBrief.clientCompany || project.clientCompany)}`,
                `- 目标岗位：${markdownValue(analysis.jobBrief.roleTitle || project.roleTitle)}`,
                `- 地点/工作模式：${markdownValue(analysis.intakeBuilder.structuredBrief.locationAndWorkModel)}`,
                `- 薪酬预算：${markdownValue(analysis.jobBrief.salaryBudget || analysis.intakeBuilder.structuredBrief.compensation)}`,
                `- 汇报线：${markdownValue(analysis.jobBrief.reportingLine || analysis.intakeBuilder.structuredBrief.reportingLine)}`,
                "",
                "### 岗位需求",
                analysis.jobBrief.companyBackground || "客户公司与岗位背景待补齐。",
                "",
                "### Hunter 推演 Kernel",
                `- 岗位核：${analysis.hunterReasoningKernel.roleNucleus || "待收束"}`,
                `- Hiring problem：${analysis.hunterReasoningKernel.hiringProblem || "待判断"}`,
                `- Core 准入：${analysis.hunterReasoningKernel.evidenceTiers.core.slice(0, 5).join("；") || "待判断"}`,
                `- Adjacent 扩展：${analysis.hunterReasoningKernel.evidenceTiers.adjacent.slice(0, 5).join("；") || "暂无"}`,
                `- Action gate：${analysis.hunterReasoningKernel.actionGate.canStartLonglist ? "可先启动 Longlist" : `先补齐 ${analysis.hunterReasoningKernel.actionGate.blockingGaps.join("、")}`}`,
                "",
                "### Must-have",
                markdownBullets(analysis.jobBrief.mustHave, "待从客户输入中继续提取"),
                "",
                "### 职责范围",
                markdownBullets(analysis.jobBrief.responsibilities, "待确认职责边界", 6),
                "",
                "### 已确认信息",
                markdownBullets(analysis.companyTeamBrief.confirmed, "暂无已确认事实"),
                "",
                "### 非阻塞待验证",
                markdownBullets(classifyProjectGaps(analysis.companyTeamBrief.missing).nonBlocking, "暂无非阻塞验证项", 6),
                "",
                "### 关键阻塞缺口",
                markdownBullets(classifyProjectGaps(analysis.companyTeamBrief.missing).blocking, "无，当前可先推进 Longlist", 4),
                "",
                "### 自动 Research",
                markdownBullets(researchNodes, "等待更多公司/人物信息", 6),
                "",
                "### 人才库扫描依据",
                markdownBullets(analysis.deepResearch.talentDbScanProtocol, "等待岗位画像补齐", 4),
                "",
                "### 评分模型",
                `- 当前版本：${scoringVersion}`,
              ].join("\n")}
            />
          </Message>
        </>
      );
    }

    if (activeStage === "longlist") {
      return (
        <Message role="agent" title="Longlist 候选池" time="pool">
          <MarkdownText
            enabled
            content={[
              "## Longlist 候选池",
              longlistQualityReview.summary,
              "",
              "### 客户可看",
              markdownCandidateList(longlistSegments.clientReady, "暂时没有可直接给客户前验证的人选。"),
              "",
              "### 电话验证",
              markdownCandidateList(longlistSegments.phoneValidate, "暂时没有只需电话验证的人选。"),
              "",
              "### 暂不推进 / 噪音",
              markdownCandidateList(longlistSegments.hold, "当前没有明显噪音或暂不推进人选。"),
              "",
              "### 需质疑样本",
              markdownBullets(
                longlistQualityReview.noiseRisks.map(({ candidate, reasons }) => `${candidate.name || "未命名候选人"}：${reasons[0]}`),
                "暂无明显噪音样本",
                6,
              ),
              "",
              "### 可能缺口",
              markdownBullets(longlistQualityReview.missingSignals, "暂无明显缺口", 6),
              "",
              "详情和人工操作在右侧候选人栏完成。",
            ].join("\n")}
          />
        </Message>
      );
    }

    if (activeStage === "screening") {
      const screenedCandidates = sortedCandidates.filter((candidate) => candidate.screening);
      return (
        <Message role="agent" title="AI 初筛结果" time="score">
          <MarkdownText
            enabled
            content={
              screenedCandidates.length
                ? [
                    "## AI 初筛结果",
                    `已评分 ${screenedCandidates.length} 人。评分不会自动进入 Shortlist，仍需顾问确认。`,
                    "",
                    "### 可进入客户前验证",
                    markdownScreeningList(screeningSegments.advance, "暂无可直接推进的评分候选人。"),
                    "",
                    "### 需人工裁判",
                    markdownScreeningList(screeningSegments.judge, "暂无需要人工裁判的评分候选人。"),
                    "",
                    "### 暂不推荐",
                    markdownScreeningList(screeningSegments.hold, "暂无明确不推荐的评分候选人。"),
                    "",
                    "右侧候选人栏用于查看履历、标记继续、降级验证或确认 Shortlist。",
                  ].join("\n")
                : "当前 longlist 尚未评分。Longlist 由系统自动扫描人才库生成后，可在右侧点击开始/重跑 AI 评分。"
            }
          />
        </Message>
      );
    }

    if (activeStage === "shortlist") {
      return (
        <Message role="agent" title="Shortlist 确认" time="shortlist">
          <MarkdownText
            enabled
            content={
              shortlist.length
                ? [
                    "## Shortlist 确认",
                    markdownBullets(
                      shortlist.map((candidate) => `${candidate.name || "未命名候选人"}：${candidate.currentCompany || "未填公司"} · ${candidate.currentTitle || "未填职位"} · ${candidate.screening?.score ?? "已确认"}`),
                      "还没有人工确认 Shortlist。",
                      12,
                    ),
                    "",
                    "可在右侧生成推荐报告草稿。",
                  ].join("\n")
                : "还没有人工确认 Shortlist。请先完成评分，再从右侧候选人排序中确认。"
            }
          />
        </Message>
      );
    }

    return (
      <Message role="agent" title="推荐报告草稿" time="report">
        <MarkdownText
          enabled
          content={
            project.reports.length
              ? [
                  "## 推荐报告草稿",
                  markdownBullets(project.reports.map((report) => `${report.title}：${formatDate(report.updatedAt)} · draft`), "暂无报告草稿", 12),
                ].join("\n")
              : "暂无报告草稿。确认 Shortlist 后可生成推荐报告。"
          }
        />
      </Message>
    );
  }

  function markdownCandidateList(candidates: ProjectCandidate[], fallback: string) {
    if (!candidates.length) return `- ${fallback}`;
    return candidates
      .slice(0, 10)
      .map((candidate) => `- **${candidate.name || "未命名候选人"}**：${candidate.currentCompany || "未填公司"} · ${candidate.currentTitle || "未填职位"} · ${candidateOneLine(candidate)}`)
      .join("\n");
  }

  function markdownScreeningList(candidates: ProjectCandidate[], fallback: string) {
    if (!candidates.length) return `- ${fallback}`;
    return candidates
      .slice(0, 10)
      .map((candidate) => `- **${candidate.name || "未命名候选人"}**：${candidate.currentCompany || "未填公司"} · ${candidate.currentTitle || "未填职位"} · ${candidate.screening?.recommendation || "未评分"} ${candidate.screening?.score ?? ""} · ${screeningOneLine(candidate)}`)
      .join("\n");
  }

  function renderNewProjectConversation() {
    return (
      <>
        <Message role="system" title="新项目">
          <p>新项目已开始。</p>
        </Message>
        <Message role="agent" title="等待输入">
          <p>把客户原始需求直接发过来。我会先整理岗位画像，再进入 Longlist。</p>
        </Message>
        {renderConversationLog()}
        <AgentLoopProcess tasks={creationLoopTasks} answer={creationAnswer} active={actionLoading === "create-project"} />
        {actionLoading === "create-project" && !creationLoopTasks.length ? (
          <ReasoningProcess steps={getReasoningSteps()} active summary={getReasoningSummary()} skills={getReasoningAudit().skills} research={getReasoningAudit().research} sources={getReasoningAudit().sources} />
        ) : null}
      </>
    );
  }

  function renderConversationLog() {
    if (!conversationLog.length) return null;
    const persisted = new Set((project?.projectMemories ?? []).map((memory) => formatCandidateJudgementInsight(memory.content)));

    return conversationLog
      .filter((entry) => !persisted.has(entry.content))
      .map((entry) => (
        <Message key={entry.id} role="user" title={entry.title} time={entry.time} timestamp={entry.timestamp}>
          <CollapsibleMarkdownText content={entry.content} enabled={markdownMode} />
        </Message>
      ));
  }

  return (
    <main className={`hunter-agent ${sidebarExpanded ? "" : "sidebar-collapsed"} ${railExpanded ? "" : "rail-collapsed"}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">H</div>
          {sidebarExpanded ? (
            <div className="brand-meta">
              <div className="brand-title">Hunter Agent</div>
              <div className="brand-sub">local workspace</div>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
            title={sidebarExpanded ? "收缩左侧项目导航栏" : "展开左侧项目导航栏"}
          >
            {sidebarExpanded ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        </div>

        {sidebarExpanded ? (
          <>
            <div className="search-row">
              <div className="search">
                <Search size={14} />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") (event.target as HTMLInputElement).blur(); }}
                  placeholder="搜索项目"
                />
                <span className="kbd">⌘K</span>
              </div>
              <Link href={newProjectHref} className="icon-btn" title="创建新项目" onClick={startNewProject}>
                <Plus size={15} />
              </Link>
            </div>

            <div className="section-label">
              <span>Active Projects</span>
              <span>{projectListCount}</span>
            </div>

            <div className="project-list">
              {loadingProjects ? (
                <div className="empty-state">
                  <Loader2 className="spin" size={15} />
                  读取项目
                </div>
              ) : (
                <>
                  {newProjectMode ? (
                    <button type="button" onClick={startNewProject} className="project-item active draft" disabled={isCreatingDraftProject}>
                      <div className="project-row1">
                        <div className="project-name">{draftProjectTitle}</div>
                        <span className="pill pill-neutral">{draftProjectPill}</span>
                      </div>
                      <div className="project-row2">{draftProjectStatus}</div>
                      <div className="project-row3">
                        <span>
                          L <b>0</b>
                        </span>
                        <span>
                          S <b>0</b>
                        </span>
                        <span>{draftProjectMeta}</span>
                      </div>
                    </button>
                  ) : null}
                  {filteredProjects.map((item) => {
                    const active = !newProjectMode && item.id === selectedProjectId;
                    return (
                      <button key={item.id} type="button" onClick={() => openProject(item.id)} className={`project-item ${active ? "active" : ""}`}>
                        <div className="project-row1">
                          <div className="project-name">{item.name}</div>
                          <ProjectBadge project={item} />
                        </div>
                        <div className="project-row2">
                          {item.clientCompany || "未填客户"} · {stageLabels[item.funnelStatus] || item.funnelStatus}
                        </div>
                        <div className="project-row3">
                          <span>
                            L <b>{item.longlistCount}</b>
                          </span>
                          <span>
                            S <b>{item.shortlistCount}</b>
                          </span>
                          <span>{formatDate(item.updatedAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="collapsed-nav">
            <Link href={newProjectHref} className="icon-btn" title="创建新项目" onClick={startNewProject}>
              <Plus size={15} />
            </Link>
            <button type="button" className="collapsed-project-dot" onClick={() => setSidebarExpanded(true)} title="展开项目导航栏">
              <span>{projectListCount}</span>
            </button>
          </div>
        )}
      </aside>

      <section className="main">
        <header className="main-header">
          <div className="crumbs">
            <span>Projects</span>
            <ChevronRight size={13} />
            <span className="now">{newProjectMode ? "新建项目" : project?.name || currentOption?.name || "选择一个项目会话"}</span>
          </div>
          {newProjectMode ? (
            <div className="header-actions">
              <button type="button" className="btn btn-outline" onClick={exitNewProjectMode} disabled={isCreatingDraftProject}>
                {isCreatingDraftProject ? "创建中" : "取消"}
              </button>
            </div>
          ) : project ? (
            <div className="header-actions">
              <button type="button" onClick={deleteCurrentProject} disabled={actionLoading === "delete-project"} className="btn btn-outline danger">
                {actionLoading === "delete-project" ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                删除
              </button>
            </div>
          ) : null}
        </header>

        {project && !newProjectMode ? <FunnelStrip project={project} activeStage={activeStage} onSelect={changeStage} /> : null}

        <div className="feed-wrap" ref={feedWrapRef} onScroll={handleFeedScroll}>
          <div className="feed">
            {error ? (
              <div className="error-banner">
                <AlertTriangle size={15} />
                <span>{error}</span>
                {newProjectMode ? (
                  <button
                    type="button"
                    className="error-retry"
                    onClick={createProjectFromAgent}
                    disabled={!canCreateProject || actionLoading === "create-project"}
                  >
                    {actionLoading === "create-project" ? <Loader2 className="spin" size={13} /> : <RotateCcw size={13} />}
                    重试
                  </button>
                ) : failedInsightRetry ? (
                  <button
                    type="button"
                    className="error-retry"
                    onClick={() => queueInsightWrite(failedInsightRetry.projectId, failedInsightRetry.insight)}
                    disabled={Boolean(actionLoading)}
                  >
                    {actionLoading ? <Loader2 className="spin" size={13} /> : <RotateCcw size={13} />}
                    重试
                  </button>
                ) : null}
              </div>
            ) : null}

            {newProjectMode ? (
              renderNewProjectConversation()
            ) : loadingProject ? (
              <Message role="agent" title="读取中" time="loading">
                <LoadingLine text="正在读取项目上下文" />
              </Message>
            ) : project && analysis ? (
              <>
                <Message role="system" title="项目上下文">
                  <MarkdownText
                    enabled
                    content={[
                      `当前：${stageLabels[activeStage]}。Longlist ${project.stats.longlistCount} / 已评分 ${project.stats.screenedCount} / Shortlist ${project.stats.shortlistCount} / 待裁判 ${project.stats.riskCount}。`,
                      getStageStatusText(),
                    ].join("\n\n")}
                  />
                </Message>
                {renderStageMessages()}
                {renderProjectDialogue()}
                {renderConversationLog()}
                <AgentLoopProcess tasks={creationLoopTasks} answer={creationAnswer} active={actionLoading === "create-project"} />
                <ReasoningProcess
                  steps={getReasoningSteps()}
                  active={Boolean(actionLoading) && !(actionLoading === "create-project" && creationLoopTasks.length)}
                  summary={getReasoningSummary()}
                  skills={getReasoningAudit().skills}
                  research={getReasoningAudit().research}
                  sources={getReasoningAudit().sources}
                />
              </>
            ) : (
              <div className="empty-state large">请选择或创建一个项目。</div>
            )}
          </div>
        </div>

        {!isCreatingProjectFlow ? (
        <div className="composer-wrap">
          {showJumpToLatest ? (
            <button type="button" className="jump-latest" onClick={() => scrollFeedToLatest()}>
              <ArrowDown size={14} />
              新消息
            </button>
          ) : null}
          <div className="composer command-composer">
            <div className="composer-commandbar">
              <div className="composer-context">
                <span className="prompt-glyph">›</span>
                <span>{composerModeLabel}</span>
              </div>
              <div className="composer-channel composer-channel-single">
                <button type="button" className={`chip ${markdownMode ? "active" : ""}`} onClick={() => setMarkdownMode((current) => !current)} title="切换对话 Markdown 显示">
                  <FileText size={13} />
                  Markdown
                </button>
              </div>
            </div>
            {composerFollowUpQuestion ? (
              <div className="composer-question">
                <QuestionPrompt
                  prompt={composerFollowUpQuestion}
                  compact
                  onUseOption={applyFollowUpOption}
                  onFreeform={() => applyFollowUpFreeform(composerFollowUpQuestion)}
                />
              </div>
            ) : null}
            <div className="composer-input-line" style={{ display: "block" }}>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => (newProjectMode ? updateComposerMessage(event.target.value) : handleMessageChange(event.target.value))}
                onKeyDown={(event) => {
                  if (composerMenu && composerMenuOptions.length) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setComposerMenuIndex((current) => (current + 1) % composerMenuOptions.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setComposerMenuIndex((current) => (current - 1 + composerMenuOptions.length) % composerMenuOptions.length);
                      return;
                    }
                    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
                      event.preventDefault();
                      composerMenuOptions[composerMenuIndex]?.pick();
                      return;
                    }
                  }
                  if (composerMenu && event.key === "Escape") {
                    event.preventDefault();
                    setComposerMenu(null);
                    return;
                  }
                  if (
                    composerFollowUpQuestion &&
                    !message.trim() &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    /^[1-9]$/.test(event.key)
                  ) {
                    const idx = Number(event.key) - 1;
                    const opt = composerFollowUpQuestion.options[idx];
                    if (opt) {
                      event.preventDefault();
                      applyFollowUpOption(opt);
                      return;
                    }
                  }
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (newProjectMode) {
                      void createProjectFromAgent();
                    } else {
                      void addInsight();
                    }
                  }
                }}
                onFocus={() => {
                  if (newProjectMode) return;
                  const trimmedRight = message.replace(/\s+$/, "");
                  if (trimmedRight.endsWith("/")) setComposerMenu("commands");
                  if (trimmedRight.endsWith("@")) setComposerMenu("mentions");
                }}
                placeholder={composerPlaceholder}
              />
            </div>
            {composerMenu && !newProjectMode ? (
              <div className="composer-menu">
                <div className="composer-menu-head">
                  {composerMenu === "commands" ? "命令" : "提及候选人"}
                  {currentTriggerToken() ? ` · ${composerMenu === "commands" ? "/" : "@"}${currentTriggerToken()}` : ""}
                  <span className="composer-menu-hint">↑↓ 选择 · ↵ 确认 · esc 关闭</span>
                </div>
                {composerMenuOptions.length ? (
                  composerMenuOptions.map((option, idx) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={option.pick}
                      onMouseEnter={() => setComposerMenuIndex(idx)}
                      className={`composer-menu-item ${idx === composerMenuIndex ? "active" : ""}`}
                    >
                      <span>{option.label}</span>
                      <small>{option.sub}</small>
                    </button>
                  ))
                ) : (
                  <div className="composer-menu-empty">
                    {composerMenu === "commands"
                      ? "没有匹配的命令。"
                      : sortedCandidates.length
                        ? "没有匹配的候选人。"
                        : "当前项目还没有候选人。"}
                  </div>
                )}
              </div>
            ) : null}
            <div className="composer-actions">
              <div className="composer-hints">
                <span>
                  <span className="k">⌘</span>
                  <span className="k">↵</span>
                  发送
                </span>
                {actionLoading ? <span className="syncing-hint">处理中 {actionElapsedSeconds}s</span> : null}
                {!newProjectMode && pendingInsightCount > 0 ? <span className="syncing-hint">后台写入中 {pendingInsightCount}</span> : null}
                {!newProjectMode ? (
                  <>
                    <button type="button" onClick={() => openComposerMenu("commands")}>
                      <span className="k">/</span>
                      命令
                    </button>
                    <button type="button" onClick={() => openComposerMenu("mentions")}>
                      <span className="k">@</span>
                      提及候选人
                    </button>
                  </>
                ) : (
                  <span>信息不完整也可先创建，缺口会继续追问</span>
                )}
              </div>
              <button
                type="button"
                onClick={newProjectMode ? createProjectFromAgent : addInsight}
                disabled={
                  newProjectMode
                    ? !canCreateProject || actionLoading === "create-project"
                    : !project || !message.trim()
                }
                className="btn btn-accent"
              >
                {actionLoading === "create-project" ? <Loader2 className="spin" size={14} /> : <Send size={14} />}
                {sendLabel}
              </button>
            </div>
          </div>
        </div>
        ) : null}
      </section>

      <aside className="rail">
        {!railExpanded ? (
          <button
            type="button"
            className="rail-expand"
            onClick={() => setRailExpanded(true)}
            title="展开右侧看板"
            aria-label="展开右侧看板"
          >
            <PanelLeftClose size={15} />
          </button>
        ) : !newProjectMode && project && analysis ? (
          <>
            <div className="rail-tabs">
              <button type="button" className={`rail-tab ${railTab === "context" ? "active" : ""}`} onClick={() => setRailTab("context")}>
                <PanelRight size={13} />
                项目上下文
              </button>
              <button type="button" className={`rail-tab ${railTab === "candidates" ? "active" : ""}`} onClick={() => setRailTab("candidates")}>
                <UsersRound size={13} />
                候选人 <span className="pill pill-neutral">{project.stats.longlistCount}</span>
              </button>
              <button type="button" className={`rail-tab ${railTab === "feedback" ? "active" : ""}`} onClick={() => setRailTab("feedback")}>
                <RotateCcw size={13} />
                反哺
              </button>
              <button
                type="button"
                className="rail-collapse"
                onClick={() => setRailExpanded(false)}
                title="收起右侧看板"
                aria-label="收起右侧看板"
              >
                <PanelLeftOpen size={13} />
              </button>
            </div>

            {renderStageActionBar()}

            {railTab === "context" ? (() => {
              const showOnIntake = activeStage === "job_brief";
              const showOnDiscovery = activeStage === "job_brief" || activeStage === "longlist";
              return (
                <>
                  <BoardCard title="项目统计" icon={PanelRight}>
                    <div className="metric-grid">
                      {[
                        ["Longlist", project.stats.longlistCount],
                        ["Scored", project.stats.screenedCount],
                        ["Shortlist", project.stats.shortlistCount],
                        ["Risks", project.stats.riskCount],
                      ].map(([label, value]) => (
                        <div key={label} className="metric">
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  </BoardCard>

                  <BoardCard title="项目基本信息" icon={ClipboardList}>
                    <div className="rail-row">
                      <div>
                        <div className="dr-label">客户公司</div>
                        <div className="dr-sub">{analysis.jobBrief.clientCompany || project.clientCompany || "待确认"}</div>
                      </div>
                    </div>
                    <div className="rail-row">
                      <div>
                        <div className="dr-label">岗位名称</div>
                        <div className="dr-sub">{analysis.jobBrief.roleTitle || project.roleTitle || "待确认"}</div>
                      </div>
                    </div>
                    <div className="rail-row">
                      <div>
                        <div className="dr-label">汇报线</div>
                        <div className="dr-sub">{analysis.jobBrief.reportingLine || "待确认"}</div>
                      </div>
                    </div>
                    <div className="rail-row">
                      <div>
                        <div className="dr-label">薪酬预算</div>
                        <div className="dr-sub">{analysis.jobBrief.salaryBudget || "待确认"}</div>
                      </div>
                    </div>
                  </BoardCard>

                  {showOnDiscovery ? (
                    <BoardCard title="客户确认/缺口" icon={AlertTriangle} defaultOpen={showOnIntake}>
                      <div className="rail-subsection compact-top">
                        <div className="rail-subtitle">已确认</div>
                        <SmallList items={analysis.companyTeamBrief.confirmed} limit={5} />
                      </div>
                      <div className="rail-subsection">
                        <div className="rail-subtitle">待补齐</div>
                        <SmallList items={analysis.companyTeamBrief.missing} limit={5} />
                      </div>
                    </BoardCard>
                  ) : null}

                  {showOnDiscovery ? (
                    <BoardCard title="人才画像" icon={UserRound} defaultOpen={showOnIntake}>
                      <p className="kv">{analysis.talentPersona.summary}</p>
                      <div className="rail-subsection">
                        <div className="rail-subtitle">Must-have</div>
                        <SmallList items={analysis.talentPersona.mustHave} limit={5} />
                      </div>
                      <div className="rail-subsection">
                        <div className="rail-subtitle">风险信号</div>
                        <SmallList items={analysis.talentPersona.riskSignals} limit={4} />
                      </div>
                    </BoardCard>
                  ) : null}

                  {showOnDiscovery ? (
                    <BoardCard title="自动 Research 信号" icon={Network} defaultOpen={false}>
                      <SmallList items={[...analysis.deepResearch.companySignals, ...analysis.deepResearch.peopleNodes].map((node) => `${node.name}: ${node.sourceStatus}`)} limit={5} />
                      <div className="note">{analysis.deepResearch.talentDbScanProtocol[0] || "暂无真实 research 信号，等待补充客户公司、团队或人物信息。"}</div>
                    </BoardCard>
                  ) : null}

                  <BoardCard title="Agent 执行记录" icon={Sparkles} defaultOpen={false}>
                    {(project.agentRuns ?? []).length ? (
                      <div className="candidate-list">
                        {(project.agentRuns ?? []).slice(0, 3).map((run) => (
                          <div key={run.id} className="candidate-card">
                            <div className="candidate-head">
                              <div>
                                <div className="dr-label">{run.trigger}</div>
                                <div className="dr-sub">{formatDate(run.createdAt)}</div>
                              </div>
                              <span className={`pill ${run.status === "done" ? "pill-good" : "pill-warn"}`}>{run.status}</span>
                            </div>
                            <p className="kv compact">{run.summary || "已执行到评分前链路。"}</p>
                            <SmallList items={run.steps.map((step) => step.skillName)} limit={6} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="kv muted">暂无执行记录。创建或补充项目信息后会自动生成。</p>
                    )}
                  </BoardCard>

                  {showOnIntake ? (
                    <BoardCard title="Agent 能力" icon={Sparkles} defaultOpen={false}>
                      <p className="kv">能力会在对话中自动调用到评分前；评分、Shortlist 和报告仍由顾问触发。</p>
                      <SmallList items={analysis.skillLibrary.map((skill) => `${skill.name}：${skill.output}`)} limit={5} />
                    </BoardCard>
                  ) : null}

                  <BoardCard title="项目记忆与证据" icon={Network} defaultOpen={false}>
                    <div className="rail-subsection compact-top">
                      <div className="rail-subtitle">最近记忆</div>
                      <SmallList items={(project.projectMemories ?? []).slice(0, 5).map((memory) => `${memory.title || memory.role}: ${memory.content}`)} limit={5} />
                    </div>
                    <div className="rail-subsection">
                      <div className="rail-subtitle">最近证据</div>
                      <SmallList
                        items={(project.agentRuns?.[0]?.evidences ?? [])
                          .slice(0, 5)
                          .map((evidence) => `${evidence.sourceType}${evidence.sourceName ? ` · ${evidence.sourceName}` : ""}: ${evidence.content}`)}
                        limit={5}
                      />
                    </div>
                  </BoardCard>
                </>
              );
            })() : null}

            {railTab === "candidates" ? (
              <>
            <BoardCard title="Longlist 质量审计" icon={ShieldCheck}>
              <QualityReviewBlock
                review={longlistQualityReview}
                compact
                onRescan={project?.id ? () => void scanLonglist(project.id) : undefined}
                loading={actionLoading === "longlist-scan"}
              />
              {longlistQualityReview.judgeRequests.length ? (
                <div className="rail-subsection">
                  <div className="rail-subtitle">建议裁判</div>
                  <SmallList items={longlistQualityReview.judgeRequests} limit={4} />
                </div>
              ) : null}
            </BoardCard>

            <BoardCard title="人工裁判队列" icon={AlertTriangle}>
              <div className="candidate-list">
                {judgeQueueCandidates
                  .map((candidate) => (
                    <div key={candidate.id} className="candidate-card">
                    <div className="candidate-head">
                      <div>
                          <div className="dr-label">{candidateDisplayName(candidate)}</div>
                          <div className="dr-sub">
                            {candidateCompany(candidate)} · {candidateTitle(candidate)}
                          </div>
                        </div>
                        {(() => {
                          const score = candidate.screening?.score ?? candidate.snapshot?.matchScore ?? null;
                          return <span className={`pill ${scoreBandPillClass(score)}`}>{score ?? "待判"}</span>;
                        })()}
                      </div>
                      <p className="kv compact">{judgeQueueReason(candidate, longlistQualityReview)}</p>
                      <div className="judge-actions">
                        <button type="button" className="btn btn-outline mini" onClick={() => judgeCandidate(candidate, "保留")} disabled={judgingCandidateId === candidate.id}>
                          保留
                        </button>
                        <button type="button" className="btn btn-outline mini" onClick={() => judgeCandidate(candidate, "降级")} disabled={judgingCandidateId === candidate.id}>
                          降级
                        </button>
                        <button type="button" className="btn btn-outline mini danger" onClick={() => judgeCandidate(candidate, "移出")} disabled={judgingCandidateId === candidate.id}>
                          移出
                        </button>
                      </div>
                      <button type="button" className="btn btn-outline full" onClick={() => void openCandidateProfile(candidate)}>
                        <UserRound size={13} />
                        查看履历
                      </button>
                    </div>
                  ))}
                {!judgeQueueCandidates.length ? (
                  <p className="kv muted">当前没有必须裁判的候选人。</p>
                ) : null}
              </div>
            </BoardCard>

            <BoardCard title="候选人分层" icon={UsersRound}>
              <div className="rail-subsection compact-top">
                <div className="rail-subtitle">客户可看</div>
                <SmallList items={longlistSegments.clientReady.slice(0, 5).map((candidate) => `${candidate.name || "未命名"} · ${candidate.currentCompany || "未填公司"}`)} limit={5} />
              </div>
              <div className="rail-subsection">
                <div className="rail-subtitle">电话验证</div>
                <SmallList items={longlistSegments.phoneValidate.slice(0, 5).map((candidate) => `${candidate.name || "未命名"} · ${candidateOneLine(candidate)}`)} limit={5} />
              </div>
            </BoardCard>

            <BoardCard title="候选人排序" icon={UsersRound}>
              <div className="candidate-list">
                {sortedCandidates.slice(0, 6).map((candidate) => (
                  <div key={candidate.id} className="candidate-card">
                    <div className="candidate-head">
                      <div>
                        <div className="dr-label">{candidateDisplayName(candidate)}</div>
                        <div className="dr-sub">
                          {candidateCompany(candidate)} · {candidateTitle(candidate)}
                        </div>
                      </div>
                      <span className={`pill ${candidate.status === "stale_scan" ? "pill-warn" : candidate.screening ? scoreBandPillClass(candidate.screening.score) : candidate.status === "unscored_limit" ? "pill-warn" : "pill-neutral"}`}>
                        {candidate.status === "stale_scan" ? "未入榜" : candidate.screening ? candidate.screening.score : candidate.status === "unscored_limit" ? "超限" : "待评"}
                      </span>
                    </div>
                    {candidate.status === "stale_scan" ? <p className="kv compact">本轮未进入 Top50，保留在候选池但不参与默认评分。</p> : candidate.screening ? <p className="kv compact">{candidate.screening.recommendation}</p> : candidate.status === "unscored_limit" ? <p className="kv compact">未评分：超过本轮评分上限</p> : null}
                    <button
                      type="button"
                      onClick={() => updateShortlist(candidate.id, candidate.funnelStatus === "shortlist" ? "remove" : "add")}
                      disabled={!candidate.screening || actionLoading === candidate.id}
                      className="btn btn-outline full"
                    >
                      {actionLoading === candidate.id ? <Loader2 className="spin" size={13} /> : <Star size={13} />}
                      {candidate.funnelStatus === "shortlist" ? "移出 Shortlist" : "确认 Shortlist"}
                    </button>
                    <button type="button" className="btn btn-outline full" onClick={() => void openCandidateProfile(candidate)}>
                      <UserRound size={13} />
                      查看履历
                    </button>
                  </div>
                ))}
                {!sortedCandidates.length ? (
                  <div className="note">Longlist 会在信息足够后自动从人才库扫描生成。若暂无结果，请继续补充岗位职责、目标背景、地点、薪酬或关键公司。</div>
                ) : null}
              </div>
            </BoardCard>

            <BoardCard title="报告与交付" icon={FileText}>
              {project.reports.length ? (
                project.reports.slice(0, 4).map((report) => (
                  <div key={report.id} className="report">
                    <div>
                      <div className="r-title">{report.title}</div>
                      <div className="r-meta">{formatDate(report.updatedAt)}</div>
                    </div>
                    <span className="pill pill-good">draft</span>
                  </div>
                ))
              ) : (
                <p className="kv muted">暂无报告草稿。</p>
              )}
            </BoardCard>
              </>
            ) : null}

            {railTab === "feedback" ? (
              <BoardCard title="Outreach 反哺循环" icon={RotateCcw}>
                <FeedbackLoopsClient projectId={project.id} initialLoops={[]} compact />
              </BoardCard>
            ) : null}

          </>
        ) : (
          <div className="empty-state large">{newProjectMode ? "创建项目后显示看板。" : "选择项目后显示看板。"}</div>
        )}
      </aside>
      <CandidateProfileDrawer
        key={selectedCandidate?.id ?? "candidate-drawer"}
        projectId={project?.id ?? null}
        candidate={selectedCandidate}
        profile={candidateProfile}
        loading={candidateProfileLoading}
        error={candidateProfileError}
        actionLoading={actionLoading}
        judging={selectedCandidate ? judgingCandidateId === selectedCandidate.id : false}
        index={drawerNavigation.index}
        total={drawerNavigation.total}
        hasPrev={drawerNavigation.hasPrev}
        hasNext={drawerNavigation.hasNext}
        onPrev={() => drawerNavigation.prev && void openCandidateProfile(drawerNavigation.prev)}
        onNext={() => drawerNavigation.next && void openCandidateProfile(drawerNavigation.next)}
        onClose={() => setSelectedCandidate(null)}
        onToggleShortlist={toggleCandidateShortlist}
        onJudge={judgeCandidate}
      />
      {confirmDeleteOpen && project ? (
        <ConfirmDialog
          title={`删除项目「${project.name}」？`}
          description="项目、候选人、评分和报告都会被永久删除，且不能恢复。"
          confirmLabel={actionLoading === "delete-project" ? "删除中…" : "确认删除"}
          danger
          loading={actionLoading === "delete-project"}
          onConfirm={() => void performDeleteProject()}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      ) : null}
    </main>
  );
}
