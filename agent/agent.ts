import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
  build: {
    // The Cedar engine loads a .wasm file relative to its own module, and
    // Drizzle/pg keep native resolution. Bundling these into eve's authored
    // module snapshots breaks the WASM path, so keep them external.
    externalDependencies: ["@cedar-policy/cedar-wasm", "drizzle-orm", "pg", "jose"],
  },
});
