"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CedarCode, Eyebrow } from "./primitives";

const CODE_GUARD = `// lib/cedar/guard.ts
const result = await authorizationRunner.run({
  principal,
  action,
  input,
  sessionId: ctx.session.id,
  execute: () => options.execute(input, ctx),
});

if (result.kind === "blocked") {
  return { authorized: false, outcome: "blocked", ... };
}`;

const CODE_RESERVATION = `// lib/cedar/operation-runner.ts
1. Read policy config + session state from private Blob
2. Prune expired reservations and evaluate Cedar
3. Conditionally save a pending reservation with the session ETag
4. Retry conflicts with fresh state and a fresh decision
5. Write a pending audit record, then execute exactly once
6. Complete only successful results; release failures and throws`;

const CODE_POLICY_WRITE = `// One activation point, no delete/reseed gap
const current = await getPolicyConfig();
const next = validateAndIncrement(current.config);
await put(POLICY_PATH, JSON.stringify(next), {
  access: "private",
  allowOverwrite: true,
  ifMatch: current.etag,
});`;

const CODE_TEMPORAL = `@id("refund-large-requires-prior-approval")
permit (
  principal is Eve::User,
  action == Eve::Action::"process_refund",
  resource == Eve::Agent::"orderdesk"
)
when {
  context.input.amount >= 500 &&
  context.session has refundApproval &&
  context.session.refundApproval.orderId == context.input.orderId &&
  context.session.refundApproval.availableAmount >= context.input.amount &&
  context.system.now.durationSince(context.session.refundApproval.latest)
    <= duration("1h")
};`;

const CODE_LAYOUT = `orderdesk/v1/
├── config/policies.json
│   schemaVersion, revision, mode, policies[]
├── authorization-sessions/<eve-session>.json
│   successful completions + expiring reservations
└── decisions/<eve-session>/<decision-id>.json
    immutable authorization facts + execution outcome`;

function Section({ step, title, children }: { step?: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        {step ? <span className="font-mono text-xs tabular-nums text-muted-foreground">{step}</span> : null}
        <h3 className="font-medium text-base tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function FileRef({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-code px-1.5 py-0.5 font-mono text-[0.8em] text-foreground">{children}</code>;
}

function Flow() {
  const steps = [
    { label: "Browser", sub: "persona JWT" },
    { label: "eve", sub: "verified session" },
    { label: "guarded()", sub: "reserve + decide" },
    { label: "Tool", sub: "simulated once" },
    { label: "Blob", sub: "complete + audit" },
  ];
  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label="Request lifecycle">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-stretch gap-2">
          <div
            className={cn(
              "flex min-w-28 flex-col justify-center rounded-md border px-3 py-2",
              index === 2 ? "border-foreground bg-foreground text-background" : "border-border bg-card",
            )}
          >
            <span className="font-medium text-xs">{step.label}</span>
            <span className={cn("text-[11px]", index === 2 ? "text-background/70" : "text-muted-foreground")}>
              {step.sub}
            </span>
          </div>
          {index < steps.length - 1 ? <span className="self-center text-muted-foreground" aria-hidden>→</span> : null}
        </li>
      ))}
    </ol>
  );
}

const FILES = [
  { path: "agent/tools/*.ts", role: "simulated business tools wrapped by guarded()" },
  { path: "lib/cedar/operation-runner.ts", role: "reservation, retry, audit, execute, finalize lifecycle" },
  { path: "lib/cedar/engine.ts", role: "pure Cedar request construction and evaluation" },
  { path: "lib/cedar/store.ts", role: "versioned policy, session, and decision documents" },
  { path: "lib/cedar/blob-storage.ts", role: "thin private Blob adapter with ETag writes" },
  { path: "lib/cedar/documents.ts", role: "validated storage document schemas" },
  { path: "lib/cedar/catalog.ts", role: "shared tool names and Zod input schemas" },
  { path: "lib/cedar/schema.ts", role: "Cedar schema generated from the tool catalog" },
  { path: "policies/*.cedar", role: "canonical, readable default policies" },
  { path: "lib/cedar/generated-defaults.ts", role: "build-safe generated copy used by Next.js and eve" },
  { path: "lib/personas/*", role: "trusted demo identities and JWT projection" },
  { path: "app/api/policies/*", role: "ETag-safe CRUD, validation, dry-run, and AI authoring" },
  { path: "app/api/decisions", role: "session/all audit feed and scoped clearing" },
];

export function HowItWorksPanel() {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-10 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-3">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-balance font-medium text-xl tracking-tight">
            Cedar decides before execution; Blob reservations make that decision safe under concurrency.
          </h2>
          <Prose>
            OrderDesk is an eve agent with eight simulated tools. The model chooses a tool and arguments,
            while one reusable guard loads the active policy revision, evaluates Cedar, and reserves shared
            authorization capacity before business code can run.
          </Prose>
          <Flow />
        </header>

        <Section step="01" title="Identity is verified once and projected consistently">
          <Prose>
            The persona picker mints a one-hour demo JWT. The eve channel verifies it, then the same
            claims-to-tags helper projects both live sessions and dry-run personas into Cedar principals.
            Token refresh uses a stable credential getter, so it does not reset the chat or resend a scenario.
          </Prose>
        </Section>

        <Section step="02" title="The guard owns the complete operation lifecycle">
          <Prose>
            Each tool exports <FileRef>guarded(name, options)</FileRef>. A valid DENY blocks execution in
            ENFORCE mode. LOG_ONLY may execute a valid DENY, but evaluation, storage, and malformed-document
            failures always fail closed. Returned business failures and thrown exceptions are never counted as
            successful prerequisites.
          </Prose>
          <div className="grid items-start gap-3 lg:grid-cols-2 *:min-w-0">
            <CedarCode code={CODE_GUARD} language="typescript" wrap />
            <CedarCode code={CODE_RESERVATION} language="typescript" wrap />
          </div>
        </Section>

        <Section step="03" title="Private Blob separates policy, state, and audit data">
          <Prose>
            Authorization state is not reconstructed from logs. The session document contains only successful
            operations and short-lived pending reservations. Decision objects are a separate audit stream and
            can be cleared without changing what Cedar knows about the session.
          </Prose>
          <CedarCode code={CODE_LAYOUT} language="text" wrap />
        </Section>

        <Section step="04" title="ETags provide optimistic concurrency">
          <Prose>
            Every policy edit includes the ETag the console read. A mismatched conditional write returns 409,
            refetches the active config, and never silently merges administrators&apos; changes. A successful,
            validated write increments the revision and is the activation point for later calls.
          </Prose>
          <CedarCode code={CODE_POLICY_WRITE} language="typescript" wrap />
        </Section>

        <Section step="05" title="Reservations close count and budget races">
          <Prose>
            Before execution, the runner conditionally adds a reservation to the session document. Competing
            calls rebuild context from fresh state after an ETag conflict. Count and refund-budget rules include
            active reservations; positive sequencing and approval prerequisites require successful completions.
          </Prose>
        </Section>

        <Section step="06" title="Approval capacity is order-scoped and consumable">
          <Prose>
            Large refunds see only successful approvals for the same order from the last hour. Successful and
            reserved refunds consume that capacity. An unrelated, expired, returned-failure, or thrown approval
            cannot authorize a refund.
          </Prose>
          <CedarCode code={CODE_TEMPORAL} language="typescript" wrap />
        </Section>

        <Section step="07" title="The console uses the same evaluator without side effects">
          <Prose>
            Test builds an explicit synthetic session context and writes nothing. Policies validates the complete
            document before activation. Decisions shows policy revision and operation outcome: blocked, pending,
            succeeded, failed, or threw. Session-scoped clearing removes only that session&apos;s audit objects.
          </Prose>
        </Section>

        <Section step="08" title="Trust boundary for this public demo">
          <Prose>
            Persona selection, token minting, and policy administration are intentionally trusted demo features.
            They are not production authentication. A real deployment must replace personas with an identity
            provider and protect policy APIs. Vercel Deployment Protection is configured on the destination
            project and does not transfer through the Deploy button.
          </Prose>
        </Section>

        <Section title="File map">
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {FILES.map((file) => (
              <li key={file.path} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                <code className="truncate font-mono text-xs text-foreground">{file.path}</code>
                <span className="text-xs text-muted-foreground">{file.role}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </ScrollArea>
  );
}
