"use client";

import Link from "next/link";

export default function LibraryCard() {
  return (
    <div
      className="
        w-full rounded-2xl border border-[color:var(--border)]
        bg-white/70 backdrop-blur px-4 py-4 shadow-sm
      "
    >
      <div className="text-[15px] font-semibold text-[color:var(--ink)]">
        Bibliothèques
      </div>
      <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
        Accède aux listes et recherche par noms, styles et périodes.
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniButton
          href="/bibliotheque"
          title="Chansons"
          subtitle="Liste et recherche"
        />
        <MiniButton
          href="/bibliotheque-artistes"
          title="Artistes"
          subtitle="Liste et recherche"
        />
      </div>
    </div>
  );
}

function MiniButton({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="
        block rounded-xl border border-[color:var(--border)]
        bg-[color:var(--cardTint)] px-3 py-3
        active:scale-[0.99] transition
      "
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[color:var(--ink)]">
            {title}
          </div>
          <div className="mt-0.5 text-[12px] text-[color:var(--muted)]">
            {subtitle}
          </div>
        </div>
        <div
          className="
            h-7 w-7 shrink-0 rounded-full
            bg-white border border-[color:var(--border)]
            flex items-center justify-center
          "
          aria-hidden="true"
        >
          <span className="text-[color:var(--primary)] text-[16px] leading-none">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
