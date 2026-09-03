import { z } from "zod";
import { AGENT_ID, CEDAR_NAMESPACE, TOOL_CATALOG, TOOL_NAMES } from "./catalog";

/**
 * Generates the Cedar schema (human-readable syntax) from the tool catalog.
 *
 * Parity with AgentCore: AgentCore auto-generates a schema from a Gateway's
 * tools, exposing each tool as `AgentCore::Action::"<target>___<tool>"` with
 * `context.input` typed from the tool's JSON schema. Here every tool becomes
 * `Eve::Action::"<tool>"` with `context.input` typed from the Zod schema.
 *
 * Extras beyond AgentCore's schema:
 *  - `context.system.now: datetime` for time-of-day / expiry policies
 *  - `context.session` with prior-action history for temporal policies
 *    (approval-before-transfer, per-session count caps, budget caps)
 */

type JsonSchema = Record<string, unknown>;

function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
}

function cedarTypeFor(js: JsonSchema): string {
  const type = Array.isArray(js.type) ? js.type[0] : js.type;
  if (js.enum) return "String";
  switch (type) {
    case "string":
      return "String";
    case "integer":
    case "number":
      return "Long";
    case "boolean":
      return "Bool";
    case "array": {
      const items = (js.items ?? {}) as JsonSchema;
      return `Set<${cedarTypeFor(items)}>`;
    }
    case "object":
      return recordTypeFor(js);
    default:
      return "String";
  }
}

function recordTypeFor(js: JsonSchema): string {
  const props = (js.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((js.required ?? []) as string[]);
  const fields = Object.entries(props).map(([key, prop]) => {
    const optional = required.has(key) ? "" : "?";
    return `${quoteIfNeeded(key)}${optional}: ${cedarTypeFor(prop)}`;
  });
  return `{ ${fields.join(", ")} }`;
}

function quoteIfNeeded(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
}

/** Cedar type of `context.input` for a given tool. */
export function inputRecordType(tool: keyof typeof TOOL_CATALOG): string {
  return recordTypeFor(zodToJsonSchema(TOOL_CATALOG[tool].inputSchema));
}

/** Session record fields shared by all actions. */
function sessionRecordType(): string {
  const counts = TOOL_NAMES.map((t) => `${t}: Long`).join(", ");
  const prior = TOOL_NAMES.map(
    (t) =>
      `${t}?: { count: Long, latest: datetime, orderIds: Set<String>, customerIds: Set<String>, amountTotal: Long }`,
  ).join(", ");
  return `{ id: String, turn: Long, counts: { ${counts} }, prior: { ${prior} } }`;
}

export function generateCedarSchema(): string {
  const lines: string[] = [];
  lines.push(`namespace ${CEDAR_NAMESPACE} {`);
  lines.push(`  // Human caller authenticated via JWT. Claims are exposed as tags.`);
  lines.push(`  // AgentCore analogue: AgentCore::OAuthUser`);
  lines.push(`  entity User tags String;`);
  lines.push(``);
  lines.push(`  // Workload / service caller. AgentCore analogue: AgentCore::IamEntity`);
  lines.push(`  entity ServicePrincipal tags String;`);
  lines.push(``);
  lines.push(`  // The agent whose tools are being invoked. AgentCore analogue: AgentCore::Gateway`);
  lines.push(`  entity Agent;`);
  lines.push(``);
  lines.push(`  type System = { now: datetime };`);
  lines.push(`  type Session = ${sessionRecordType()};`);
  lines.push(``);
  for (const tool of TOOL_NAMES) {
    lines.push(`  // ${TOOL_CATALOG[tool].description}`);
    lines.push(`  action "${tool}" appliesTo {`);
    lines.push(`    principal: [User, ServicePrincipal],`);
    lines.push(`    resource: [Agent],`);
    lines.push(`    context: { input: ${inputRecordType(tool)}, system: System, session: Session }`);
    lines.push(`  };`);
    lines.push(``);
  }
  lines.push(`}`);
  return lines.join("\n");
}

let cached: string | undefined;
export function getCedarSchema(): string {
  cached ??= generateCedarSchema();
  return cached;
}

export const ENTITY_TYPES = {
  user: `${CEDAR_NAMESPACE}::User`,
  service: `${CEDAR_NAMESPACE}::ServicePrincipal`,
  agent: `${CEDAR_NAMESPACE}::Agent`,
  action: `${CEDAR_NAMESPACE}::Action`,
} as const;

export const AGENT_RESOURCE = { type: ENTITY_TYPES.agent, id: AGENT_ID } as const;
