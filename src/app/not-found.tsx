import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="page-stack">
      <section className="stock-hero">
        <span className="eyebrow">Not found</span>
        <h1>That stock page is not in the current snapshot.</h1>
        <p className="section-copy">
          The starter ships with demo fixtures for a small set of companies. Once live ingestion is wired up,
          this route will expand to the full NSE/BSE universe.
        </p>
        <Link href="/" className="ghost-button">
          Back to search
        </Link>
      </section>
    </div>
  );
}
