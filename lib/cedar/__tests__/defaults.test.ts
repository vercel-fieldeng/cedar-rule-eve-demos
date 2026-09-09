import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERATED_POLICY_TEXT } from "../generated-defaults";
import { SEED_POLICIES } from "../seed-policies";
import { validatePolicies } from "../engine";

const root = process.cwd();

describe("default policies", () => {
  it("keeps generated policy text synchronized with canonical Cedar files", async () => {
    for (const policy of SEED_POLICIES) {
      const canonical = await readFile(resolve(root, "policies", `${policy.id}.cedar`), "utf8");
      expect(GENERATED_POLICY_TEXT[policy.id]).toBe(canonical);
    }
  });

  it("strictly validates the complete default policy set", () => {
    const report = validatePolicies(Object.fromEntries(SEED_POLICIES.map((policy) => [policy.id, policy.cedar])));
    expect(report.ok, report.issues.map((issue) => issue.message).join("\n")).toBe(true);
  });
});
