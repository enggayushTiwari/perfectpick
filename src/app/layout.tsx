import type { Metadata } from "next";
import Link from "next/link";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "PerfectPick",
  description: "Web-first Indian stock intelligence platform starter built for Supabase and Python workers."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link href="/" className="brand">
              <span className="brand-mark">PP</span>
              <span>
                <strong>PerfectPick</strong>
                <small>Indian stock intelligence</small>
              </span>
            </Link>
            <nav className="site-nav">
              <Link href="/watchlist">Watchlist</Link>
              <Link href="/learn">Learn</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}

