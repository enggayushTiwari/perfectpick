"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/lib/contracts";

type SearchPanelProps = {
  companies: SearchResult[];
  className?: string;
};

export function SearchPanel({ companies, className }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<SearchResult[]>(companies.slice(0, 6));
  const router = useRouter();

  useEffect(() => {
    const normalized = deferredQuery.trim();
    if (!normalized) {
      setResults(companies.slice(0, 6));
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as { results?: SearchResult[] };
        setResults(payload.results?.slice(0, 8) ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [companies, deferredQuery]);

  function openStock(symbol: string) {
    startTransition(() => {
      router.push(`/stocks/${symbol}`);
    });
  }

  return (
    <div className={className}>
      <label className="search-shell">
        <span className="search-label">Search NSE / BSE names</span>
        <input
          aria-label="Search stocks"
          className="search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try RELIANCE, TCS, or Infosys"
        />
      </label>
      <div className="search-results">
        {results.map((company) => (
          <button
            key={company.symbol}
            className="search-result-card"
            type="button"
            onClick={() => openStock(company.symbol)}
          >
            <div>
              <strong>{company.symbol}</strong>
              <p>{company.companyName}</p>
            </div>
            <span>{company.sector}</span>
          </button>
        ))}
        {results.length === 0 ? (
          <div className="search-empty">
            No live matches found in the current Supabase security master. Refresh the directory import to widen search coverage.
          </div>
        ) : null}
      </div>
      <div className="search-meta">
        <span>{isPending ? "Opening stock page..." : "Fast search-first discovery"}</span>
        <span>Live Supabase directory results only for the Phase 0 foundation</span>
      </div>
    </div>
  );
}
