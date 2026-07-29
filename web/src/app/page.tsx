import { Hero } from "@/components/hero";
import { AgentLoop } from "@/components/agent-loop";
import { PhaseList } from "@/components/phase-list";
import { RigorLayer } from "@/components/rigor-layer";
import { PackagesSection } from "@/components/packages-section";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Hero />
      <AgentLoop />
      <PhaseList />
      <RigorLayer />
      <PackagesSection />
      <SiteFooter />
    </div>
  );
}
