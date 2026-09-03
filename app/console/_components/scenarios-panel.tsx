"use client";

import { ArrowRightIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PERSONAS } from "@/lib/personas/personas";
import { usePersona } from "@/lib/personas/use-persona";
import { cn } from "@/lib/utils";
import { SCENARIOS, type Scenario } from "../_lib/scenarios";
import { Eyebrow } from "./primitives";

export function ScenariosPanel({
  onRun,
  onOpenPolicy,
}: {
  /** Switch persona, start a fresh session, and prefill the chat composer. */
  onRun: (s: Scenario) => void;
  onOpenPolicy: (id: string) => void;
}) {
  const identity = usePersona();
  const [openId, setOpenId] = useState<string | null>(SCENARIOS[0]?.id ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <Eyebrow>{SCENARIOS.length} guided scenarios</Eyebrow>
        <span className="text-[11px] text-muted-foreground">Each maps to an AgentCore Policy feature</span>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {SCENARIOS.map((s, i) => {
          const persona = PERSONAS.find((p) => p.id === s.personaId);
          const open = openId === s.id;
          const active = identity.personaId === s.personaId;
          return (
            <li key={s.id} className="border-b border-border">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
                aria-expanded={open}
              >
                <span className="mt-0.5 w-5 shrink-0 font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm">{s.title}</span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground text-pretty">{s.agentcore}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
                    active ? "border-foreground text-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {persona?.label ?? s.personaId}
                </span>
              </button>
              {open ? (
                <div className="flex flex-col gap-3 border-t border-dashed border-border bg-muted/30 px-4 py-3 pl-12">
                  {s.setup ? (
                    <div className="flex flex-col gap-1">
                      <Eyebrow>Setup</Eyebrow>
                      <p className="text-xs leading-relaxed text-pretty">{s.setup}</p>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1">
                    <Eyebrow>Say to the agent</Eyebrow>
                    <PromptLine text={s.prompt} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Eyebrow>Expect</Eyebrow>
                    <p className="text-xs leading-relaxed text-pretty">{s.expect}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Eyebrow>Policies</Eyebrow>
                    {s.policies.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onOpenPolicy(id)}
                        className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                  <div>
                    <Button size="sm" onClick={() => onRun(s)}>
                      Run as {persona?.label ?? s.personaId}
                      <ArrowRightIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PromptLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <p className="flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-xs leading-relaxed">
        &ldquo;{text}&rdquo;
      </p>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy prompt"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <CheckIcon className="size-3.5 text-permit" /> : <CopyIcon className="size-3.5" />}
      </Button>
    </div>
  );
}
