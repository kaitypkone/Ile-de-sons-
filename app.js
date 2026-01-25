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
  language,
  annee,
  place,
  lyrics,
  genius_url,
  youtube_url,
  youtube_embed,
  latitude,
  longitude,
  decennie
`;

let sb;

// =====================
// 1) DOM HELPERS
// =====================
const $ = (id) => document.getElementById(id);

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
const fArtist = $("f-dept");
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
let map;
let markersLayer;
let selectedCoords = null;
let currentSong = null;

// =====================
// 3) HELPERS
// =====================
const safe = (v) => (v ?? "").toString();
const norm = (s) => safe(s).toLowerCase().trim();

const titleOf = (s) => safe(s.title) || safe(s.full_title) || "Sans titre";
const artistOf = (s) => safe(s.main_artist) || safe(s.artist_names) || "Artiste inconnu";
const placeOf = (s) => safe(s.place) || "Lieu";

function ytOf(song){
  const yt = safe(song.youtube_url).trim();
  if (yt) return yt;

  const embed = safe(song.youtube_embed).trim();
  const m = embed.match(/embed\/([^?&]+)/);
  return m?.[1] ? `https://www.youtube.com/watch?v=${m[1]}` : "";
}

function showStatus(msg){
  elStatus.textContent = msg;
  console.log("[status]", msg);
}

function numYear(song){
  const y = Number(song.annee);
  return Number.isFinite(y) ? y : null;
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

  map.on("click", (e) => {
    selectedCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
    addCoords.textContent = `📍 ${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`;
  });

  setTimeout(() => map.invalidateSize(), 300);
}

// =====================
// 5) MARKERS
// =====================
function drawMarkers(songs){
  markersLayer.clearLayers();

  songs.forEach(song => {
    if (song.latitude == null || song.longitude == null) return;

    const marker = L.marker([song.latitude, song.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<span style="font-size:22px">🎵</span>`,
        iconSize: [22,22],
        iconAnchor: [11,11]
      })
    }).addTo(markersLayer);

    marker.on("click", () => openSongSheet(song));
  });
}

function zoomToSong(song){
  if (song.latitude == null || song.longitude == null) return;
  map.setView([song.latitude, song.longitude], 13);
}

// =====================
// 6) SONG SHEET
// =====================
function openSongSheet(song){
  currentSong = song;

  shTitle.textContent = titleOf(song);
  shMeta.textContent = `${artistOf(song)}${song.annee ? " • " + song.annee : ""}`;
  shPlace.textContent = `📍 ${placeOf(song)}`;

  const txt = safe(song.lyrics).trim();
  shQuote.style.display = txt ? "block" : "none";
  shQuote.textContent = txt ? `“${txt.slice(0,180)}${txt.length > 180 ? "…" : ""}”` : "";

  shYoutube.disabled = !ytOf(song);

  if (song.genius_url){
    shLyrics.href = song.genius_url;
    shLyrics.style.display = "inline-flex";
  } else {
    shLyrics.style.display = "none";
  }

  sheet.classList.remove("hidden");
}

sheetClose.onclick = () => sheet.classList.add("hidden");

shYoutube.onclick = () => {
  const url = ytOf(currentSong);
  if (url) window.open(url, "_blank");
};

shZoom.onclick = () => {
  zoomToSong(currentSong);
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
// 8) SEARCH + FILTERS
// =====================
function computeResults(){
  const q = norm(elSearch.value);
  let list = allSongs;

  if (q){
    list = list.filter(s =>
      [
        s.title,
        s.full_title,
        s.main_artist,
        s.artist_names,
        s.place,
        s.style,
        s.language
      ].map(norm).join(" ").includes(q)
    );
  }

  renderResults(list);
  drawMarkers(list);
  drawer.classList.remove("hidden");
  showStatus(`${list.length} résultat(s)`);
}

// =====================
// 9) LOAD SONGS (FIX FINAL)
// =====================
async function loadSongs(){
  let all = [];
  let from = 0;
  const step = 1000;

  while (true){
    const { data, error } = await sb
      .from(TABLE_SONGS)
      .select(COLS)
      .order("id", { ascending: true })
      .range(from, from + step - 1);

    if (error) {
      showStatus("Erreur Supabase");
      console.error(error);
      return;
    }

    if (!data.length) break;

    all = all.concat(data);
    from += step;
  }

  allSongs = all;
  elTotalSongs.textContent = allSongs.length;

  drawMarkers(allSongs);
  showStatus(`✅ ${allSongs.length} chansons chargées`);
}

// =====================
// 10) INIT
// =====================
async function init(){
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initMap();
  await loadSongs();
}

init();

