"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { DEFAULT_PERSONA_ID, type Persona } from "./personas";

const COOKIE = "orderdesk_persona";

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : null;
}

function writeCookie(id: string) {
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

interface TokenResponse {
  token: string;
  expiresAt: string;
  persona: Persona;
}

const fetcher = async (url: string): Promise<TokenResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to mint persona token (${res.status})`);
  return res.json();
};

/**
 * Active demo identity. The persona id lives in a cookie so the chat page and
 * the console agree; SWR mints (and refreshes) the bearer token that the eve
 * channel verifies with `jwtHmac`.
 */
export function usePersona() {
  const [personaId, setPersonaId] = useState<string>(DEFAULT_PERSONA_ID);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const fromCookie = readCookie();
    if (fromCookie) setPersonaId(fromCookie);
    setHydrated(true);
  }, []);

  const { data, error, isLoading, mutate } = useSWR<TokenResponse>(
    hydrated ? `/api/personas/token?persona=${encodeURIComponent(personaId)}` : null,
    fetcher,
    {
      // Re-mint well before the 1h expiry.
      refreshInterval: 45 * 60 * 1000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const select = useCallback(
    (id: string) => {
      writeCookie(id);
      setPersonaId(id);
    },
    [],
  );

  /** Function form so eve re-reads the latest token on every request. */
  const bearer = useCallback(() => data?.token ?? "", [data?.token]);

  return {
    personaId,
    persona: data?.persona ?? null,
    token: data?.token ?? null,
    bearer,
    ready: hydrated && Boolean(data?.token),
    isLoading: !hydrated || isLoading,
    error: error as Error | undefined,
    select,
    refresh: mutate,
  };
}

export const PERSONA_COOKIE = COOKIE;
