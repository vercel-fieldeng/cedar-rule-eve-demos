"use client";

import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type AuthorResponse, authorPolicy, savePolicy } from "../_lib/api";
import { CedarCode, Eyebrow, IssueList } from "./primitives";

const EXAMPLES = [
  "Support agents in the EU may not issue refunds over 200.",
  "Contractors can only look up orders, nothing else.",
  "Managers can approve refunds, but never for orders they already refunded in this session.",
  "The reporting service account may only export orders for the client it is scoped to.",
];

export function AuthorPanel({ onOpenInEditor }: { onOpenInEditor: (draft: AuthorResponse["draft"]) => void }) {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AuthorResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function generate() {
    if (!prompt.trim()) return;
    setStatus("generating");
    setError(null);
    setResult(null);
    setSavedId(null);
    try {
      const out = await authorPolicy(prompt.trim());
      setResult(out);
    } catch (e) {
      const err = e as Error & { data?: AuthorResponse };
      if (err.data?.draft) setResult(err.data);
      setError(err.message);
    } finally {
      setStatus("idle");
    }
  }

  async function save() {
    if (!result) return;
    setStatus("saving");
    setError(null);
    try {
      const out = await savePolicy({
        id: result.draft.id,
        description: result.draft.description,
        cedar: result.draft.cedar,
        origin: "ai",
        enabled: false,
      });
      setSavedId(out.policy.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <Eyebrow className="flex items-center gap-1.5">
          <SparklesIcon className="size-3" />
          Natural language to Cedar
        </Eyebrow>
        {result ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {result.model} · {result.attempts} attempt{result.attempts === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void generate();
              }
            }}
            placeholder="Describe a rule in plain English. The model writes a single Cedar policy against the live schema, and it is validated before you see it."
            className="min-h-24 resize-y text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-sm border border-border px-2 py-0.5 text-left text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
            <Button size="sm" disabled={status !== "idle" || !prompt.trim()} onClick={generate} className="shrink-0">
              {status === "generating" ? "Drafting…" : "Draft policy"}
            </Button>
          </div>
        </div>

        {error && !result ? (
          <p className="rounded-sm bg-forbid-muted px-2 py-1.5 text-xs text-forbid">{error}</p>
        ) : null}

        {result ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-xs">{result.draft.id}</span>
                <span className="text-xs text-muted-foreground text-pretty">{result.draft.description}</span>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase",
                  result.validation.ok ? "bg-permit-muted text-permit" : "bg-forbid-muted text-forbid",
                )}
              >
                {result.validation.ok ? "validates" : "invalid"}
              </span>
            </div>

            <CedarCode code={result.draft.cedar} />

            {result.draft.notes ? (
              <div className="flex flex-col gap-1">
                <Eyebrow>Assumptions</Eyebrow>
                <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{result.draft.notes}</p>
              </div>
            ) : null}

            <IssueList issues={result.validation.issues} findings={result.analysis} />

            {error ? <p className="rounded-sm bg-forbid-muted px-2 py-1.5 text-xs text-forbid">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={!result.validation.ok || status !== "idle" || savedId !== null}
                onClick={save}
              >
                {savedId ? "Saved (disabled)" : status === "saving" ? "Saving…" : "Save as disabled"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenInEditor(result.draft)}>
                Open in editor
              </Button>
              {savedId ? (
                <span className="text-xs text-muted-foreground">
                  Saved as <span className="font-mono">{savedId}</span>. Flip it on from the Policies tab when ready.
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            Drafts are generated once, validated against the schema, and retried once with the validator errors if
            the first attempt fails. Nothing is enabled automatically.
          </p>
        )}
      </div>
    </div>
  );
}
