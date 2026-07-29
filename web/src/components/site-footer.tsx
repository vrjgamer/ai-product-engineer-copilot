import Link from "next/link";
import { links } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>AI Product Engineer Copilot — built test-first, in public.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href={links.repo} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            Main repo
          </Link>
          <Link href={links.mcpToolkit} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            mcp-toolkit
          </Link>
          <Link href={links.evalFramework} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            agent-eval-framework
          </Link>
          <Link href={links.architectureDoc} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            ARCHITECTURE.md
          </Link>
        </div>
      </div>
    </footer>
  );
}
