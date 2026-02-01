"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SongSearchResult = {
  id: string;
  genius_song_id: string | null;
  full_title: string | null;
  title: string | null;
  main_artist: string | null;
  artist_names: string | null;
  place: string | null;
  anciens_id: string | null;
  echelle: string | null;
  echelle2: string | null;
  sous_type: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_embed: string | null;
  youtube_url: string | null;
  spotify_url: string | null;
  soundcloud_url: string | null;
  lyrics: string | null;
  annee: string | null;
  decennie: string | null;
  snippet: string; // avec **…** pour le lieu en gras
};

function renderBoldMarkdownish(text: string) {
  // Convertit "**mot**" en <strong>mot</strong>, sans HTML dangereux
  const parts: Array<{ bold: boolean; value: string }> = [];
  const re = /\*\*(.+?)\*\*/g;

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ bold: false, value: text.slice(last, m.index) });
    parts.push({ bold: true, value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ bold: false, value: text.slice(last) });

  return (
    <span>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-[color:var(--ink)]">
            {p.value}
          </strong>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </span>
  );
}

export default function SongSearch({
  onSelect,
  loading: loadingMap,
  filters,
}: {
  onSelect: (song: SongSearchResult) => void;
  loading?: boolean;
  filters: { artists: string[]; decennies: string[]; styles: string[] };
}) {

  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setOpen(false);
      return;
    }

    const t = window.setTimeout(async () => {
      abortRef.current?.abort();

      try {
  abortRef.current?.abort();
} catch {
  // ignore
}

      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      try {
 const url = new URL("/api/song-search", window.location.origin);
url.searchParams.set("q", q.trim());

for (const a of filters.artists) url.searchParams.append("artist", a);
for (const d of filters.decennies) url.searchParams.append("decennie", d);
for (const s of filters.styles) url.searchParams.append("style", s);

const res = await fetch(url.toString(), { signal: ac.signal });

  if (!res.ok) return;
  const json = await res.json();
  const r = (json?.results ?? []) as SongSearchResult[];
  setResults(r);
  setOpen(true);
  setActive(0);
} catch (e: any) {
  // IMPORTANT : en dev, AbortError ne doit pas faire crasher l’écran
  if (e?.name !== "AbortError") {
    console.error(e);
  }
} finally {
  setLoading(false);
}
    }, 220);

    return () => window.clearTimeout(t);
  }, [q, canSearch]);

  const shown = results.slice(0, 5);


  function pick(song: SongSearchResult) {
    setOpen(false);
    onSelect(song);
  }

  return (
    <div className="relative">
      <div className="rounded-2xl border border-[color:var(--border)] bg-white/85 backdrop-blur shadow-sm px-3 py-2">
        <div className="text-[11px] font-semibold tracking-wide text-[color:var(--muted)]">
          Rechercher une chanson
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => shown.length && setOpen(true)}
            onKeyDown={(e) => {
              if (!open && e.key === "ArrowDown" && shown.length) {
                setOpen(true);
                return;
              }
              if (!open) return;

              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((v) => Math.min(shown.length - 1, v + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((v) => Math.max(0, v - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const s = shown[active];
                if (s) pick(s);
              }
            }}
            placeholder="Rechercher un titre de chanson"
            className="
              w-full rounded-xl border border-[color:var(--border)]
              bg-white px-3 py-2 text-[13px]
              text-[color:var(--ink)] outline-none
            "
          />

          <div className="text-[12px] text-[color:var(--muted)]">
            {loading ? "…" : loadingMap ? "Chargement…" : " "}
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
    <div className="max-h-[240px] overflow-auto">
      {shown.map((r, i) => (
        <button
          key={r.id}
          className={[
            "w-full text-left px-3 py-3 border-b border-[color:var(--border)] last:border-b-0",
            i === active ? "bg-[color:var(--cardTint)]" : "bg-white",
          ].join(" ")}
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(r)}
        >
          <div className="text-[13px] font-semibold text-[color:var(--ink)]">
            {r.full_title ?? r.title ?? "Sans titre"}
          </div>
          <div className="mt-1 text-[12px] text-[color:var(--muted)]">
            {r.place ? `${r.place}${r.echelle ? ` · ${r.echelle}` : ""}` : "—"}
          </div>

          <div className="mt-2 text-[12px] leading-5 text-[color:var(--muted)] line-clamp-3">
            {renderBoldMarkdownish(r.snippet)}
          </div>
        </button>
      ))}
    </div>
  </div>
) : null}
    </div>
  );
}
