import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { packages } from "@/lib/content";

export function PackagesSection() {
  return (
    <section id="packages" className="border-b">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          Extracted into two open-source packages
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          The seams were designed in from Phase 3 onward, so pulling these
          out was a real extraction — not a rewrite.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {packages.map((pkg) => (
            <Card key={pkg.name} className="flex flex-col p-6">
              <h3 className="font-mono font-medium">{pkg.name}</h3>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {pkg.tagline}
              </p>
              <p className="mt-4 flex-1 text-sm text-muted-foreground">
                {pkg.description}
              </p>
              <pre className="mt-4 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
                {pkg.install}
              </pre>
              <Link
                href={pkg.href}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", className: "mt-4 w-fit" })}
              >
                View repo ↗
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
