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
  spotify_url,
  soundcloud_url,
  longitude,
  latitude,
  decennie,
  language,
  echelle,
  sous_type
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
const safe = v => (v ?? "").toString();
const normalize = s => safe(s).toLowerCase().trim();

function parseNum(v){
  if (!v) return null;
  const n = Number(safe(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function showStatus(msg){
  elStatus.textContent = msg;
}

const getTitle = s => safe(s.title) || safe(s.full_title) || "Sans titre";
const getArtist = s => safe(s.main_artist) || safe(s.artist_names) || "Artiste inconnu";
const getPlace = s => safe(s.place) || "Lieu";

function getQuote(song){
  const t = safe(song.lyrics);
  return t && t.length > 180 ? t.slice(0,180) + "…" : t;
}

function getYoutube(song){
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
  map = L.map("map", { zoomControl: true }).setView([48.8566, 2.3522], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on("click", e => {
    selectedCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
    addCoords.textContent =
      `📍 Coordonnées : ${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`;
  });

  // 🔴 FIX CRITIQUE
  setTimeout(() => map.invalidateSize(), 200);
}

// =====================
// 5) MARKERS
// =====================
function drawMarkers(songs){
  markersLayer.clearLayers();

  songs.forEach(song => {
    const lat = parseNum(song.latitude);
    const lng = parseNum(song.longitude);
    if (lat === null || lng === null) return;

    const icon = L.divIcon({
      className: "",
      html: `<div class="song-dot"></div>`,
      iconSize: [18,18],
      iconAnchor: [9,9]
    });

    const marker = L.marker([lat,lng], { icon }).addTo(markersLayer);

    const yt = getYoutube(song);

    marker.bindPopup(`
      <strong>${getTitle(song)}</strong><br>
      ${getArtist(song)}<br>
      📍 ${getPlace(song)}<br><br>
      ${yt ? `<button onclick="window.open('${yt}','_blank')">YouTube</button>` : ""}
    `);

    marker.on("click", () => openSongSheet(song));
  });
}

// =====================
// 6) SONG SHEET
// =====================
function openSongSheet(song){
  currentSong = song;

  shTitle.textContent = getTitle(song);
  shMeta.textContent = `${getArtist(song)}${song.annee ? " • " + song.annee : ""}`;
  shPlace.textContent = `📍 ${getPlace(song)}`;

  const q = getQuote(song);
  shQuote.textContent = q ? `“${q}”` : "";
  shQuote.style.display = q ? "block" : "none";

  shLyrics.href = song.genius_url || "#";
  shLyrics.style.display = song.genius_url ? "inline-flex" : "none";

  shYoutube.disabled = !getYoutube(song);

  sheet.classList.remove("hidden");
}

sheetClose.onclick = () => sheet.classList.add("hidden");

shYoutube.onclick = () => {
  const yt = currentSong ? getYoutube(currentSong) : "";
  if (yt) window.open(yt, "_blank");
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
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="rc-title">${getTitle(song)}</div>
      <div class="rc-meta">
        ${getArtist(song)}${song.annee ? " • " + song.annee : ""} • ${getPlace(song)}
      </div>
      <div class="rc-tags">
        ${getTagStyle(song.style) ? `<span class="tag">${getTagStyle(song.style)}</span>` : ""}
      </div>
      <div class="rc-actions">
        ${getYoutube(song) ? `<button class="btn primary" data-yt>YouTube</button>` : ""}
        ${song.genius_url ? `<a class="btn soft" href="${song.genius_url}" target="_blank">Paroles</a>` : ""}
        <button class="btn soft" data-open>Voir</button>
      </div>
    `;

    card.querySelector("[data-open]").onclick = () => openSongSheet(song);
    const ytBtn = card.querySelector("[data-yt]");
    if (ytBtn) ytBtn.onclick = () => window.open(getYoutube(song), "_blank");

    elResults.appendChild(card);
  });
}

// =====================
// 8) SEARCH / FILTERS
// =====================
function computeResults(){
  const q = normalize(elSearch.value);
  const c = normalize(fCommune.value);
  const s = normalize(fStyle.value);
  const ymin = Number(fYearMin.value || "");
  const ymax = Number(fYearMax.value || "");

  const hasFilters = q || c || s || Number.isFinite(ymin) || Number.isFinite(ymax);

  if (!hasFilters){
    currentResults = [];
    drawer.classList.add("hidden");
    drawMarkers(allSongs);
    return;
  }

  const list = allSongs.filter(song => {
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
  showStatus(`✅ ${allSongs.length} chanson(s) chargée(s)`);
}

// =====================
// 10) FILTER OPTIONS
// =====================
function fillFilterOptions(songs){
  const communes = new Set();
  const styles = new Set();

  songs.forEach(s => {
    if (s.place) communes.add(s.place);
    if (s.style){
      const first = s.style.split(",")[0].trim();
      if (first) styles.add(first);
    }
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
// 11) EVENTS
// =====================
elSearch.oninput = computeResults;
btnClear.onclick = () => { elSearch.value = ""; computeResults(); };

btnFilters.onclick = () => filtersPanel.classList.toggle("hidden");
filtersClose.onclick = () => filtersPanel.classList.add("hidden");
filtersApply.onclick = () => { filtersPanel.classList.add("hidden"); computeResults(); };
filtersReset.onclick = () => {
  fCommune.value = "";
  fStyle.value = "";
  fYearMin.value = "";
  fYearMax.value = "";
  computeResults();
};

drawerClose.onclick = () => drawer.classList.add("hidden");

btnRefresh.onclick = async () => {
  showStatus("Actualisation...");
  await loadSongs();
};

btnLocate.onclick = () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p => {
    map.setView([p.coords.latitude, p.coords.longitude], 13);
  });
};

tabExplore.onclick = () => {
  setActiveTab("explore");
  addPanel.classList.add("hidden");
};

tabLibrary.onclick = () => {
  setActiveTab("library");
  currentResults = allSongs.slice();
  renderResults(currentResults);
  drawer.classList.remove("hidden");
  drawMarkers(allSongs);
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
    addStatus.textContent = "⚠️ Champs obligatoires manquants.";
    return;
  }

  addStatus.textContent = "Envoi...";
  const { error } = await sb.from(TABLE_SUGGEST).insert(payload);

  if (error){
    addStatus.textContent = "❌ Erreur.";
    console.error(error);
    return;
  }

  addStatus.textContent = "✅ Envoyé";
  addForm.reset();
  selectedCoords = null;
  addCoords.textContent = "📍 Coordonnées : —";
};

// =====================
// 12) INIT
// =====================
async function init(){
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initMap();
  setActiveTab("explore");
  await loadSongs();
}

init();
