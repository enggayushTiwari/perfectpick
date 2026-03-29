"use client";

const tabs = [
  ["overview", "Overview"],
  ["fundamentals", "Fundamentals"],
  ["charts", "Charts"],
  ["news", "News"],
  ["behavior", "Behavior"],
  ["peers", "Peers"],
  ["strategies", "Strategies"]
] as const;

export function StockTabNav() {
  return (
    <nav className="tab-nav" aria-label="Stock detail sections">
      {tabs.map(([id, label]) => (
        <a key={id} href={`#${id}`} className="tab-pill">
          {label}
        </a>
      ))}
    </nav>
  );
}

