"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";

type Artist = {
  id: string;
  artiste: string | null;
  image_wikipedia: string | null;
};

export default function ArtistCarousel() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("artistes")
        .select("id, artiste, image_wikipedia")
        .not("image_wikipedia", "is", null)
        .limit(40);

      if (error) {
        console.error("Supabase artistes error:", error);
      }

      if (!cancelled) {
        setArtists((data as Artist[]) ?? []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (artists.length < 2) return;
    const t = window.setInterval(() => {
      setIdx((v) => (v + 1) % artists.length);
    }, 2200);
    return () => window.clearInterval(t);
  }, [artists.length]);

  const current = useMemo(
    () => (artists.length ? artists[idx] : null),
    [artists, idx]
  );
  const next1 = useMemo(
    () => (artists.length > 1 ? artists[(idx + 1) % artists.length] : null),
    [artists, idx]
  );
  const next2 = useMemo(
    () => (artists.length > 2 ? artists[(idx + 2) % artists.length] : null),
    [artists, idx]
  );

  return (
    <Link
      href="/artistes"
      className="
        block w-full rounded-2xl border border-[color:var(--border)]
        bg-white/70 backdrop-blur px-4 py-4 shadow-sm
        active:scale-[0.99] transition
      "
      aria-label="Carte des artistes originaires d’Île-de-France"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-[color:var(--ink)]">
            Carte des artistes originaires d’Île-de-France
          </div>
          <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
            Explore les artistes et leurs communes d’origine.
          </div>
        </div>
        <div
          className="
            mt-1 h-9 w-9 rounded-full
            bg-[color:var(--primarySoft)]
            border border-[color:var(--border)]
            flex items-center justify-center
          "
          aria-hidden="true"
        >
          <span className="text-[color:var(--primary)] text-[18px] leading-none">
            →
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="relative h-[132px] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)]">
          <div className="absolute inset-0 p-3">
            <div className="flex h-full items-center gap-3">
              <CardImage artist={current} size="lg" />
              <div className="flex flex-1 gap-3 overflow-hidden">
                <CardImage artist={next1} size="md" />
                <CardImage artist={next2} size="md" />
              </div>
            </div>
          </div>
        </div>

        {!artists.length ? (
          <div className="mt-3 text-[12px] text-[color:var(--muted)]">
            Chargement des artistes…
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function CardImage({
  artist,
  size,
}: {
  artist: Artist | null;
  size: "lg" | "md";
}) {
  const w = size === "lg" ? 110 : 92;
  const h = size === "lg" ? 110 : 92;

  if (!artist?.image_wikipedia) {
    return (
      <div
        className="
          flex items-center justify-center rounded-xl
          border border-[color:var(--border)]
          bg-white/60 text-[color:var(--muted)]
        "
        style={{ width: w, height: h }}
      >
        <span className="text-[12px]">Image</span>
      </div>
    );
  }

  return (
    <div
      className="
        relative overflow-hidden rounded-xl
        border border-[color:var(--border)] bg-white
        shadow-sm
      "
      style={{ width: w, height: h }}
      title={artist.artiste ?? ""}
    >
      <img
        src={artist.image_wikipedia}
        alt={artist.artiste ?? "Artiste"}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />

      {/* Cartouche nom artiste – sans flou */}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-white/85">
        <div className="truncate text-[11px] font-medium text-[color:var(--ink)]">
          {artist.artiste ?? "Artiste"}
        </div>
      </div>
    </div>
  );
}
