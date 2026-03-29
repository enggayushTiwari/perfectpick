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
    </div>
  );
}

