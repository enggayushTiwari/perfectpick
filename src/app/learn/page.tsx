import { SectionCard } from "@/components/section-card";
import { getLearnGlossary } from "@/lib/repositories";

export default async function LearnPage() {
  const glossary = await getLearnGlossary();

  return (
    <div className="page-stack">
      <section className="stock-hero">
        <span className="eyebrow">Stage 7</span>
        <h1>Learn the metrics without leaving the platform.</h1>
        <p className="section-copy">
          The learning layer keeps beginner explanations beside advanced data so users can grow into the product
          rather than bouncing out to other sites.
        </p>
      </section>

      <SectionCard title="How To Read The Platform" eyebrow="Trust layer">
        <div className="metric-grid">
          <div className="metric-card">
            <strong>1. Start with coverage status</strong>
            <p>Every major tab tells you whether the section is live, partial, or still missing.</p>
          </div>
          <div className="metric-card">
            <strong>2. Check freshness and source basis</strong>
            <p>Use the trust notes on each tab to understand what the section is built from and how recent it is.</p>
          </div>
          <div className="metric-card">
            <strong>3. Use scenarios as frames</strong>
            <p>Strategies and scenarios are structured interpretations, not direct execution calls.</p>
          </div>
          <div className="metric-card">
            <strong>4. Treat AI as explanation only</strong>
            <p>AI is here to summarize and teach. The stored platform data remains the source of truth.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Glossary" eyebrow="Always-on help">
        <div className="metric-grid">
          {glossary.map((item) => (
            <div key={item.term} className="metric-card">
              <strong>{item.term}</strong>
              <p>{item.meaning}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Reading Order" eyebrow="Beginner-friendly flow">
        <div className="metric-grid">
          <div className="metric-card">
            <strong>Overview</strong>
            <p>Use this first to understand the business, the last refresh date, and the main company context.</p>
          </div>
          <div className="metric-card">
            <strong>Fundamentals</strong>
            <p>Use this to judge business quality, profitability, leverage, and whether disclosures are complete enough.</p>
          </div>
          <div className="metric-card">
            <strong>Technicals + Behavior</strong>
            <p>Use these together to see both structure and how the stock usually reacts when momentum or volatility changes.</p>
          </div>
          <div className="metric-card">
            <strong>News + Strategies</strong>
            <p>Use these last to frame what might matter now and what conditions would strengthen or weaken the setup.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
