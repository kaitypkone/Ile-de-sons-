"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import SongSearch, { SongSearchResult } from "./SongSearch";

type SongPoint = {
  id: string;
  genius_song_id: string | null;
  full_title: string | null;
  title: string | null;
  main_artist: string | null;
  artist_names: string | null;
  place: string | null;
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
};

type GeoJSONFeature = GeoJSON.Feature<GeoJSON.Geometry, any>;
type GeoJSONFC = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;

const POSITRON_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Quelques seuils de zoom (ajustables)
const Z_IDF_ONLY = 6.8;        // <= : IDF visible (grand dézoom)
const Z_CONTEXT_START = 6.8;   // > : deps + fleuves + rail visibles
const Z_CONTEXT_END = 9.6;     // au-delà : on cache deps/fleuves/rail (plus tôt)
const Z_CLUSTERS_START = 7.2;  // clusters apparaissent à partir de là
const Z_POINTS_START = 12.8;   // points individuels

export default function MusicMap() {
  const mapRef = useRef<MLMap | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  const [selectedSong, setSelectedSong] = useState<SongPoint | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [lastBboxKey, setLastBboxKey] = useState<string>("");

  const [tab, setTab] = useState<"lecture" | "paroles">("lecture");
const [selectedPlace, setSelectedPlace] = useState<string>("");

  const idfBounds: LngLatBoundsLike = useMemo(
    () => [
      [1.45, 48.12], // SW approx
      [3.55, 49.25], // NE approx
    ],
    []
  );

  useEffect(() => {
    if (!mapDivRef.current) return;

    // Dev/HMR safety : évite une map “accrochée” à un ancien div
if (mapRef.current) {
  mapRef.current.remove();
  mapRef.current = null;
}

    const map = new maplibregl.Map({
  container: mapDivRef.current,
  style: POSITRON_STYLE,
  center: [2.35, 48.6],  // moitié nord (ajuste si tu veux)
  zoom: 6.2,             // moitié nord visible au chargement
  minZoom: 2.5,          // dézoom très large autorisé
  maxZoom: 18,
  attributionControl: false,
});

    console.log("MapLibre: map created");

map.on("error", (e) => {
  console.error("MapLibre error:", e.error);
});

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

    mapRef.current = map;

    map.on("load", async () => {
      // 1) Contexte (polygones/lignes) depuis fichiers GeoJSON
      await addContextLayers(map);

      // 2) Source pour points chansons (GeoJSON qu’on alimentera via API bbox)
      addSongPointLayers(map);

       addSelectionLayers(map);

      // 3) Gestion visibilité selon zoom
      applyVisibilityRules(map);
      map.on("zoom", () => applyVisibilityRules(map));
      map.on("moveend", () => maybeFetchPoints(map));
      map.on("zoomend", () => maybeFetchPoints(map));

      // 4) Premier fetch si zoom ok
      maybeFetchPoints(map);

      // 5) Interactions clic clusters / points
      wireSongPointInteractions(map, (song) => {
        setSelectedSong(song);
        setSheetOpen(true);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [idfBounds]);

  return (
  <main className="h-dvh w-full">
    <div className="relative h-dvh w-full">
      {/* Carte */}
      <div ref={mapDivRef} className="absolute inset-0 h-full w-full" />

      {/* Overlay haut */}
      <div className="absolute left-0 right-0 top-0 z-20 px-3 pt-3">
        <div className="mx-auto w-full max-w-[420px] space-y-2">
          <SongSearch
            onSelect={(song) => {
              const map = mapRef.current;
              if (!map) return;

              setSelectedSong(song as any);
              setSelectedPlace(song.place ?? "");
              setTab("lecture");
              setSheetOpen(true);

              if (
                typeof song.longitude === "number" &&
                typeof song.latitude === "number"
              ) {
                const targetZoom = Math.max(map.getZoom(), 13);
                map.easeTo({
                  center: [song.longitude, song.latitude],
                  zoom: targetZoom,
                  duration: 650,
                });
                setSelectedPoint(map, song.longitude, song.latitude, song);
              }
            }}
          />

          <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-3 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold text-[color:var(--ink)]">
                Carte musicale
              </div>
              <div className="text-[12px] text-[color:var(--muted)]">
                {isLoadingPoints ? "Chargement…" : " "}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom sheet */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={selectedSong?.full_title ?? selectedSong?.title ?? "Sélection"}
        subtitle={
          selectedSong?.place
            ? `${selectedSong.place}${selectedSong.echelle ? ` · ${selectedSong.echelle}` : ""}`
            : undefined
        }
      >
        <div className="p-3">
          <div className="rounded-xl border border-[color:var(--border)] bg-white overflow-hidden">
            <div className="flex">
              <button
                className={[
                  "flex-1 px-3 py-2 text-[13px] font-semibold border-b",
                  tab === "lecture"
                    ? "text-[color:var(--ink)] border-[color:var(--primary)]"
                    : "text-[color:var(--muted)] border-[color:var(--border)]",
                ].join(" ")}
                onClick={() => setTab("lecture")}
              >
                Lecture
              </button>
              <button
                className={[
                  "flex-1 px-3 py-2 text-[13px] font-semibold border-b",
                  tab === "paroles"
                    ? "text-[color:var(--ink)] border-[color:var(--primary)]"
                    : "text-[color:var(--muted)] border-[color:var(--border)]",
                ].join(" ")}
                onClick={() => setTab("paroles")}
              >
                Paroles
              </button>
            </div>

            <div
  className={tab === "lecture" ? "block" : "invisible h-0 overflow-hidden"}
>
  {selectedSong && (
    <MediaBlock
      song={{
        youtube_embed: selectedSong.youtube_embed,
        youtube_url: selectedSong.youtube_url,
        spotify_url: selectedSong.spotify_url,
        soundcloud_url: selectedSong.soundcloud_url,
      }}
    />
  )}
</div>

            <div className={tab === "paroles" ? "block" : "hidden"}>
              <div className="p-3 whitespace-pre-wrap text-[13px] leading-6 text-[color:var(--ink)]">
                {selectedSong?.lyrics ?? "Paroles indisponibles."}
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  </main>
);



  async function maybeFetchPoints(map: MLMap) {
    const z = map.getZoom();

    // Ne pas charger/afficher en-dessous du zoom IDF
    if (z < Z_CLUSTERS_START) return;

    const b = map.getBounds();
    const key = `${z.toFixed(2)}:${b.getWest().toFixed(3)},${b.getSouth().toFixed(
      3
    )},${b.getEast().toFixed(3)},${b.getNorth().toFixed(3)}`;

    // Évite de refetch si on n’a pas changé “sensiblement”
    if (key === lastBboxKey) return;
    setLastBboxKey(key);

    setIsLoadingPoints(true);
    try {
      const url = new URL("/api/songs-bbox", window.location.origin);
      url.searchParams.set("minLng", String(b.getWest()));
      url.searchParams.set("minLat", String(b.getSouth()));
      url.searchParams.set("maxLng", String(b.getEast()));
      url.searchParams.set("maxLat", String(b.getNorth()));
      url.searchParams.set("zoom", String(z));

      const res = await fetch(url.toString());

if (!res.ok) {
  console.warn("songs-bbox non OK :", res.status);
  return;
}

const fc = (await res.json()) as GeoJSONFC;

      const src = map.getSource("songs") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPoints(false);
    }
  }
}

async function addContextLayers(map: MLMap) {
  // Région IDF (quand on dézoome très loin)
  const idf = await fetch("/data/IDF.geojson").then((r) => r.json());

  map.addSource("idf-region", {
    type: "geojson",
    data: idf,
  });

  map.addLayer({
    id: "idf-fill",
    type: "fill",
    source: "idf-region",
    paint: {
      "fill-color": "#f1b56a", // orangé doux
      "fill-opacity": 0.35,
    },
  });

  map.addLayer({
    id: "idf-outline",
    type: "line",
    source: "idf-region",
    paint: {
      "line-color": "#c9853f",
      "line-width": 2,
      "line-opacity": 0.9,
    },
  });

  // Départements (visibles quand on voit IDF, cachés quand zoom fort)
  const deps = await fetch("/data/dep_WGS84.geojson").then((r) => r.json());

  map.addSource("idf-deps", { type: "geojson", data: deps });

  map.addLayer({
    id: "deps-fill",
    type: "fill",
    source: "idf-deps",
    paint: {
      "fill-color": "#f1a65f",
      "fill-opacity": 0.6, // demandé : 60% transparent
    },
  });

  map.addLayer({
    id: "deps-outline",
    type: "line",
    source: "idf-deps",
    paint: {
      "line-color": "#d8893f",
      "line-width": 1.5,
      "line-opacity": 0.9,
    },
  });

  // Fleuves (bleu, sans transparence)
  const rivers = await fetch("/data/fleuves_WGS84.geojson").then((r) => r.json());
  map.addSource("idf-rivers", { type: "geojson", data: rivers });

  map.addLayer({
    id: "rivers-line",
    type: "line",
    source: "idf-rivers",
    paint: {
      "line-color": "#2a78ff",
      "line-width": 2.5,
      "line-opacity": 1,
    },
  });

  // Réseau ferré (gris/marron, sans transparence)
  const rail = await fetch("/data/reseau_ferre_IDF.geojson").then((r) => r.json());
  map.addSource("idf-rail", { type: "geojson", data: rail });

  map.addLayer({
    id: "rail-line",
    type: "line",
    source: "idf-rail",
    paint: {
      "line-color": "#6b5b4a",
      "line-width": 2,
      "line-opacity": 1,
    },
  });
}

function addSongPointLayers(map: MLMap) {
  map.addSource("songs", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
    cluster: true,
    clusterRadius: 45,
    clusterMaxZoom: Math.floor(Z_POINTS_START - 0.2),
  });

  // Clusters (cercles)
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "songs",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(192, 80, 176, 0.55)", // rose/violet doux
      "circle-stroke-color": "rgba(255,255,255,0.9)",
      "circle-stroke-width": 2,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        16,
        50,
        20,
        200,
        26,
        800,
        32,
      ],
    },
  });

  // Texte clusters (nombre)
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "songs",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-size": 12,
    },
    paint: {
      "text-color": "#231a2a",
    },
  });

  // Points (symbol)
  map.addLayer({
    id: "unclustered",
    type: "circle",
    source: "songs",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "rgba(192, 80, 176, 0.9)",
      "circle-radius": 5,
      "circle-stroke-color": "rgba(255,255,255,0.95)",
      "circle-stroke-width": 1.5,
    },
  });
}

function applyVisibilityRules(map: MLMap) {
  const z = map.getZoom();

  // 1) IDF (grand dézoom)
  const idfVisible = z <= Z_IDF_ONLY;
  setVis(map, "idf-fill", idfVisible);
  setVis(map, "idf-outline", idfVisible);

  // 2) Départements + fleuves + rail (zoom moyen)
  const contextVisible = z > Z_CONTEXT_START && z <= Z_CONTEXT_END;
  setVis(map, "deps-fill", contextVisible);
  setVis(map, "deps-outline", contextVisible);
  setVis(map, "rivers-line", contextVisible);
  setVis(map, "rail-line", contextVisible);

  // 3) Clusters (zoom moyen et fort, jusqu’aux points)
  const clustersVisible = z >= Z_CLUSTERS_START && z < Z_POINTS_START;
  setVis(map, "clusters", clustersVisible);
  setVis(map, "cluster-count", clustersVisible);

  // 4) Points (fort zoom)
  setVis(map, "unclustered", z >= Z_POINTS_START);
}


function setVis(map: MLMap, layerId: string, on: boolean) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
}

function addSelectionLayers(map: MLMap) {
  map.addSource("selected-point", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "selected-glow",
    type: "circle",
    source: "selected-point",
    paint: {
      "circle-color": "rgba(192, 80, 176, 0.20)",
      "circle-radius": 16,
      "circle-blur": 0.6,
    },
  });

  map.addLayer({
    id: "selected-ring",
    type: "circle",
    source: "selected-point",
    paint: {
      "circle-color": "rgba(192, 80, 176, 0.0)",
      "circle-stroke-color": "rgba(192, 80, 176, 1)",
      "circle-stroke-width": 3,
      "circle-radius": 8,
    },
  });
}

function setSelectedPoint(map: MLMap, lng: number, lat: number, props: any) {
  const src = map.getSource("selected-point") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;

  src.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: props ?? {},
      },
    ],
  });
}


function wireSongPointInteractions(
  map: MLMap,
  onSelect: (song: SongPoint) => void
) {
  // Clic cluster => zoom in sur le cluster
  map.on("click", "clusters", (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
  const f = features[0];
  if (!f) return;

  const clusterId = f.properties?.cluster_id;
  if (clusterId === undefined || clusterId === null) return;

  const source = map.getSource("songs") as maplibregl.GeoJSONSource;

// Typings récents : Promise<number>
(source as any).getClusterExpansionZoom(clusterId).then((zoom: number) => {
  const coords = (f.geometry as any).coordinates as [number, number];
  map.easeTo({ center: coords, zoom });
});
});

  // Clic point => ouvre bottom sheet
  map.on("click", "unclustered", (e) => {
    const f = e.features?.[0];
    if (!f) return;

    const props = f.properties ?? {};
    const song: SongPoint = {
      id: props.id,
      genius_song_id: props.genius_song_id,
      full_title: props.full_title,
      title: props.title,
      main_artist: props.main_artist,
      artist_names: props.artist_names,
      place: props.place,
      echelle: props.echelle,
      echelle2: props.echelle2,
      sous_type: props.sous_type,
      latitude: props.latitude ? Number(props.latitude) : null,
      longitude: props.longitude ? Number(props.longitude) : null,
      youtube_embed: props.youtube_embed,
      youtube_url: props.youtube_url,
      spotify_url: props.spotify_url,
      soundcloud_url: props.soundcloud_url,
      lyrics: props.lyrics,
      annee: props.annee,
      decennie: props.decennie,
    };
    onSelect(song);
  });

  map.on("mouseenter", "clusters", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "clusters", () => map.getCanvas().style.cursor = "");
  map.on("mouseenter", "unclustered", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "unclustered", () => map.getCanvas().style.cursor = "");
}

function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "absolute left-0 right-0 bottom-0 z-30 transition-transform duration-200",
        open ? "translate-y-0 pointer-events-auto" : "translate-y-[92%] pointer-events-none",
      ].join(" ")}
    >
      <div className="mx-auto w-full max-w-[420px] rounded-t-3xl bg-white shadow-lg">
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <div className="text-[14px] font-semibold">{title}</div>
          {subtitle ? (
            <div className="text-[12px] text-[color:var(--muted)]">{subtitle}</div>
          ) : null}
        </div>

        <div className="max-h-[70dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
  {children}
</div>
      </div>
    </div>
  );

}

function toSpotifyEmbed(url: string) {
  return url.replace("open.spotify.com/", "open.spotify.com/embed/");
}

function toSoundCloudEmbed(url: string) {
  const encoded = encodeURIComponent(url);
  return `https://w.soundcloud.com/player/?url=${encoded}&auto_play=false&show_teaser=false`;
}

function MediaBlock({
  song,
}: {
  song: {
    youtube_embed: string | null;
    youtube_url: string | null;
    spotify_url: string | null;
    soundcloud_url: string | null;
  };
}) {
  const yt = song.youtube_embed ? song.youtube_embed.trim() : null;
  const spotify = song.spotify_url;
  const sc = song.soundcloud_url;
  const ytLink = song.youtube_url;

  return (
    <div className="p-3 space-y-3">
      {yt ? (
        <div className="rounded-xl overflow-hidden border border-[color:var(--border)] bg-black">
          <iframe
  src={yt}
  className="w-full aspect-video"
  title="YouTube player"
  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
  referrerPolicy="strict-origin-when-cross-origin"
/>
        </div>
      ) : spotify ? (
        <div className="rounded-xl overflow-hidden border border-[color:var(--border)] bg-white">
          <iframe
            src={toSpotifyEmbed(spotify)}
            className="w-full"
            height="152"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
      ) : sc ? (
        <div className="rounded-xl overflow-hidden border border-[color:var(--border)] bg-white">
          <iframe
            width="100%"
            height="166"
            scrolling="no"
            frameBorder={0}
            allow="autoplay"
            src={toSoundCloudEmbed(sc)}
          />
        </div>
      ) : (
        <div className="text-[13px] text-[color:var(--muted)]">
          Aucun lecteur intégré disponible pour cette chanson.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ytLink ? (
          <a
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold text-[color:var(--ink)]"
            href={ytLink}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir sur YouTube
          </a>
        ) : null}

        {spotify ? (
          <a
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold text-[color:var(--ink)]"
            href={spotify}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir sur Spotify
          </a>
        ) : null}

        {sc ? (
          <a
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold text-[color:var(--ink)]"
            href={sc}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir sur SoundCloud
          </a>
        ) : null}
      </div>

      {yt ? (
        <div className="text-[12px] text-[color:var(--muted)]">
          Si la vidéo est indisponible dans l’application, utilise Spotify/SoundCloud ci-dessus.
        </div>
      ) : null}
    </div>
  );
}
