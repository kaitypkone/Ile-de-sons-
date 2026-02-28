"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Accueil", href: "/" },
  { label: "Chansons", href: "/carte" },
  { label: "Artistes", href: "/artistes" },
  { label: "Géoplaylists", href: "/parcours" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-[color:var(--border)]">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Logo" width={70} height={70} priority />
        </Link>

        {/* Navigation */}
        <nav className="flex gap-0.01">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "px-2 py-1 rounded-xl text-[12px] font-semibold",
                  active
                    ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
                    : "text-[color:var(--muted)] hover:bg-[color:var(--cardTint)]",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}