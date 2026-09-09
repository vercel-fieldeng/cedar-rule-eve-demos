# OrderDesk: Cedar authorization for eve agents

OrderDesk is a public Next.js 16 demo of an [eve](https://github.com/vercel/eve) customer-operations agent whose tool calls are authorized by Cedar before execution. It includes selectable demo principals, policy editing and validation, AI-assisted policy authoring, dry-run tests, guided scenarios, and a live decision audit feed.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-fieldeng%2Fcedar-rule-eve-demos&project-name=orderdesk-cedar-eve&repository-name=orderdesk-cedar-eve&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D&env=PERSONA_JWT_SECRET&envDescription=Generate%20a%20unique%20secret%20with%20at%20least%2032%20characters.)

## Architecture

Every authored eve tool uses `guarded()` rather than `defineTool()` directly:

1. The browser sends a short-lived demo persona JWT to the eve channel.
2. The guard loads the active policy document and authorization-session document from private Vercel Blob.
3. Cedar evaluates principal, action, agent resource, tool input, time, and session context.
4. An allowed call reserves count, budget, and approval capacity with an ETag-conditional session write.
5. A pending audit object is created before the simulated business operation runs.
6. Successful results become completed session operations. Returned failures and thrown executions release the reservation and never satisfy later policy prerequisites.
7. The audit record becomes `succeeded`, `failed`, or `threw`. A denied call is recorded as `blocked` and never executes.

Policy evaluation is pure and storage-independent. Decision logs are never used to reconstruct authorization state.

## Private Blob layout and consistency

The app requires a **private** Vercel Blob store:

```text
orderdesk/v1/
├── config/policies.json
├── authorization-sessions/<eve-session>.json
└── decisions/<eve-session>/<decision-id>.json
```

- `config/policies.json` contains a schema version, monotonic policy revision, mode, update metadata, and the full policy set. Missing config is initialized with create-only semantics from `policies/*.cedar`.
- Policy administration uses ETags. A stale save receives HTTP `409` and must be retried from freshly loaded configuration; changes are never silently merged.
- Session documents contain successful completions and short-lived reservations. Contending calls retry ETag conflicts with fresh Cedar evaluation, then fail closed when bounded retries are exhausted.
- Decision objects are separate audit records. Clearing them does not clear authorization state.
- Reservations expire after 30 seconds. This conservative window prevents uncertain post-execution state from immediately releasing capacity.

Deleting the Blob store or the `orderdesk/v1/` prefix resets policies, session authorization history, and audit logs. Reset Policies replaces only the policy document and preserves the current engine mode.

## Local setup

Requirements: Node.js 20+, pnpm, a private Vercel Blob store, and Vercel AI Gateway access.

```bash
pnpm install --frozen-lockfile
```

Configure these variables in `.env.development.local`:

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
PERSONA_JWT_SECRET=<unique random value of at least 32 characters>
```

Use `openssl rand -base64 48` or an equivalent cryptographically secure generator for `PERSONA_JWT_SECRET`. Never reuse the example or share this value.

AI Gateway authentication is automatic on Vercel. For local AI policy authoring, authenticate through the Vercel development environment or configure local AI Gateway credentials according to the current Vercel AI Gateway documentation. The Cedar engine, policy CRUD, test panel, scenarios, and decision feed do not require an AI model call; only the Author tab and agent conversation do.

Run the app:

```bash
pnpm dev
```

Open `/console` for the combined chat and policy workbench.

## Demo walkthrough

- **Scenarios:** launch role, input-threshold, temporal approval, count, budget, sequencing, forbid, service-principal, and LOG_ONLY examples.
- **Decisions:** inspect Cedar outcome, execution outcome, determining policy IDs, input, latency, and policy revision. Clear the current session or all audit records.
- **Policies:** edit, toggle, create, delete, and atomically restore defaults. Concurrent administrators receive a stale-edit conflict instead of overwriting each other.
- **Author:** draft one Cedar statement with Vercel AI Gateway, validate it, then save it disabled for human review.
- **Test:** run the exact pure evaluator with a selected principal, tool input, clock, and synthetic session context. Dry runs create neither reservations nor audit records.
- **Schema:** inspect the Cedar schema generated from the same Zod schemas used by eve tools.

Canonical defaults live in `policies/*.cedar`; `pnpm policies:sync` regenerates the build-safe TypeScript copy used by both Next.js and eve. The test suite checks that the two stay synchronized.

## Add a guarded tool

1. Add the tool name, description, mutation flag, and Zod input schema to `lib/cedar/catalog.ts`.
2. Create `agent/tools/<tool_name>.ts` and export `guarded("<tool_name>", { description, inputSchema, execute })`.
3. Return an explicit business result (`ok: true/false` or `found: true/false`) so the guard can distinguish successful completion from a returned failure.
4. Add one or more canonical policies under `policies/<policy-id>.cedar` and corresponding metadata in `policies/metadata.ts`.
5. Run `pnpm policies:sync`, add focused policy tests, then run the validation commands below.

The Cedar schema updates automatically from the catalog. Do not add authorization checks inside business tools; keep enforcement in the reusable guard.

## Validate

```bash
pnpm info
pnpm typecheck
pnpm test
pnpm smoke:cedar
pnpm build
```

## Deployment and trust model

The Deploy button can clone the repository, request `PERSONA_JWT_SECRET`, and provision a private Blob store. It cannot configure project-level Deployment Protection, replace demo authentication, or decide who may administer policies.

After deployment, open the destination Vercel project and enable **Deployment Protection** for the environments you need. Choose Vercel Authentication or password protection if available on your plan. Protection settings do not transfer when a repository is cloned. Without protection, the production domain and its trusted demo controls are public.

This project intentionally exposes:

- selectable personas;
- persona-token minting;
- policy administration APIs;
- simulated order operations.

These are teaching surfaces, not production authentication or authorization. Before using this pattern with real data, replace persona JWTs with your IdP, authorize session ownership, protect policy and audit endpoints with administrator roles, remove public principal selection, and connect tools to idempotent production systems with their own validation and audit controls.

## Default policy behavior

The checked-in policy set demonstrates Cedar default deny, permit/forbid precedence, input constraints, service principals, business-hour and region toggles, sequencing, same-order approval, one-hour approval expiry, consumed approval capacity, three-refund session count limits, and a 2000 session refund budget. All business mutations remain explicitly simulated and keep fixtures pristine for repeatable demos.
