"use client";

import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from "lucide-react";
import { Fragment } from "react";
import useSWR from "swr";
import type { CodeLanguage } from "../_lib/highlight";
import type { AnalysisFinding, ValidationIssue } from "@/lib/cedar/engine";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Decision badge                                                       */
/* ------------------------------------------------------------------ */

export function DecisionBadge({
  decision,
  enforced,
  size = "md",
  className,
}: {
  decision: "ALLOW" | "DENY";
  /** DENY + not enforced = LOG_ONLY observation. */
  enforced?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const allow = decision === "ALLOW";
  const observed = !allow && enforced === false;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-mono font-medium uppercase tracking-wider",
        size === "sm" && "h-5 px-1.5 text-[10px]",
        size === "md" && "h-6 px-2 text-xs",
        size === "lg" && "h-8 px-3 text-sm",
        allow && "bg-permit-muted text-permit",
        !allow && !observed && "bg-forbid-muted text-forbid",
        observed && "border border-forbid/50 border-dashed text-forbid",
        className,
      )}
      title={observed ? "Denied by policy but not enforced (LOG_ONLY)" : undefined}
    >
      {allow ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
      {decision}
      {observed ? <span className="ml-1 normal-case tracking-normal opacity-80">observed</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Mode pill                                                            */
/* ------------------------------------------------------------------ */

export function ModePill({ mode, className }: { mode: "ENFORCE" | "LOG_ONLY"; className?: string }) {
  const enforce = mode === "ENFORCE";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 font-mono text-xs uppercase tracking-wider",
        enforce ? "bg-foreground text-background" : "border border-audit text-audit-foreground bg-audit-muted",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", enforce ? "bg-permit" : "bg-audit")} />
      {enforce ? "Enforce" : "Log only"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Language-aware code highlighting                                    */
/* ------------------------------------------------------------------ */

export function CedarCode({
  code,
  className,
  wrap = false,
  language = "cedar",
}: {
  code: string;
  className?: string;
  /** Soft-wrap long lines instead of scrolling horizontally (for prose contexts). */
  wrap?: boolean;
  language?: CodeLanguage;
}) {
  const { data: lines } = useSWR(
    ["code-highlight", language, code],
    async ([, lang, source]) => {
      const { highlightCode } = await import("../_lib/highlight");
      return highlightCode(source, lang);
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false },
  );

  return (
    <pre
      tabIndex={0}
      aria-label={`${language === "typescript" ? "TypeScript" : language === "cedar" ? "Cedar" : "Plain text"} code`}
      className={cn(
        "min-w-0 rounded-md border border-border bg-code px-3 py-2.5 font-mono text-sm leading-relaxed text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto",
        className,
      )}
    >
      <code data-language={language}>
        {lines ? lines.map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 ? "\n" : null}
            {line.map((token, tokenIndex) => (
              <span
                key={tokenIndex}
                style={{
                  color: token.color,
                  fontStyle: (token.fontStyle ?? 0) & 1 ? "italic" : undefined,
                  fontWeight: (token.fontStyle ?? 0) & 2 ? 600 : undefined,
                  textDecoration: (token.fontStyle ?? 0) & 4 ? "underline" : undefined,
                }}
              >
                {token.content}
              </span>
            ))}
          </Fragment>
        )) : code}
      </code>
    </pre>
  );
}

/* ------------------------------------------------------------------ */
/* Validation + analysis findings                                       */
/* ------------------------------------------------------------------ */

export function IssueList({
  issues,
  findings,
  className,
}: {
  issues?: ValidationIssue[];
  findings?: AnalysisFinding[];
  className?: string;
}) {
  const rows: { tone: "error" | "warning" | "info"; text: string }[] = [];
  for (const i of issues ?? []) rows.push({ tone: i.severity, text: i.message });
  for (const f of findings ?? []) {
    const tone = f.kind === "info" ? "info" : f.kind === "never-fires" ? "warning" : "warning";
    rows.push({ tone, text: f.message });
  }
  if (rows.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {rows.map((r, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-2 rounded-sm px-2 py-1.5 text-xs leading-relaxed",
            r.tone === "error" && "bg-forbid-muted text-forbid",
            r.tone === "warning" && "bg-audit-muted text-audit-foreground",
            r.tone === "info" && "bg-muted text-muted-foreground",
          )}
        >
          {r.tone === "error" ? (
            <XIcon className="mt-0.5 size-3.5 shrink-0" />
          ) : r.tone === "warning" ? (
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span className="text-pretty">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Section label                                                        */
/* ------------------------------------------------------------------ */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
