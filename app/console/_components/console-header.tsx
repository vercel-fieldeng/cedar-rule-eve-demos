"use client";

import {
  ChevronDownIcon,
  ExternalLinkIcon,
  MessageSquarePlusIcon,
  ServerIcon,
  ShieldCheckIcon,
  TriangleIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { PERSONAS } from "@/lib/personas/personas";
import { usePersona } from "@/lib/personas/use-persona";
import { cn } from "@/lib/utils";
import { setEngineMode, useEngineMode } from "../_lib/api";
import { ModePill } from "./primitives";

export function ConsoleHeader({ onNewSession }: { onNewSession: () => void }) {
  const identity = usePersona();
  const { data: engine } = useEngineMode();
  const [switching, setSwitching] = useState(false);
  const mode = engine?.mode ?? "ENFORCE";

  async function toggleMode(checked: boolean) {
    setSwitching(true);
    try {
      await setEngineMode(checked ? "ENFORCE" : "LOG_ONLY");
    } finally {
      setSwitching(false);
    }
  }

  const users = PERSONAS.filter((p) => p.kind === "user");
  const services = PERSONAS.filter((p) => p.kind === "service");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/console" className="flex items-center gap-2 font-medium tracking-tight">
          <ShieldCheckIcon className="size-4" />
          <span className="hidden sm:inline">orderdesk</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            policy console
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Persona switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 pr-2 pl-2 font-normal">
              {identity.persona?.kind === "service" ? (
                <ServerIcon className="size-3.5 text-muted-foreground" />
              ) : (
                <UserIcon className="size-3.5 text-muted-foreground" />
              )}
              <span className="max-w-40 truncate text-xs sm:max-w-56 sm:text-sm">
                {identity.persona?.label ?? "Loading identity"}
              </span>
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Users (OAuth-style JWT)
            </DropdownMenuLabel>
            {users.map((p) => (
              <PersonaItem key={p.id} p={p} active={p.id === identity.personaId} onSelect={identity.select} />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Service principals
            </DropdownMenuLabel>
            {services.map((p) => (
              <PersonaItem key={p.id} p={p} active={p.id === identity.personaId} onSelect={identity.select} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Engine mode */}
        <div className="flex items-center gap-2">
          <ModePill mode={mode} className="hidden sm:inline-flex" />
          <Switch
            checked={mode === "ENFORCE"}
            disabled={switching || !engine}
            onCheckedChange={toggleMode}
            aria-label={mode === "ENFORCE" ? "Enforcing policies. Switch to log only." : "Log only. Switch to enforce."}
          />
        </div>

        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onNewSession}>
          <MessageSquarePlusIcon className="size-4" />
          <span className="hidden sm:inline">New session</span>
        </Button>

        <Button asChild size="sm" className="h-8 gap-1.5 px-2.5 sm:px-3">
          <a
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-fieldeng%2Fcedar-rule-eve-demos"
            target="_blank"
            rel="noreferrer"
            aria-label="Deploy this project to Vercel"
          >
            <TriangleIcon className="size-3.5 fill-current" aria-hidden />
            <span className="hidden md:inline">Deploy</span>
            <ExternalLinkIcon className="hidden size-3 md:block" aria-hidden />
          </a>
        </Button>
      </div>
    </header>
  );
}

function PersonaItem({
  p,
  active,
  onSelect,
}: {
  p: (typeof PERSONAS)[number];
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const tags = Object.entries(p.claims)
    .filter(([k]) => ["role", "region", "employment", "scope", "client_id"].includes(k))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(" ") : v}`);
  return (
    <DropdownMenuItem
      onSelect={() => onSelect(p.id)}
      className={cn("flex flex-col items-start gap-1 py-2", active && "bg-accent text-accent-foreground")}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-sm">{p.label}</span>
        {active ? <span className="font-mono text-[10px] uppercase text-muted-foreground">active</span> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span key={t} className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {t}
          </span>
        ))}
      </div>
    </DropdownMenuItem>
  );
}
