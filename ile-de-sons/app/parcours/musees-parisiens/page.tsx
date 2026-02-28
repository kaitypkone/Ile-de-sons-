"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Song = {
  id: string;
  full_title: string | null;
  title: string | null;
  main_artist: string | null;
  artist_names: string | null;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
  youtube_embed: string | null;
  youtube_url: string | null;
  spotify_url: string | null;
  soundcloud_url: string | null;
  lyrics: string | null;
};

const POSITRON_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// IDs dans l’ordre demandé
const SONG_IDS = [
  "227ac6da-77b0-4dc7-86ea-8badc2126523", // Louvre
  "3acdfdd6-70e4-4338-abd7-cae7543517b7", // Orsay
  "f625e59c-6d0c-43e0-97e5-6cef3d2ac87b", // Orangerie
  "52b61dac-12ec-4ba1-918d-bcdb903fdd1f", // Quai Branly
];

// Texte au-dessus de chaque chanson (par id)
const TEXT_BY_ID: Record<string, string> = {
  "227ac6da-77b0-4dc7-86ea-8badc2126523":
    "Chanson pleine d’humour sur la déception d’un américain qui découvre Mona Lisa au musée du Louvre alors qu’il en a rêvé pendant si longtemps.",
  "3acdfdd6-70e4-4338-abd7-cae7543517b7":
    "Par opposition aux puissants de ce monde en col blanc, que Leme pense être corrompus jusqu’à la moelle, il évoque dans ce rap sa présence au Musée d’Orsay face à un tableau de Courbet, symbolisant la sagesse.",
  "f625e59c-6d0c-43e0-97e5-6cef3d2ac87b":
    "Dans un très bel hommage à Paris, Vincent Delerm évoque le Musée de l’Orangerie parmi de nombreux souvenirs associés à la capitale.",
  "52b61dac-12ec-4ba1-918d-bcdb903fdd1f":
    "Dans ce son écrit en 2020, Jok’Air rappe « Faut que je braque le Quai Branly », clin d’œil et soutien au militant congolais Emery Mwazulu. En effet, la même année, Emery Mwazulu ainsi que 4 autres militants panafricanistes, sont arrêtés après avoir braqué et récupéré des œuvres conservées au Quai Branly dans le but de dénoncer le pillage culturel de l’Afrique par l’Europe et de ramener les œuvres « à la maison ».",
};

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
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escapedTerm, "gi");
  return safe.replace(re, (m) => `<mark class="px-1 rounded bg-amber-200">${m}</mark>`);
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

function MediaPlayer({ song }: { song: Song }) {
  const yt = song.youtube_embed ? song.youtube_embed.trim() : null;
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
  isActive,
  onClick,
}: {
  song: Song;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const [openLyrics, setOpenLyrics] = useState(false);

  const artist = song.main_artist || song.artist_names || "";
  const title = song.title || song.full_title || "Titre inconnu";
  const place = song.place || "";

  const lyrics = song.lyrics || "";
  const excerpt = lyrics ? excerptAround(lyrics, place, 90) : "";

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-3xl border overflow-hidden shadow-sm transition",
        "border-[color:var(--border)] bg-white/80 backdrop-blur",
        isActive ? "ring-2 ring-[color:var(--primary)]" : "hover:shadow-md",
      ].join(" ")}
    >
      <div className="p-4 space-y-3">
        <div className="text-[13px] leading-5 text-[color:var(--muted)]">
          {TEXT_BY_ID[song.id] ?? ""}
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[14px] font-extrabold text-[color:var(--ink)]">
              {index + 1}. {artist}
            </div>
            <div className="text-[13px] font-semibold text-[color:var(--ink)]">
              {title}
            </div>
          </div>

          {place ? (
            <span className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
              {place}
            </span>
          ) : null}
        </div>

        <MediaPlayer song={song} />

        <div className="pt-1">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-bold text-[color:var(--ink)]">
              Paroles
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenLyrics((v) => !v);
              }}
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
                __html: highlightAll(lyrics, place),
              }}
            />
          ) : (
            <div className="mt-2 text-[12px] leading-5 text-[color:var(--ink)]">
              <span
                dangerouslySetInnerHTML={{
                  __html: highlightAll(excerpt, place),
                }}
              />
              <div className="mt-2 text-[12px] font-semibold text-[color:var(--primary)]">
                Voir le passage →
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function MuseesPlaylistPage() {
  const mapRef = useRef<MLMap | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<any | null>(null);

  // rose du thème
  const primaryPink =
    (typeof window !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()
      : "") || "#ec4899";

  // refs pour scroll vers les blocs
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

      if (list[0]?.id) setActiveId(list[0].id);
    })();
  }, []);

  const pointsGeojson = useMemo(() => {
    const features = songs
      .filter((s) => typeof s.longitude === "number" && typeof s.latitude === "number")
      .map((s) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [s.longitude as number, s.latitude as number],
        },
        properties: {
          id: s.id,
          title: s.title ?? s.full_title ?? "",
          main_artist: s.main_artist ?? s.artist_names ?? "",
          orderIndex: SONG_IDS.indexOf(s.id),
        },
      }));

    return {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection;
  }, [songs]);

  // Itinéraire OSRM (vrais chemins)
  useEffect(() => {
    const orderedCoords = SONG_IDS
      .map((id) => songs.find((s) => s.id === id))
      .filter(
        (s) => s && typeof s.longitude === "number" && typeof s.latitude === "number"
      )
      .map((s) => [s!.longitude as number, s!.latitude as number] as [number, number]);

    if (orderedCoords.length < 2) return;

    (async () => {
      const res = await fetch("/api/route-osrm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coordinates: orderedCoords,
          profile: "walking", // musées = trajet piéton (tu peux mettre "driving" si tu préfères)
        }),
      });

      const json = await res.json();
      setRouteGeometry(json?.geometry ?? null);
    })();
  }, [songs]);

  const lineGeojson = useMemo(() => {
    if (!routeGeometry) {
      // fallback ligne droite si OSRM indispo
      const ordered = SONG_IDS
        .map((id) => songs.find((s) => s.id === id))
        .filter(
          (s) => s && typeof s.longitude === "number" && typeof s.latitude === "number"
        ) as Song[];

      const coords = ordered.map((s) => [s.longitude as number, s.latitude as number]);

      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: {},
          },
        ],
      } as GeoJSON.FeatureCollection;
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: routeGeometry,
          properties: {},
        },
      ],
    } as GeoJSON.FeatureCollection;
  }, [routeGeometry, songs]);

  // init map
  useEffect(() => {
    if (!mapDivRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: POSITRON_STYLE,
      center: [2.34, 48.86], // Paris
      zoom: 12.2,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("musees-points", { type: "geojson", data: pointsGeojson });
      map.addSource("musees-line", { type: "geojson", data: lineGeojson });

      map.addLayer({
        id: "musees-line",
        type: "line",
        source: "musees-line",
        paint: {
          "line-width": 4,
          "line-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "musees-points",
        type: "circle",
        source: "musees-points",
        paint: {
          "circle-radius": 7,
          "circle-color": "#111827",
          "circle-opacity": 0.75,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 1,
        },
      });

      map.addLayer({
        id: "musees-point-selected",
        type: "circle",
        source: "musees-points",
        filter: ["==", ["get", "id"], activeId ?? ""],
        paint: {
          "circle-radius": 10,
          "circle-color": primaryPink,
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 1,
        },
      });

      // fit bounds
      const coords = (pointsGeojson.features as any[]).map((f) => f.geometry.coordinates);
      if (coords.length >= 2) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      } else if (coords.length === 1) {
        map.flyTo({ center: coords[0], zoom: 14, duration: 0 });
      }

      // clic point => scroll bloc
      map.on("click", "musees-points", (e) => {
        const feat = e.features?.[0] as any;
        const id = feat?.properties?.id as string | undefined;
        if (!id) return;

        setActiveId(id);

        const el = blockRefs.current[id];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      map.on("mouseenter", "musees-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "musees-points", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [pointsGeojson, lineGeojson, activeId, primaryPink]);

  // update sources + selected filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const pts = map.getSource("musees-points") as any;
    if (pts) pts.setData(pointsGeojson);

    const ln = map.getSource("musees-line") as any;
    if (ln) ln.setData(lineGeojson);

    if (map.getLayer("musees-point-selected")) {
      map.setFilter("musees-point-selected", ["==", ["get", "id"], activeId ?? ""]);
    }
  }, [pointsGeojson, lineGeojson, activeId]);

  function flyToSong(id: string) {
    const s = songs.find((x) => x.id === id);
    if (!s || typeof s.longitude !== "number" || typeof s.latitude !== "number") return;

    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: [s.longitude, s.latitude],
      zoom: 15,
      speed: 1.2,
    });
  }

  return (
    <main className="min-h-dvh bg-[color:var(--bg)]">
      {/* Carte full width sticky + bouton retour */}
      <div className="sticky top-16 z-30 w-full">
        <div className="w-full overflow-hidden border-b border-[color:var(--border)] bg-white/95 backdrop-blur shadow-sm">
          <div ref={mapDivRef} className="h-[200px] w-full" />
          <div className="px-4 py-2 border-t border-[color:var(--border)] bg-white/90 backdrop-blur">
            <a
              href="/parcours"
              className="text-[13px] font-semibold text-[color:var(--primary)] hover:underline"
            >
              ← Retour aux géoplaylists
            </a>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <h1 className="text-[18px] font-extrabold text-[color:var(--ink)]">
          Musées parisiens en musique
        </h1>

        <div className="pt-2 grid gap-4">
          {SONG_IDS.map((id, idx) => {
            const song = songs.find((s) => s.id === id);
            if (!song) return null;

            return (
              <div
                key={id}
                ref={(el) => {
                  blockRefs.current[id] = el;
                }}
                className="scroll-mt-[380px]"
              >
                <SongBlock
                  song={song}
                  index={idx}
                  isActive={activeId === id}
                  onClick={() => {
                    setActiveId(id);
                    flyToSong(id);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}