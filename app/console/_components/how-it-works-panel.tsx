"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CedarCode, Eyebrow } from "./primitives";

/* ------------------------------------------------------------------ */
/* Code excerpts (kept verbatim from the source files they cite)        */
/* ------------------------------------------------------------------ */

const CODE_CHANNEL = `// agent/channels/eve.ts
export default eveChannel({
  auth: [
    vercelOidc(),
    jwtHmac({
      algorithm: "HS256",
      issuer: PERSONA_JWT.issuer,
      audiences: [PERSONA_JWT.audience],
      secret: PERSONA_JWT.secret(),
    }),
    localDev(),
  ],
});`;

const CODE_MINT = `// lib/personas/mint.ts
const token = await new SignJWT({ ...rest })   // role, region, scope, ...
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setSubject(String(sub))                     // -> Eve::User id
  .setIssuer(PERSONA_JWT.issuer)
  .setAudience(PERSONA_JWT.audience)
  .setExpirationTime(expiresAt)                // 1 hour
  .sign(encoder.encode(PERSONA_JWT.secret()));`;

const CODE_TOOL = `// agent/tools/process_refund.ts
export default guarded("process_refund", {
  description: TOOL_CATALOG.process_refund.description,
  inputSchema: TOOL_CATALOG.process_refund.inputSchema,
  execute({ orderId, amount, reason }) {
    // ...business logic runs only if Cedar allowed it
  },
});`;

const CODE_GUARD = `// lib/cedar/guard.ts
export function guarded(action, options) {
  return defineTool({
    ...options,
    async execute(input, ctx) {
      const principal = principalFromSessionAuth(ctx.session.auth.current);
      const result = await authorize({
        principal, action, input,
        sessionId: ctx.session.id,
        turn: ctx.session.turn.sequence,
      });

      if (result.enforced) {
        // DENY in ENFORCE mode: never call execute, return a
        // structured denial the model can explain to the user.
        return { denied: true, decision: "DENY", action, reason, ... };
      }

      const output = await options.execute(input, ctx);
      if (result.decision === "DENY") {
        // LOG_ONLY: the tool ran, but flag the would-be denial.
        return { ...output, _policy: { mode: "LOG_ONLY", wouldDeny: true } };
      }
      return output;
    },
  });
}`;

const CODE_PRINCIPAL = `// lib/cedar/engine.ts
export function principalFromSessionAuth(auth) {
  const tags = {};
  for (const [k, v] of Object.entries(auth.attributes)) {
    tags[k] = Array.isArray(v) ? v.join(" ") : v;
  }
  return {
    kind: tags.principal_kind === "service" ? "service" : "user",
    id: auth.subject ?? auth.principalId,   // JWT "sub"
    tags,                                    // JWT claims
  };
}`;

const CODE_REQUEST = `// lib/cedar/engine.ts  (inside evaluate)
const request = {
  principal: { type: "Eve::User", id: "dev@orderdesk.demo" },
  action:    { type: "Eve::Action", id: "process_refund" },
  resource:  { type: "Eve::Agent", id: "orderdesk" },
  context: {
    input:   { orderId: "ORD-1001", amount: 120, reason: "defective" },
    system:  { now: datetime("2026-09-04T14:00:00Z") },
    session: { id, turn, counts: { ... }, prior: { ... } },
  },
};

const result = cedar.isAuthorized({
  ...request,
  policies: { staticPolicies: enabledPoliciesById },
  entities: [principalEntityWithTags, agentEntity],
  schema: getCedarSchema(),
});`;

const CODE_POLICY = `@id("refund-under-500-for-leads")
permit (
  principal is Eve::User,
  action == Eve::Action::"process_refund",
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("role") &&
  ["support-lead", "admin"].contains(principal.getTag("role")) &&
  context.input.amount < 500
};`;

const CODE_TEMPORAL = `@id("refund-large-requires-prior-approval")
permit (
  principal is Eve::User,
  action == Eve::Action::"process_refund",
  resource == Eve::Agent::"orderdesk"
)
when {
  context.input.amount >= 500 &&
  context.session.prior has approve_refund &&
  context.session.prior.approve_refund.orderIds.contains(context.input.orderId) &&
  context.session.prior.approve_refund.amountTotal >= context.input.amount &&
  context.session.prior.approve_refund.latest
    .offset(duration("1h")) > context.system.now
};`;

const CODE_SESSION_CTX = `// lib/cedar/engine.ts
export async function buildSessionContext(sessionId, turn) {
  // Every action that actually EXECUTED earlier in this eve session,
  // read back from the cedar_decisions audit log.
  const rows = await listExecutedActionsForSession(sessionId);
  for (const row of rows) {
    counts[row.action] += 1;
    prior[row.action].orderIds.push(row.input.orderId);
    prior[row.action].amountTotal += row.input.amount;
    prior[row.action].latest = row.createdAt;
  }
  return { id: sessionId, turn, counts, prior };
}`;

const CODE_SCHEMA = `// lib/cedar/schema.ts  (generated from the Zod tool catalog)
namespace Eve {
  entity User tags String;
  entity ServicePrincipal tags String;
  entity Agent;

  action "process_refund" appliesTo {
    principal: [User, ServicePrincipal],
    resource:  [Agent],
    context: {
      input:   { orderId: String, amount: Long, reason: String },
      system:  { now: datetime },
      session: { id: String, turn: Long, counts: {...}, prior: {...} }
    }
  };
  // ...one action per tool
}`;

const CODE_TABLES = `// lib/db/schema.ts  (Drizzle -> Neon Postgres)
cedar_policies   id, description, cedar, enabled, origin, updated_at
cedar_engine     id = "default", mode: "ENFORCE" | "LOG_ONLY"
cedar_decisions  session_id, principal_id, action, input, context,
                 decision, mode, enforced, determining_policies,
                 errors, duration_ms, created_at`;

const CODE_AGENT = `// agent/agent.ts
export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
  build: {
    // cedar-wasm loads a .wasm next to its module; keep it (and pg)
    // out of eve's bundled snapshots.
    externalDependencies: ["@cedar-policy/cedar-wasm", "drizzle-orm", "pg", "jose"],
  },
});`;

/* ------------------------------------------------------------------ */
/* Layout pieces                                                        */
/* ------------------------------------------------------------------ */

function Section({
  step,
  title,
  children,
}: {
  step?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        {step ? <span className="font-mono text-muted-foreground text-xs tabular-nums">{step}</span> : null}
        <h3 className="font-medium text-base tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-pretty text-muted-foreground text-sm leading-relaxed", className)}>{children}</p>;
}

function FileRef({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-code px-1.5 py-0.5 font-mono text-[0.8em] text-foreground">{children}</code>;
}

function Flow() {
  const steps = [
    { label: "Browser", sub: "persona JWT" },
    { label: "eve channel", sub: "jwtHmac verifies" },
    { label: "Model", sub: "picks a tool" },
    { label: "guarded()", sub: "Cedar decides" },
    { label: "Tool", sub: "runs or is blocked" },
    { label: "Neon", sub: "decision logged" },
  ];
  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label="Request lifecycle">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-stretch gap-2">
          <div
            className={cn(
              "flex min-w-28 flex-col justify-center rounded-md border px-3 py-2",
              i === 3 ? "border-foreground bg-foreground text-background" : "border-border bg-card",
            )}
          >
            <span className="font-medium text-xs">{s.label}</span>
            <span className={cn("text-[11px]", i === 3 ? "text-background/70" : "text-muted-foreground")}>
              {s.sub}
            </span>
          </div>
          {i < steps.length - 1 ? (
            <span className="self-center text-muted-foreground" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const FILES: { path: string; role: string }[] = [
  { path: "agent/agent.ts", role: "eve agent definition and model" },
  { path: "agent/channels/eve.ts", role: "web channel; verifies persona JWTs" },
  { path: "agent/tools/*.ts", role: "eight business tools, each wrapped in guarded()" },
  { path: "lib/cedar/guard.ts", role: "the enforcement point (defineTool wrapper)" },
  { path: "lib/cedar/engine.ts", role: "Cedar evaluate/authorize, validation, analysis" },
  { path: "lib/cedar/schema.ts", role: "generates the Cedar schema from the tool catalog" },
  { path: "lib/cedar/catalog.ts", role: "tool names, descriptions, Zod input schemas" },
  { path: "lib/cedar/seed-policies.ts", role: "the seed policy set loaded on first run" },
  { path: "lib/cedar/store.ts", role: "Drizzle queries for policies, mode, decisions" },
  { path: "lib/personas/*", role: "demo personas, JWT minting, client hook" },
  { path: "app/api/policies/*", role: "CRUD, validate, dry-run test, AI author" },
  { path: "app/api/decisions", role: "decision log feed (polled by this console)" },
  { path: "app/console/*", role: "this workbench" },
];

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

export function HowItWorksPanel() {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-10 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-3">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-balance font-medium text-xl tracking-tight">
            Every tool call is an authorization request. Cedar answers it before the tool runs.
          </h2>
          <Prose>
            OrderDesk is an eve agent whose tools sit behind a policy decision point. The model still
            chooses which tool to call and with what arguments, but a Cedar policy set, stored in Neon and
            editable from this console, decides whether that call may execute. Nothing in the tool code
            checks roles or permissions; the guard does it once, uniformly, for all eight tools.
          </Prose>
          <Flow />
        </header>

        <Section step="01" title="Identity: the browser carries a signed persona token">
          <Prose>
            The persona picker mints a one-hour HS256 JWT from <FileRef>/api/personas/token</FileRef>. The
            token&apos;s <FileRef>sub</FileRef> becomes the Cedar principal id and every other claim (role,
            region, scope, employment…) becomes a tag on that principal. The web chat sends it as a bearer
            credential, and the eve channel verifies it with <FileRef>jwtHmac</FileRef>. In production this
            slot would be filled by your IdP&apos;s JWKS instead of a shared secret.
          </Prose>
          <div className="grid items-start gap-3 lg:grid-cols-2 *:min-w-0">
            <CedarCode code={CODE_MINT} language="typescript" wrap />
            <CedarCode code={CODE_CHANNEL} language="typescript" wrap />
          </div>
        </Section>

        <Section step="02" title="Tools declare what they do; the guard decides whether they may">
          <Prose>
            Each file in <FileRef>agent/tools/</FileRef> exports <FileRef>guarded(name, …)</FileRef> instead
            of a bare <FileRef>defineTool</FileRef>. The wrapper is the only place enforcement happens: it
            resolves the principal from the verified session, asks the engine for a decision, records it,
            and either short-circuits with a structured denial or lets <FileRef>execute</FileRef> run.
            The denial is returned to the model as data, not thrown, so the agent can explain which
            policy blocked the request instead of failing the turn.
          </Prose>
          <div className="grid items-start gap-3 lg:grid-cols-[2fr_3fr] *:min-w-0">
            <CedarCode code={CODE_TOOL} language="typescript" wrap />
            <CedarCode code={CODE_GUARD} language="typescript" wrap />
          </div>
        </Section>

        <Section step="03" title="Building the Cedar request">
          <Prose>
            Cedar evaluates a PARC tuple: principal, action, resource, context. The action is the tool
            name, the resource is the agent itself, and the context carries three things: the tool&apos;s
            validated input, the current time, and a summary of what already executed in this session.
            The principal&apos;s claims are attached as entity tags so policies can read them with{" "}
            <FileRef>principal.getTag(&quot;role&quot;)</FileRef>.
          </Prose>
          <div className="grid items-start gap-3 lg:grid-cols-[2fr_3fr] *:min-w-0">
            <CedarCode code={CODE_PRINCIPAL} language="typescript" wrap />
            <CedarCode code={CODE_REQUEST} language="typescript" wrap />
          </div>
        </Section>

        <Section step="04" title="Policies read the request; the schema keeps them honest">
          <Prose>
            Policies are plain Cedar with an <FileRef>@id</FileRef> annotation, which is how the decision
            log cites them by name. Cedar is default-deny: a request is allowed only if at least one{" "}
            <FileRef>permit</FileRef> matches and no <FileRef>forbid</FileRef> does. The schema is
            generated from the Zod input schemas in the tool catalog, so{" "}
            <FileRef>context.input.amount</FileRef> is known to be a <FileRef>Long</FileRef> and a typo
            like <FileRef>context.input.ammount</FileRef> fails strict validation before it can be saved.
          </Prose>
          <div className="grid items-start gap-3 lg:grid-cols-2 *:min-w-0">
            <CedarCode code={CODE_POLICY} language="typescript" wrap />
            <CedarCode code={CODE_SCHEMA} language="typescript" wrap />
          </div>
        </Section>

        <Section step="05" title="Temporal policies come from the decision log">
          <Prose>
            Rules such as &quot;a large refund needs an approval first&quot; or &quot;at most two exports
            per session&quot; need history. Rather than a separate session store, the engine derives{" "}
            <FileRef>context.session</FileRef> from the audit log itself: every decision that executed in
            the current eve session, grouped by action, with counts, order ids, amount totals, and the
            timestamp of the latest one. Because the log is the source of truth, the policy and the audit
            trail can never disagree.
          </Prose>
          <div className="grid items-start gap-3 lg:grid-cols-2 *:min-w-0">
            <CedarCode code={CODE_SESSION_CTX} language="typescript" wrap />
            <CedarCode code={CODE_TEMPORAL} language="typescript" wrap />
          </div>
        </Section>

        <Section step="06" title="ENFORCE vs LOG_ONLY">
          <Prose>
            The engine mode is a single row in Neon, toggled from the header. In <FileRef>ENFORCE</FileRef>{" "}
            a DENY blocks the tool. In <FileRef>LOG_ONLY</FileRef> the same decision is computed and
            recorded, but the tool still runs and its result is annotated with{" "}
            <FileRef>_policy.wouldDeny</FileRef>. This is how you dry-run a new policy set against real
            traffic before flipping it on; the Decisions tab shows the would-be denials in amber.
          </Prose>
          <CedarCode code={CODE_TABLES} language="typescript" wrap />
        </Section>

        <Section step="07" title="The console is a client of the same engine">
          <Prose>
            Everything in these tabs calls the same functions the guard uses. <strong>Test</strong>{" "}
            runs <FileRef>evaluate()</FileRef> with an overridden principal, clock, and session context
            and never writes to the log. <strong>Policies</strong> runs strict validation on save and a
            small analysis pass (unconditional permits, unreachable rules, a probe matrix across the demo
            personas). <strong>Author</strong> asks a model to draft Cedar from a sentence, validates it,
            and saves it disabled so nothing goes live without a human reading it. <strong>Decisions</strong>{" "}
            polls <FileRef>/api/decisions</FileRef> and can be scoped to the current chat session.
          </Prose>
        </Section>

        <Section step="08" title="Runtime notes">
          <Prose>
            Cedar runs in-process through <FileRef>@cedar-policy/cedar-wasm</FileRef>, so a decision is a
            local function call measured in tenths of a millisecond. The WASM binary and the Postgres
            driver are marked external so eve does not bundle them into its tool snapshots. Policies are
            seeded into Neon on first request; after that the database is the only source of truth.
          </Prose>
          <CedarCode code={CODE_AGENT} language="typescript" wrap />
        </Section>

        <Section title="File map">
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {FILES.map((f) => (
              <li key={f.path} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                <code className="truncate font-mono text-foreground text-xs">{f.path}</code>
                <span className="text-muted-foreground text-xs">{f.role}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </ScrollArea>
  );
}
