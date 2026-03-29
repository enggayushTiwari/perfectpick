from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class SourceDescriptor:
    key: str
    label: str
    authority: str
    cadence: str
    notes: str


@dataclass(slots=True)
class IndicatorSnapshot:
    symbol: str
    close: float
    sma_20: float
    sma_50: float
    sma_200: float
    rsi_14: float
    volume_confirmation: bool
    upcoming_event: bool = False
    roe_pct: float | None = None


@dataclass(slots=True)
class StrategyOutcome:
    strategy_name: str
    matched: bool
    confidence_pct: float
    support_points: list[str] = field(default_factory=list)
    invalidation: str = ""
    explanation: str = ""
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SecurityMasterRecord:
    symbol: str
    exchange: str
    display_name: str
    legal_name: str | None = None
    isin: str | None = None
    sector: str | None = None
    industry: str | None = None
    business_summary: str | None = None
    website_url: str | None = None
    ir_url: str | None = None
    is_primary: bool = True


@dataclass(slots=True)
class EodMarketRecord:
    symbol: str
    exchange: str
    price_date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
