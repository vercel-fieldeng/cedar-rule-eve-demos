"use client";

import { ChevronDownIcon, RadioIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearDecisions, type DecisionDto, useDecisions } from "../_lib/api";
import { DecisionBadge, Eyebrow, relativeTime } from "./primitives";

export function DecisionLog({
  sessionId,
  scope,
  onScopeChange,
}: {
  sessionId?: string;
  scope: "session" | "all";
  onScopeChange: (s: "session" | "all") => void;
}) {
  const effectiveSession = scope === "session" ? sessionId : undefined;
  const { data, isLoading } = useDecisions(effectiveSession);
  const decisions = data?.decisions ?? [];
  const [clearing, setClearing] = useState(false);

  const allows = decisions.filter((d) => d.decision === "ALLOW").length;
  const denies = decisions.length - allows;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Eyebrow className="flex items-center gap-1.5">
            <RadioIcon className="size-3 text-permit" />
            Decisions
          </Eyebrow>
          <div className="flex items-center rounded-sm border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onScopeChange("session")}
              className={cn(
                "rounded-[3px] px-2 py-0.5",
                scope === "session" ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              This session
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("all")}
              className={cn(
                "rounded-[3px] px-2 py-0.5",
                scope === "all" ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              All
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            <span className="text-permit">{allows}</span> / <span className="text-forbid">{denies}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear decision log"
            disabled={clearing || decisions.length === 0}
            onClick={async () => {
              setClearing(true);
              try {
                await clearDecisions();
              } finally {
                setClearing(false);
              }
            }}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {decisions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground text-pretty">
              {isLoading
                ? "Loading decisions…"
                : scope === "session" && !sessionId
                  ? "Send a message in the chat. Every tool call the agent makes is authorized by Cedar and lands here."
                  : "No decisions yet."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {decisions.map((d) => (
              <DecisionRow key={d.id} d={d} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DecisionRow({ d }: { d: DecisionDto }) {
  const [open, setOpen] = useState(false);
  const principal = d.principalType.endsWith("ServicePrincipal") ? `svc:${d.principalId}` : d.principalId;
  return (
    <li className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
        aria-expanded={open}
      >
        <DecisionBadge decision={d.decision} enforced={d.enforced} size="sm" className="mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-xs text-foreground">{d.action}</span>
            <span className="truncate text-xs text-muted-foreground">{principal}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {d.determiningPolicies.length > 0 ? (
              <span className="truncate font-mono">{d.determiningPolicies.join(", ")}</span>
            ) : (
              <span className="italic">no matching permit (default deny)</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
          <span>{relativeTime(d.createdAt)}</span>
          <ChevronDownIcon className={cn("size-3 transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-dashed border-border bg-muted/30 px-4 py-3 text-xs">
          <KV k="principal" v={`${d.principalType}::"${d.principalId}"`} />
          <KV k="action" v={`Eve::Action::"${d.action}"`} />
          <KV k="resource" v={d.resource} />
          <KV k="mode" v={`${d.mode}${d.enforced ? "" : " (not enforced)"}`} />
          <KV k="latency" v={`${d.durationMs} ms`} />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">context.input</span>
            <pre className="overflow-x-auto rounded-sm bg-code px-2 py-1.5 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(d.input, null, 2)}
            </pre>
          </div>
          {d.errors.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-forbid">evaluation errors</span>
              <ul className="flex flex-col gap-1 text-forbid">
                {d.errors.map((e, i) => (
                  <li key={i} className="font-mono text-[11px]">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className="min-w-0 break-all font-mono text-[11px]">{v}</span>
    </div>
  );
}
