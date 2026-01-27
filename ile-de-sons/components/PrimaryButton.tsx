"use client";

import Link from "next/link";
import { ReactNode } from "react";

type Props = {
  href: string;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
};

export default function PrimaryButton({ href, title, subtitle, extra }: Props) {
  return (
    <Link
      href={href}
      className="
        group block w-full rounded-2xl border border-[color:var(--border)]
        bg-white/70 backdrop-blur
        px-4 py-4 shadow-sm
        active:scale-[0.99] transition
      "
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-[color:var(--ink)]">
            {title}
          </div>

          {subtitle ? (
            <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
              {subtitle}
            </div>
          ) : null}

          {extra ? <div className="mt-2">{extra}</div> : null}
        </div>

        <div
          className="
            mt-1 h-9 w-9 rounded-full
            bg-[color:var(--primarySoft)]
            border border-[color:var(--border)]
            flex items-center justify-center
            group-hover:bg-[color:var(--primarySoft2)] transition
          "
          aria-hidden="true"
        >
          <span className="text-[color:var(--primary)] text-[18px] leading-none">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
