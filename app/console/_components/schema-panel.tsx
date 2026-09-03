"use client";

import { Eyebrow } from "./primitives";
import { useSchema } from "../_lib/api";
import { cn } from "@/lib/utils";

export function SchemaPanel() {
  const { data, isLoading } = useSchema();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <Eyebrow>Cedar schema · generated from the tool catalog</Eyebrow>
        {data ? <span className="font-mono text-[10px] text-muted-foreground">{data.tools.length} actions</span> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          Every eve tool&apos;s Zod input schema becomes a Cedar action whose <span className="font-mono">context.input</span>{" "}
          is typed. Policies are validated against this schema on save, so a rule that references a field the tool does not
          have is rejected before it can ever run.
        </p>

        {data ? (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {data.tools.map((t) => (
              <li key={t.name} className="flex flex-col gap-0.5 rounded-md border border-border px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{t.name}</span>
                  <span
                    className={cn(
                      "rounded-sm px-1 font-mono text-[10px] uppercase",
                      t.mutating ? "bg-audit-muted text-audit-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.mutating ? "mutating" : "read"}
                  </span>
                </div>
                <span className="text-[11px] leading-relaxed text-muted-foreground text-pretty">{t.description}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <pre className="overflow-x-auto rounded-md border border-border bg-code px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
          {isLoading ? "Loading schema…" : data?.schema}
        </pre>
      </div>
    </div>
  );
}
