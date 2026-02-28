"use client";

import { useEffect, useState } from "react";

type Song = {
  id: string;
  full_title: string | null;
  title: string | null;
  main_artist: string | null;
  artist_names: string | null;
  youtube_embed: string | null;
  lyrics: string | null;
};

const SONG_IDS = [
  "9b3c155f-b137-40c3-a7e0-de881614e62a",
  "24d63dfd-3453-4b61-96fb-73dac761555f",
  "9b66c9b4-cc93-4d54-8dde-87258aa1dfca",
  "46ffe2ce-f174-4713-a8e2-d08bdac2ff2d",
  "c37bf8dc-62ff-46dc-97f0-77c12723b6a3",
];

const HIGHLIGHT_TERM = "RER B";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function highlightAll(text: string, term: string) {
  if (!term.trim()) return escapeHtml(text);
  const safe = escapeHtml(text);

  // On gère les espaces "RER B" et la casse
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escapedTerm, "gi");

  return safe.replace(
    re,
    (m) => `<mark class="px-1 rounded bg-amber-200">${m}</mark>`
  );
}

function excerptAround(text: string, term: string, radius = 90) {
  const lower = text.toLowerCase();
  const t = term.toLowerCase().trim();
  if (!t) return text.slice(0, Math.min(180, text.length));

  const idx = lower.indexOf(t);
  if (idx < 0) return text.slice(0, Math.min(180, text.length));

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + t.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}

function MediaPlayer({ youtube_embed }: { youtube_embed: string | null }) {
  const yt = youtube_embed ? youtube_embed.trim() : null;
  if (!yt) return null;

  return (
    <div className="rounded-2xl overflow-hidden border border-[color:var(--border)] bg-black">
      <iframe
        src={yt}
        className="w-full aspect-video"
        title="YouTube player"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

function SongBlock({
  song,
  index,
}: {
  song: Song;
  index: number;
}) {
  const [openLyrics, setOpenLyrics] = useState(false);

  const artist = song.main_artist || song.artist_names || "";
  const title = song.title || song.full_title || "Titre inconnu";

  const lyrics = song.lyrics || "";
  const excerpt = lyrics ? excerptAround(lyrics, HIGHLIGHT_TERM, 90) : "";

  return (
    <div className="w-full rounded-3xl border overflow-hidden shadow-sm border-[color:var(--border)] bg-white/80 backdrop-blur hover:shadow-md transition">
      <div className="p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[14px] font-extrabold text-[color:var(--ink)]">
              {index + 1}. {artist}
            </div>
            <div className="text-[13px] font-semibold text-[color:var(--ink)]">
              {title}
            </div>
          </div>

          <span className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
            {HIGHLIGHT_TERM}
          </span>
        </div>

        <MediaPlayer youtube_embed={song.youtube_embed} />

        {/* Paroles */}
        <div className="pt-1">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-bold text-[color:var(--ink)]">
              Paroles
            </div>

            <button
              type="button"
              onClick={() => setOpenLyrics((v) => !v)}
              className="text-[12px] font-semibold text-[color:var(--primary)] hover:underline"
            >
              {openLyrics ? "Replier" : "Déplier"}
            </button>
          </div>

          {!lyrics ? (
            <div className="mt-2 text-[12px] text-[color:var(--muted)]">
              Paroles indisponibles.
            </div>
          ) : openLyrics ? (
            <div
              className="mt-2 text-[12px] leading-5 text-[color:var(--ink)] whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: highlightAll(lyrics, HIGHLIGHT_TERM),
              }}
            />
          ) : (
            <div className="mt-2 text-[12px] leading-5 text-[color:var(--ink)]">
              <span
                dangerouslySetInnerHTML={{
                  __html: highlightAll(excerpt, HIGHLIGHT_TERM),
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RerBPlaylistPage() {
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/songs-by-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: SONG_IDS }),
      });

      const json = await res.json();
      const list: Song[] = Array.isArray(json?.songs) ? json.songs : [];
      setSongs(list);
    })();
  }, []);

  return (
    <main className="min-h-dvh bg-[color:var(--bg)]">
      {/* Barre "retour" sticky comme les autres playlists (sans carte) */}
      <div className="sticky top-16 z-30 w-full">
        <div className="w-full border-b border-[color:var(--border)] bg-white/95 backdrop-blur shadow-sm">
          <div className="px-4 py-2 bg-white/90 backdrop-blur">
            <a
              href="/parcours"
              className="text-[13px] font-semibold text-[color:var(--primary)] hover:underline"
            >
              ← Retour aux géoplaylists
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <h1 className="text-[18px] font-extrabold text-[color:var(--ink)]">
          RER B : une expérience partagée
        </h1>

        <p className="text-[13px] leading-5 text-[color:var(--muted)]">
          Voici notre sélection de chansons évoquant la ligne du RER B ! En espérant
          que la musique pourra rendre cette expérience plus vivable... 😉
        </p>

        <div className="pt-2 grid gap-4">
          {SONG_IDS.map((id, idx) => {
            const song = songs.find((s) => s.id === id);
            if (!song) return null;

            return (
              <div key={id} className="scroll-mt-[140px]">
                <SongBlock song={song} index={idx} />
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}