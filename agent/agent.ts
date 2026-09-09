import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
  build: {
    // Cedar WASM and Blob resolve runtime assets and credentials outside Eve snapshots.
    externalDependencies: ["@cedar-policy/cedar-wasm", "@vercel/blob", "jose"],
  },
});
