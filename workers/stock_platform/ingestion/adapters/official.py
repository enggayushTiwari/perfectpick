from __future__ import annotations

from stock_platform.ingestion.adapters.base import RunContext
from stock_platform.models import SourceDescriptor


class OfficialSourceAdapter:
    def __init__(self, descriptor: SourceDescriptor, endpoints: list[str]) -> None:
        self.descriptor = descriptor
        self._endpoints = endpoints

    def fetch_plan(self, context: RunContext) -> list[str]:
        return [f"{self.descriptor.label}: {endpoint} -> {context.output_target} ({context.as_of_date})" for endpoint in self._endpoints]


OFFICIAL_SOURCES = [
    OfficialSourceAdapter(
        SourceDescriptor(
            key="nse_eod",
            label="NSE EOD / Historical",
            authority="NSE India",
            cadence="Daily after market close",
            notes="Primary daily price and security master source."
        ),
        [
            "EOD historical data download",
            "Corporate filings and shareholding references"
        ],
    ),
    OfficialSourceAdapter(
        SourceDescriptor(
            key="bse_bhavcopy",
            label="BSE Bhav Copy",
            authority="BSE India",
            cadence="Daily after market close",
            notes="Cross-exchange verification and alternate symbol coverage."
        ),
        ["Equity bhav copy", "Corporate announcement references"],
    ),
    OfficialSourceAdapter(
        SourceDescriptor(
            key="mca_filings",
            label="MCA Filings",
            authority="Ministry of Corporate Affairs",
            cadence="Filing-driven",
            notes="Annual reports, XBRL, and business disclosures."
        ),
        ["Annual reports / XBRL ingestion", "Document extraction queue"],
    ),
    OfficialSourceAdapter(
        SourceDescriptor(
            key="rbi_dbie",
            label="RBI DBIE",
            authority="Reserve Bank of India",
            cadence="Weekly / monthly",
            notes="Macro and regime context overlays."
        ),
        ["Macro factor snapshots", "Market regime context refresh"],
    ),
]


def build_fetch_registry(as_of_date: str) -> dict[str, list[str]]:
    context = RunContext(as_of_date=as_of_date, output_target="supabase")
    return {adapter.descriptor.key: adapter.fetch_plan(context) for adapter in OFFICIAL_SOURCES}
