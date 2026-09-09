export interface ScenarioCommand {
  nonce: number;
  text: string;
}

export interface ScenarioUiState {
  sessionNonce: number;
  commandNonce: number;
  command: ScenarioCommand | null;
}

export const initialScenarioUiState: ScenarioUiState = {
  sessionNonce: 0,
  commandNonce: 0,
  command: null,
};

export type ScenarioUiEvent =
  | { type: "new-session" }
  | { type: "manual-persona-change" }
  | { type: "run-scenario"; text: string }
  | { type: "consume-command"; nonce: number };

export function scenarioUiReducer(state: ScenarioUiState, event: ScenarioUiEvent): ScenarioUiState {
  switch (event.type) {
    case "new-session":
    case "manual-persona-change":
      return { ...state, sessionNonce: state.sessionNonce + 1, command: null };
    case "run-scenario": {
      const commandNonce = state.commandNonce + 1;
      return {
        sessionNonce: state.sessionNonce + 1,
        commandNonce,
        command: { nonce: commandNonce, text: event.text },
      };
    }
    case "consume-command":
      return state.command?.nonce === event.nonce ? { ...state, command: null } : state;
  }
}
