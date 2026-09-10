import { expect, it } from "vitest";
import { simulatedPersona } from "../../personas/simulated";
import { PERSONAS } from "../../personas/personas";
import { principalFromPersona, principalFromSessionAuth } from "../../personas/principal";

it("maps every public selector to its fixed server-side persona", async () => {
  for (const persona of PERSONAS) {
    const auth = await simulatedPersona(new Request("http://localhost", {
      headers: { authorization: `Bearer demo:${persona.id}`, "x-role": "admin" },
    }));
    expect(auth).toBeTruthy();
    const principal = principalFromSessionAuth(auth!);
    const expected = principalFromPersona(persona);
    expect(principal.kind).toBe(expected.kind);
    expect(principal.id).toBe(expected.id);
    expect(principal.tags).toMatchObject(expected.tags);
    expect(auth?.authenticator).toBe("simulated-persona");
  }
});

it("rejects missing, arbitrary, and legacy JWT selectors", async () => {
  for (const authorization of ["", "Bearer demo:unknown", "Bearer eyJhbGciOiJIUzI1NiJ9.invalid", "Bearer admin"]) {
    expect(await simulatedPersona(new Request("http://localhost", { headers: { authorization } }))).toBeNull();
  }
});
