import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { MESSAGE_PREVIEW_MAX_LENGTH } from "@/components/project-chat-types";
import { truncateMessagePreview } from "@/components/project-chat-utils";

export function MarkdownText({ content, enabled }: { content: string; enabled: boolean }) {
  if (!enabled) return <p className="user-input-copy">{content}</p>;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      nodes.push(
        <pre key={`code-${index}`} className="markdown-code">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const headingContent = renderMarkdownInline(heading[2]);
      if (level === 1) nodes.push(<h3 key={`heading-${index}`}>{headingContent}</h3>);
      if (level === 2) nodes.push(<h4 key={`heading-${index}`}>{headingContent}</h4>);
      if (level === 3) nodes.push(<h5 key={`heading-${index}`}>{headingContent}</h5>);
      if (level >= 4) nodes.push(<h6 key={`heading-${index}`}>{headingContent}</h6>);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quotes: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quotes.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      nodes.push(
        <blockquote key={`quote-${index}`}>
          {quotes.map((item, itemIndex) => (
            <span key={`${item}-${itemIndex}`}>
              {itemIndex ? <br /> : null}
              {renderMarkdownInline(item)}
            </span>
          ))}
        </blockquote>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    nodes.push(<p key={`p-${index}`}>{renderMarkdownInline(paragraph.join("\n"))}</p>);
  }

  return <div className="markdown-copy">{nodes}</div>;
}

export function CollapsibleMarkdownText({ content, enabled, maxLength = MESSAGE_PREVIEW_MAX_LENGTH }: { content: string; enabled: boolean; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  const normalized = content.trim();
  const needsCollapse = normalized.length > maxLength;
  const visibleContent = needsCollapse && !expanded ? truncateMessagePreview(normalized, maxLength) : normalized;

  return (
    <div className="collapsible-message">
      <MarkdownText content={visibleContent} enabled={enabled} />
      {needsCollapse ? (
        <button type="button" className="message-toggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <ChevronRight className={expanded ? "open" : ""} size={13} />
          {expanded ? "收起" : `展开全部 ${normalized.length.toLocaleString("zh-CN")} 字`}
        </button>
      ) : null}
    </div>
  );
}

export function AnimatedMarkdownText({
  content,
  enabled,
  animate = false,
  streaming = false,
}: {
  content: string;
  enabled: boolean;
  animate?: boolean;
  streaming?: boolean;
}) {
  const [visibleContent, setVisibleContent] = useState("");

  useEffect(() => {
    if (!animate || streaming) return;

    let cancelled = false;
    let index = 0;
    const step = Math.max(1, Math.ceil(content.length / 180));

    function tick() {
      if (cancelled) return;
      index = Math.min(content.length, index + step);
      setVisibleContent(content.slice(0, index));
      if (index < content.length) window.setTimeout(tick, 18);
    }

    const resetTimer = window.setTimeout(() => {
      if (!cancelled) setVisibleContent("");
    }, 0);
    const timer = window.setTimeout(tick, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
    };
  }, [animate, content, streaming]);

  if (streaming) {
    return (
      <div className="typewriter-copy">
        <MarkdownText content={content || " "} enabled={enabled} />
        <span className="typewriter-caret" aria-hidden="true" />
      </div>
    );
  }

  if (!animate) return <MarkdownText content={content} enabled={enabled} />;

  return (
    <div className="typewriter-copy">
      <MarkdownText content={visibleContent || " "} enabled={enabled} />
      {animate && visibleContent.length < content.length ? <span className="typewriter-caret" aria-hidden="true" /> : null}
    </div>
  );
}

export function renderMarkdownInline(text: string) {
  const parts: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${token}-${match.index}`;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
    if (link) {
      parts.push(
        <a key={key} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>,
      );
    } else if (/^https?:\/\//.test(token)) {
      parts.push(
        <a key={key} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      );
    } else if (token.startsWith("`")) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function markdownBullets(items: string[], fallback = "暂无内容", limit = 8) {
  const shown = items.map((item) => item.trim()).filter(Boolean).slice(0, limit);
  if (!shown.length) return `- ${fallback}`;
  return shown.map((item) => `- ${item}`).join("\n");
}

export function markdownValue(value: string | number | null | undefined, fallback = "待确认") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}
