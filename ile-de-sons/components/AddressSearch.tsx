"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type AddressSearchResult = {
  label: string;
  lat: number;
  lng: number;
};

export default function AddressSearch({
  onSelect,
}: {
  onSelect: (addr: AddressSearchResult) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const shown = useMemo(() => results.slice(0, 5), [results]);

  useEffect(() => {
    const qq = q.trim();
    if (qq.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    const t = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      try {
        const res = await fetch("/api/address-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({ q: qq }),
        });

        if (!res.ok) return;

        const data = (await res.json()) as AddressSearchResult[];
        setResults(Array.isArray(data) ? data : []);
        setActive(0);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [q]);

  function pick(r: AddressSearchResult) {
    setQ(r.label);
    setOpen(false);
    onSelect(r);
  }

  return (
    <div className="relative">
      <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Tape une adresse (ex: 10 rue de la Paix, Paris)"
            className="w-full bg-transparent outline-none text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--muted)]"
            onKeyDown={(e) => {
              if (!open) return;

              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const r = shown[active];
                if (r) pick(r);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />

          {loading ? (
            <div className="text-[12px] text-[color:var(--muted)]">…</div>
          ) : null}
        </div>
      </div>

      {open && shown.length ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-lg">
          {shown.map((r, i) => (
            <button
              key={`${r.lat}-${r.lng}-${i}`}
              className={[
                "w-full text-left px-3 py-2 text-[13px] leading-snug",
                i === active ? "bg-[color:var(--cardTint)]" : "bg-white",
              ].join(" ")}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <div className="font-semibold text-[color:var(--ink)]">Adresse</div>
              <div className="text-[12px] text-[color:var(--muted)]">{r.label}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}