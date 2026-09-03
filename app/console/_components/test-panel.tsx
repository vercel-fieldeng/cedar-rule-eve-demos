"use client";

import { FlaskConicalIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AuthorizeResult } from "@/lib/cedar/engine";
import { PERSONAS } from "@/lib/personas/personas";
import { usePersona } from "@/lib/personas/use-persona";
import { cn } from "@/lib/utils";
import { type DryRunBody, dryRun, usePolicies } from "../_lib/api";
import { DecisionBadge, Eyebrow } from "./primitives";

const ACTIONS = [
  "lookup_order",
  "lookup_customer",
  "approve_refund",
  "process_refund",
  "cancel_order",
  "update_shipping_address",
  "apply_discount",
  "export_customer_data",
] as const;

const DEFAULT_INPUT: Record<(typeof ACTIONS)[number], Record<string, unknown>> = {
  lookup_order: { orderId: "ORD-1001" },
  lookup_customer: { customerId: "CUST-1" },
  approve_refund: { orderId: "ORD-1001", amount: 800, note: "Customer escalated" },
  process_refund: { orderId: "ORD-1001", amount: 120, reason: "defective" },
  cancel_order: { orderId: "ORD-1002", notifyCustomer: true },
  update_shipping_address: {
    orderId: "ORD-1002",
    country: "DE",
    line1: "Friedrichstr. 12",
    city: "Berlin",
    postalCode: "10117",
  },
  apply_discount: { orderId: "ORD-1001", percent: 15, code: "SORRY15" },
  export_customer_data: { customerId: "CUST-1", format: "full", includePii: true },
};

export interface TestPreset {
  personaId: string;
  action: (typeof ACTIONS)[number];
  input: Record<string, unknown>;
  now?: string;
  session?: DryRunBody["session"];
}

export function TestPanel({
  draft,
  preset,
}: {
  /** Optional unsaved policy to evaluate together with the stored set. */
  draft?: { id: string; cedar: string };
  preset?: TestPreset | null;
}) {
  const identity = usePersona();
  const { data } = usePolicies();
  const [personaId, setPersonaId] = useState(preset?.personaId ?? identity.personaId);
  const [action, setAction] = useState<(typeof ACTIONS)[number]>(preset?.action ?? "process_refund");
  const [inputText, setInputText] = useState(
    JSON.stringify(preset?.input ?? DEFAULT_INPUT[preset?.action ?? "process_refund"], null, 2),
  );
  const [now, setNow] = useState(preset?.now ?? "");
  const [priorApproval, setPriorApproval] = useState(Boolean(preset?.session?.prior?.approve_refund));
  const [includeDraft, setIncludeDraft] = useState(Boolean(draft));
  const [result, setResult] = useState<Awaited<ReturnType<typeof dryRun>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const enabledCount = data?.policies.filter((p) => p.enabled).length ?? 0;

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(inputText) as Record<string, unknown>;
      } catch {
        throw new Error("Input must be valid JSON.");
      }
      const orderId = typeof input.orderId === "string" ? input.orderId : "ORD-1001";
      const body: DryRunBody = {
        personaId,
        action,
        input,
        now: now || undefined,
        session: priorApproval
          ? {
              counts: { approve_refund: 1 },
              prior: {
                approve_refund: {
                  count: 1,
                  latest: new Date(Date.now() - 5 * 60_000).toISOString(),
                  orderIds: [orderId],
                  customerIds: [],
                  amountTotal: typeof input.amount === "number" ? input.amount : 0,
                },
              },
            }
          : undefined,
        draft: includeDraft && draft ? draft : undefined,
        includeStored: true,
      };
      const out = await dryRun(body);
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dry run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <Eyebrow className="flex items-center gap-1.5">
          <FlaskConicalIcon className="size-3" />
          Dry run
        </Eyebrow>
        <span className="font-mono text-[10px] text-muted-foreground">
          {enabledCount} stored{draft && includeDraft ? " + 1 draft" : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Eyebrow>Principal</Eyebrow>
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Eyebrow>Action</Eyebrow>
            <select
              value={action}
              onChange={(e) => {
                const a = e.target.value as (typeof ACTIONS)[number];
                setAction(a);
                setInputText(JSON.stringify(DEFAULT_INPUT[a], null, 2));
                setResult(null);
              }}
              className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <Eyebrow>context.input</Eyebrow>
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            spellCheck={false}
            className="min-h-28 resize-y font-mono text-[12px] leading-relaxed"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Eyebrow>Clock override (ISO, optional)</Eyebrow>
            <Input
              value={now}
              onChange={(e) => setNow(e.target.value)}
              placeholder="2026-09-05T03:00:00Z"
              className="font-mono text-xs"
            />
          </label>
          <div className="flex flex-col gap-1">
            <Eyebrow>Session state</Eyebrow>
            <label className="flex h-8 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={priorApproval}
                onChange={(e) => setPriorApproval(e.target.checked)}
                className="accent-foreground"
              />
              Prior approve_refund on this order
            </label>
          </div>
        </div>

        {draft ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeDraft}
              onChange={(e) => setIncludeDraft(e.target.checked)}
              className="accent-foreground"
            />
            Include unsaved draft <span className="font-mono">{draft.id}</span>
          </label>
        ) : null}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={run} disabled={running}>
            <PlayIcon className="size-3.5" />
            {running ? "Evaluating…" : "Evaluate"}
          </Button>
          <span className="text-[11px] text-muted-foreground">Not recorded in the decision log.</span>
        </div>

        {error ? <p className="rounded-sm bg-forbid-muted px-2 py-1.5 text-xs text-forbid">{error}</p> : null}

        {result ? <ResultCard result={result.result} policyIds={result.policyIds} /> : null}
      </div>
    </div>
  );
}

function ResultCard({ result, policyIds }: { result: AuthorizeResult; policyIds: string[] }) {
  const [showRequest, setShowRequest] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <DecisionBadge decision={result.decision} size="lg" />
        <span className="font-mono text-[11px] text-muted-foreground">{Math.round(result.durationMs)} ms</span>
      </div>

      <div className="flex flex-col gap-1">
        <Eyebrow>Determining policies</Eyebrow>
        {result.determiningPolicies.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None. Cedar denies by default when no permit matches.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {result.determiningPolicies.map((id) => (
              <li
                key={id}
                className={cn(
                  "rounded-sm px-1.5 py-0.5 font-mono text-[11px]",
                  result.decision === "ALLOW" ? "bg-permit-muted text-permit" : "bg-forbid-muted text-forbid",
                )}
              >
                {id}
              </li>
            ))}
          </ul>
        )}
      </div>

      {result.errors.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Eyebrow className="text-forbid">Evaluation errors</Eyebrow>
          <ul className="flex flex-col gap-0.5">
            {result.errors.map((e, i) => (
              <li key={i} className="font-mono text-[11px] text-forbid">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setShowRequest((s) => !s)}
          className="self-start text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showRequest ? "Hide" : "Show"} authorization request · {policyIds.length} policies evaluated
        </button>
        {showRequest ? (
          <pre className="overflow-x-auto rounded-sm bg-code px-2 py-1.5 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(
              {
                principal: result.request.principal,
                action: result.request.action,
                resource: result.request.resource,
                context: result.request.context,
              },
              null,
              2,
            )}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
