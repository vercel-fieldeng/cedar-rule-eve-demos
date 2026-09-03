"use client";

import { useCallback, useState } from "react";
import { AgentChat } from "@/app/_components/agent-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePersona } from "@/lib/personas/use-persona";
import { cn } from "@/lib/utils";
import type { AuthorResponse } from "../_lib/api";
import type { Scenario } from "../_lib/scenarios";
import { AuthorPanel } from "./author-panel";
import { ConsoleHeader } from "./console-header";
import { DecisionLog } from "./decision-log";
import { PoliciesPanel, PolicyEditor } from "./policies-panel";
import { ScenariosPanel } from "./scenarios-panel";
import { SchemaPanel } from "./schema-panel";
import { TestPanel, type TestPreset } from "./test-panel";

type Tab = "decisions" | "policies" | "author" | "test" | "schema" | "scenarios";

export function ConsoleWorkbench() {
  const identity = usePersona();
  const [tab, setTab] = useState<Tab>("scenarios");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [resetCounter, setResetCounter] = useState(0);
  const [autoSend, setAutoSend] = useState<{ key: number; text: string } | null>(null);
  const [scope, setScope] = useState<"session" | "all">("session");
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<AuthorResponse["draft"] | null>(null);
  const [testPreset, setTestPreset] = useState<TestPreset | null>(null);

  // A persona switch invalidates the current session (different principal).
  const resetKey = `${identity.personaId}:${resetCounter}`;

  const newSession = useCallback(() => {
    setResetCounter((c) => c + 1);
    setAutoSend(null);
  }, []);

  function runScenario(s: Scenario) {
    if (identity.personaId !== s.personaId) identity.select(s.personaId);
    setResetCounter((c) => c + 1);
    setAutoSend({ key: Date.now(), text: s.prompt });
    setScope("session");
    setTab("decisions");
  }

  function openPolicy(id: string) {
    setSelectedPolicy(id);
    setAiDraft(null);
    setTab("policies");
  }

  function openDraftInEditor(draft: AuthorResponse["draft"]) {
    setAiDraft(draft);
    setSelectedPolicy("__draft__");
    setTab("policies");
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <ConsoleHeader onNewSession={newSession} />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Chat */}
        <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <AgentChat
            key={resetKey}
            embedded
            sessionless
            resetKey={resetKey}
            onSessionId={setSessionId}
            autoSend={autoSend}
          />
        </div>

        {/* Workbench */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-col gap-0">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
            {(
              [
                ["scenarios", "Scenarios"],
                ["decisions", "Decisions"],
                ["policies", "Policies"],
                ["author", "Author"],
                ["test", "Test"],
                ["schema", "Schema"],
              ] as [Tab, string][]
            ).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  "relative h-10 flex-none rounded-none border-0 px-4 text-xs text-muted-foreground shadow-none",
                  "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-transparent data-[state=active]:after:bg-foreground",
                )}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="scenarios" className="mt-0 min-h-0 flex-1">
            <ScenariosPanel onRun={runScenario} onOpenPolicy={openPolicy} />
          </TabsContent>
          <TabsContent value="decisions" className="mt-0 min-h-0 flex-1">
            <DecisionLog sessionId={sessionId} scope={scope} onScopeChange={setScope} />
          </TabsContent>
          <TabsContent value="policies" className="mt-0 min-h-0 flex-1">
            {selectedPolicy === "__draft__" && aiDraft ? (
              <PolicyEditor
                key={aiDraft.id}
                policy={null}
                initial={aiDraft}
                onBack={() => {
                  setSelectedPolicy(null);
                  setAiDraft(null);
                }}
                onSaved={(id) => {
                  setAiDraft(null);
                  setSelectedPolicy(id);
                }}
              />
            ) : (
              <PoliciesPanel selectedId={selectedPolicy} onSelect={setSelectedPolicy} />
            )}
          </TabsContent>
          <TabsContent value="author" className="mt-0 min-h-0 flex-1">
            <AuthorPanel onOpenInEditor={openDraftInEditor} />
          </TabsContent>
          <TabsContent value="test" className="mt-0 min-h-0 flex-1">
            <TestPanel
              key={testPreset ? JSON.stringify(testPreset) : "default"}
              preset={testPreset}
              draft={aiDraft ? { id: aiDraft.id, cedar: aiDraft.cedar } : undefined}
            />
          </TabsContent>
          <TabsContent value="schema" className="mt-0 min-h-0 flex-1">
            <SchemaPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
