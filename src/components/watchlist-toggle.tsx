"use client";

import { useEffect, useMemo, useState } from "react";

const storageKey = "perfectpick.watchlist";

function readWatchlist() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function WatchlistToggle({ symbol }: { symbol: string }) {
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    setWatchlist(readWatchlist());
  }, []);

  const watched = useMemo(() => watchlist.includes(symbol), [symbol, watchlist]);

  function toggle() {
    const next = watched ? watchlist.filter((item) => item !== symbol) : [...watchlist, symbol];
    setWatchlist(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  return (
    <button className="ghost-button" type="button" onClick={toggle}>
      {watched ? "Remove from watchlist" : "Add to watchlist"}
    </button>
  );
}

export function useLocalWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);

  useEffect(() => {
    setSymbols(readWatchlist());
  }, []);

  return symbols;
}

