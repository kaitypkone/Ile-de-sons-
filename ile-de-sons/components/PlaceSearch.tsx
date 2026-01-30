"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PlaceSearchResult = {
  place: string;
  echelle: string | null;
  echelle2: string | null;
  sous_type: string | null;
  count: number;
};

type Filters = {
  artists: string[];
  echelles: string[];   // ex: ["Rue","Commune","Département","Région"]
  decennies: string[];
  styles: string[];
};

export default function PlaceSearch({
  filters,
  onSelect,
}: {
  filters: Filters;
  onSelect: (place: PlaceSearchResult) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const shown = useMemo(() => results.slice(0, 5), [results]);

  useEffect(() => {
    const qq = q.trim();
    if (qq.length < 2) {
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
        const res = await fetch("/api/places-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({ q: qq, filters }),
        });

        if (!res.ok) return;
        const data = (await res.json()) as PlaceSearchResult[];
        setResults(data);
        setActive(0);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(t);
  }, [q, filters]);

  function pick(r: PlaceSearchResult) {
    setQ(r.place);
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
            onFocus={() => shown.length && setOpen(true)}
            placeholder="Rechercher un lieu (dép, commune, gare, fleuve, lieu précis...)"
            className="w-full bg-transparent outline-none text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--muted)]"
            onKeyDown={(e) => {
              if (!open && e.key === "ArrowDown" && shown.length) setOpen(true);
              if (!open) return;

              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((v) => Math.min(shown.length - 1, v + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((v) => Math.max(0, v - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const s = shown[active];
                if (s) pick(s);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <div className="text-[12px] text-[color:var(--muted)]">
            {loading ? "…" : " "}
          </div>
        </div>
      </div>

      {open && shown.length ? (
        <div
          className="
            absolute left-0 right-0 mt-2 z-50
            rounded-2xl border border-[color:var(--border)]
            bg-white shadow-lg overflow-hidden
          "
        >
          <div className="max-h-[220px] overflow-auto">
            {shown.map((r, i) => (
              <button
                key={`${r.place}-${i}`}
                className={[
                  "w-full text-left px-3 py-3 border-b border-[color:var(--border)] last:border-b-0",
                  i === active ? "bg-[color:var(--cardTint)]" : "bg-white",
                ].join(" ")}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-semibold text-[color:var(--ink)] truncate">
                    {r.place}
                  </div>
                  <div className="text-[12px] text-[color:var(--muted)] shrink-0">
                    {r.count.toLocaleString("fr-FR")}
                  </div>
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--muted)]">
                  {r.echelle2 ?? r.echelle ?? "—"}
                  {r.sous_type ? ` · ${r.sous_type}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
