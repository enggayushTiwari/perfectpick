"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLocalWatchlist } from "@/components/watchlist-toggle";
import { stockBundles } from "@/lib/demo-data";

export default function WatchlistPage() {
  const symbols = useLocalWatchlist();
  const items = useMemo(
    () => symbols.map((symbol) => stockBundles[symbol]).filter((item): item is (typeof stockBundles)[string] => Boolean(item)),
    [symbols]
  );

  return (
    <div className="page-stack">
      <section className="stock-hero">
        <span className="eyebrow">User data</span>
        <h1>Watchlist</h1>
        <p className="section-copy">
          In demo mode, watchlist entries are stored in local browser storage. Supabase RLS-backed watchlists are
          ready in the SQL schema for the live setup.
        </p>
      </section>

      <div className="dashboard-grid">
        {items.length === 0 ? (
          <div className="metric-card">No saved stocks yet. Add a name from any stock page.</div>
        ) : (
          items.map((item) => (
            <Link key={item.overview.symbol} href={`/stocks/${item.overview.symbol}`} className="strategy-card" data-matched="true">
              <strong>{item.overview.symbol}</strong>
              <p>{item.overview.companyName}</p>
              <p className="muted">{item.overview.summary}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
