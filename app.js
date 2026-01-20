// =====================
// 0) SUPABASE CONFIG
// =====================
const SUPABASE_URL = "https://votckpjacugwoqowjcow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kzB2e_oa8VfzGCYlyELKng_YYV8_zJd";

const TABLE_SONGS = "chansons";
const TABLE_SUGGEST = "suggestions"; // pour "Ajouter" (en attente)

const COLS = `
  id,
  anciens_id,
  place,
  full_title,
  title,
  genius_song_id,
  language,
  main_artist,
  artist_names,
  genius_url,
  lyrics,
  style,
  media_urls,
  annee,
  longitude,
  latitude,
  echelle,
  sous_type,
  youtube_url,
  spotify_url,
  soundcloud_url,
  youtube_embed,
  decennie
`;

let sb;

// =====================
// 1) DOM
// =====================
const elStatus = document.getElementById("status");
const elTotalSongs = document.getElementById("total-songs");

const elSearch = document.getElementById("search-input");
const btnClear = document.getElementById("clear-search");

const btnFilters = document.getElementById("btn-filters");
const btnLocate = document.getElementById("btn-locate");
const btnRefresh = document.getElementById("btn-refresh");

const drawer = document.getElementById("results-drawer");
const drawerClose = document.getElementById("drawer-close");
const elResults = document.getElementById("results-list");
const elNoResults = document.getElementById("no-results");
const elResultsCount = document.getElementById("results-count");

const sheet = document.getElementById("song-sheet");
const sheetClose = document.getElementById("sheet-close");
const shTitle = document.getElementById("sheet-title");
const shMeta = document.getElementById("sheet-meta");
const shPlace = document.getElementById("sheet-place");
const shQuote = document.getElementById("sheet-quote");
const shYoutube = document.getElementById("sheet-youtube");
const shLyrics = document.getElementById("sheet-lyrics");
const shZoom = document.getElementById("sheet-zoom");

const filtersPanel = document.getElementById("filters-panel");
const filtersClose = document.getElementById("filters-close");
const fCommune = document.getElementById("f-commune");
const fStyle = document.getElementById("f-style");
const fYearMin = document.getElementById("f-year-min");
const fYearMax = document.getElementById("f-year-max");

// ⚠️ Le filtre département n’existe plus dans la table `chansons`.
// Si ton HTML a encore un champ f-dept, on le garde mais on le désactive proprement.
const fDept = document.getElementById("f-dept");

const filtersApply = document.getElementById("filters-apply");
const filtersReset = document.getElementById("filters-reset");

const tabExplore = document.getElementById("tab-explore");
const tabLibrary = document.getElementById("tab-library");
const tabAdd = document.getElementById("tab-add");

const addPanel = document.getElementById("add-panel");
const addClose = document.getElementById("add-close");
const addForm = document.getElementById("add-form");
const addStatus = document.getElementById("add-status");
const addCoords = document.getElementById("add-coords");

const aTitle = document.getElementById("a-title");
const aArtist = document.getElementById("a-artist");
const aCity = document.getElementById("a-city");
const aStyle = document.getElementById("a-style");
const aYear = document.getElementById("a-year");
const aYoutube = document.getElementById("a-youtube");
const aLyrics = document.getElementById("a-lyrics");
const aQuote = document.getElementById("a-quote");

// =====================
// 2) STATE
// =====================
let allSongs = [];
let currentResults = [];
let isSearchActive = false;

let map;
let markersLayer;
let selectedCoords = null; // click map for add

let currentSong = null;

// =====================
// 3) HELPERS
// =====================
function safe(v){ return (v ?? "").toString(); }

function normalize(s){
  return safe(s).toLowerCase().trim();
}

function showStatus(msg){
  if (elStatus) elStatus.textContent = msg;
  console.log("[status]", msg);
}

function parseNum(v){
  if (v === null || v === undefined || v === "") return null;
  const n = Number(safe(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function getTitle(song){
  return safe(song.title).trim() || safe(song.full_title).trim() || "Sans titre";
}

function getArtist(song){
  return safe(song.main_artist).trim() || safe(song.artist_names).trim() || "Artiste inconnu";
}

function getPlace(song){
  return safe(song.place).trim() || "Lieu";
}

function getQuote(song){
  // `lyrics` peut être long. On prend un extrait propre.
  const txt = safe(song.lyrics).trim();
  if (!txt) return "";
  return txt.length > 180 ? txt.slice(0, 180) + "…" : txt;
}

function getLyricsUrl(song){
  // lien paroles
  return safe(song.genius_url).trim();
}

function getYoutubeWatchUrl(song){
  const yt = safe(song.youtube_url).trim();
  if (yt) return yt;

  const embed = safe(song.youtube_embed).trim();
  const m = embed.match(/youtube\.com\/embed\/([^?&]+)/);
  if (m?.[1]) return `https://www.youtube.com/watch?v=${m[1]}`;

  // fallback media_urls si dispo
  try{
    const mu = song.media_urls;
    if (mu && typeof mu === "object"){
      const y = mu.youtube || mu.yt || mu.youtube_url;
      if (y) return safe(y).trim();
    }
  }catch(_e){}
  return "";
}

function getTagStyle(style){
  const s = safe(style).trim();
  if (!s) return "";
  const first = s.split(",")[0].trim();
  return first.length > 18 ? first.slice(0, 18) + "…" : first;
}

function parseYear(song){
  // `annee` est en text côté table => on essaie de convertir en nombre
  const y = parseNum(song.annee);
  return y;
}

function setActiveTab(which){
  [tabExplore, tabLibrary, tabAdd].forEach(t => t.classList.remove("active"));
  if (which === "explore") tabExplore.classList.add("active");
  if (which === "library") tabLibrary.classList.add("active");
  if (which === "add") tabAdd.classList.add("active");
}

// =====================
// 4) MAP
// =====================
function initMap(){
  map = L.map("map", { zoomControl: true }).setView([48.8566, 2.3522], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on("click", (e) => {
    selectedCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
    addCoords.textContent = `📍 Coordonnées : ${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`;
  });

  showStatus("Carte prête.");
}

function clearMarkers(){
  markersLayer.clearLayers();
}

function drawMarkers(songs){
  clearMarkers();

  songs.forEach(song => {
    const lat = parseNum(song.latitude);
    const lng = parseNum(song.longitude);
    if (lat === null || lng === null) return;

    const icon = L.divIcon({
      className: "",
      html: `<div class="song-dot"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(markersLayer);

    const titre = getTitle(song);
    const artiste = getArtist(song);
    const lieu = getPlace(song);
    const yt = getYoutubeWatchUrl(song);

    const popupHtml = `
      <div style="min-width:220px;">
        <div style="font-weight:900; margin-bottom:4px;">${titre}</div>
        <div style="opacity:.85; margin-bottom:6px;">${artiste}</div>
        <div style="opacity:.75;">📍 ${lieu}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          ${yt ? `<button data-yt="1" style="cursor:pointer; padding:6px 10px; border-radius:12px; border:1px solid rgba(0,0,0,.12); background: rgba(255,102,196,.18); font-weight:800;">YouTube</button>` : ""}
          <button data-open="1" style="cursor:pointer; padding:6px 10px; border-radius:12px; border:1px solid rgba(0,0,0,.12); background: rgba(159,229,255,.18); font-weight:800;">Voir fiche</button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);

    marker.on("popupopen", (evt) => {
      const el = evt.popup.getElement();
      const bOpen = el?.query_...
