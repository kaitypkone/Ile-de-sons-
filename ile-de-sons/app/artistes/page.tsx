"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Photos (markers HTML) seulement à partir de ce zoom
const PHOTO_ZOOM = 12;
// Limite de photos pour éviter le lag
const MAX_PHOTOS = 200;

type ArtistePoint = {
  id: string;
  artiste: string | null;
  commune_origine: string | null;
  style: string | null;
  annee_de_naissance: string | null;
  latitude: number | null;
  longitude: number | null;
  lien: string | null;
  image_wikipedia: string | null;
  distance_km?: number | null;
};

type TopMode = "filter" | "search" | null;
type SearchMode = "nom" | "origine";

type Filters = {
  styles: string[];
};

export default function ArtistesMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  // markers photo
  const photoMarkersRef = useRef<maplibregl.Marker[]>([]);

  // --- 
  const allArtistesRef = useRef<ArtistePoint[]>([]);
  
  // pour throttler les fetch
  const fetchTimerRef = useRef<number | undefined>(undefined);
  // garder les filtres à jour dans les callbacks map
  const filtersRef = useRef<Filters>({ styles: [] });

  // UI state
  const [selectedArtiste, setSelectedArtiste] = useState<ArtistePoint | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<"presentation" | "liste">("presentation");

  const [topMode, setTopMode] = useState<TopMode>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("nom");

  const [filters, setFilters] = useState<Filters>({ styles: [] });

  const [listTitle, setListTitle] = useState<string>("");
  const [listItems, setListItems] = useState<ArtistePoint[]>([]);

  // sync ref
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  function toggleTopMode(next: Exclude<TopMode, null>) {
    setTopMode((cur) => (cur === next ? null : next));
  }

  // 1) Crée la map UNE SEULE FOIS
  useEffect(() => {
    if (!mapDivRef.current) return;

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: STYLE,
      center: [2.35, 48.85],
      zoom: 8,
      minZoom: 2.5,
      maxZoom: 18,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

    map.on("load", () => {
      // source points
      map.addSource("artistes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // layer points (fallback)
      map.addLayer({
        id: "artistes-points",
        type: "circle",
        source: "artistes",
        paint: {
          "circle-radius": 5,
          "circle-color": "#b7e6ff",
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // interactions points
     map.on("click", "artistes-points", (e) => {
      const feats = map.queryRenderedFeatures(e.point, {
        layers: ["artistes-points"],
      }) as any[];

      const f = feats?.[0];
      if (!f) return;

      const commune = f.properties?.commune_origine;
      if (!commune) return;

      const artistesCommune = allArtistesRef.current.filter(
        (a) => (a.commune_origine ?? "").toLowerCase() === commune.toLowerCase()
      );

      if (!artistesCommune.length) return;

      setSelectedArtiste(null);
      setListTitle(`Commune : ${commune}`);
      setListItems(artistesCommune);
      setTab("liste");
      setSheetOpen(true);
    });

      map.on("mouseenter", "artistes-points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "artistes-points", () => (map.getCanvas().style.cursor = ""));

      // charge initial + reload bbox sur move/zoom (throttle)
      const schedule = () => {
        if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = window.setTimeout(async () => {
          await loadBBox(map, filtersRef.current, photoMarkersRef, allArtistesRef);
        }, 250);
      };

      map.on("moveend", schedule);
      map.on("zoomend", schedule);

      schedule();
    });

    return () => {
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      for (const m of photoMarkersRef.current) m.remove();
      photoMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2) Quand les filtres changent → reload bbox (sans recréer la map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    void loadBBox(map, filters, photoMarkersRef, allArtistesRef);
  }, [filters]);

  return (
    <main className="h-dvh w-full">
      <div className="relative h-dvh w-full">
        <div ref={mapDivRef} className="absolute inset-0 h-full w-full" />

        {/* TOP OVERLAY */}
        <div className="absolute left-0 right-0 top-0 z-[9999] px-3 pt-3 pointer-events-none">
  <div className="mx-auto w-full max-w-[420px] space-y-2 relative pointer-events-auto">

            <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-2 py-1 shadow-sm">
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
              </div>
            </div>

            {topMode === "filter" ? (
              <FiltersPanel filters={filters} setFilters={setFilters} />
            ) : null}

            {topMode === "search" ? (
              <div className="space-y-2">
                <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-2 py-1 shadow-sm">
                  <div className="flex">
                    <button
                      className={[
                        "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
                        searchMode === "nom"
                          ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
                          : "text-[color:var(--muted)]",
                      ].join(" ")}
                      onClick={() => setSearchMode("nom")}
                    >
                      Nom
                    </button>

                    <button
                      className={[
                        "flex-1 px-3 py-2 text-[13px] font-semibold rounded-xl",
                        searchMode === "origine"
                          ? "bg-[color:var(--cardTint)] text-[color:var(--ink)]"
                          : "text-[color:var(--muted)]",
                      ].join(" ")}
                      onClick={() => setSearchMode("origine")}
                    >
                      Origine
                    </button>
                  </div>
                </div>

                {searchMode === "nom" ? (
                  <ArtistSearch
                    filters={filters}
                    onSelect={(a) => {
                      const map = mapRef.current;
                      if (!map) return;

                      setSelectedArtiste(a);
                      setTab("presentation");
                      setSheetOpen(true);

                      if (typeof a.longitude === "number" && typeof a.latitude === "number") {
                        map.easeTo({
                          center: [a.longitude, a.latitude],
                          zoom: Math.max(map.getZoom(), 13),
                          duration: 650,
                        });
                      }
                    }}
                  />
                ) : (
                  <OriginSearch
                    filters={filters}
                    map={mapRef.current}
                    onList={(title, items, center) => {
                      setListTitle(title);
                      setListItems(items);
                      setSelectedArtiste(null);
                      setTab("liste");
                      setSheetOpen(true);

                      const map = mapRef.current;
                      if (map && center) {
                        map.easeTo({
                          center,
                          zoom: Math.max(map.getZoom(), 12),
                          duration: 650,
                        });
                      }
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* BOTTOM SHEET */}
        {sheetOpen ? (
          <div className="absolute left-0 right-0 bottom-0 z-30">
            <div className="mx-auto w-full max-w-[420px] rounded-t-3xl bg-white shadow-lg overflow-hidden">
              <div className="px-4 pt-3 pb-3 border-b border-[color:var(--border)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">
                      {selectedArtiste?.artiste ?? listTitle ?? "Sélection"}
                    </div>

                    {selectedArtiste?.commune_origine ? (
                      <div className="text-[12px] text-[color:var(--muted)] truncate">
                        {selectedArtiste.commune_origine}
                        {selectedArtiste.annee_de_naissance ? ` · ${selectedArtiste.annee_de_naissance}` : ""}
                      </div>
                    ) : null}
                  </div>

                  <button
                    onClick={() => {
                      setSheetOpen(false);
                      setSelectedArtiste(null);
                    }}
                    className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-2 py-1 text-[12px] font-semibold text-[color:var(--ink)]"
                  >
                    Fermer
                  </button>
                </div>

                <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-white overflow-hidden">
                  <div className="flex">
                    <button
                      className={[
                        "flex-1 px-3 py-2 text-[13px] font-semibold border-b",
                        tab === "presentation"
                          ? "text-[color:var(--ink)] border-[color:var(--primary)]"
                          : "text-[color:var(--muted)] border-[color:var(--border)]",
                      ].join(" ")}
                      onClick={() => setTab("presentation")}
                      disabled={!selectedArtiste}
                      title={!selectedArtiste ? "Sélectionne un artiste" : undefined}
                    >
                      Présentation
                    </button>

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
                  </div>

                  <div className="max-h-[65dvh] overflow-auto pb-[env(safe-area-inset-bottom)]">
                    {tab === "presentation" ? (
                      <PresentationPanel artiste={selectedArtiste} />
                    ) : (
                      <ListPanel
                        items={listItems}
                        onPick={(a) => {
                          const map = mapRef.current;
                          if (!map) return;

                          setSelectedArtiste(a);
                          setTab("presentation");

                          if (typeof a.longitude === "number" && typeof a.latitude === "number") {
                            map.easeTo({
                              center: [a.longitude, a.latitude],
                              zoom: Math.max(map.getZoom(), 13),
                              duration: 650,
                            });
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

/* ---------------- UI components ---------------- */

function FiltersPanel({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
}) {
  const [open, setOpen] = useState(false);

  // input + suggestions
  const [styleInput, setStyleInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  async function fetchStyleSuggestions(q: string) {
    const url = new URL("/api/styles-suggest", window.location.origin);
    url.searchParams.set("q", q.trim()); // ✅ peut être vide → suggestions au focus
    url.searchParams.set("limit", "30");

    const res = await fetch(url.toString());
    if (!res.ok) return;

    const json = await res.json();
    setSuggestions(json.styles ?? []);
  }

  function addStyleValue(v: string) {
    const vv = v.trim();
    if (!vv) return;

    setFilters((prev) =>
      prev.styles.includes(vv) ? prev : { ...prev, styles: [...prev.styles, vv] }
    );
    setStyleInput("");
    setSuggestOpen(false);
  }

  function removeStyle(v: string) {
    setFilters((prev) => ({ ...prev, styles: prev.styles.filter((x) => x !== v) }));
  }

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur shadow-sm overflow-visible">
      <button
        className="w-full flex items-center justify-between px-3 py-2"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="text-[13px] font-semibold text-[color:var(--ink)]">Filtres</div>
        <div className="text-[12px] text-[color:var(--muted)]">{filters.styles.length} sélection</div>
      </button>

      {open ? (
        <div className="border-t border-[color:var(--border)] p-3 space-y-3">
          {filters.styles.length ? (
            <div className="flex flex-wrap gap-2">
              {filters.styles.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-1 text-[12px] font-semibold text-[color:var(--ink)]"
                >
                  {s}
                  <button onClick={() => removeStyle(s)} className="text-[color:var(--muted)]" type="button">
                    ×
                  </button>
                </span>
              ))}
              <button
                className="text-[12px] font-semibold text-[color:var(--primary)] underline"
                onClick={() => setFilters({ styles: [] })}
                type="button"
              >
                Tout effacer
              </button>
            </div>
          ) : null}

          <div>
            <div className="text-[12px] font-semibold text-[color:var(--muted)] mb-2">Style</div>

            <div className="relative">
              <div className="flex gap-2">
                <input
                  value={styleInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStyleInput(v);

                    if (timerRef.current) window.clearTimeout(timerRef.current);
                    timerRef.current = window.setTimeout(() => void fetchStyleSuggestions(v), 200);
                  }}
                  placeholder="Ex: rap, pop…"
                  className="flex-1 rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
                  onFocus={() => {
                    setSuggestOpen(true);
                    void fetchStyleSuggestions(styleInput); // ✅ si vide → suggestions direct
                  }}
                  onBlur={() => window.setTimeout(() => setSuggestOpen(false), 120)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addStyleValue(styleInput);
                    }
                  }}
                />

                <button
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold"
                  onClick={() => addStyleValue(styleInput)}
                  type="button"
                >
                  Ajouter
                </button>
              </div>

              {suggestOpen && suggestions.length ? (
                <div className="absolute left-0 right-0 mt-2 max-h-72 overflow-auto rounded-2xl border border-[color:var(--border)] bg-white shadow-lg z-50">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-[color:var(--cardTint)]"
                      onMouseDown={(e) => {
                        e.preventDefault(); // ✅ empêche le blur de casser le clic
                        addStyleValue(s);
                      }}
                    >
                      <div className="text-[13px] font-semibold text-[color:var(--ink)]">{s}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PresentationPanel({ artiste }: { artiste: ArtistePoint | null }) {
  if (!artiste) {
    return <div className="p-3 text-[13px] text-[color:var(--muted)]">Sélectionne un artiste.</div>;
  }

  const img = normalizeWikiUrl(artiste.image_wikipedia);

  return (
    <div className="p-3 space-y-3">
      {/* ✅ IMAGE DANS L’ONGLET PRÉSENTATION */}
      {img ? (
        <div className="rounded-2xl overflow-hidden border border-[color:var(--border)] bg-[color:var(--cardTint)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={artiste.artiste ?? "Artiste"}
            className="w-full h-56 object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}

      <div className="text-[14px] font-semibold text-[color:var(--ink)]">{artiste.artiste ?? "—"}</div>

      <div className="text-[13px] text-[color:var(--muted)] space-y-1">
        {artiste.commune_origine ? <div>Commune : {artiste.commune_origine}</div> : null}
        {artiste.annee_de_naissance ? <div>Année de naissance : {artiste.annee_de_naissance}</div> : null}
        {artiste.style ? <div>Style : {artiste.style}</div> : null}
      </div>

      {artiste.lien ? (
        <a
          href={artiste.lien}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--primary)] px-3 py-2 text-[13px] font-semibold text-white"
        >
          Ouvrir sur Wikipédia
        </a>
      ) : null}
    </div>
  );
}

function ListPanel({ items, onPick }: { items: ArtistePoint[]; onPick: (a: ArtistePoint) => void }) {
  if (!items.length) {
    return <div className="p-3 text-[13px] text-[color:var(--muted)]">Aucun résultat.</div>;
  }

  return (
    <div className="p-3 space-y-2">
    {/* --- groupement par style --- */}
    {(() => {
      // 1️⃣ regroupe les artistes par style
      const grouped: Record<string, ArtistePoint[]> = {};
      items.forEach((a) => {
        const style = a.style ?? "Autres styles";
        if (!grouped[style]) grouped[style] = [];
        grouped[style].push(a);
      });

      // 2️⃣ trie les styles par ordre alphabétique
      const sortedStyles = Object.keys(grouped).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );

      // 3️⃣ affichage
      return sortedStyles.map((style) => (
        <div key={style}>
          {/* titre du style */}
          <div className="px-3 py-1 bg-[color:var(--cardTint)] font-semibold text-[color:var(--ink)] rounded-xl mt-2">
            {style}
          </div>

          {/* artistes pour ce style */}
          <div className="space-y-1 mt-1">
            {grouped[style]
              .slice()
              .sort((a, b) =>
                (a.artiste ?? "").toLowerCase().localeCompare((b.artiste ?? "").toLowerCase())
              )
              .map((a) => (
                <button
                  key={a.id}
                  className="w-full text-left rounded-2xl border border-[color:var(--border)] bg-white px-3 py-2"
                  onClick={() => onPick(a)}
                  type="button"
                >
                  <div className="text-[13px] font-semibold text-[color:var(--ink)]">{a.artiste ?? "—"}</div>
                  <div className="text-[12px] text-[color:var(--muted)]">{a.commune_origine ?? "—"}</div>
                </button>
              ))}
          </div>
        </div>
      ));
    })()}
    </div>
  );
}

function ArtistSearch({
  filters,
  onSelect,
}: {
  filters: Filters;
  onSelect: (a: ArtistePoint) => void;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<ArtistePoint[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  async function searchNow(v: string) {
    const qq = v.trim();
    if (!qq) {
      setOpts([]);
      return;
    }

    const url = new URL("/api/artistes-search", window.location.origin);
    url.searchParams.set("q", qq);
    url.searchParams.set("limit", "30");

    const res = await fetch(url.toString());
    if (!res.ok) return;

    const json = await res.json();
    let artistes = (json.artistes ?? []) as ArtistePoint[];

    if (filters.styles.length) {
      artistes = artistes.filter((a) => {
        const s = (a.style ?? "").toLowerCase();
        return filters.styles.some((f) => s.includes(f.toLowerCase()));
      });
    }

    setOpts(artistes);
  }

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur shadow-sm overflow-visible">
      <div className="p-2">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);

              if (timerRef.current) window.clearTimeout(timerRef.current);
              timerRef.current = window.setTimeout(() => void searchNow(v), 250);
            }}
            onFocus={() => {
              setOpen(true);
              void searchNow(q);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder="Rechercher un artiste…"
            className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
          />

          {open && opts.length ? (
            <div className="absolute left-0 right-0 mt-2 max-h-72 overflow-auto rounded-2xl border border-[color:var(--border)] bg-white shadow-lg z-50">
              {opts.map((a) => (
                <button
                  key={a.id}
                  className="w-full text-left px-3 py-2 hover:bg-[color:var(--cardTint)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(a)}
                  type="button"
                >
                  <div className="text-[13px] font-semibold text-[color:var(--ink)]">{a.artiste ?? "—"}</div>
                  <div className="text-[11px] text-[color:var(--muted)]">{a.commune_origine ?? "—"}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OriginSearch({
  filters,
  map,
  onList,
}: {
  filters: Filters;
  map: maplibregl.Map | null;
  onList: (title: string, items: ArtistePoint[], center?: [number, number]) => void;
}) {
  const [q, setQ] = useState("");
  const [communes, setCommunes] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  async function suggestNow(v: string) {
    const vv = v.trim();

    // si vide, on peut afficher rien (ou des communes populaires si tu fais une API dédiée)
    if (!vv) {
      setCommunes([]);
      return;
    }

    const url = new URL("/api/communes-suggest", window.location.origin);
    url.searchParams.set("q", vv);
    url.searchParams.set("limit", "30");

    const res = await fetch(url.toString());
    if (!res.ok) return;

    const json = await res.json();
    setCommunes(json.communes ?? []);
  }

  async function openCommune(name: string) {
    if (!map) return;
    const b = map.getBounds();

    const url = new URL("/api/artistes-bbox", window.location.origin);
    url.searchParams.set("minLng", String(b.getWest()));
    url.searchParams.set("minLat", String(b.getSouth()));
    url.searchParams.set("maxLng", String(b.getEast()));
    url.searchParams.set("maxLat", String(b.getNorth()));

    const res = await fetch(url.toString());
    if (!res.ok) return;

    const json = await res.json();
    let items = (json.artistes ?? []) as ArtistePoint[];

    items = items.filter((a) => (a.commune_origine ?? "").toLowerCase() === name.toLowerCase());

    if (filters.styles.length) {
      items = items.filter((a) => {
        const s = (a.style ?? "").toLowerCase();
        return filters.styles.some((f) => s.includes(f.toLowerCase()));
      });
    }

    onList(`Commune : ${name}`, items);
  }

  async function aroundMe() {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas disponible.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        const res = await fetch("/api/artistes-nearby", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, radiusKm: 30, limit: 200 }),
        });
        if (!res.ok) return;

        const json = await res.json();
        let items = (json.artistes ?? []) as ArtistePoint[];

        if (filters.styles.length) {
          items = items.filter((a) => {
            const s = (a.style ?? "").toLowerCase();
            return filters.styles.some((f) => s.includes(f.toLowerCase()));
          });
        }

        items = items.slice().sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
        onList("Autour de moi (30 km)", items, [lng, lat]);
      },
      () => alert("Impossible d’obtenir la position."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 backdrop-blur shadow-sm overflow-visible">
      <div className="p-2 space-y-2">
        <button
          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-2 text-[13px] font-semibold"
          onClick={() => void aroundMe()}
          type="button"
        >
          Autour de moi
        </button>

        <div className="relative">
          <input
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);

              if (timerRef.current) window.clearTimeout(timerRef.current);
              timerRef.current = window.setTimeout(() => void suggestNow(v), 250);
            }}
            onFocus={() => {
              setOpen(true);
              void suggestNow(q);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder="Rechercher une commune d’origine…"
            className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] outline-none"
          />

          {open && communes.length ? (
            <div className="absolute left-0 right-0 mt-2 max-h-72 overflow-auto rounded-2xl border border-[color:var(--border)] bg-white shadow-lg z-50">
              {communes.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-[color:var(--cardTint)]"
                  onMouseDown={(e) => {
                    e.preventDefault(); // ✅ empêche le blur de casser le clic
                    void openCommune(c);
                    setOpen(false);
                  }}
                >
                  <div className="text-[13px] font-semibold text-[color:var(--ink)]">{c}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------- data + perf ---------------- */

function normalizeWikiUrl(raw: any) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("http")) return s;
  return "";
}

async function loadBBox(
  map: maplibregl.Map,
  filters: Filters,
  photoMarkersRef: React.MutableRefObject<maplibregl.Marker[]>,
  allArtistesRef: React.MutableRefObject<ArtistePoint[]>
) {
  const b = map.getBounds();
  const url = new URL("/api/artistes-bbox", window.location.origin);
  url.searchParams.set("minLng", String(b.getWest()));
  url.searchParams.set("minLat", String(b.getSouth()));
  url.searchParams.set("maxLng", String(b.getEast()));
  url.searchParams.set("maxLat", String(b.getNorth()));

  const res = await fetch(url.toString());
  if (!res.ok) return;

  const json = await res.json();
  let artistes = (json.artistes ?? []) as ArtistePoint[];

  // filtre style (simple)
  if (filters.styles.length) {
    artistes = artistes.filter((a) => {
      const s = (a.style ?? "").toLowerCase();
      return filters.styles.some((f) => s.includes(f.toLowerCase()));
    });
  }

  allArtistesRef.current = artistes;

  // update points
  const geojson = {
    type: "FeatureCollection",
    features: artistes
      .map((a: any) => {
        const lng = Number(a.longitude);
        const lat = Number(a.latitude);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            ...a,
            longitude: lng,
            latitude: lat,
          },
        };
      })
      .filter(Boolean),
  };

  const src = map.getSource("artistes") as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(geojson as any);

  // photos HTML (lourd) → zoom only
  renderPhotoMarkers(map, artistes, photoMarkersRef);
}

function renderPhotoMarkers(
  map: maplibregl.Map,
  artistes: ArtistePoint[],
  photoMarkersRef: React.MutableRefObject<maplibregl.Marker[]>
) {
  for (const m of photoMarkersRef.current) m.remove();
  photoMarkersRef.current = [];

  if (map.getZoom() < PHOTO_ZOOM) return;

  let count = 0;
  for (const a of artistes) {
    if (count >= MAX_PHOTOS) break;

    const lng = Number(a.longitude);
    const lat = Number(a.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const imgUrl = normalizeWikiUrl(a.image_wikipedia);
    if (!imgUrl) continue;

    const el = document.createElement("div");
    el.style.width = "34px";
    el.style.height = "34px";
    el.style.borderRadius = "9999px";
    el.style.border = "2px solid white";
    el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
    el.style.backgroundImage = `url("${imgUrl}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";

    const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    photoMarkersRef.current.push(marker);

    count++;
  }
}
