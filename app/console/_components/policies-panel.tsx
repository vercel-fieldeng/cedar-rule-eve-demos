"use client";

import { ChevronRightIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ValidationReport } from "@/lib/cedar/engine";
import { cn } from "@/lib/utils";
import {
  type AnalysisReport,
  type PolicyDto,
  deletePolicy,
  resetPolicies,
  savePolicy,
  togglePolicy,
  usePolicies,
  validateCedar,
} from "../_lib/api";
import { CedarCode, Eyebrow, IssueList } from "./primitives";

const NEW_ID = "__new__";

export function PoliciesPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data, isLoading } = usePolicies();
  const policies = data?.policies ?? [];
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const permits = policies.filter((p) => /^\s*(@[^\n]*\n\s*)*permit/m.test(p.cedar));
    const forbids = policies.filter((p) => !permits.includes(p));
    return { permits, forbids };
  }, [policies]);

  const selected = selectedId === NEW_ID ? null : policies.find((p) => p.id === selectedId) ?? null;

  if (selectedId === NEW_ID || selected) {
    return (
      <PolicyEditor
        key={selectedId}
        policy={selected}
        onBack={() => onSelect(null)}
        onSaved={(id) => onSelect(id)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <Eyebrow>
          {policies.filter((p) => p.enabled).length} enabled · {policies.length} total
        </Eyebrow>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy === "reset"}
            onClick={async () => {
              setBusy("reset");
              try {
                await resetPolicies();
              } finally {
                setBusy(null);
              }
            }}
          >
            <RotateCcwIcon className="size-3.5" />
            Reset seeds
          </Button>
          <Button size="sm" onClick={() => onSelect(NEW_ID)}>
            <PlusIcon className="size-3.5" />
            New
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && policies.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading policies…</p>
        ) : null}
        <Group title="Forbid (always wins)" items={groups.forbids} onSelect={onSelect} busy={busy} setBusy={setBusy} />
        <Group title="Permit" items={groups.permits} onSelect={onSelect} busy={busy} setBusy={setBusy} />
      </div>
    </div>
  );
}

function Group({
  title,
  items,
  onSelect,
  busy,
  setBusy,
}: {
  title: string;
  items: PolicyDto[];
  onSelect: (id: string) => void;
  busy: string | null;
  setBusy: (id: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-1.5 backdrop-blur">
        <Eyebrow>{title}</Eyebrow>
      </div>
      <ul className="flex flex-col">
        {items.map((p) => {
          const isForbid = /^\s*(@[^\n]*\n\s*)*forbid/m.test(p.cedar);
          return (
            <li
              key={p.id}
              className={cn(
                "flex items-start gap-3 border-b border-border px-4 py-2.5",
                !p.enabled && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  isForbid ? "bg-forbid" : "bg-permit",
                  !p.enabled && "bg-muted-foreground/40",
                )}
                aria-hidden
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                onClick={() => onSelect(p.id)}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs text-foreground">{p.id}</span>
                  {p.origin !== "seed" ? (
                    <span className="rounded-sm border border-border px-1 font-mono text-[10px] uppercase text-muted-foreground">
                      {p.origin}
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground text-pretty">
                  {p.description}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  aria-label={`${p.enabled ? "Disable" : "Enable"} ${p.id}`}
                  checked={p.enabled}
                  disabled={busy === p.id}
                  onCheckedChange={async (v) => {
                    setBusy(p.id);
                    try {
                      await togglePolicy(p.id, v);
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
                <Button variant="ghost" size="icon-sm" aria-label={`Open ${p.id}`} onClick={() => onSelect(p.id)}>
                  <ChevronRightIcon className="size-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                               */
/* ------------------------------------------------------------------ */

const TEMPLATE = `@id("my-policy")
permit (
  principal is Eve::User,
  action == Eve::Action::"lookup_order",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") == "support"
};`;

export function PolicyEditor({
  policy,
  onBack,
  onSaved,
  initial,
}: {
  policy: PolicyDto | null;
  onBack: () => void;
  onSaved: (id: string) => void;
  /** Pre-filled draft (from the AI author panel). */
  initial?: { id: string; description: string; cedar: string };
}) {
  const [id, setId] = useState(policy?.id ?? initial?.id ?? "");
  const [description, setDescription] = useState(policy?.description ?? initial?.description ?? "");
  const [cedar, setCedar] = useState(policy?.cedar ?? initial?.cedar ?? TEMPLATE);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisReport | null>(null);
  const [status, setStatus] = useState<"idle" | "validating" | "saving" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const canSave = id.trim().length > 0 && cedar.trim().length > 0 && status === "idle";

  async function runValidate() {
    setStatus("validating");
    setError(null);
    try {
      const out = await validateCedar(cedar);
      setValidation(out.validation);
      setAnalysis(out.analysis ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setStatus("idle");
    }
  }

  async function runSave() {
    setStatus("saving");
    setError(null);
    try {
      const out = await savePolicy({
        id: id.trim(),
        description: description.trim(),
        cedar,
        origin: policy?.origin ?? (initial ? "ai" : "console"),
      });
      setValidation(out.validation);
      setAnalysis(out.analysis);
      onSaved(out.policy.id);
    } catch (e) {
      const err = e as Error & { data?: { validation?: ValidationReport } };
      setError(err.message);
      if (err.data?.validation) setValidation(err.data.validation);
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronRightIcon className="size-3.5 rotate-180" />
          Policies
        </button>
        <div className="flex items-center gap-1">
          {policy ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete policy"
              disabled={status !== "idle"}
              onClick={async () => {
                setStatus("deleting");
                try {
                  await deletePolicy(policy.id);
                  onBack();
                } finally {
                  setStatus("idle");
                }
              }}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          ) : null}
          <Button variant="outline" size="sm" disabled={status !== "idle"} onClick={runValidate}>
            {status === "validating" ? "Validating…" : "Validate"}
          </Button>
          <Button size="sm" disabled={!canSave} onClick={runSave}>
            {status === "saving" ? "Saving…" : policy ? "Save" : "Create"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="flex flex-col gap-1">
            <Eyebrow>Policy id</Eyebrow>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={Boolean(policy)}
              placeholder="refund-under-500"
              className="font-mono text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Eyebrow>Description</Eyebrow>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this rule is for and who it affects"
              className="text-xs"
            />
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Eyebrow>Cedar</Eyebrow>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? "Edit" : "Highlight"}
            </button>
          </div>
          {preview ? (
            <CedarCode code={cedar} className="min-h-40" />
          ) : (
            <Textarea
              value={cedar}
              onChange={(e) => {
                setCedar(e.target.value);
                setValidation(null);
                setAnalysis(null);
              }}
              spellCheck={false}
              className="min-h-56 resize-y font-mono text-[12.5px] leading-relaxed"
            />
          )}
        </div>

        {error ? <p className="rounded-sm bg-forbid-muted px-2 py-1.5 text-xs text-forbid">{error}</p> : null}

        {validation ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Eyebrow>Validation</Eyebrow>
              <span
                className={cn(
                  "rounded-sm px-1.5 font-mono text-[10px] uppercase",
                  validation.ok ? "bg-permit-muted text-permit" : "bg-forbid-muted text-forbid",
                )}
              >
                {validation.ok ? "passes strict schema validation" : "failed"}
              </span>
            </div>
            <IssueList issues={validation.issues} findings={analysis ?? undefined} />
            {validation.ok && (!analysis || analysis.length === 0) ? (
              <p className="text-xs text-muted-foreground">
                No analysis findings: the policy neither always fires nor never fires across the probe set.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
