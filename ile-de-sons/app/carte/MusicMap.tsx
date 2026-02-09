"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import SongSearch, { SongSearchResult } from "./SongSearch";
import PlaceSearch, { PlaceSearchResult } from "../../components/PlaceSearch";

type SongPoint = {
  id: string;
  anciens_id: string | null;
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
    style: string | null;          
  distance_km?: number | null;
  language: string | null;
};

type GeoJSONFeature = GeoJSON.Feature<GeoJSON.Geometry, any>;
type GeoJSONFC = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;

type Overlay = "none" | "idf" | "dep" | "river" | "rail";

type ContributionDraft = {
  title: string;
  main_artist: string;
  lyrics: string;
  place: string;
  echelle: "" | "Région" | "Département" | "Commune" | "Rue";
  sous_type: string;
  decennie: string;
  youtube_url: string;
  latitude: number | null;
  longitude: number | null;
};


const POSITRON_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

  // ✅ Style satellite (raster) — sans clé API
const SATELLITE_STYLE: any = {
  version: 8,
  sources: {
    esri_sat: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Tiles © Esri",
    },
  },
  layers: [
    {
      id: "esri-satellite",
      type: "raster",
      source: "esri_sat",
    },
  ],
};


// Quelques seuils de zoom (ajustables)
const Z_IDF_ONLY = 6.8;        // <= : IDF visible (grand dézoom)
const Z_CONTEXT_START = 6.8;   // > : deps + fleuves + rail visibles
const Z_CONTEXT_END = 9.6;     // au-delà : on cache deps/fleuves/rail (plus tôt)
const Z_CLUSTERS_START = 7.2;  // clusters apparaissent à partir de là
const Z_POINTS_START = 12.8;   // points individuels

export default function MusicMap() {
  const mapRef = useRef<MLMap | null>(null);
  // Garde en mémoire les points actuellement chargés (pour retrouver les doublons sur un clic)
const pointsGeojsonRef = useRef<GeoJSONFC | null>(null);

 // ✅ index coords arrondies -> chansons à ce point
  const coordIndexRef = useRef<Map<string, SongPoint[]>>(new Map());

  // ✅ garde les geojson en mémoire pour retrouver une feature + bbox
const idfGeoRef = useRef<GeoJSONFC | null>(null);
const depsGeoRef = useRef<GeoJSONFC | null>(null);
const riversGeoRef = useRef<GeoJSONFC | null>(null);
const railGeoRef = useRef<GeoJSONFC | null>(null);
const geoForFiltersRef = useRef<{ idf: string[]; dep: string[]; river: string[]; rail: string[] } | null>(null);


  function coordKey(lng: number, lat: number) {
    return `${lng.toFixed(6)}|${lat.toFixed(6)}`;
  }

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const [selectedSong, setSelectedSong] = useState<SongPoint | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<"collapsed" | "half" | "full">("full");
  const dragRef = useRef<{ startY: number; startSnap: "collapsed" | "half" | "full" } | null>(null);
const [playerNonce, setPlayerNonce] = useState(0);

  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [lastBboxKey, setLastBboxKey] = useState<string>("");
const [pointsCount, setPointsCount] = useState(0);


const [pickOnMap, setPickOnMap] = useState(false);
const pickMarkerRef = useRef<maplibregl.Marker | null>(null);
const [pickToast, setPickToast] = useState<string | null>(null);


  const [placeTotal, setPlaceTotal] = useState<number>(0);
const [placeOffset, setPlaceOffset] = useState<number>(0);
const [placeHasMore, setPlaceHasMore] = useState<boolean>(false);
const [placeLoadingMore, setPlaceLoadingMore] = useState<boolean>(false);

const [baseMap, setBaseMap] = useState<"positron" | "satellite">("positron");

const PLACE_PAGE_SIZE = 50;

const [filters, setFilters] = useState({
  artists: [] as string[],
  decennies: [] as string[],
  styles: [] as string[],
  languages: [] as string[],
});

const [contributionOpen, setContributionOpen] = useState(false);

const [draft, setDraft] = useState<ContributionDraft>({
  title: "",
  main_artist: "",
  lyrics: "",
  place: "",
  echelle: "",
  sous_type: "",
  decennie: "",
  youtube_url: "",
  latitude: null,
  longitude: null,
});

async function submitContribution() {
  const res = await fetch("/api/chansons-contributions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    alert(j.error ?? "Erreur lors de l’envoi.");
    return;
  }

  alert("Merci. Ta contribution a été envoyée.");
  setContributionOpen(false);
  setDraft({
    title: "",
    main_artist: "",
    lyrics: "",
    place: "",
    echelle: "",
    sous_type: "",
    decennie: "",
    youtube_url: "",
    latitude: null,
    longitude: null,
  });
}

useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  if (!pickOnMap) {
    map.getCanvas().style.cursor = "";
    return;
  }

  map.getCanvas().style.cursor = "crosshair";

  const handler = (e: maplibregl.MapMouseEvent) => {
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;

    console.log("[pickOnMap] picked:", lng, lat);

    // 1) Sauvegarde dans le draft
    setDraft((d) => ({ ...d, longitude: lng, latitude: lat }));

    // 2) Feedback VISUEL garanti : Marker
    if (pickMarkerRef.current) pickMarkerRef.current.remove();
    pickMarkerRef.current = new maplibregl.Marker({ color: "#c050b0" })
      .setLngLat([lng, lat])
      .addTo(map);

    // 3) Petit toast
    setPickToast(`✅ Point sélectionné : ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    window.setTimeout(() => setPickToast(null), 1800);

    // 4) Fin du mode pick
    setPickOnMap(false);
  };

  map.once("click", handler);

  return () => {
    map.off("click", handler);
    map.getCanvas().style.cursor = "";
  };
}, [pickOnMap]);


  // Garder les filtres "à jour" pour les callbacks MapLibre (évite le bug: filtres qui sautent après moveend)
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Signature stable des filtres (pour déclencher un refetch même si la carte ne bouge pas)
  const filtersKey = useMemo(() => {
    const norm = (arr: string[]) =>
      [...arr]
        .map((s) => s.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    return JSON.stringify({
      artists: norm(filters.artists),
      decennies: norm(filters.decennies),
      styles: norm(filters.styles),
      languages: norm(filters.languages),
    });
  }, [filters]);

const [topMode, setTopMode] = useState<"filter" | "search" | "contribute" | null>(null);
const [placeMode, setPlaceMode] = useState<"song" | "place">("song");

function toggleTopMode(next: "filter" | "search" | "contribute") {
  setTopMode((cur) => (cur === next ? null : next));
}


const [placeSongs, setPlaceSongs] = useState<SongPoint[]>([]);
// Chansons correspondant exactement au point cliqué (mêmes coordonnées)
const [pointSongs, setPointSongs] = useState<SongPoint[]>([]);
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
  style: baseMap === "positron" ? POSITRON_STYLE : SATELLITE_STYLE,
  center: [2.35, 48.85],  // moitié nord (ajuste si tu veux)
  zoom: 8.3,             // moitié nord visible au chargement
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
  // 1) Contexte...
  await addContextLayers(map, { idfGeoRef, depsGeoRef, riversGeoRef, railGeoRef });

// On démarre avec aucune sélection geo
clearSelectedGeo(map);

// ✅ Clics sur les GeoJSON (idf / deps / fleuves / rail)
const openGeo = async (kind: "idf" | "dep" | "river" | "rail", id: any, label: string) => {
  // reset liste
  setSelectedSong(null);
  setPointSongs([]);
  setSelectedPlaceLabel(label);

  // fetch
  const res = await fetch("/api/songs-by-geo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      id,
      filters: filtersRef.current,
      offset: 0,
      limit: PLACE_PAGE_SIZE,
    }),
  });

  if (!res.ok) return;
  const json = await res.json();

  setPlaceSongs(json.songs ?? []);
  setPlaceTotal(json.total ?? 0);
  setPlaceOffset((json.songs ?? []).length);
  setPlaceHasMore(Boolean(json.hasMore));
  setPlaceLoadingMore(false);

  setTab("liste");
  setSheetOpen(true);
  setSheetSnap("full");
};

map.on("click", (e) => {
  const p = e.point;

  // 1️⃣ PRIORITÉ ABSOLUE : points
  const pointHits = map.queryRenderedFeatures(p, {
    layers: ["unclustered", "clusters"],
  });
  if (pointHits.length) return;

  // 2️⃣ Fleuves
  const riverHits = map.queryRenderedFeatures(p, {
    layers: ["rivers-hit"],
  });
  if (riverHits.length) {
    const f = riverHits[0];
    const id = f.properties?.ID;
    if (id != null) {
      openGeo(
        "river",
        id,
        f.properties?.NOM_C_EAU ?? f.properties?.name ?? "Fleuve"
      );
    }
    return;
  }

  // 3️⃣ Rail
  const railHits = map.queryRenderedFeatures(p, {
    layers: ["rail-hit"],
  });
  if (railHits.length) {
    const f = railHits[0];
    const id = f.properties?.OBJECTID_1;
    if (id != null) {
      openGeo("rail", id, f.properties?.res_com ?? "Réseau ferré");
    }
    return;
  }

  // 4️⃣ Département
  const depHits = map.queryRenderedFeatures(p, {
    layers: ["deps-fill"],
  });
  if (depHits.length) {
    const f = depHits[0];
    const id = f.properties?.ID;
    if (id != null) {
      openGeo(
        "dep",
        id,
        f.properties?.NOM ?? f.properties?.name ?? "Département"
      );
    }
    return;
  }

  // 5️⃣ IDF (dernier)
  const idfHits = map.queryRenderedFeatures(p, {
    layers: ["idf-fill"],
  });
  if (idfHits.length) {
    const f = idfHits[0];
    const id = f.properties?.ID;
    if (id != null) {
      openGeo("idf", id, "Île-de-France");
    }
  }
});




// Cursors “cliquable”
map.on("mouseenter", "idf-fill", () => (map.getCanvas().style.cursor = "pointer"));
map.on("mouseleave", "idf-fill", () => (map.getCanvas().style.cursor = ""));
map.on("mouseenter", "deps-fill", () => (map.getCanvas().style.cursor = "pointer"));
map.on("mouseleave", "deps-fill", () => (map.getCanvas().style.cursor = ""));
map.on("mouseenter", "rivers-hit", () => (map.getCanvas().style.cursor = "pointer"));
map.on("mouseleave", "rivers-hit", () => (map.getCanvas().style.cursor = ""));
map.on("mouseenter", "rail-hit", () => (map.getCanvas().style.cursor = "pointer"));
map.on("mouseleave", "rail-hit", () => (map.getCanvas().style.cursor = ""));


  // 2) Source...
  addSongPointLayers(map);
  addSelectionLayers(map);

  // 3) Visibilité...
  applyVisibilityRules(map, pointsCount);
map.on("zoom", () => applyVisibilityRules(map, pointsCount));
  map.on("moveend", () => maybeFetchPoints(map));
  map.on("zoomend", () => maybeFetchPoints(map));

  // 4) Premier fetch
  maybeFetchPoints(map);

  // 5) Interactions
 wireSongPointInteractions(
  map,
  (lng, lat) => coordIndexRef.current.get(coordKey(lng, lat)) ?? [],
  (payload) => {

    if (payload.mode === "single") {
      setSelectedSong(payload.song);
      setPointSongs([]);
      setTab("lecture");
      setSheetOpen(true);
      setSheetSnap("full");
      return;
    }

    setSelectedSong(null);
    setPointSongs(payload.songs);
    setSelectedPlaceLabel("Chansons à cet endroit");
    setTab("liste");
    setSheetOpen(true);
    setSheetSnap("full");
  });
}); // ✅ IMPORTANT: fermeture du map.on("load")

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [idfBounds, baseMap]);

  // Quand les filtres changent : invalide le cache bbox et refetch immédiatement
  useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  setLastBboxKey("");
  maybeFetchPoints(map);

    // ✅ Si plus aucun filtre => on enlève TOUT le contexte geo (idf/dep/fleuves/rail)
  const f = filtersRef.current;
  const noFilters =
    f.artists.length === 0 &&
    f.decennies.length === 0 &&
    f.styles.length === 0 &&
    f.languages.length === 0;

  if (noFilters) {
    resetContextLayers(map);
    return; // ✅ stop ici, pas d'appel API
  }


  // ✅ Afficher automatiquement les entités geo concernées par les filtres
    (async () => {
    try {
      const res = await fetch("/api/geo-ids-for-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: filtersRef.current }),
      });
      if (!res.ok) return;

      const json = await res.json();
      // ✅ l’API renvoie: { idf, dep, river, rail }
      const payload = {
        idf: Array.isArray(json.idf) ? json.idf : [],
        dep: Array.isArray(json.dep) ? json.dep : [],
        river: Array.isArray(json.river) ? json.river : [],
        rail: Array.isArray(json.rail) ? json.rail : [],
      };

      geoForFiltersRef.current = payload;

      // ✅ applique sur la carte
      applyGeoFiltersToContext(map, payload);
    } catch (e) {
      console.error(e);
    }
  })();


  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filtersKey]);


  return (
  <main className="h-dvh w-full">
    <div className="relative h-dvh w-full">
      {/* Carte */}
      <div ref={mapDivRef} className="absolute inset-0 h-full w-full" />

     {/* Overlay haut */}
<div className="fixed left-0 right-0 top-14 z-40 px-3 pt-3 pointer-events-none">
  <div className="mx-auto w-full max-w-[420px] space-y-2 pointer-events-auto">
          
{pickOnMap ? (
  <div className="absolute left-0 right-0 bottom-4 z-50 px-3">
    <div className="mx-auto max-w-[420px] rounded-2xl border border-[color:var(--border)] bg-white/90 backdrop-blur px-3 py-3 shadow-lg">
      <div className="text-[13px] font-semibold text-[color:var(--ink)]">
        Clique sur la carte pour placer le point 📍
      </div>
      <div className="mt-1 text-[12px] text-[color:var(--muted)]">
        (Le curseur devient une croix)
      </div>
      <button
        className="mt-2 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold"
        onClick={() => setPickOnMap(false)}
      >
        Annuler
      </button>
    </div>
  </div>
) : null}

{pickToast ? (
  <div className="absolute left-0 right-0 bottom-24 z-50 px-3">
    <div className="mx-auto max-w-[420px] rounded-2xl border border-[color:var(--border)] bg-white/95 backdrop-blur px-3 py-2 shadow-lg text-[13px] font-semibold">
      {pickToast}
    </div>
  </div>
) : null}


          {/* Toggle Chanson / Lieu */}
{/* Barre principale + switch fond de carte (même ligne, pas de chevauchement) */}
<div className="flex items-center gap-2">
  {/* Barre Filtrer / Rechercher / Contribuer — volontairement plus courte */}
  <div className="flex-1 max-w-[320px] rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-2 py-1 shadow-sm">
    <div className="flex">
      <button
        className={[
          "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
          topMode === "filter"
            ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
            : "text-[color:var(--muted)]",
        ].join(" ")}
        onClick={() => toggleTopMode("filter")}
      >
        Filtrer
      </button>

      <button
        className={[
          "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
          topMode === "search"
            ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
            : "text-[color:var(--muted)]",
        ].join(" ")}
        onClick={() => toggleTopMode("search")}
      >
        Rechercher
      </button>

      <button
        className={[
          "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
          topMode === "contribute"
            ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
            : "text-[color:var(--muted)]",
        ].join(" ")}
        onClick={() => {
          setTopMode("contribute");
          setSheetOpen(true);
          setSheetSnap("full");
          setContributionOpen(true);
        }}
      >
        Contribuer
      </button>
    </div>
  </div>

  {/* Switch Plan / Satellite — discret, à droite */}
  <div className="shrink-0">
    <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-white/70 backdrop-blur px-1 py-1 shadow-sm">
      <button
        className={[
          "px-2.5 py-1 text-[11px] font-semibold rounded-full transition",
          baseMap === "positron"
            ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
            : "text-[color:var(--muted)]",
        ].join(" ")}
        onClick={() => setBaseMap("positron")}
        title="Fond plan"
      >
        Carte
      </button>

      <button
        className={[
          "px-2.5 py-1 text-[11px] font-semibold rounded-full transition",
          baseMap === "satellite"
            ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
            : "text-[color:var(--muted)]",
        ].join(" ")}
        onClick={() => setBaseMap("satellite")}
        title="Fond satellite"
      >
        Sat
      </button>
    </div>
  </div>
</div>

{/* Mode FILTRER */}
{topMode === "filter" ? (
  <FiltersPanel filters={filters} setFilters={setFilters} />
) : null}

{/* Mode RECHERCHER */}
{topMode === "search" ? (
  <>
    {/* Sous-toggle : Chanson / Lieu */}
    <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-2 py-1 shadow-sm">
      <div className="flex">
        <button
  className={[
    "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
    placeMode === "song"
      ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
      : "text-[color:var(--muted)]",
  ].join(" ")}
 onClick={() => {
  setPlaceMode("song");
  const map = mapRef.current;
  if (map) {
    clearSelectedPoint(map);
    clearSelectedGeo(map);
  }
}}

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

    {/* UI de recherche */}
    {placeMode === "song" ? (
      <SongSearch
        loading={isLoadingPoints}
        filters={filters}
        onSelect={(song) => {
          const map = mapRef.current;
          if (!map) return;
          clearSelectedGeo(map);

          setSelectedSong(song as any);
          setSelectedPlace(song.place ?? "");
          setTab("lecture");
          setSheetOpen(true);
          setSheetSnap("full");

          const hasPoint = typeof song.longitude === "number" && typeof song.latitude === "number";

if (hasPoint) {
  const targetZoom = Math.max(map.getZoom(), 13);
  map.easeTo({
    center: [song.longitude as number, song.latitude as number],
    zoom: targetZoom,
    duration: 650,
  });
  setSelectedPoint(map, song.longitude as number, song.latitude as number, song);
} else {
  // ✅ cas fleuve / dep / région / rail : on affiche uniquement l'entité
  const kind = kindFromRow(song.echelle ?? null, song.echelle2 ?? null, song.sous_type ?? null);
  if (kind && song.anciens_id) {
    showSelectedGeo({
      map,
      kind,
      anciensId: song.anciens_id,
      idfGeo: idfGeoRef.current,
      depsGeo: depsGeoRef.current,
      riversGeo: riversGeoRef.current,
      railGeo: railGeoRef.current,
    });
  } else {
    // rien à afficher : on clear juste
    clearSelectedPoint(map);
    clearSelectedGeo(map);
  }
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

              const success = async (pos: GeolocationPosition) => {
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
};

const fail = (err: GeolocationPositionError) => {
  console.error("Geolocation error:", err.code, err.message);

  // ✅ Si high accuracy échoue (timeout/position indispo), on retente en mode plus permissif (iPhone-friendly)
  const shouldRetry =
    err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE;

  if (shouldRetry) {
    navigator.geolocation.getCurrentPosition(
      success,
      (err2) => {
        console.error("Geolocation retry error:", err2.code, err2.message);
        alert("Impossible d’obtenir la position. Autorise la localisation dans Safari.");
      },
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000,
      }
    );
    return;
  }

  // Permission refusée ou autre
  alert("Impossible d’obtenir la position. Autorise la localisation dans Safari.");
};

navigator.geolocation.getCurrentPosition(success, fail, {
  enableHighAccuracy: true,
  timeout: 20000,     // ✅ iOS a souvent besoin de plus
  maximumAge: 60000,  // ✅ accepte une position récente (très utile sur iOS)
});

            }}
          >
            Autour de moi
          </button>
        </div>

        <div className="p-2">
          <PlaceSearch
            filters={filters}
            onSelect={async (p) => {
              setPointSongs([]);      // ✅ important : sinon la liste affichera encore pointSongs
setPlaceSongs([]);      // optionnel mais propre (évite flash d'ancienne liste)
setSelectedSong(null);  // optionnel (tu le fais déjà plus bas)

              const map = mapRef.current;
              if (!map) return;
              setPointSongs([]);         // ✅ reset liste “point”
setPlaceSongs([]);         // ✅ reset liste “place” (optionnel)
setSelectedSong(null);     // ✅ reset sélection (optionnel)
setSelectedPlaceLabel(p.place);


              setSelectedPlaceLabel(p.place);
clearSelectedPoint(map);
clearSelectedGeo(map);

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

// ✅ Si le lieu correspond à une entité geo, on n'affiche que CETTE entité
const kind = kindFromRow(p.echelle ?? null, p.echelle2 ?? null, p.sous_type ?? null);
if (kind && p.anciens_id) {
  showSelectedGeo({
    map,
    kind,
    anciensId: p.anciens_id,
    idfGeo: idfGeoRef.current,
    depsGeo: depsGeoRef.current,
    riversGeo: riversGeoRef.current,
    railGeo: railGeoRef.current,
  });
  return; // ✅ on évite d'utiliser json.center (on a déjà fitBounds sur l'entité)
}


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
  </>
) : null}

        </div>
      </div>

      {/* Bottom sheet */}
  {/* Bottom sheet */}
<BottomSheet
  open={sheetOpen}
  snap={sheetSnap}
  onSnap={setSheetSnap}
  onClose={() => {
  // ✅ stoppe les iframes (YouTube/Spotify/SoundCloud) uniquement quand on ferme totalement
  setPlayerNonce((n) => n + 1);

  setSheetOpen(false);
  setContributionOpen(false);
  setPickOnMap(false);
}}
  title={
    contributionOpen
      ? "Contribuer"
      : selectedSong?.full_title ??
        selectedSong?.title ??
        selectedPlaceLabel ??
        "Sélection"
  }
  subtitle={
    contributionOpen
      ? "Proposer une chanson"
      : selectedSong?.place
      ? `${selectedSong.place}${selectedSong.echelle ? ` · ${selectedSong.echelle}` : ""}`
      : selectedPlaceLabel
      ? "Résultats pour ce lieu"
      : undefined
  }
>
  {contributionOpen ? (
    <ContributionPanel
      draft={draft}
      setDraft={setDraft}
      pickOnMap={pickOnMap}
      onPickOnMap={() => {
        setPickOnMap(true);
        setSheetSnap("collapsed"); // optionnel: laisse voir la carte
      }}
      onCancel={() => {
        setContributionOpen(false);
        setPickOnMap(false);
      }}
      onSubmit={submitContribution}
    />
  ) : (
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

          {(placeSongs.length > 0 || pointSongs.length > 0) ? (
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
            <>
              {/* ✅ Infos chanson (badges) */}
              <div className="px-3 pt-3">
                <div className="flex flex-wrap gap-2">
                  {selectedSong.language ? (
                    <span className="rounded-full px-3 py-1 text-[12px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                      Langue : {selectedSong.language}
                    </span>
                  ) : null}

                  {selectedSong.decennie ? (
                    <span className="rounded-full px-3 py-1 text-[12px] font-semibold bg-indigo-100 text-indigo-900 border border-indigo-200">
                      Décennie : {selectedSong.decennie}
                    </span>
                  ) : null}

                  {selectedSong.annee ? (
                    <span className="rounded-full px-3 py-1 text-[12px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                      Année : {selectedSong.annee}
                    </span>
                  ) : null}

                  {selectedSong.style ? (
  selectedSong.style
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => Boolean(s))
    .slice(0, 2)
    .map((s: string, i: number) => (
      <span
        key={`style-${i}`}
        className="rounded-full px-3 py-1 text-[12px] font-semibold bg-pink-100 text-pink-900 border border-pink-200"
      >
        {s}
      </span>
    ))
) : null}

                </div>
              </div>

              <MediaBlock
  key={playerNonce}
  song={{
    youtube_embed: selectedSong.youtube_embed,
    youtube_url: selectedSong.youtube_url,
    spotify_url: selectedSong.spotify_url,
    soundcloud_url: selectedSong.soundcloud_url,
  }}
/>

            </>
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
              {(pointSongs.length > 0 ? pointSongs.length : placeSongs.length).toLocaleString("fr-FR")}
              {pointSongs.length > 0 ? " chanson(s)" : ` / ${placeTotal.toLocaleString("fr-FR")} chansons`}
            </div>

            <div className="mt-3 space-y-2">
              {(pointSongs.length > 0 ? pointSongs : placeSongs).map((s) => (
                <button
                  key={s.id}
                  className="w-full text-left rounded-2xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-3"
                  onClick={() => {
                    const map = mapRef.current;
                    if (!map) return;
                    setPointSongs([]);
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
                        (pointSongs.length > 0
                          ? (s.place ?? "")
                          : selectedPlaceLabel && !selectedPlaceLabel.startsWith("Autour de moi")
                          ? selectedPlaceLabel
                          : (s.place ?? "")),
                        90
                      )}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>

            {placeHasMore && pointSongs.length === 0 ? (
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
  )}
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
    const b = map.getBounds();
        const f = filtersRef.current;
const filtersKey = JSON.stringify({
  artists: [...f.artists].sort(),
  decennies: [...f.decennies].sort(),
  styles: [...f.styles].sort(),
  languages: [...f.languages].sort(),
});

const key = `${filtersKey}|${z.toFixed(2)}:${b.getWest().toFixed(3)},${b
  .getSouth()
  .toFixed(3)},${b.getEast().toFixed(3)},${b.getNorth().toFixed(3)}`;


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
      const f = filtersRef.current;

      for (const a of f.artists) url.searchParams.append("artist", a);
      for (const d of f.decennies) url.searchParams.append("decennie", d);
      for (const s of f.styles) url.searchParams.append("style", s);
      for (const l of f.languages) url.searchParams.append("language", l);

      const res = await fetch(url.toString());

if (!res.ok) {
  console.warn("songs-bbox non OK :", res.status);
  return;
}

const fc = (await res.json()) as GeoJSONFC;
setPointsCount(fc.features?.length ?? 0);
applyVisibilityRules(map, fc.features?.length ?? 0);


const src = map.getSource("songs") as maplibregl.GeoJSONSource | undefined;
if (src) src.setData(fc);

// ✅ mémorise les points actuellement chargés (filtrés + bbox courante)
pointsGeojsonRef.current = fc;

// ✅ construit l’index coords -> liste de chansons
const idx = new Map<string, SongPoint[]>();

for (const feat of fc.features as any[]) {
  const coords = feat?.geometry?.coordinates;
  if (!coords || coords.length < 2) continue;
  const [lng, lat] = coords as [number, number];

  const props = feat.properties ?? {};
  const song: SongPoint = {
    id: props.id,
    anciens_id: props.anciens_id ?? null,
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
    distance_km: props.distance_km ? Number(props.distance_km) : null,
    language: props.language ?? null,
    style: props.style ?? null,
  };

  const k = coordKey(lng, lat);
  const arr = idx.get(k) ?? [];
  arr.push(song);
  idx.set(k, arr);
}

for (const arr of idx.values()) {
  arr.sort((a, b) =>
    (a.full_title ?? a.title ?? "").localeCompare(b.full_title ?? b.title ?? "")
  );
}

coordIndexRef.current = idx;


    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPoints(false);
    }
  }
}

async function addContextLayers(
  map: MLMap,
  refs: {
    idfGeoRef: React.MutableRefObject<GeoJSONFC | null>;
    depsGeoRef: React.MutableRefObject<GeoJSONFC | null>;
    riversGeoRef: React.MutableRefObject<GeoJSONFC | null>;
    railGeoRef: React.MutableRefObject<GeoJSONFC | null>;
  }
) {
  // Région IDF
  const idf = (await fetch("/data/IDF.geojson").then((r) => r.json())) as GeoJSONFC;
  refs.idfGeoRef.current = idf;

  map.addSource("idf-region", { type: "geojson", data: idf });

  map.addLayer({
    id: "idf-fill",
    type: "fill",
    source: "idf-region",
    layout: { visibility: "none" },
    paint: { "fill-color": "#f1b56a", "fill-opacity": 0.35 },
  });

  map.addLayer({
    id: "idf-outline",
    type: "line",
    source: "idf-region",
    layout: { visibility: "none" },
    paint: { "line-color": "#c9853f", "line-width": 2, "line-opacity": 0.9 },
  });

  // Départements
  const deps = (await fetch("/data/dep_WGS84.geojson").then((r) => r.json())) as GeoJSONFC;
  refs.depsGeoRef.current = deps;

  map.addSource("idf-deps", { type: "geojson", data: deps });

  map.addLayer({
    id: "deps-fill",
    type: "fill",
    source: "idf-deps",
    layout: { visibility: "none" },
    paint: { "fill-color": "#f1a65f", "fill-opacity": 0.6 },
  });

  map.addLayer({
    id: "deps-outline",
    type: "line",
    source: "idf-deps",
    layout: { visibility: "none" },
    paint: { "line-color": "#d8893f", "line-width": 1.5, "line-opacity": 0.9 },
  });

  // Fleuves
  const rivers = (await fetch("/data/fleuves_WGS84.geojson").then((r) => r.json())) as GeoJSONFC;
  refs.riversGeoRef.current = rivers;

  map.addSource("idf-rivers", { type: "geojson", data: rivers });

  map.addLayer({
    id: "rivers-line",
    type: "line",
    source: "idf-rivers",
    layout: { visibility: "none" },
    paint: { "line-color": "#2a78ff", "line-width": 2.5, "line-opacity": 1 },
  });

  // ✅ Fleuves : hitbox invisible (facilite le clic)
map.addLayer({
  id: "rivers-hit",
  type: "line",
  source: "idf-rivers",
  layout: { visibility: "none" },
  paint: {
    "line-color": "#000000",
    "line-width": 16,     // zone de clic confortable
    "line-opacity": 0.001,
    // totalement invisible
  },
});


  // Rail
  const rail = (await fetch("/data/reseau_ferre_IDF.geojson").then((r) => r.json())) as GeoJSONFC;
  refs.railGeoRef.current = rail;

  map.addSource("idf-rail", { type: "geojson", data: rail });

  map.addLayer({
    id: "rail-line",
    type: "line",
    source: "idf-rail",
    layout: { visibility: "none" },
    paint: { "line-color": "#6b5b4a", "line-width": 2, "line-opacity": 1 },
  });

    // Rail hitbox (large, invisible) — pour faciliter le clic
  map.addLayer({
    id: "rail-hit",
    type: "line",
    source: "idf-rail",
    layout: { visibility: "none" },
    paint: {
      "line-color": "#000000",
      "line-width": 14,
      "line-opacity": 0.001,
    },
  });


  // =========================
  // ✅ Layers de sélection (1 seule entité)
  // =========================

// IDF selected (ORANGE 65%)
  map.addLayer({
    id: "idf-selected-fill",
    type: "fill",
    source: "idf-region",
    layout: { visibility: "none" },
    filter: ["==", ["get", "ID"], "__none__"],
    paint: {
      "fill-color": "#f1a65f",
      "fill-opacity": 0.65,
    },
  });

  map.addLayer({
    id: "idf-selected-outline",
    type: "line",
    source: "idf-region",
    layout: { visibility: "none" },
    filter: ["==", ["get", "ID"], "__none__"],
    paint: {
      "line-color": "#d8893f",
      "line-width": 2,
      "line-opacity": 1,
    },
  });

  // Départements selected (ORANGE 65%)
  map.addLayer({
    id: "dep-selected-fill",
    type: "fill",
    source: "idf-deps",
    layout: { visibility: "none" },
    filter: ["==", ["get", "ID"], "__none__"],
    paint: {
      "fill-color": "#f1a65f",
      "fill-opacity": 0.65,
    },
  });

  map.addLayer({
    id: "dep-selected-outline",
    type: "line",
    source: "idf-deps",
    layout: { visibility: "none" },
    filter: ["==", ["get", "ID"], "__none__"],
    paint: {
      "line-color": "#d8893f",
      "line-width": 2,
      "line-opacity": 1,
    },
  });

  // Fleuves selected (BLEU, opaque)
  map.addLayer({
    id: "river-selected-line",
    type: "line",
    source: "idf-rivers",
    layout: { visibility: "none" },
    filter: ["==", ["get", "ID"], "__none__"],
    paint: {
      "line-color": "#2a78ff",
      "line-width": 4,
      "line-opacity": 1,
    },
  });

  // Rail selected (GRIS clair, opaque)
  map.addLayer({
    id: "rail-selected-line",
    type: "line",
    source: "idf-rail",
    layout: { visibility: "none" },
    filter: ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"],
    paint: {
      "line-color": "#7a7a7a",
      "line-width": 4,
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

function applyVisibilityRules(map: MLMap, count?: number) {
  const z = map.getZoom();

  // clusters visibles partout
  setVis(map, "clusters", true);
  setVis(map, "cluster-count", true);

  // ✅ si peu de points (ex: après filtre), on montre les points plus tôt
  const c = typeof count === "number" ? count : Infinity;
  const showUnclustered =
    z >= Z_POINTS_START || (c > 0 && c <= 500 && z >= Z_CLUSTERS_START);

  setVis(map, "unclustered", showUnclustered);
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
  getSongsAt: (lng: number, lat: number) => SongPoint[],
  onSelect: (
    payload:
      | { mode: "single"; song: SongPoint }
      | { mode: "multi"; songs: SongPoint[] }
  ) => void
) {


    // ✅ Clic cluster => zoom in sur le cluster
  map.on("click", "clusters", (e) => {
    // ✅ Empêche les handlers des couches geo de s'exécuter aussi
(e.originalEvent as any).cancelBubble = true;

    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const f = features[0];
    if (!f) return;

    const clusterId = f.properties?.cluster_id;
    if (clusterId === undefined || clusterId === null) return;

    const source = map.getSource("songs") as maplibregl.GeoJSONSource;
    const coords = (f.geometry as any).coordinates as [number, number];

    (source as any).getClusterExpansionZoom(clusterId).then((zoom: number) => {
      map.easeTo({ center: coords, zoom, duration: 450 });
    });
  });

  // Clic cluster => zoom in sur le cluster
    // Clic point => si plusieurs chansons au même point : ouvrir la liste
    map.on("click", "unclustered", (e) => {
      (e.originalEvent as any).cancelBubble = true;

    // 🔥 récupère toutes les features sous le clic (pas seulement la première)
    const feats = map.queryRenderedFeatures(e.point, { layers: ["unclustered"] }) as any[];
    if (!feats?.length) return;

    // Convertit chaque feature en SongPoint
    const songsAtPixel: SongPoint[] = feats.map((feat) => {
      const props = feat.properties ?? {};
      return {
        id: props.id,
          anciens_id: props.anciens_id ?? null,
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
        distance_km: props.distance_km ? Number(props.distance_km) : null,
        language: props.language ?? null,
        style: props.style ?? null,
      };
    });

    // coords du point cliqué (pour le halo)
    const coords = (feats[0].geometry as any).coordinates as [number, number];
    const [lng, lat] = coords;

    // Si plusieurs chansons au même pixel => liste
    if (songsAtPixel.length > 1) {
      songsAtPixel.sort((a, b) =>
        (a.full_title ?? a.title ?? "").localeCompare(b.full_title ?? b.title ?? "")
      );
      onSelect({ mode: "multi", songs: songsAtPixel });
      setSelectedPoint(map, lng, lat, { kind: "multi", count: songsAtPixel.length });
      return;
    }

    // Sinon => comportement normal
    const one = songsAtPixel[0];
    onSelect({ mode: "single", song: one });
    setSelectedPoint(map, lng, lat, one);
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

type Filters = {
  artists: string[];
  decennies: string[];
  styles: string[];
  languages: string[];
};

function FiltersPanel({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
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
type SuggestKind = "artist" | "style" | "language";

const SUGGEST_DEBOUNCE_MS = 300;
const SUGGEST_TTL_MS = 60_000;

// Cache: key = `${kind}||${qNorm}`
const suggestCacheRef = useRef(
  new Map<string, { ts: number; options: { label: string; count: number }[] }>()
);

// Pour debounce (un timer par kind)
const suggestTimerRef = useRef<Record<string, number | undefined>>({});

// Pour éviter qu’une réponse lente écrase une recherche plus récente
const suggestReqIdRef = useRef<Record<string, number>>({});

function normQ(q: string) {
  return q.trim().toLowerCase();
}

async function fetchSuggestNow(kind: SuggestKind, q: string) {
  const url = new URL("/api/filter-suggest", window.location.origin);
  url.searchParams.set("kind", kind);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "40");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = await res.json();
  return (json.options ?? []) as { label: string; count: number }[];
}

function scheduleSuggest(
  kind: SuggestKind,
  q: string,
  setOptions: (opts: { label: string; count: number }[]) => void,
  setOpenList?: (v: boolean) => void
) {
  const qn = normQ(q);
  const cacheKey = `${kind}||${qn}`;

  // Cache hit
  const hit = suggestCacheRef.current.get(cacheKey);
  if (hit && Date.now() - hit.ts < SUGGEST_TTL_MS) {
    setOptions(hit.options);
    if (setOpenList) setOpenList(true);
    return;
  }

  // Debounce
  if (suggestTimerRef.current[kind]) {
    window.clearTimeout(suggestTimerRef.current[kind]);
  }

  suggestTimerRef.current[kind] = window.setTimeout(async () => {
    const reqId = (suggestReqIdRef.current[kind] ?? 0) + 1;
    suggestReqIdRef.current[kind] = reqId;

    const opts = await fetchSuggestNow(kind, qn);

    // Si une requête plus récente existe, on ignore la réponse
    if (suggestReqIdRef.current[kind] !== reqId) return;

    suggestCacheRef.current.set(cacheKey, { ts: Date.now(), options: opts });
    setOptions(opts);
    if (setOpenList) setOpenList(true);
  }, SUGGEST_DEBOUNCE_MS);
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

  function addChip(kind: "artists" | "styles" | "languages", value: string) {
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
  kind: "artists" | "styles" | "decennies" | "languages",
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
  setFilters({ artists: [], decennies: [], styles: [], languages: [] } as Filters);
}

  const count =
  filters.artists.length +
  filters.decennies.length +
  filters.styles.length +
  filters.languages.length;

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
          scheduleSuggest("artist", v, setArtistOptions, setArtistOpen);
        }}
        onFocus={async () => {
          scheduleSuggest("artist", artistInput, setArtistOptions, setArtistOpen);
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
          scheduleSuggest("style", v, setStyleOptions, setStyleOpen);
        }}
        onFocus={async () => {
          scheduleSuggest("style", styleInput, setStyleOptions, setStyleOpen);
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
    scheduleSuggest("language", "", setLanguageOptions);
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
      onClick={() => setOpen(false)}
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
    ? "translate-y-[78%]"
    : snap === "half"
    ? "translate-y-[40%]"
    : "translate-y-0";

  return (
    <div
      className={[
        "fixed left-0 right-0 bottom-0 z-50 transition-transform duration-200",
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

function pickLabel(props: any, fallback: string) {
  return (
    props?.name ??
    props?.nom ??
    props?.NOM ??
    props?.libelle ??
    props?.LIBELLE ??
    props?.NOM_DEPT ??
    props?.dep_name ??
    fallback
  );
}

function clearSelectedPoint(map: MLMap) {
  const src = map.getSource("selected-point") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({ type: "FeatureCollection", features: [] });
}

function clearSelectedGeo(map: MLMap) {
  // Cache tous les layers selected
  setVis(map, "idf-selected-fill", false);
  setVis(map, "idf-selected-outline", false);
  setVis(map, "dep-selected-fill", false);
  setVis(map, "dep-selected-outline", false);
  setVis(map, "river-selected-line", false);
  setVis(map, "rail-selected-line", false);

  // Reset filtres (valeurs impossibles)
  if (map.getLayer("idf-selected-fill")) map.setFilter("idf-selected-fill", ["==", ["get", "ID"], "__none__"]);
  if (map.getLayer("idf-selected-outline")) map.setFilter("idf-selected-outline", ["==", ["get", "ID"], "__none__"]);
  if (map.getLayer("dep-selected-fill")) map.setFilter("dep-selected-fill", ["==", ["get", "ID"], "__none__"]);
  if (map.getLayer("dep-selected-outline")) map.setFilter("dep-selected-outline", ["==", ["get", "ID"], "__none__"]);
  if (map.getLayer("river-selected-line")) map.setFilter("river-selected-line", ["==", ["get", "ID"], "__none__"]);
  if (map.getLayer("rail-selected-line"))
  map.setFilter("rail-selected-line", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);

}

function resetContextLayers(map: MLMap) {
  // Cache tout
  setVis(map, "idf-fill", false);
  setVis(map, "idf-outline", false);
  setVis(map, "deps-fill", false);
  setVis(map, "deps-outline", false);
  setVis(map, "rivers-line", false);
  setVis(map, "rail-line", false);
  setVis(map, "rivers-hit", false);
  setVis(map, "rail-hit", false);
    if (map.getLayer("rivers-hit")) map.setFilter("rivers-hit", ["==", ["get", "ID"], "__none__"]);

  if (map.getLayer("rail-hit"))
    map.setFilter("rail-hit", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);


  // Et surtout: filtre impossible (sinon un autre handler peut ré-afficher)
  if (map.getLayer("idf-fill")) map.setFilter("idf-fill", ["==", ["get", "ID"], "__none__"]);
  if (map.getLayer("idf-outline")) map.setFilter("idf-outline", ["==", ["get", "ID"], "__none__"]);

  if (map.getLayer("deps-fill")) map.setFilter("deps-fill", ["==", ["get", "ID"], "__none__"]);
  if (map.getLayer("deps-outline")) map.setFilter("deps-outline", ["==", ["get", "ID"], "__none__"]);

  if (map.getLayer("rivers-line")) map.setFilter("rivers-line", ["==", ["get", "ID"], "__none__"]);

  if (map.getLayer("rail-line"))
    map.setFilter("rail-line", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);
}


function showAvailableGeo(map: MLMap, payload: {
  
  depIds: (string | number)[];
  riverIds: (string | number)[];
  railIds: (string | number)[];
  hasIdf: boolean;
}) {

      const hasAny =
    payload.hasIdf ||
    payload.depIds.length > 0 ||
    payload.riverIds.length > 0 ||
    payload.railIds.length > 0;

  if (!hasAny) {
    resetContextLayers(map);
    return;
  }


  // On active les layers de contexte MAIS filtrés
  // (et on laisse les layers "*-selected-*" à part, pour quand tu sélectionnes UNE entité)

  // IDF
  if (payload.hasIdf) {
    setVis(map, "idf-fill", true);
    setVis(map, "idf-outline", true);
    map.setFilter("idf-fill", ["!=", ["get", "ID"], "__none__"]);      // affiche l'unique entité
    map.setFilter("idf-outline", ["!=", ["get", "ID"], "__none__"]);
  } else {
    setVis(map, "idf-fill", false);
    setVis(map, "idf-outline", false);
    map.setFilter("idf-fill", ["==", ["get", "ID"], "__none__"]);
    map.setFilter("idf-outline", ["==", ["get", "ID"], "__none__"]);
  }

  // Départements (ID)
  if (payload.depIds.length) {
    setVis(map, "deps-fill", true);
    setVis(map, "deps-outline", true);
    map.setFilter("deps-fill", ["in", ["get", "ID"], ["literal", payload.depIds.map(String)]]);
    map.setFilter("deps-outline", ["in", ["get", "ID"], ["literal", payload.depIds.map(String)]]);
  } else {
    setVis(map, "deps-fill", false);
    setVis(map, "deps-outline", false);
    map.setFilter("deps-fill", ["==", ["get", "ID"], "__none__"]);
    map.setFilter("deps-outline", ["==", ["get", "ID"], "__none__"]);
  }

 // Fleuves (ID) — line + hitbox
if (payload.riverIds.length) {
  const filter = [
    "in",
    ["to-string", ["get", "ID"]],
    ["literal", payload.riverIds.map(String)],
  ] as any;

  setVis(map, "rivers-line", true);
  setVis(map, "rivers-hit", true);

  map.setFilter("rivers-line", filter);
  map.setFilter("rivers-hit", filter);
} else {
  setVis(map, "rivers-line", false);
  setVis(map, "rivers-hit", false);

  map.setFilter("rivers-line", ["==", ["get", "ID"], "__none__"]);
  map.setFilter("rivers-hit", ["==", ["get", "ID"], "__none__"]);
}

// Rail (OBJECTID_1) — line + hitbox
if (payload.railIds.length) {
  const filter = [
    "in",
    ["to-string", ["get", "OBJECTID_1"]],
    ["literal", payload.railIds.map(String)],
  ] as any;

  setVis(map, "rail-line", true);
  setVis(map, "rail-hit", true);

  map.setFilter("rail-line", filter);
  map.setFilter("rail-hit", filter);
} else {
  setVis(map, "rail-line", false);
  setVis(map, "rail-hit", false);

  map.setFilter("rail-line", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);
  map.setFilter("rail-hit", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);
}



}


function kindFromRow(echelle: string | null, echelle2: string | null, sous_type: string | null): "idf" | "dep" | "river" | "rail" | null {
  if (echelle2 === "Département") return "dep";
  if (echelle === "Région" && sous_type === "Fleuves") return "river";
  if (echelle === "Région" && sous_type === "Lignes de trains - métros") return "rail";
  if (echelle === "Région" && (!sous_type || sous_type.trim() === "")) return "idf";
  return null;
}

function findFeatureById(fc: GeoJSONFC | null, field: string, idValue: string | number) {
  if (!fc?.features?.length) return null;
  for (const f of fc.features as any[]) {
    const v = f?.properties?.[field];
    if (v == null) continue;
    // compare souple (string/number)
    if (String(v) === String(idValue)) return f as GeoJSONFeature;
  }
  return null;
}

function bboxFromGeometry(geom: GeoJSON.Geometry): [number, number, number, number] | null {
  // [minX, minY, maxX, maxY]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const walk = (coords: any) => {
    if (!coords) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0], y = coords[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const c of coords) walk(c);
  };

  // @ts-ignore
  walk(geom.coordinates);

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  return [minX, minY, maxX, maxY];
}

function applyGeoFiltersToContext(
  
  map: MLMap,
  payload: { idf: string[]; dep: string[]; river: string[]; rail: string[] }
) {
  // Si aucun filtre geo, on cache tout le contexte
  const z = map.getZoom();
if (z < Z_CONTEXT_START) return;
  
  const hasAny =
    payload.idf.length || payload.dep.length || payload.river.length || payload.rail.length;

  if (!hasAny) {
    setVis(map, "idf-fill", false);
    setVis(map, "idf-outline", false);
    setVis(map, "deps-fill", false);
    setVis(map, "deps-outline", false);
    setVis(map, "rivers-line", false);
    setVis(map, "rail-line", false);
    setVis(map, "rivers-hit", false);
setVis(map, "rail-hit", false);
if (map.getLayer("rivers-hit")) map.setFilter("rivers-hit", ["==", ["get", "ID"], "__none__"]);
if (map.getLayer("rail-hit")) map.setFilter("rail-hit", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);


    // reset filtres (valeurs impossibles)
    if (map.getLayer("idf-fill")) map.setFilter("idf-fill", ["==", ["get", "ID"], "__none__"]);
    if (map.getLayer("idf-outline")) map.setFilter("idf-outline", ["==", ["get", "ID"], "__none__"]);
    if (map.getLayer("deps-fill")) map.setFilter("deps-fill", ["==", ["get", "ID"], "__none__"]);
    if (map.getLayer("deps-outline")) map.setFilter("deps-outline", ["==", ["get", "ID"], "__none__"]);
    if (map.getLayer("rivers-line")) map.setFilter("rivers-line", ["==", ["get", "ID"], "__none__"]);
    if (map.getLayer("rail-line"))
      map.setFilter("rail-line", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);

    return;
  }

  // IDF (si au moins une chanson "Région" sans sous_type => on affiche la région)
  if (payload.idf.length) {
    setVis(map, "idf-fill", true);
    setVis(map, "idf-outline", true);
    // IDF.geojson a un ID unique: on peut afficher tout, ou filtrer sur l'ID renvoyé (souvent "1")
    map.setFilter("idf-fill", ["in", ["to-string", ["get", "ID"]], ["literal", payload.idf.map(String)]]);
    map.setFilter("idf-outline", ["in", ["to-string", ["get", "ID"]], ["literal", payload.idf.map(String)]]);
  } else {
    setVis(map, "idf-fill", false);
    setVis(map, "idf-outline", false);
    map.setFilter("idf-fill", ["==", ["get", "ID"], "__none__"]);
    map.setFilter("idf-outline", ["==", ["get", "ID"], "__none__"]);
  }

  // Départements (ID)
  if (payload.dep.length) {
    setVis(map, "deps-fill", true);
    setVis(map, "deps-outline", true);
    map.setFilter("deps-fill", ["in", ["to-string", ["get", "ID"]], ["literal", payload.dep.map(String)]]);
    map.setFilter("deps-outline", ["in", ["to-string", ["get", "ID"]], ["literal", payload.dep.map(String)]]);
  } else {
    setVis(map, "deps-fill", false);
    setVis(map, "deps-outline", false);
    map.setFilter("deps-fill", ["==", ["get", "ID"], "__none__"]);
    map.setFilter("deps-outline", ["==", ["get", "ID"], "__none__"]);
  }

  // Fleuves (ID)
  if (payload.river.length) {
    setVis(map, "rivers-line", true);
    map.setFilter("rivers-line", ["in", ["to-string", ["get", "ID"]], ["literal", payload.river.map(String)]]);
  } else {
    setVis(map, "rivers-line", false);
    map.setFilter("rivers-line", ["==", ["get", "ID"], "__none__"]);
  }

  // Rail (OBJECTID_1)
  if (payload.rail.length) {
    setVis(map, "rail-line", true);
    map.setFilter("rail-line", [
      "in",
      ["to-string", ["get", "OBJECTID_1"]],
      ["literal", payload.rail.map(String)],
    ]);
  } else {
    setVis(map, "rail-line", false);
    map.setFilter("rail-line", ["==", ["to-string", ["get", "OBJECTID_1"]], "__none__"]);
  }
}


function showSelectedGeo(opts: {
  map: MLMap;
  kind: "idf" | "dep" | "river" | "rail";
  anciensId: string;
  idfGeo: GeoJSONFC | null;
  depsGeo: GeoJSONFC | null;
  riversGeo: GeoJSONFC | null;
  railGeo: GeoJSONFC | null;
}) {
  const { map, kind, anciensId, idfGeo, depsGeo, riversGeo, railGeo } = opts;

  clearSelectedPoint(map);
  clearSelectedGeo(map);

  // Détermine le champ ID côté geojson
  const field = kind === "rail" ? "OBJECTID_1" : "ID";
  const idValue: string | number = kind === "rail" ? Number(anciensId) : anciensId;

  // Applique filtre + visibilité sur le bon layer selected
  if (kind === "idf") {
    setVis(map, "idf-selected-fill", true);
    setVis(map, "idf-selected-outline", true);
    map.setFilter("idf-selected-fill", ["==", ["get", "ID"], idValue]);
    map.setFilter("idf-selected-outline", ["==", ["get", "ID"], idValue]);
  } else if (kind === "dep") {
    setVis(map, "dep-selected-fill", true);
    setVis(map, "dep-selected-outline", true);
    map.setFilter("dep-selected-fill", ["==", ["get", "ID"], idValue]);
    map.setFilter("dep-selected-outline", ["==", ["get", "ID"], idValue]);
  } else if (kind === "river") {
    setVis(map, "river-selected-line", true);
    map.setFilter("river-selected-line", ["==", ["get", "ID"], idValue]);
  } else if (kind === "rail") {
    setVis(map, "rail-selected-line", true);
    map.setFilter("rail-selected-line", [
  "==",
  ["to-string", ["get", "OBJECTID_1"]],
  String(anciensId),
]);


  }

  // Bbox + fitBounds (pour centrer/zoomer sur l'entité)
  const fc =
    kind === "idf" ? idfGeo :
    kind === "dep" ? depsGeo :
    kind === "river" ? riversGeo :
    railGeo;

  const feat = findFeatureById(fc, field, idValue);
  const bbox = feat?.geometry ? bboxFromGeometry(feat.geometry) : null;

  if (bbox) {
    const bounds: LngLatBoundsLike = [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ];
    map.fitBounds(bounds, {
      padding: 50,
      duration: 650,
      maxZoom: kind === "river" || kind === "rail" ? 12.5 : 11.8,
    });
  }
}



function setOverlay(map: MLMap, overlay: Overlay) {
  // tout cacher
  setVis(map, "idf-fill", false);
  setVis(map, "idf-outline", false);
  setVis(map, "deps-fill", false);
  setVis(map, "deps-outline", false);
  setVis(map, "rivers-line", false);
  setVis(map, "rail-line", false);

  // puis montrer seulement celui voulu
  if (overlay === "idf") {
    setVis(map, "idf-fill", true);
    setVis(map, "idf-outline", true);
  }
  if (overlay === "dep") {
    setVis(map, "deps-fill", true);
    setVis(map, "deps-outline", true);
  }
  if (overlay === "river") setVis(map, "rivers-line", true);
  if (overlay === "rail") setVis(map, "rail-line", true);
}

function overlayFromPlace(p: PlaceSearchResult): Overlay {
  // Département
  if (p.echelle2 === "Département") return "dep";

  // Fleuves
  if (p.echelle === "Région" && p.sous_type === "Fleuves") return "river";

  // Rail
  if (p.echelle === "Région" && p.sous_type === "Lignes de trains - métros")
    return "rail";

  // IDF : région sans sous-type
  if (p.echelle === "Région" && (!p.sous_type || p.sous_type.trim() === ""))
    return "idf";

  return "none";
}

function ContributionPanel({
  draft,
  setDraft,
  pickOnMap,
  onPickOnMap,
  onCancel,
  onSubmit,
}: {
  draft: ContributionDraft;
  setDraft: React.Dispatch<React.SetStateAction<ContributionDraft>>;
  pickOnMap: boolean;
  onPickOnMap: () => void;
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  const needCoords = draft.latitude == null || draft.longitude == null;
  return (
    <div className="p-3 space-y-3">
      <div className="text-[14px] font-semibold text-[color:var(--ink)]">
        Proposer une chanson
      </div>

      <input
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        placeholder="Titre"
        className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
      />

      <input
        value={draft.main_artist}
        onChange={(e) => setDraft((d) => ({ ...d, main_artist: e.target.value }))}
        placeholder="Nom de l'artiste"
        className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
      />

      <input
        value={draft.place}
        onChange={(e) => {
          const place = e.target.value;
          setDraft((d) => ({
            ...d,
            place,
            // reset coords quand on change de lieu (on recalculera / repick)
            latitude: null,
            longitude: null,
          }));
        }}
        placeholder="Lieu mentionné dans la chanson"
        className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
      />

      <input
        value={draft.youtube_url}
        onChange={(e) => setDraft((d) => ({ ...d, youtube_url: e.target.value }))}
        placeholder="Lien YouTube"
        className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
      />

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--cardTint)] p-3">
        <div className="text-[12px] font-semibold text-[color:var(--muted)]">
          Coordonnées (si le lieu n’existe pas)
        </div>

        {needCoords ? (
          <>
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] font-semibold"
              onClick={onPickOnMap}
            >
              {pickOnMap ? "Clique sur la carte…" : "Choisir sur la carte"}
            </button>

            {pickOnMap ? (
              <div className="mt-2 text-[12px] text-[color:var(--primary)]">
                Clique sur la carte pour placer le point 📍
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-2 text-[12px] text-[color:var(--muted)]">
            {draft.latitude?.toFixed(5)}, {draft.longitude?.toFixed(5)}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] font-semibold"
          onClick={onCancel}
        >
          Annuler
        </button>

        <button
          className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--primary)] px-3 py-2 text-[13px] font-semibold text-white"
          onClick={onSubmit}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
