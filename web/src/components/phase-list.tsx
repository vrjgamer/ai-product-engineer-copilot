import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { phases } from "@/lib/content";

export function PhaseList() {
  return (
    <section id="phases" className="border-b">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          Six phases, each built test-first
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every phase below started with a failing test. Expand a phase to
          see what it actually proves.
        </p>
        <Accordion className="mt-10">
          {phases.map((phase) => (
            <AccordionItem key={phase.number} value={phase.number}>
              <AccordionTrigger>
                <div className="flex items-center gap-4 text-left">
                  <span className="font-mono text-xs text-muted-foreground">
                    Phase {phase.number}
                  </span>
                  <span className="font-medium">{phase.title}</span>
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {phase.status === "done" ? "done" : "planned"}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-muted-foreground">{phase.summary}</p>
                <ul className="mt-4 space-y-2">
                  {phase.details.map((detail) => (
                    <li
                      key={detail}
                      className="flex gap-2 text-sm text-muted-foreground"
                    >
                      <span aria-hidden className="text-foreground/40">
                        —
                      </span>
                      {detail}
                    </li>
                  ))}
                </ul>
                {phase.link && (
                  <Link
                    href={phase.link.href}
                    target={phase.link.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
                  >
                    {phase.link.label}
                  </Link>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
