// =====================
// 0) SUPABASE CONFIG
// =====================
const SUPABASE_URL = "https://votckpjacugwoqowjcow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kzB2e_oa8VfzGCYlyELKng_YYV8_zJd";

const TABLE_SONGS = "chansons";

let sb;

// =====================
// 1) DOM HELPERS
// =====================
const $ = (id) => document.getElementById(id);

const elStatus = $("status");
const elTotalSongs = $("total-songs");
const elSearch = $("search-input");
const btnClear = $("clear-search");

const drawer = $("results-drawer");
const elResults = $("results-list");
const elNoResults = $("no-results");
const elResultsCount = $("results-count");

// =====================
// 2) STATE
// =====================
let allSongs = [];
let map;
let markersLayer;

// =====================
// 3) HELPERS
// =====================
const safe = (v) => (v ?? "").toString();
const norm = (s) => safe(s).toLowerCase().trim();

function showStatus(msg){
  elStatus.textContent = msg;
  console.log("[status]", msg);
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

  setTimeout(() => map.invalidateSize(), 300);
}

// =====================
// 5) MARKERS
// =====================
function drawMarkers(songs){
  markersLayer.clearLayers();

  songs.forEach(song => {
    if (song.latitude == null || song.longitude == null) return;

    L.marker([song.latitude, song.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<span style="font-size:22px">🎵</span>`,
        iconSize: [22,22],
        iconAnchor: [11,11]
      })
    }).addTo(markersLayer);
  });
}

// =====================
// 6) RESULTS LIST
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
      <div class="rc-title">${safe(song.title || song.full_title)}</div>
      <div class="rc-meta">${safe(song.main_artist || song.artist_names)} • ${safe(song.place)}</div>
    `;
    elResults.appendChild(div);
  });
}

// =====================
// 7) SEARCH
// =====================
function computeResults(){
  const q = norm(elSearch.value);

  if (!q){
    drawer.classList.add("hidden");
    drawMarkers(allSongs);
    showStatus(`✅ ${allSongs.length} chanson(s)`);
    return;
  }

  const list = allSongs.filter(song =>
    [
      song.title,
      song.full_title,
      song.main_artist,
      song.artist_names,
      song.place,
      song.style,
      song.language
    ].map(norm).join(" ").includes(q)
  );

  renderResults(list);
  drawer.classList.remove("hidden");
  drawMarkers(list);
  showStatus(`🔎 ${list.length} résultat(s)`);
}

elSearch.addEventListener("input", computeResults);
btnClear.addEventListener("click", () => {
  elSearch.value = "";
  computeResults();
});

// =====================
// 8) LOAD SONGS (PAGINATION)
// =====================
async function loadSongs(){
  showStatus("Chargement des chansons…");

  let all = [];
  let from = 0;
  const step = 1000;

  while (true){
    const { data, error } = await sb
      .from(TABLE_SONGS)
      .select(`
        id,
        title,
        full_title,
        main_artist,
        artist_names,
        style,
        language,
        place,
        latitude,
        longitude
      `)
      .order("id", { ascending: true })
      .range(from, from + step - 1);

    if (error){
      console.error(error);
      showStatus("❌ Erreur Supabase");
      return;
    }

    if (!data || data.length === 0) break;

    all = all.concat(data);
    from += step;
  }

  allSongs = all;
  elTotalSongs.textContent = allSongs.length;

  drawMarkers(allSongs);
  showStatus(`✅ ${allSongs.length} chanson(s) chargée(s)`);
}

// =====================
// 9) INIT (SAFE)
// =====================
async function init(){
  try {
    if (!window.supabase || !window.supabase.createClient){
      showStatus("❌ Supabase non chargé");
      return;
    }

    sb = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    initMap();
    await loadSongs();

  } catch (e){
    console.error(e);
    showStatus("❌ Erreur JS");
  }
}

init();
