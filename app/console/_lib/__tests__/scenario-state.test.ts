import { describe, expect, it } from "vitest";
import { initialScenarioUiState, scenarioUiReducer } from "../scenario-state";

describe("scenarioUiReducer", () => {
  it("consumes one-shot commands and does not replay them on unrelated refreshes", () => {
    const launched = scenarioUiReducer(initialScenarioUiState, { type: "run-scenario", text: "hello" });
    expect(launched.command).toEqual({ nonce: 1, text: "hello" });
    const consumed = scenarioUiReducer(launched, { type: "consume-command", nonce: 1 });
    expect(consumed.command).toBeNull();
    expect(consumed.sessionNonce).toBe(1);
  });

  it("manual persona changes clear pending scenarios and create a blank session", () => {
    const launched = scenarioUiReducer(initialScenarioUiState, { type: "run-scenario", text: "hello" });
    const changed = scenarioUiReducer(launched, { type: "manual-persona-change" });
    expect(changed.command).toBeNull();
    expect(changed.sessionNonce).toBe(2);
  });
});
