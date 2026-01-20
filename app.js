// =====================
// 0) SUPABASE CONFIG
// =====================
const SUPABASE_URL = "https://votckpjacugwoqowjcow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kzB2e_oa8VfzGCYlyELKng_YYV8_zJd";

const TABLE_SONGS = "chansons";
const TABLE_SUGGEST = "suggestions";

const COLS = `
  id,
  title,
  full_title,
  main_artist,
  artist_names,
  style,
  annee,
  place,
  lyrics,
  genius_url,
  youtube_url,
  youtube_embed,
  longitude,
  latitude,
  decennie
`;

let sb;

// =====================
// 1) DOM
// =====================
const $ = id => document.getElementById(id);

const elStatus = $("status");
const elTotalSongs = $("total-songs");

const elSearch = $("search-input");
const btnClear = $("clear-search");
const btnFilters = $("btn-filters");
const btnLocate = $("btn-locate");
const btnRefresh = $("btn-refresh");

const drawer = $("results-drawer");
const drawerClose = $("drawer-close");
const elResults = $("results-list");
const elNoResults = $("no-results");
const elResultsCount = $("results-count");

const sheet = $("song-sheet");
const sheetClose = $("sheet-close");
const shTitle = $("sheet-title");
const shMeta = $("sheet-meta");
const shPlace = $("sheet-place");
const shQuote = $("sheet-quote");
const shYoutube = $("sheet-youtube");
const shLyrics = $("sheet-lyrics");
const shZoom = $("sheet-zoom");

const filtersPanel = $("filters-panel");
const filtersClose = $("filters-close");
const fCommune = $("f-commune");
const fStyle = $("f-style");
const fYearMin = $("f-year-min");
const fYearMax = $("f-year-max");

const filtersApply = $("filters-apply");
const filtersReset = $("filters-reset");

const tabExplore = $("tab-explore");
const tabLibrary = $("tab-library");
const tabAdd = $("tab-add");

const addPanel = $("add-panel");
const addClose = $("add-close");
const addForm = $("add-form");
const addStatus = $("add-status");
const addCoords = $("add-coords");

const aTitle = $("a-title");
const aArtist = $("a-artist");
const aCity = $("a-city");
const aStyle = $("a-style");
const aYear = $("a-year");
const aYoutube = $("a-youtube");
const aLyrics = $("a-lyrics");
const aQuote = $("a-quote");

// =====================
// 2) STATE
// =====================
let allSongs = [];
let currentResults = [];
let map;
let markersLayer;
let selectedCoords = null;
let currentSong = null;

// =====================
// 3) HELPERS
// =====================
const safe = v => (v ?? "").toString();
const norm = s => safe(s).toLowerCase().trim();

const titleOf = s => safe(s.title) || safe(s.full_title) || "Sans titre";
const artistOf = s => safe(s.main_artist) || safe(s.artist_names) || "Artiste inconnu";
const placeOf = s => safe(s.place) || "Lieu";

function ytOf(song){
  if (song.youtube_url) return song.youtube_url;
  if (song.youtube_embed){
    const m = song.youtube_embed.match(/embed\/([^?&]+)/);
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return "";
}

function showStatus(msg){
  elStatus.textContent = msg;
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
    selectedCoords = e.latlng;
    addCoords.textContent =
      `📍 ${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`;
  });

  setTimeout(() => map.invalidateSize(), 300);
}

// =====================
// 5) MARKERS (🎵 ROSE, PAS DE PUNAISE BLEUE)
// =====================
function drawMarkers(songs){
  markersLayer.clearLayers();

  songs.forEach(song => {
    if (!song.latitude || !song.longitude) return;

    const icon = L.divIcon({
      className: "",
      html: `<div class="song-dot">🎵</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const marker = L.marker([song.latitude, song.longitude], { icon })
      .addTo(markersLayer);

    marker.on("click", () => openSongSheet(song));
  });
}

// =====================
// 6) SONG SHEET
// =====================
function openSongSheet(song){
  currentSong = song;

  shTitle.textContent = titleOf(song);
  shMeta.textContent =
    `${artistOf(song)}${song.annee ? " • " + song.annee : ""}`;
  shPlace.textContent = `📍 ${placeOf(song)}`;

  const q = safe(song.lyrics);
  shQuote.textContent = q ? `“${q.slice(0,180)}${q.length>180?"…":""}”` : "";
  shQuote.style.display = q ? "block" : "none";

  shLyrics.href = song.genius_url || "#";
  shLyrics.style.display = song.genius_url ? "inline-flex" : "none";

  shYoutube.disabled = !ytOf(song);

  sheet.classList.remove("hidden");
}

sheetClose.onclick = () => sheet.classList.add("hidden");

shYoutube.onclick = () => {
  if (currentSong){
    const y = ytOf(currentSong);
    if (y) window.open(y, "_blank");
  }
};

shZoom.onclick = () => {
  if (!currentSong) return;
  map.setView([currentSong.latitude, currentSong.longitude], 13);
  sheet.classList.add("hidden");
};

// =====================
// 7) RESULTS
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
    const div = document.createElement("div");
    div.className = "result-card";
    div.innerHTML = `
      <div class="rc-title">${titleOf(song)}</div>
      <div class="rc-meta">${artistOf(song)} • ${placeOf(song)}</div>
      <div class="rc-actions">
        <button class="btn soft">Voir</button>
      </div>
    `;
    div.querySelector("button").onclick = () => openSongSheet(song);
    elResults.appendChild(div);
  });
}

// =====================
// 8) FILTERS / SEARCH
// =====================
function computeResults(){
  const q = norm(elSearch.value);
  const c = norm(fCommune.value);
  const s = norm(fStyle.value);
  const ymin = Number(fYearMin.value || "");
  const ymax = Number(fYearMax.value || "");

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
    ].map(norm).join(" ");

    if (q && !hay.includes(q)) return false;
    if (c && !norm(song.place).includes(c)) return false;
    if (s && !norm(song.style).includes(s)) return false;

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
// 9) LOAD
// =====================
async function loadSongs(){
  const { data, error } = await sb
    .from(TABLE_SONGS)
    .select(COLS)
    .order("id", { ascending: true })
    .limit(1000);

  if (error){
    showStatus("Erreur Supabase");
    console.error(error);
    return;
  }

  allSongs = data || [];
  elTotalSongs.textContent = allSongs.length;
  fillFilterOptions(allSongs);
  drawMarkers(allSongs);
  showStatus("Prêt.");
}

// =====================
// 10) FILTER OPTIONS
// =====================
function fillFilterOptions(songs){
  const communes = new Set();
  const styles = new Set();

  songs.forEach(s => {
    if (s.place) communes.add(s.place);
    if (s.style) styles.add(s.style.split(",")[0].trim());
  });

  fCommune.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
  fStyle.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());

  [...communes].sort().forEach(v => {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    fCommune.appendChild(o);
  });

  [...styles].sort().forEach(v => {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    fStyle.appendChild(o);
  });
}

// =====================
// 11) EVENTS (TOUT ACTIF)
// =====================
elSearch.oninput = computeResults;
btnClear.onclick = () => { elSearch.value=""; drawer.classList.add("hidden"); drawMarkers(allSongs); };

btnFilters.onclick = () => filtersPanel.classList.toggle("hidden");
filtersClose.onclick = () => filtersPanel.classList.add("hidden");
filtersApply.onclick = () => { filtersPanel.classList.add("hidden"); computeResults(); };
filtersReset.onclick = () => {
  fCommune.value = "";
  fStyle.value = "";
  fYearMin.value = "";
  fYearMax.value = "";
  drawer.classList.add("hidden");
  drawMarkers(allSongs);
};

drawerClose.onclick = () => drawer.classList.add("hidden");

btnLocate.onclick = () => {
  navigator.geolocation?.getCurrentPosition(p => {
    map.setView([p.coords.latitude, p.coords.longitude], 13);
  });
};

btnRefresh.onclick = loadSongs;

tabExplore.onclick = () => {
  setActiveTab("explore");
  addPanel.classList.add("hidden");
};

tabLibrary.onclick = () => {
  setActiveTab("library");
  currentResults = allSongs.slice();
  renderResults(currentResults);
  drawer.classList.remove("hidden");
};

tabAdd.onclick = () => {
  setActiveTab("add");
  drawer.classList.add("hidden");
  addPanel.classList.remove("hidden");
};

addClose.onclick = () => {
  addPanel.classList.add("hidden");
  setActiveTab("explore");
};

// =====================
// 12) ADD FORM
// =====================
addForm.onsubmit = async e => {
  e.preventDefault();

  const payload = {
    titre: aTitle.value.trim(),
    artiste: aArtist.value.trim(),
    lieu_principal: aCity.value.trim(),
    style: aStyle.value.trim() || null,
    annee: aYear.value || null,
    lien_youtube: aYoutube.value.trim() || null,
    lien: aLyrics.value.trim() || null,
    extrait_paroles: aQuote.value.trim() || null,
    latitude: selectedCoords?.lat || null,
    longitude: selectedCoords?.lng || null,
    status: "pending"
  };

  if (!payload.titre || !payload.artiste || !payload.lieu_principal){
    addStatus.textContent = "⚠️ Champs obligatoires manquants";
    return;
  }

  addStatus.textContent = "Envoi...";
  await sb.from(TABLE_SUGGEST).insert(payload);
  addStatus.textContent = "✅ Envoyé";

  addForm.reset();
  selectedCoords = null;
  addCoords.textContent = "📍 Coordonnées : —";
};

// =====================
// 13) INIT
// =====================
async function init(){
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initMap();
  await loadSongs();
}

init();
