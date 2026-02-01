"use client";

import Link from "next/link";

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
