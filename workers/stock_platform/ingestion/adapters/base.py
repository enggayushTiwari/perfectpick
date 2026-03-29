from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from stock_platform.models import SourceDescriptor


@dataclass(slots=True)
class RunContext:
    as_of_date: str
    output_target: str


class SourceAdapter(Protocol):
    descriptor: SourceDescriptor

    def fetch_plan(self, context: RunContext) -> list[str]:
        """Return the concrete fetch steps the worker should execute."""

