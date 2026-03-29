from __future__ import annotations

from stock_platform.models import IndicatorSnapshot, StrategyOutcome


def evaluate_strategies(snapshot: IndicatorSnapshot) -> list[StrategyOutcome]:
    outputs: list[StrategyOutcome] = []

    trend_match = snapshot.close > snapshot.sma_20 > snapshot.sma_50 > snapshot.sma_200 and snapshot.rsi_14 >= 55
    outputs.append(
        StrategyOutcome(
            strategy_name="Trend Continuation",
            matched=trend_match,
            confidence_pct=78 if trend_match else 34,
            support_points=[
                "Price sits above aligned moving averages",
                "RSI remains in constructive territory",
                "Volume confirmation present" if snapshot.volume_confirmation else "Volume confirmation missing"
            ],
            invalidation="Daily close below the short-term trend shelf.",
            explanation="Aligned moving averages plus healthy momentum fit a continuation setup."
            if trend_match
            else "Trend is not aligned enough for a clean continuation setup."
        )
    )

    breakout_match = snapshot.close > snapshot.sma_20 and snapshot.volume_confirmation and snapshot.rsi_14 >= 60
    outputs.append(
        StrategyOutcome(
            strategy_name="Breakout Confirmation",
            matched=breakout_match,
            confidence_pct=72 if breakout_match else 40,
            support_points=[
                "Recent price expansion",
                "Volume confirmation" if snapshot.volume_confirmation else "Volume still needs confirmation"
            ],
            invalidation="Immediate rejection back into the prior base.",
            explanation="This is a live breakout candidate because participation confirms the move."
            if breakout_match
            else "The setup is close, but still lacks one of the confirmation conditions."
        )
    )

    mean_reversion = snapshot.rsi_14 <= 35
    outputs.append(
        StrategyOutcome(
            strategy_name="Mean Reversion Watchlist",
            matched=mean_reversion,
            confidence_pct=67 if mean_reversion else 20,
            support_points=["RSI reset condition met" if mean_reversion else "No oversold reset visible"],
            invalidation="Momentum expands back into trend continuation.",
            explanation="Oversold conditions make the stock a watchlist candidate for mean reversion."
            if mean_reversion
            else "The stock is not sufficiently washed out for a mean-reversion setup."
        )
    )

    quality_momentum = bool(snapshot.roe_pct and snapshot.roe_pct >= 18 and trend_match)
    outputs.append(
        StrategyOutcome(
            strategy_name="Quality + Momentum",
            matched=quality_momentum,
            confidence_pct=80 if quality_momentum else 38,
            support_points=[
                f"ROE {snapshot.roe_pct:.1f}%" if snapshot.roe_pct is not None else "ROE unavailable",
                "Trend continuation structure" if trend_match else "Trend support incomplete"
            ],
            invalidation="Quality profile weakens or trend support breaks.",
            explanation="Strong capital efficiency plus trend support creates a quality-momentum profile."
            if quality_momentum
            else "The setup lacks either the return profile or the trend support for this bucket."
        )
    )

    outputs.append(
        StrategyOutcome(
            strategy_name="Event Risk Watch",
            matched=snapshot.upcoming_event,
            confidence_pct=60 if snapshot.upcoming_event else 22,
            support_points=[
                "Upcoming scheduled event" if snapshot.upcoming_event else "No near event trigger flagged"
            ],
            invalidation="Catalyst passes without material information change.",
            explanation="Upcoming events justify a wider scenario frame."
            if snapshot.upcoming_event
            else "No catalyst is close enough to elevate event risk."
        )
    )

    return outputs

