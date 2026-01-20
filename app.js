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
// 1) DOM
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

const fCommune = $("f-commune");  // commune
const fStyle = $("f-style");      // style
const fArtist = $("f-dept");      // on RÉUTILISE "département" comme ARTISTE (visuellement ça reste écrit Département dans ton HTML)

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
const langOf = (s) => safe(s.language);

function ytOf(song){
  const yt = safe(song.youtube_url).trim();
  if (yt) return yt;

  const embed = safe(song.youtube_embed).trim();
  if (embed){
    const m = embed.match(/embed\/([^?&]+)/);
    if (m?.[1]) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return "";
}

function showStatus(msg){
  if (elStatus) elStatus.textContent = msg;
  console.log("[status]", msg);
}

function numYear(song){
  const y = Number(safe(song.annee));
  return Number.isFinite(y) ? y : null;
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
    if (addCoords){
      addCoords.textContent = `📍 Coordonnées : ${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`;
    }
  });

  // important pour layout overlay
  setTimeout(() => map.invalidateSize(), 300);

  showStatus("Carte prête.");
}

// =====================
// 5) MARKERS (🎵 SEUL, SANS POINT)
// =====================
function drawMarkers(songs){
  markersLayer.clearLayers();

  songs.forEach((song) => {
    const lat = song.latitude;
    const lng = song.longitude;
    if (lat === null || lat === undefined || lng === null || lng === undefined) return;

    // ✅ AUCUNE classe .song-dot => ton CSS ne peut rien dessiner derrière
    const icon = L.divIcon({
      className: "",
      html: `
        <span style="
          display:inline-block;
          font-size:22px;
          line-height:22px;
          transform: translate(-50%, -50%);
          color: var(--pink);
          user-select:none;
        ">🎵</span>
      `,
      iconSize: [22,22],
      iconAnchor: [11,11]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(markersLayer);

    marker.on("click", () => openSongSheet(song));
  });
}

function zoomToSong(song){
  const lat = song.latitude;
  const lng = song.longitude;
  if (lat === null || lat === undefined || lng === null || lng === undefined) return;
  map.setView([lat, lng], 13);
}

// =====================
// 6) SONG SHEET
// =====================
function openSongSheet(song){
  currentSong = song;

  shTitle.textContent = titleOf(song);
  shMeta.textContent = `${artistOf(song)}${song.annee ? ` • ${song.annee}` : ""}`;
  shPlace.textContent = `📍 ${placeOf(song)}`;

  const txt = safe(song.lyrics).trim();
  if (txt){
    const q = txt.length > 180 ? txt.slice(0,180) + "…" : txt;
    shQuote.textContent = `“${q}”`;
    shQuote.style.display = "block";
  }else{
    shQuote.style.display = "none";
  }

  const yt = ytOf(song);
  shYoutube.disabled = !yt;

  const link = safe(song.genius_url).trim();
  if (link){
    shLyrics.href = link;
    shLyrics.style.display = "inline-flex";
  }else{
    shLyrics.style.display = "none";
  }

  sheet.classList.remove("hidden");
}

function closeSongSheet(){
  sheet.classList.add("hidden");
  currentSong = null;
}

sheetClose.addEventListener("click", closeSongSheet);

shYoutube.addEventListener("click", () => {
  const url = currentSong ? ytOf(currentSong) : "";
  if (url) window.open(url, "_blank", "noopener");
});

shZoom.addEventListener("click", () => {
  if (!currentSong) return;
  zoomToSong(currentSong);
  closeSongSheet();
});

// =====================
// 7) RESULTS DRAWER
// =====================
function openDrawer(){
  drawer.classList.remove("hidden");
}
function closeDrawer(){
  drawer.classList.add("hidden");
}
drawerClose.addEventListener("click", closeDrawer);

function renderResults(list){
  elResults.innerHTML = "";
  elResultsCount.textContent = String(list.length);

  if (!list.length){
    elNoResults.classList.remove("hidden");
    return;
  }
  elNoResults.classList.add("hidden");

  list.forEach(song => {
    const titre = titleOf(song);
    const artiste = artistOf(song);
    const lieu = placeOf(song);
    const yt = ytOf(song);
    const lyrics = safe(song.genius_url).trim();

    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="rc-title">${titre}</div>
      <div class="rc-meta">${artiste}${song.annee ? ` • ${song.annee}` : ""}${lieu ? ` • ${lieu}` : ""}${song.language ? ` • ${song.language}` : ""}</div>

      <div class="rc-actions">
        ${yt ? `<button class="btn primary" data-yt="1">YouTube</button>` : ""}
        ${lyrics ? `<a class="btn soft" href="${lyrics}" target="_blank" rel="noopener">Paroles</a>` : ""}
        <button class="btn soft" data-open="1">Voir</button>
        <button class="btn soft" data-zoom="1">Carte</button>
      </div>
    `;

    card.querySelector('[data-open="1"]').addEventListener("click", () => openSongSheet(song));
    card.querySelector('[data-zoom="1"]').addEventListener("click", () => zoomToSong(song));

    const ytBtn = card.querySelector('[data-yt="1"]');
    if (ytBtn) ytBtn.addEventListener("click", () => window.open(yt, "_blank", "noopener"));

    elResults.appendChild(card);
  });
}

// =====================
// 8) SEARCH + FILTERS (commune + style + annees + langue + artiste)
// =====================
function computeResults(){
  const q = norm(elSearch.value);
  const c = norm(fCommune.value);
  const st = norm(fStyle.value);
  const art = norm(fArtist.value);
  const ymin = Number(fYearMin.value || "");
  const ymax = Number(fYearMax.value || "");

  const hasFilters =
    !!q || !!c || !!st || !!art || Number.isFinite(ymin) || Number.isFinite(ymax);

  if (!hasFilters){
    currentSong = null;
    closeDrawer();
    drawMarkers(allSongs);
    showStatus(`✅ ${allSongs.length} chanson(s)`);
    return;
  }

  let list = allSongs.slice();

  if (q){
    list = list.filter(song => {
      const hay = [
        song.title,
        song.full_title,
        song.main_artist,
        song.artist_names,
        song.place,
        song.style,
        song.language,
        song.lyrics,
        song.decennie
      ].map(norm).join(" | ");
      return hay.includes(q);
    });
  }

  if (c){
    list = list.filter(song => norm(song.place).includes(c));
  }

  if (st){
    list = list.filter(song => norm(song.style).includes(st));
  }

  if (art){
    list = list.filter(song => norm(artistOf(song)).includes(art));
  }

  if (Number.isFinite(ymin)){
    list = list.filter(song => {
      const y = numYear(song);
      return y !== null && y >= ymin;
    });
  }

  if (Number.isFinite(ymax)){
    list = list.filter(song => {
      const y = numYear(song);
      return y !== null && y <= ymax;
    });
  }

  renderResults(list);
  openDrawer();
  drawMarkers(list);
  showStatus(`✅ ${list.length} résultat(s)`);
}

// =====================
// 9) FILTER OPTIONS
// =====================
function fillFilterOptions(songs){
  const communes = new Set();
  const styles = new Set();
  const artists = new Set();

  songs.forEach(s => {
    const c = safe(s.place).trim();
    if (c) communes.add(c);

    const st = safe(s.style).trim();
    if (st) styles.add(st.split(",")[0].trim());

    const ar = artistOf(s).trim();
    if (ar) artists.add(ar);
  });

  const sortFR = (a,b) => a.localeCompare(b, "fr", { sensitivity:"base" });

  // reset lists
  fCommune.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
  fStyle.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
  fArtist.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());

  [...communes].sort(sortFR).forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    fCommune.appendChild(opt);
  });

  [...styles].sort(sortFR).forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    fStyle.appendChild(opt);
  });

  // ✅ f-dept devient ARTISTE (liste)
  [...artists].sort(sortFR).forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    fArtist.appendChild(opt);
  });

  // ⚠️ On ne peut pas ajouter un select “Langue” sans modifier le HTML.
  // La langue est déjà filtrable via la barre de recherche (q).
}

// =====================
// 10) TOP BUTTONS
// =====================
btnRefresh.addEventListener("click", async () => {
  showStatus("Actualisation...");
  await loadSongs();
  computeResults();
});

btnLocate.addEventListener("click", () => {
  if (!navigator.geolocation){
    alert("Géolocalisation non disponible.");
    return;
  }
  btnLocate.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btnLocate.disabled = false;
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
    },
    () => {
      btnLocate.disabled = false;
      alert("Impossible d'obtenir ta position.");
    }
  );
});

// =====================
// 11) FILTER UI
// =====================
btnFilters.addEventListener("click", () => {
  filtersPanel.classList.toggle("hidden");
});

filtersClose.addEventListener("click", () => {
  filtersPanel.classList.add("hidden");
});

filtersApply.addEventListener("click", () => {
  filtersPanel.classList.add("hidden");
  computeResults();
});

filtersReset.addEventListener("click", () => {
  fCommune.value = "";
  fStyle.value = "";
  fArtist.value = "";
  fYearMin.value = "";
  fYearMax.value = "";
  filtersPanel.classList.add("hidden");
  computeResults();
});

btnClear.addEventListener("click", () => {
  elSearch.value = "";
  computeResults();
});

elSearch.addEventListener("input", computeResults);

// =====================
// 12) TABS
// =====================
function setActiveTab(which){
  [tabExplore, tabLibrary, tabAdd].forEach(t => t.classList.remove("active"));
  if (which === "explore") tabExplore.classList.add("active");
  if (which === "library") tabLibrary.classList.add("active");
  if (which === "add") tabAdd.classList.add("active");
}

tabExplore.addEventListener("click", () => {
  setActiveTab("explore");
  addPanel.classList.add("hidden");
  // Explorer: si filtres actifs -> drawer visible, sinon caché
  // on ne force rien ici
});

tabLibrary.addEventListener("click", () => {
  setActiveTab("library");
  addPanel.classList.add("hidden");
  renderResults(allSongs);
  openDrawer();
  drawMarkers(allSongs);
  showStatus(`Bibliothèque : ${allSongs.length} chanson(s)`);
});

tabAdd.addEventListener("click", () => {
  setActiveTab("add");
  closeDrawer();
  addPanel.classList.remove("hidden");
});

// =====================
// 13) ADD FORM
// =====================
addClose.addEventListener("click", () => {
  addPanel.classList.add("hidden");
  setActiveTab("explore");
});

function setAddStatus(msg){
  addStatus.textContent = msg;
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    titre: aTitle.value.trim(),
    artiste: aArtist.value.trim(),
    lieu_principal: aCity.value.trim(),
    style: aStyle.value.trim() || null,
    annee: aYear.value ? Number(aYear.value) : null,
    lien_youtube: aYoutube.value.trim() || null,
    lien: aLyrics.value.trim() || null,
    extrait_paroles: aQuote.value.trim() || null,
    latitude: selectedCoords ? selectedCoords.lat : null,
    longitude: selectedCoords ? selectedCoords.lng : null,
    status: "pending"
  };

  if (!payload.titre || !payload.artiste || !payload.lieu_principal){
    setAddStatus("⚠️ Remplis Titre / Artiste / Commune.");
    return;
  }

  setAddStatus("Envoi...");
  const { error } = await sb.from(TABLE_SUGGEST).insert(payload);
  if (error){
    console.error(error);
    setAddStatus("❌ Erreur : " + error.message);
    return;
  }

  setAddStatus("✅ Envoyé ! (En attente de validation)");
  addForm.reset();
  selectedCoords = null;
  addCoords.textContent = "📍 Coordonnées : —";
});

// =====================
// 14) LOAD + INIT
// =====================
async function loadSongs(){
  const { data, error } = await sb
    .from(TABLE_SONGS)
    .select(COLS)
    .order("id", { ascending: true })
    .limit(1000);

  if (error){
    console.error(error);
    showStatus("Erreur Supabase: " + error.message);
    return;
  }

  allSongs = data || [];
  elTotalSongs.textContent = String(allSongs.length);

  fillFilterOptions(allSongs);
  drawMarkers(allSongs);
  closeDrawer();
  showStatus(`✅ ${allSongs.length} chanson(s) chargée(s)`);
}

async function init(){
  try{
    if (!window.supabase?.createClient){
      showStatus("Erreur: supabase-js non chargé.");
      return;
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    initMap();
    setActiveTab("explore");
    await loadSongs();

  }catch(e){
    console.error(e);
    showStatus("Erreur: " + (e?.message || e));
  }
}

init();

