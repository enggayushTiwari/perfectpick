# PerfectPick

PerfectPick is a web-first Indian stock research platform starter built with Next.js, Supabase, and Python workers. The repository ships with:

- A responsive stock platform shell with overview, fundamentals, charts, news, behavior, peers, and strategy sections
- JSON API routes for the planned MVP endpoints
- A Supabase-first SQL schema with RLS, storage buckets, and ingestion/analytics domains
- Python worker skeletons for official-source ingestion and deterministic analytics

## Quick start

1. Install dependencies with `npm.cmd install`
2. Copy `.env.example` to `.env.local`
3. Run `npm.cmd run dev`
4. Apply the single setup file [supabase/setup.sql](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\supabase\setup.sql) in Supabase

## Project layout

- [src/app](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\src\app): App Router pages and API routes
- [src/components](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\src\components): Responsive UI building blocks
- [src/lib](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\src\lib): Contracts, demo fixtures, repositories, formatting, and Supabase helpers
- [supabase](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\supabase): SQL schema and seed data
- [workers](C:\Users\ayush\.gemini\antigravity\scratch\perfectpick\workers): Python ingestion and analytics skeletons

## Current implementation note

The platform now reads live company, fundamentals, technicals, news, behavior, strategy, and admin data from Supabase `public.app_*` views when those rows exist. On-demand hydration and worker imports write into the private schemas, while the web app stays on the public read layer.

## AI explanation layer

Gemini can now be used as an explanation layer on top of stored platform data. Set one of these server-side env vars:

- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`

Optional:

- `GOOGLE_GENAI_MODEL`
- `GEMINI_MODEL`

Available grounded explanation endpoints:

- `/api/companies/{symbol}/ai-summary`
- `/api/companies/{symbol}/ai-fundamentals`
- `/api/companies/{symbol}/ai-technicals`
- `/api/companies/{symbol}/ai-strategies`

These endpoints only explain live structured rows. If the required stored data is missing, they return an unavailable state instead of narrating fallback fixtures.
