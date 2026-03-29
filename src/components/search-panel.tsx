"use client";

import type { FormEvent } from "react";
import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/lib/contracts";

type SearchPanelProps = {
  companies: SearchResult[];
  className?: string;
};

function getLocalMatches(companies: SearchResult[], value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return companies.slice(0, 6);
  }

  return companies
    .filter((company) => {
      const haystack = [
        company.symbol,
        company.companyName,
        company.sector,
        company.exchange,
        ...company.tags
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    })
    .slice(0, 8);
}

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

    setResults(getLocalMatches(companies, normalized));

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as { results?: SearchResult[] };
        const remoteResults = payload.results?.slice(0, 8) ?? [];
        const merged = [...getLocalMatches(companies, normalized), ...remoteResults].filter(
          (company, index, collection) =>
            collection.findIndex((candidate) => candidate.symbol === company.symbol) === index
        );
        setResults(merged.slice(0, 8));
      } catch {
        if (!controller.signal.aborted) {
          setResults(getLocalMatches(companies, normalized));
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bestMatch = results[0];
    if (bestMatch) {
      openStock(bestMatch.symbol);
    }
  }

  return (
    <div className={className}>
      <form className="search-shell" onSubmit={handleSubmit}>
        <label>
          <span className="search-label">Search NSE / BSE names</span>
          <input
            aria-label="Search stocks"
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try RELIANCE, TCS, or Infosys"
            list="stock-search-suggestions"
            autoComplete="off"
          />
        </label>
        <datalist id="stock-search-suggestions">
          {results.map((company) => (
            <option key={company.symbol} value={company.symbol}>
              {company.companyName}
            </option>
          ))}
        </datalist>
      </form>
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
