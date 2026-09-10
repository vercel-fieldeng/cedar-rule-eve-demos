"use client";

import { useCallback, useRef } from "react";
import useSWR from "swr";
import { DEFAULT_PERSONA_ID, findPersona } from "./personas";

export const PERSONA_COOKIE = "orderdesk_persona";
const PERSONA_ID_KEY = "persona:active-id";

function readCookie(): string {
  if (typeof document === "undefined") return DEFAULT_PERSONA_ID;
  const value = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${PERSONA_COOKIE}=`));
  try {
    const id = value ? decodeURIComponent(value.slice(PERSONA_COOKIE.length + 1)) : DEFAULT_PERSONA_ID;
    return findPersona(id)?.id ?? DEFAULT_PERSONA_ID;
  } catch { return DEFAULT_PERSONA_ID; }
}

/** Shared simulated identity. No credentials are minted, stored, or refreshed. */
export function usePersona() {
  const { data: personaId = DEFAULT_PERSONA_ID, mutate, isLoading } = useSWR<string>(
    PERSONA_ID_KEY, readCookie,
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: Infinity },
  );
  const persona = findPersona(personaId);
  const selector = useRef("");
  selector.current = persona ? `demo:${persona.id}` : "";
  const bearer = useCallback(() => selector.current, []);
  const select = useCallback((id: string) => {
    if (!findPersona(id)) throw new Error("Unknown demo persona");
    document.cookie = `${PERSONA_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=2592000; SameSite=Lax`;
    void mutate(id, { revalidate: false });
  }, [mutate]);
  return { personaId, persona, bearer, ready: !isLoading && Boolean(persona), isLoading, select };
}
