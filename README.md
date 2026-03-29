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

The web app runs in demo snapshot mode until Supabase environment variables and real workers are configured. The schema, route contracts, and worker interfaces match the production design, so live adapters can replace the fixtures without rewriting the UI.
