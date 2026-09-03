import type { Metadata } from "next";
import { ConsoleWorkbench } from "./_components/console-workbench";

export const metadata: Metadata = {
  title: "Policy Console · orderdesk",
  description:
    "Cedar policy workbench for the orderdesk eve agent: live authorization decisions, policy editing, natural-language authoring, and dry-run testing.",
};

export default function ConsolePage() {
  return <ConsoleWorkbench />;
}
