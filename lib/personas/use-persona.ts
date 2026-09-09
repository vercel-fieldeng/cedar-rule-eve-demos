"use client";

import { useCallback, useRef } from "react";
import useSWR from "swr";
import { DEFAULT_PERSONA_ID, type Persona } from "./personas";

const COOKIE = "orderdesk_persona";
const PERSONA_ID_KEY = "persona:active-id";

function readCookie(): string {
  if (typeof document === "undefined") return DEFAULT_PERSONA_ID;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : DEFAULT_PERSONA_ID;
}

function writeCookie(id: string) {
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

interface TokenResponse {
  token: string;
  expiresAt: string;
  persona: Persona;
}

const tokenFetcher = async (url: string): Promise<TokenResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to mint persona token (${res.status})`);
  return res.json();
};

/**
 * Active demo identity. The persona id lives in a cookie so the chat page and
 * the console agree across reloads, and in the SWR cache so every component
 * on the page switches together. SWR mints (and refreshes) the bearer token
 * that the eve channel verifies with `jwtHmac`.
 */
export function usePersona() {
  // Client-only state shared across all hook instances through the SWR cache.
  const { data: personaId = DEFAULT_PERSONA_ID, mutate: setPersonaId, isLoading: idLoading } = useSWR<string>(
    PERSONA_ID_KEY,
    () => readCookie(),
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: Number.POSITIVE_INFINITY },
  );

  const { data, error, isLoading, mutate } = useSWR<TokenResponse>(
    idLoading ? null : `/api/personas/token?persona=${encodeURIComponent(personaId)}`,
    tokenFetcher,
    {
      // Re-mint well before the 1h expiry.
      refreshInterval: 45 * 60 * 1000,
      revalidateOnFocus: false,
      keepPreviousData: false,
    },
  );

  const select = useCallback(
    (id: string) => {
      writeCookie(id);
      void setPersonaId(id, { revalidate: false });
    },
    [setPersonaId],
  );

  const tokenRef = useRef(data?.token ?? "");
  tokenRef.current = data?.token ?? "";

  /** Stable function form so Eve re-reads the newest token before every request. */
  const bearer = useCallback(() => tokenRef.current, []);

  return {
    personaId,
    persona: data?.persona ?? null,
    token: data?.token ?? null,
    bearer,
    ready: Boolean(data?.token),
    isLoading: idLoading || isLoading,
    error: error as Error | undefined,
    select,
    refresh: mutate,
  };
}

export const PERSONA_COOKIE = COOKIE;
