// =====================
// 0) SUPABASE CONFIG
// =====================
const SUPABASE_URL = "https://votckpjacugwoqowjcow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kzB2e_oa8VfzGCYlyELKng_YYV8_zJd";

const TABLE_SONGS = "chansons";
const TABLE_SUGGEST = "suggestions";

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
let selectedCoords = null;
let currentSong = null;

// =====================
// 3) HELPERS
// =====================
function safe(v){ return (v ?? "").toString(); }
function normalize(s){ return safe(s).toLowerCase().trim(); }

function parseNum(v){
  if (!v) return null;
  const n = Number(safe(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function showStatus(msg){
  elStatus.textContent = msg;
  console.log(msg);
}

function getTitle(song){
  return safe(song.title) || safe(song.full_title) || "Sans titre";
}

function getArtist(song){
  return safe(song.main_artist) || safe(song.artist_names) || "Artiste inconnu";
}

function getPlace(song){
  return safe(song.place) || "Lieu";
}

function getQuote(song){
  const t = safe(song.lyrics);
  return t.length > 180 ? t.slice(0,180) + "…" : t;
}

function getYoutubeWatchUrl(song){
  if (song.youtube_url) return song.youtube_url;
  if (song.youtube_embed){
    const m = song.youtube_embed.match(/embed\/([^?&]+)/);
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return "";
}

function getTagStyle(style){
  if (!style) return "";
  const first = style.split(",")[0].trim();
  return first.length > 18 ? first.slice(0,18) + "…" : first;
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
  map = L.map("map").setView([48.8566, 2.3522], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on("click", e => {
    selectedCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
    addCoords.textContent = `📍 ${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`;
  });
}

function drawMarkers(songs){
  markersLayer.clearLayers();

  songs.forEach(song => {
    const lat = parseNum(song.latitude);
    const lng = parseNum(song.longitude);
    if (lat === null || lng === null) return;

    const marker = L.marker([lat,lng]).addTo(markersLayer);
    const yt = getYoutubeWatchUrl(song);

    marker.bindPopup(`
      <b>${getTitle(song)}</b><br>
      ${getArtist(song)}<br>
      📍 ${getPlace(song)}<br><br>
      ${yt ? `<button onclick="window.open('${yt}','_blank')">YouTube</button>` : ""}
    `);

    marker.on("click", () => openSongSheet(song));
  });
}

// =====================
// 5) SONG SHEET
// =====================
function openSongSheet(song){
  currentSong = song;

  shTitle.textContent = getTitle(song);
  shMeta.textContent = `${getArtist(song)}${song.annee ? " • " + song.annee : ""}`;
  shPlace.textContent = `📍 ${getPlace(song)}`;

  const q = getQuote(song);
  shQuote.textContent = q ? `“${q}”` : "";
  shQuote.style.display = q ? "block" : "none";

  const yt = getYoutubeWatchUrl(song);
  shYoutube.disabled = !yt;

  shLyrics.href = song.genius_url || "#";
  shLyrics.style.display = song.genius_url ? "inline-flex" : "none";

  sheet.classList.remove("hidden");
}

sheetClose.onclick = () => sheet.classList.add("hidden");
shYoutube.onclick = () => {
  if (currentSong){
    const yt = getYoutubeWatchUrl(currentSong);
    if (yt) window.open(yt, "_blank");
  }
};

shZoom.onclick = () => {
  if (!currentSong) return;
  map.setView([currentSong.latitude, currentSong.longitude], 13);
  sheet.classList.add("hidden");
};

// =====================
// 6) RESULTS
// =====================
function renderResults(list){
  elResults.innerHTML = "";
  elResultsCount.textContent = list.length;

  if (!list.length){
    elNoResults.classList.remove("hidden");
    return;
  }
  elNoResults.classList.add("hidden");

  list.forEach(song => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="rc-title">${getTitle(song)}</div>
      <div class="rc-meta">${getArtist(song)}${song.annee ? " • " + song.annee : ""} • ${getPlace(song)}</div>
      <div class="rc-tags">${getTagStyle(song.style)}</div>
      <div class="rc-actions">
        ${getYoutubeWatchUrl(song) ? `<button onclick="window.open('${getYoutubeWatchUrl(song)}','_blank')">YouTube</button>` : ""}
        ${song.genius_url ? `<a href="${song.genius_url}" target="_blank">Paroles</a>` : ""}
        <button onclick="openSongSheet(${JSON.stringify(song).replace(/"/g,'&quot;')})">Voir</button>
      </div>
    `;
    elResults.appendChild(card);
  });
}

// =====================
// 7) SEARCH / FILTERS
// =====================
function computeResults(){
  const q = normalize(elSearch.value);
  const c = normalize(fCommune.value);
  const s = normalize(fStyle.value);
  const ymin = Number(fYearMin.value || "");
  const ymax = Number(fYearMax.value || "");

  if (!q && !c && !s && !Number.isFinite(ymin) && !Number.isFinite(ymax)){
    currentResults = [];
    drawer.classList.add("hidden");
    drawMarkers(allSongs);
    return;
  }

  let list = allSongs.filter(song => {
    const hay = [
      song.title,
      song.full_title,
      song.main_artist,
      song.artist_names,
      song.place,
      song.style,
      song.lyrics,
      song.decennie
    ].map(normalize).join(" ");

    if (q && !hay.includes(q)) return false;
    if (c && !normalize(song.place).includes(c)) return false;
    if (s && !normalize(song.style).includes(s)) return false;

    const y = Number(song.annee);
    if (Number.isFinite(ymin) && y < ymin) return false;
    if (Number.isFinite(ymax) && y > ymax) return false;

    return true;
  });

  currentResults = list;
  renderResults(list);
  drawer.classList.remove("hidden");
  drawMarkers(list);
}

// =====================
// 8) LOAD
// =====================
async function loadSongs(){
  const { data, error } = await sb
    .from(TABLE_SONGS)
    .select(COLS)
    .order("id", { ascending: true })
    .limit(1000);

  if (error){
    showStatus(error.message);
    return;
  }

  allSongs = data || [];
  elTotalSongs.textContent = allSongs.length;
  drawMarkers(allSongs);
  showStatus(`✅ ${allSongs.length} chanson(s) chargée(s)`);
}

// =====================
// 9) INIT
// =====================
async function init(){
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initMap();
  setActiveTab("explore");
  await loadSongs();
}

init();
