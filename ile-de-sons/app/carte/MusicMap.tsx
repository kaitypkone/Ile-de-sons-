"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import SongSearch, { SongSearchResult } from "./SongSearch";
import PlaceSearch, { PlaceSearchResult } from "../../components/PlaceSearch";

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
  distance_km?: number | null;
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
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const [selectedSong, setSelectedSong] = useState<SongPoint | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<"collapsed" | "half" | "full">("full");
  const dragRef = useRef<{ startY: number; startSnap: "collapsed" | "half" | "full" } | null>(null);

  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [lastBboxKey, setLastBboxKey] = useState<string>("");

  const [placeTotal, setPlaceTotal] = useState<number>(0);
const [placeOffset, setPlaceOffset] = useState<number>(0);
const [placeHasMore, setPlaceHasMore] = useState<boolean>(false);
const [placeLoadingMore, setPlaceLoadingMore] = useState<boolean>(false);

const PLACE_PAGE_SIZE = 50;

const [filters, setFilters] = useState({
  artists: [] as string[],
  echelles: [] as string[],
  decennies: [] as string[],
  styles: [] as string[],
  languages: [] as string[],
  echelle2s: [] as string[],   // ✅ AJOUT
  sous_types: [] as string[],  // ✅ AJOUT
});

const [placeMode, setPlaceMode] = useState<"song" | "place">("song");
const [placeSongs, setPlaceSongs] = useState<SongPoint[]>([]);
const [selectedPlaceLabel, setSelectedPlaceLabel] = useState<string>("");


const [tab, setTab] = useState<"lecture" | "paroles" | "liste">("lecture");
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
        setSheetSnap("full");
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
          {/* Toggle Chanson / Lieu */}
          <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-2 py-1 shadow-sm">
            <div className="flex">
              <button
                className={[
                  "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
                  placeMode === "song"
                    ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
                    : "text-[color:var(--muted)]",
                ].join(" ")}
                onClick={() => setPlaceMode("song")}
              >
                Chanson
              </button>

              <button
                className={[
                  "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
                  placeMode === "place"
                    ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
                    : "text-[color:var(--muted)]",
                ].join(" ")}
                onClick={() => setPlaceMode("place")}
              >
                Lieu
              </button>
            </div>
          </div>

          {/* ✅ Filtres (doit être DANS l’overlay) */}
          <FiltersPanel filters={filters} setFilters={setFilters} />

          {/* ✅ Recherche */}
          {placeMode === "song" ? (
            <SongSearch
              loading={isLoadingPoints}
              filters={filters}
              onSelect={(song) => {
                const map = mapRef.current;
                if (!map) return;

                setSelectedSong(song as any);
                setSelectedPlace(song.place ?? "");
                setTab("lecture");
                setSheetOpen(true);
                setSheetSnap("full");

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
          ) : (
            <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur shadow-sm overflow-visible">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--border)]">
                <div className="text-[13px] font-semibold text-[color:var(--ink)]">
                  Recherche de lieu
                </div>

                <button
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[12px] font-semibold text-[color:var(--ink)]"
                  onClick={async () => {
                    if (!navigator.geolocation) {
                      alert("La géolocalisation n'est pas disponible.");
                      return;
                    }

                    navigator.geolocation.getCurrentPosition(
                      async (pos) => {
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;

                        const res = await fetch("/api/songs-nearby", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            lat,
                            lng,
                            radiusKm: 20,
                            limit: 100,
                            filters,
                          }),
                        });

                        if (!res.ok) return;
                        const json = await res.json();

                        setSelectedPlaceLabel("Autour de moi (20 km)");
                        setPlaceSongs(json.songs ?? []);
                        setPlaceTotal((json.songs ?? []).length);
                        setPlaceOffset((json.songs ?? []).length);
                        setPlaceHasMore(false);
                        setSelectedSong(null);

                        setTab("liste");
                        setSheetOpen(true);
                        setSheetSnap("full");

                        const map = mapRef.current;
                        if (map) {
                          map.easeTo({
                            center: [lng, lat],
                            zoom: Math.max(map.getZoom(), 12),
                            duration: 650,
                          });
                        }
                      },
                      (err) => {
                        alert("Impossible d’obtenir la position.");
                        console.error(err);
                      },
                      { enableHighAccuracy: true, timeout: 8000 }
                    );
                  }}
                >
                  Autour de moi
                </button>
              </div>

              <div className="p-2">
                <PlaceSearch
                  filters={filters}
                  onSelect={async (p) => {
                    const map = mapRef.current;
                    if (!map) return;

                    setSelectedPlaceLabel(p.place);

                    const res = await fetch("/api/songs-by-place", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        place: p.place,
                        filters,
                        offset: 0,
                        limit: PLACE_PAGE_SIZE,
                      }),
                    });

                    if (!res.ok) return;
                    const json = await res.json();

                    setPlaceSongs(json.songs ?? []);
                    setSelectedSong(null);
                    setPlaceTotal(json.total ?? 0);
                    setPlaceOffset((json.songs ?? []).length);
                    setPlaceHasMore(Boolean(json.hasMore));
                    setPlaceLoadingMore(false);

                    setTab("liste");
                    setSheetOpen(true);
                    setSheetSnap("full");

                    if (json.center && Array.isArray(json.center)) {
                      map.easeTo({
                        center: json.center,
                        zoom: Math.max(map.getZoom(), 12),
                        duration: 650,
                      });
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom sheet */}
      <BottomSheet
        open={sheetOpen}
        snap={sheetSnap}
        onSnap={setSheetSnap}
        onClose={() => setSheetOpen(false)}
        title={
          selectedSong?.full_title ??
          selectedSong?.title ??
          selectedPlaceLabel ??
          "Sélection"
        }
        subtitle={
          selectedSong?.place
            ? `${selectedSong.place}${
                selectedSong.echelle ? ` · ${selectedSong.echelle}` : ""
              }`
            : selectedPlaceLabel
            ? "Résultats pour ce lieu"
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

        {placeSongs.length > 0 ? (
          <button
            className={[
              "flex-1 px-3 py-2 text-[13px] font-semibold border-b",
              tab === "liste"
                ? "text-[color:var(--ink)] border-[color:var(--primary)]"
                : "text-[color:var(--muted)] border-[color:var(--border)]",
            ].join(" ")}
            onClick={() => setTab("liste")}
          >
            Liste
          </button>
        ) : null}
      </div>

      {/* LECTURE */}
      <div className={tab === "lecture" ? "block" : "invisible h-0 overflow-hidden"}>
        {selectedSong ? (
          <MediaBlock
            song={{
              youtube_embed: selectedSong.youtube_embed,
              youtube_url: selectedSong.youtube_url,
              spotify_url: selectedSong.spotify_url,
              soundcloud_url: selectedSong.soundcloud_url,
            }}
          />
        ) : (
          <div className="p-3 text-[13px] text-[color:var(--muted)]">
            Sélectionne une chanson pour afficher le lecteur.
          </div>
        )}
      </div>

      {/* PAROLES */}
      <div className={tab === "paroles" ? "block" : "hidden"}>
        {selectedSong?.place ? (
          <div className="px-3 pt-3">
            <button
              className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[12px] font-semibold text-[color:var(--primary)]"
              onClick={() => {
                const el = document.getElementById("highlighted-place");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Voir le passage
            </button>
          </div>
        ) : null}

        <div className="p-3 whitespace-pre-wrap text-[13px] leading-6 text-[color:var(--ink)]">
          {selectedSong && selectedSong.lyrics && selectedSong.place
            ? renderLyricsWithHighlight(selectedSong.lyrics, selectedSong.place)
            : selectedSong?.lyrics}
        </div>
      </div>

      {/* LISTE */}
      <div className={tab === "liste" ? "block" : "hidden"}>
        <div className="p-3">
          <div className="text-[13px] font-semibold text-[color:var(--ink)]">
            {selectedPlaceLabel || "Lieu"}
          </div>

          <div className="mt-1 text-[12px] text-[color:var(--muted)]">
            {placeSongs.length.toLocaleString("fr-FR")} / {placeTotal.toLocaleString("fr-FR")} chansons
          </div>

          <div className="mt-3 space-y-2">
            {placeSongs.map((s) => (
              <button
                key={s.id}
                className="w-full text-left rounded-2xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-3"
                onClick={() => {
                  const map = mapRef.current;
                  if (!map) return;

                  setSelectedSong(s);
                  setTab("lecture");
                  setSheetOpen(true);
                  setSheetSnap("full");

                  if (typeof s.longitude === "number" && typeof s.latitude === "number") {
                    map.easeTo({
                      center: [s.longitude, s.latitude],
                      zoom: Math.max(map.getZoom(), 13),
                      duration: 650,
                    });
                    setSelectedPoint(map, s.longitude, s.latitude, s);
                  }
                }}
              >
                <div className="text-[13px] font-semibold text-[color:var(--ink)]">
                  {s.full_title ?? s.title ?? "Sans titre"}
                </div>

                <div className="mt-1 text-[12px] text-[color:var(--muted)]">
                  {(s.main_artist ?? s.artist_names ?? "—")}
                  {typeof (s as any).distance_km === "number"
                    ? ` · ${(s as any).distance_km.toFixed(1).replace(".", ",")} km`
                    : ""}
                </div>

                {s.lyrics ? (
                  <div className="mt-2 text-[12px] leading-5 text-[color:var(--muted)]">
                    {renderLyricsExcerptWithHighlight(
                      s.lyrics,
                      selectedPlaceLabel && !selectedPlaceLabel.startsWith("Autour de moi")
                        ? selectedPlaceLabel
                        : (s.place ?? ""),
                      90
                    )}
                  </div>
                ) : null}
              </button>
            ))}
          </div>

          {placeHasMore ? (
            <button
              className="mt-3 w-full rounded-2xl border border-[color:var(--border)] bg-white px-3 py-3 text-[13px] font-semibold text-[color:var(--ink)]"
              onClick={loadMorePlaceSongs}
              disabled={placeLoadingMore}
            >
              {placeLoadingMore ? "Chargement…" : "Charger plus"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  </div>

      </BottomSheet>
    </div>
  </main>
);


async function loadMorePlaceSongs() {
  if (placeLoadingMore || !placeHasMore) return;
  setPlaceLoadingMore(true);

  try {
    const res = await fetch("/api/songs-by-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place: selectedPlaceLabel,
        filters,
        offset: placeOffset,
        limit: PLACE_PAGE_SIZE,
      }),
    });

    if (!res.ok) return;
    const json = await res.json();

    const newSongs = json.songs ?? [];
    setPlaceSongs((prev) => [...prev, ...newSongs]);
    setPlaceTotal(json.total ?? placeTotal);
    setPlaceOffset((prev) => prev + newSongs.length);
    setPlaceHasMore(Boolean(json.hasMore));
  } finally {
    setPlaceLoadingMore(false);
  }
}

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
      for (const a of filters.artists) url.searchParams.append("artist", a);
for (const d of filters.decennies) url.searchParams.append("decennie", d);
for (const s of filters.styles) url.searchParams.append("style", s);
for (const e of filters.echelles) url.searchParams.append("echelle", e);
for (const l of filters.languages) url.searchParams.append("language", l);
for (const e2 of filters.echelle2s) url.searchParams.append("echelle2", e2);
for (const st of filters.sous_types) url.searchParams.append("sous_type", st);
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

    const coords = (f.geometry as any).coordinates as [number, number];

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
    setSelectedPoint(map, coords[0], coords[1], song);
  });

  map.on("mouseenter", "clusters", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "clusters", () => map.getCanvas().style.cursor = "");
  map.on("mouseenter", "unclustered", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "unclustered", () => map.getCanvas().style.cursor = "");
}

function normalizeForMatch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // apostrophes/tirets → espace (gère ’ et ')
    .replace(/[’']/g, " ")
    .replace(/[-‐-‒–—―]/g, " ")
    // ponctuation → espace
    .replace(/[.,;:!?(){}\[\]"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Construit: (1) texte normalisé (sans accents etc.)
//           (2) mapNormToOrig : pour chaque char du texte normalisé, l'index dans lyrics original
function buildNormalizedMap(original: string) {
  let norm = "";
  const mapNormToOrig: number[] = [];

  let lastWasSpace = false;

  for (let i = 0; i < original.length; i++) {
    const ch = original[i];

    // Normalise ce caractère seul
    const normCh = ch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    // Si c'est un séparateur (espace, apostrophe, tiret, ponctuation) => un seul espace
    if (
      /\s/.test(ch) ||
      /[’']/.test(ch) ||
      /[-‐-‒–—―]/.test(ch) ||
      /[.,;:!?(){}\[\]"«»]/.test(ch)
    ) {
      if (!lastWasSpace && norm.length > 0) {
        norm += " ";
        mapNormToOrig.push(i); // espace “représente” ce point dans l’original
        lastWasSpace = true;
      }
      continue;
    }

    // sinon, on ajoute tous les chars normalisés produits
    for (let k = 0; k < normCh.length; k++) {
      const out = normCh[k];
      if (!out) continue;
      norm += out;
      mapNormToOrig.push(i);
      lastWasSpace = false;
    }
  }

  // Trim de fin: on enlève espaces finaux et map associée
  while (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    mapNormToOrig.pop();
  }

  return { norm, mapNormToOrig };
}

function findFirstMatchRange(original: string, place: string) {
  if (!original || !place) return null;

  const { norm, mapNormToOrig } = buildNormalizedMap(original);
  const needle = normalizeForMatch(place);
  if (!needle) return null;

  const idx = norm.indexOf(needle);
  if (idx === -1) return null;

  // index original de début/fin via la map
  const startOrig = mapNormToOrig[idx];
  const endOrig = mapNormToOrig[idx + needle.length - 1] + 1; // end exclusive

  if (startOrig == null || endOrig == null) return null;
  return { startOrig, endOrig };
}

function renderLyricsWithHighlight(lyrics: string, place: string) {
  const range = findFirstMatchRange(lyrics, place);
  if (!range) return lyrics;

  const { startOrig, endOrig } = range;

  return (
    <>
      {lyrics.slice(0, startOrig)}
      <strong
        id="highlighted-place"
        className="font-semibold text-[color:var(--primary)]"
      >
        {lyrics.slice(startOrig, endOrig)}
      </strong>
      {lyrics.slice(endOrig)}
    </>
  );
}

function renderLyricsExcerptWithHighlight(
  lyrics: string,
  place: string,
  radius = 90
) {
  const range = findFirstMatchRange(lyrics, place);
  if (!range) {
    return (
      <span className="text-[color:var(--muted)]">
        Extrait indisponible.
      </span>
    );
  }

  const { startOrig, endOrig } = range;

  // Fenêtre autour du match
  const start = Math.max(0, startOrig - radius);
  const end = Math.min(lyrics.length, endOrig + radius);

  let before = lyrics.slice(start, startOrig);
  const match = lyrics.slice(startOrig, endOrig);
  let after = lyrics.slice(endOrig, end);

  // Ajoute "…" si on coupe
  if (start > 0) before = `…${before}`;
  if (end < lyrics.length) after = `${after}…`;

  return (
    <>
      {before}
      <strong className="font-semibold text-[color:var(--primary)]">
        {match}
      </strong>
      {after}
    </>
  );
}

function FiltersPanel({
  filters,
  setFilters,
}: {
  filters: { artists: string[]; echelles: string[]; decennies: string[]; styles: string[]; languages: string[]; echelle2s: string[]; sous_types: string[]};
setFilters: React.Dispatch<
  React.SetStateAction<{ artists: string[]; echelles: string[]; decennies: string[]; styles: string[]; languages: string[]; echelle2s: string[]; sous_types: string[]}>
>;
}) {
  const [open, setOpen] = useState(false);
  const [artistInput, setArtistInput] = useState("");
  const [styleInput, setStyleInput] = useState("");
  const [languageInput, setLanguageInput] = useState("");
  const [languageOptions, setLanguageOptions] = useState<{ label: string; count: number }[]>([]);

  const [artistOpen, setArtistOpen] = useState(false);
const [styleOpen, setStyleOpen] = useState(false);

const [artistOptions, setArtistOptions] = useState<{ label: string; count: number }[]>([]);
const [styleOptions, setStyleOptions] = useState<{ label: string; count: number }[]>([]);
const [echelle2Options, setEchelle2Options] = useState<{ label: string; count: number }[]>([]);
const [sousTypeOptions, setSousTypeOptions] = useState<{ label: string; count: number }[]>([]);

type SuggestKind = "artist" | "style" | "language" | "echelle2" | "sous_type";

async function fetchSuggest(kind: SuggestKind, q: string) {
  const url = new URL("/api/filter-suggest", window.location.origin);
  url.searchParams.set("kind", kind);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "40");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = await res.json();
  return (json.options ?? []) as { label: string; count: number }[];
}


  const decades = [
    "1950-1960",
    "1960-1970",
    "1970-1980",
    "1980-1990",
    "1990-2000",
    "2000-2010",
    "2010-2020",
    "2020-2030",
  ];

  function addChip(kind: "artists" | "styles" | "languages" | "echelle2s" | "sous_types", value: string) {
  const v = value.trim();
  if (!v) return;

  setFilters((prev) => {
    const arr = prev[kind];
    if (arr.includes(v)) return prev;
    return { ...prev, [kind]: [...arr, v] };
  });

  if (kind === "artists") setArtistInput("");
  if (kind === "styles") setStyleInput("");
  if (kind === "languages") setLanguageInput("");
}

  function removeChip(
  kind: "artists" | "styles" | "decennies" | "languages" | "echelle2s" | "sous_types",
  value: string
) {
  setFilters((prev) => ({
    ...prev,
    [kind]: prev[kind].filter((x) => x !== value),
  }));
}

  function toggleDecade(d: string) {
    setFilters((prev) => ({
      ...prev,
      decennies: prev.decennies.includes(d)
        ? prev.decennies.filter((x) => x !== d)
        : [...prev.decennies, d],
    }));
  }

  function clearAll() {
    setFilters({ artists: [], echelles: [], decennies: [], styles: [], languages: [], echelle2s: [], sous_types: [] });
  }

  const count =
  filters.artists.length +
  filters.decennies.length +
  filters.styles.length +
  filters.echelles.length +
  filters.languages.length +
  filters.echelle2s.length +
  filters.sous_types.length;

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="text-[13px] font-semibold text-[color:var(--ink)]">Filtres</div>
        <div className="text-[12px] text-[color:var(--muted)]">{count} sélection</div>
      </button>

      {open ? (
        <div className="border-t border-[color:var(--border)] p-3 space-y-3">
          {count ? (
            <div className="flex flex-wrap gap-2">
              {filters.artists.map((a) => (
                <Chip key={`a-${a}`} label={a} onRemove={() => removeChip("artists", a)} />
              ))}
              {filters.styles.map((s) => (
                <Chip key={`s-${s}`} label={s} onRemove={() => removeChip("styles", s)} />
              ))}
              {filters.decennies.map((d) => (
                <Chip key={`d-${d}`} label={d} onRemove={() => removeChip("decennies", d)} />
              ))}
              {filters.languages.map((l) => (
  <Chip key={`l-${l}`} label={l} onRemove={() => removeChip("languages", l)} />
))}
{filters.echelle2s.map((v) => (
  <Chip key={`e2-${v}`} label={v} onRemove={() => removeChip("echelle2s", v)} />
))}
{filters.sous_types.map((v) => (
  <Chip key={`st-${v}`} label={v} onRemove={() => removeChip("sous_types", v)} />
))}
              <button
                className="text-[12px] font-semibold text-[color:var(--primary)] underline"
                onClick={clearAll}
              >
                Tout effacer
              </button>
            </div>
          ) : null}

          {/* Artistes (autocomplete) */}
<div>
  <div className="text-[12px] font-semibold text-[color:var(--muted)] mb-2">Artistes</div>

  <div className="relative">
    <div className="flex gap-2">
      <input
        value={artistInput}
        onChange={async (e) => {
          const v = e.target.value;
          setArtistInput(v);
          const opts = await fetchSuggest("artist", v);
          setArtistOptions(opts);
          setArtistOpen(true);
        }}
        onFocus={async () => {
          const opts = await fetchSuggest("artist", artistInput);
          setArtistOptions(opts);
          setArtistOpen(true);
        }}
        onBlur={() => {
          // petit délai pour laisser le click sur une option
          window.setTimeout(() => setArtistOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addChip("artists", artistInput);
            setArtistOpen(false);
          }
        }}
        placeholder="Rechercher un artiste…"
        className="flex-1 rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
      />

      <button
        className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold"
        onClick={() => {
          addChip("artists", artistInput);
          setArtistOpen(false);
        }}
      >
        Ajouter
      </button>
    </div>

    {artistOpen && artistOptions.length ? (
      <div className="absolute left-0 right-0 mt-2 max-h-56 overflow-auto rounded-2xl border border-[color:var(--border)] bg-white shadow-lg z-50">
        {artistOptions.map((o) => (
          <button
            key={o.label}
            className="w-full text-left px-3 py-2 hover:bg-[color:var(--cardTint)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              addChip("artists", o.label);
              setArtistOpen(false);
            }}
          >
            <div className="text-[13px] font-semibold text-[color:var(--ink)]">{o.label}</div>
            <div className="text-[11px] text-[color:var(--muted)]">{o.count} occurrence(s)</div>
          </button>
        ))}
      </div>
    ) : null}
  </div>
</div>

          {/* Styles (autocomplete) */}
<div>
  <div className="text-[12px] font-semibold text-[color:var(--muted)] mb-2">Styles</div>

  <div className="relative">
    <div className="flex gap-2">
      <input
        value={styleInput}
        onChange={async (e) => {
          const v = e.target.value;
          setStyleInput(v);
          const opts = await fetchSuggest("style", v);
          setStyleOptions(opts);
          setStyleOpen(true);
        }}
        onFocus={async () => {
          const opts = await fetchSuggest("style", styleInput);
          setStyleOptions(opts);
          setStyleOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setStyleOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addChip("styles", styleInput);
            setStyleOpen(false);
          }
        }}
        placeholder="Ex: rap, pop…"
        className="flex-1 rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
      />

      <button
        className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold"
        onClick={() => {
          addChip("styles", styleInput);
          setStyleOpen(false);
        }}
      >
        Ajouter
      </button>
    </div>

    {styleOpen && styleOptions.length ? (
      <div className="absolute left-0 right-0 mt-2 max-h-56 overflow-auto rounded-2xl border border-[color:var(--border)] bg-white shadow-lg z-50">
        {styleOptions.map((o) => (
          <button
            key={o.label}
            className="w-full text-left px-3 py-2 hover:bg-[color:var(--cardTint)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              addChip("styles", o.label);
              setStyleOpen(false);
            }}
          >
            <div className="text-[13px] font-semibold text-[color:var(--ink)]">{o.label}</div>
            <div className="text-[11px] text-[color:var(--muted)]">{o.count} occurrence(s)</div>
          </button>
        ))}
      </div>
    ) : null}

    <div className="mt-2 text-[12px] text-[color:var(--muted)]">
      Astuce : si tu sélectionnes “rap”, une chanson avec “r&amp;b, pop, rap” sera gardée.
    </div>
  </div>
</div>

{/* Langues (menu déroulant Supabase) */}
<div>
  <div className="text-[12px] font-semibold text-[color:var(--muted)] mb-2">Langue</div>

  <select
    className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
    defaultValue=""
    onFocus={async () => {
      // charge la liste au moment où tu ouvres
      const opts = await fetchSuggest("language", "");
      setLanguageOptions(opts);
    }}
    onChange={(e) => {
      const v = e.target.value;
      if (!v) return;

      setFilters((prev) => ({
        ...prev,
        languages: prev.languages.includes(v) ? prev.languages : [...prev.languages, v],
      }));

      e.currentTarget.value = "";
    }}
  >
    <option value="">Choisir une langue…</option>
    {languageOptions.map((o) => (
      <option key={o.label} value={o.label}>
        {o.label} ({o.count})
      </option>
    ))}
  </select>
</div>

{/* Échelle 2 (menu déroulant) */}
<div>
  <div className="text-[12px] font-semibold text-[color:var(--muted)] mb-2">Échelle 2</div>

  <select
    className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
    defaultValue=""
    onFocus={async () => {
      if (echelle2Options.length) return;
      const opts = await fetchSuggest("echelle2", "");
      setEchelle2Options(opts);
    }}
    onChange={(e) => {
      const v = e.target.value;
      if (!v) return;
      addChip("echelle2s", v);
      e.currentTarget.value = "";
    }}
  >
    <option value="">Choisir une échelle 2…</option>
    {echelle2Options.map((o) => (
      <option key={o.label} value={o.label}>
        {o.label} ({o.count})
      </option>
    ))}
  </select>
</div>

{/* Sous-type (menu déroulant) */}
<div>
  <div className="text-[12px] font-semibold text-[color:var(--muted)] mb-2">Sous-type</div>

  <select
    className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
    defaultValue=""
    onFocus={async () => {
      if (sousTypeOptions.length) return;
      const opts = await fetchSuggest("sous_type", "");
      setSousTypeOptions(opts);
    }}
    onChange={(e) => {
      const v = e.target.value;
      if (!v) return;
      addChip("sous_types", v);
      e.currentTarget.value = "";
    }}
  >
    <option value="">Choisir un sous-type…</option>
    {sousTypeOptions.map((o) => (
      <option key={o.label} value={o.label}>
        {o.label} ({o.count})
      </option>
    ))}
  </select>
</div>

          {/* Décennies */}
         {/* Décennies (menu déroulant) */}
<div>
  <div className="text-[12px] font-semibold text-[color:var(--muted)] mb-2">Décennie</div>

  <div className="flex gap-2">
    <select
      className="flex-1 rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
      defaultValue=""
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        setFilters((prev) => ({
          ...prev,
          decennies: prev.decennies.includes(v) ? prev.decennies : [...prev.decennies, v],
        }));
        e.currentTarget.value = "";
      }}
    >
      <option value="">Choisir une décennie…</option>
      {decades.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>

    <button
      className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold"
      onClick={() => setOpen(true)}
    >
      OK
    </button>
  </div>
</div>

        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-1 text-[12px] font-semibold text-[color:var(--ink)]">
      {label}
      <button onClick={onRemove} className="text-[color:var(--muted)]">
        ×
      </button>
    </span>
  );
}


function BottomSheet({
  open,
  snap,
  onSnap,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  snap: "collapsed" | "half" | "full";
  onSnap: (s: "collapsed" | "half" | "full") => void;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  // Positions en % : plus c’est grand, plus la sheet est “bas” (moins visible)
  const snapClass =
    snap === "collapsed"
      ? "translate-y-[92%]"
      : snap === "half"
      ? "translate-y-[40%]"
      : "translate-y-0";

  return (
    <div
      className={[
        "absolute left-0 right-0 bottom-0 z-30 transition-transform duration-200",
        open ? `${snapClass} pointer-events-auto` : "translate-y-[100%] pointer-events-none",
      ].join(" ")}
      // Empêche le scroll de la page derrière
      style={{ touchAction: "none" }}
    >
      <div className="mx-auto w-full max-w-[420px] rounded-t-3xl bg-white shadow-lg overflow-hidden">
        {/* Handle tactile */}
        <div
          className="px-4 pt-2 pb-2 border-b border-[color:var(--border)]"
          onPointerDown={(e) => {
            // capture du pointer pour suivre le drag
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            (window as any).__sheetDrag = {
              startY: e.clientY,
              startSnap: snap,
            };
          }}
          onPointerMove={(e) => {
            const d = (window as any).__sheetDrag as
              | { startY: number; startSnap: "collapsed" | "half" | "full" }
              | undefined;
            if (!d) return;

            const dy = e.clientY - d.startY;

            // Si on tire vers le haut (dy négatif) : on “ouvre”
            if (dy < -50) {
              if (d.startSnap === "collapsed") onSnap("half");
              else onSnap("full");
              (window as any).__sheetDrag = undefined;
            }

            // Si on tire vers le bas (dy positif) : on “ferme”
            if (dy > 50) {
              if (d.startSnap === "full") onSnap("half");
              else onSnap("collapsed");
              (window as any).__sheetDrag = undefined;
            }
          }}
          onPointerUp={() => {
            (window as any).__sheetDrag = undefined;
          }}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-[color:var(--border)]" />
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold truncate">{title}</div>
              {subtitle ? (
                <div className="text-[12px] text-[color:var(--muted)] truncate">
                  {subtitle}
                </div>
              ) : null}
            </div>

            {/* Bouton fermer total (optionnel). Tu peux le retirer si tu veux. */}
            <button
              onClick={onClose}
              className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-2 py-1 text-[12px] font-semibold text-[color:var(--ink)]"
            >
              Fermer
            </button>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="max-h-[75dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
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
          Si la vidéo est indisponible dans l’application, utilise un lien externe Youtube/Spotify/SoundCloud ci-dessus.
        </div>
      ) : null}
    </div>
  );
}
