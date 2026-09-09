import { DEFAULT_POLICY_METADATA } from "../../policies/metadata";
import { GENERATED_POLICY_TEXT } from "./generated-defaults";

export interface SeedPolicy {
  readonly id: string;
  readonly description: string;
  readonly cedar: string;
  readonly enabled: boolean;
}

export const SEED_POLICIES: readonly SeedPolicy[] = DEFAULT_POLICY_METADATA.map((metadata) => {
  const cedar = GENERATED_POLICY_TEXT[metadata.id];
  if (!cedar) throw new Error(`Missing generated Cedar text for ${metadata.id}`);
  return { ...metadata, cedar };
});
