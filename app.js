// =====================
// 0) SUPABASE CONFIG
// =====================
const SUPABASE_URL = "https://votckpjacugwoqowjcow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kzB2e_oa8VfzGCYlyELKng_YYV8_zJd";

const TABLE_SONGS = "songs";
const TABLE_SUGGEST = "suggestions"; // pour "Ajouter" (en attente)

const COLS = `
  id_text,
  titre,
  artiste,
  style,
  annee,
  lieu_principal,
  code_departement,
  extrait_paroles,
  lien,
  lien_youtube,
  youtube_embed,
  longitude,
  latitude
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

function getYoutubeWatchUrl(song){
  const yt = safe(song.lien_youtube).trim();
  if (yt) return yt;

  const embed = safe(song.youtube_embed).trim();
  const m = embed.match(/youtube\.com\/embed\/([^?&]+)/);
  if (m?.[1]) return `https://www.youtube.com/watch?v=${m[1]}`;
  return "";
}

function getTagStyle(style){
  const s = safe(style).trim();
  if (!s) return "";
  // garde un tag court
  const first = s.split(",")[0].trim();
  return first.length > 18 ? first.slice(0, 18) + "…" : first;
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
        className: "",                // important pour ne pas ajouter de style Leaflet
        html: `<div class="song-dot"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(markersLayer);

    const titre = safe(song.titre) || "Sans titre";
    const artiste = safe(song.artiste) || "Artiste inconnu";
    const lieu = safe(song.lieu_principal) || "Lieu";
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
      const bOpen = el?.querySelector('[data-open="1"]');
      const bYT = el?.querySelector('[data-yt="1"]');

      if (bOpen) bOpen.addEventListener("click", () => openSongSheet(song));
      if (bYT) bYT.addEventListener("click", () => {
        const url = getYoutubeWatchUrl(song);
        if (url) window.open(url, "_blank", "noopener");
      });
    });

    marker.on("click", () => {
      // juste ouvrir la fiche propre (pas de lecture intégrée)
      openSongSheet(song);
    });
  });
}

function zoomToSong(song){
  const lat = parseNum(song.latitude);
  const lng = parseNum(song.longitude);
  if (lat === null || lng === null) return;

  map.setView([lat, lng], 13);
}

// =====================
// 5) SONG SHEET (bottom)
// =====================
function openSongSheet(song){
  currentSong = song;

  const titre = safe(song.titre) || "Sans titre";
  const artiste = safe(song.artiste) || "Artiste inconnu";
  const annee = song.annee ? ` • ${song.annee}` : "";
  const lieu = safe(song.lieu_principal) || "Lieu";
  const quote = safe(song.extrait_paroles);

  shTitle.textContent = titre;
  shMeta.textContent = `${artiste}${annee}`;
  shPlace.textContent = `📍 ${lieu}`;

  if (quote) {
    shQuote.textContent = `“${quote}”`;
    shQuote.style.display = "block";
  } else {
    shQuote.style.display = "none";
  }

  const yt = getYoutubeWatchUrl(song);
  shYoutube.disabled = !yt;

  const lyrics = safe(song.lien).trim();
  if (lyrics) {
    shLyrics.href = lyrics;
    shLyrics.style.display = "inline-flex";
  } else {
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
  const url = currentSong ? getYoutubeWatchUrl(currentSong) : "";
  if (url) window.open(url, "_blank", "noopener");
});

shZoom.addEventListener("click", () => {
  if (!currentSong) return;
  zoomToSong(currentSong);
  closeSongSheet();
});

// =====================
// 6) RESULTS DRAWER
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
    const titre = safe(song.titre) || "Sans titre";
    const artiste = safe(song.artiste) || "Artiste inconnu";
    const lieu = safe(song.lieu_principal) || "";
    const tag = getTagStyle(song.style);
    const dept = safe(song.code_departement).trim();
    const yt = getYoutubeWatchUrl(song);
    const lyrics = safe(song.lien).trim();

    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="rc-title">${titre}</div>
      <div class="rc-meta">${artiste}${song.annee ? ` • ${song.annee}` : ""}${lieu ? ` • ${lieu}` : ""}</div>

      <div class="rc-tags">
        ${tag ? `<span class="tag">${tag}</span>` : ""}
        ${dept ? `<span class="tag">${dept}</span>` : ""}
      </div>

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
// 7) SEARCH + FILTERS
// =====================
function computeResults(){
  const q = normalize(elSearch.value);

  // filtres
  const c = normalize(fCommune.value);
  const s = normalize(fStyle.value);
  const d = normalize(fDept.value);
  const ymin = Number(fYearMin.value || "");
  const ymax = Number(fYearMax.value || "");

  const hasFilters =
    !!q || !!c || !!s || !!d || Number.isFinite(ymin) || Number.isFinite(ymax);

  // IMPORTANT: pas de résultats au démarrage
  if (!hasFilters){
    isSearchActive = false;
    currentResults = [];
    closeDrawer();
    // Explorer = on peut laisser les marqueurs de toute l'IDF visibles (c’est OK)
    drawMarkers(allSongs);
    return;
  }

  isSearchActive = true;

  let list = allSongs.slice();

  if (q){
    list = list.filter(song => {
      const hay = [
        song.titre, song.artiste, song.style, song.lieu_principal, song.extrait_paroles, song.code_departement
      ].map(normalize).join(" | ");
      return hay.includes(q);
    });
  }

  if (c){
    list = list.filter(song => normalize(song.lieu_principal).includes(c));
  }

  if (s){
    list = list.filter(song => normalize(song.style).includes(s));
  }

  if (d){
    list = list.filter(song => normalize(song.code_departement) === d);
  }

  if (Number.isFinite(ymin)){
    list = list.filter(song => Number(song.annee) >= ymin);
  }

  if (Number.isFinite(ymax)){
    list = list.filter(song => Number(song.annee) <= ymax);
  }

  currentResults = list;

  renderResults(currentResults);
  openDrawer();
  drawMarkers(currentResults);

  showStatus(`✅ ${currentResults.length} résultat(s)`);
}

btnClear.addEventListener("click", () => {
  elSearch.value = "";
  computeResults();
});

elSearch.addEventListener("input", () => {
  // si l’utilisateur tape : on active le mode résultats
  computeResults();
});

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
  fDept.value = "";
  fYearMin.value = "";
  fYearMax.value = "";
  filtersPanel.classList.add("hidden");
  computeResults();
});

// =====================
// 8) TOP BUTTONS
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
// 9) TABS
// =====================
tabExplore.addEventListener("click", () => {
  setActiveTab("explore");
  addPanel.classList.add("hidden");
  // Explorer = carte + résultats si recherche active
  if (isSearchActive) openDrawer();
  else closeDrawer();
});

tabLibrary.addEventListener("click", () => {
  setActiveTab("library");
  addPanel.classList.add("hidden");

  // Bibliothèque = on force l’affichage des résultats = tout
  currentResults = allSongs.slice();
  renderResults(currentResults);
  openDrawer();
  elResultsCount.textContent = String(allSongs.length);
  showStatus(`Bibliothèque : ${allSongs.length} chanson(s)`);

  // marqueurs = tout
  drawMarkers(allSongs);
});

tabAdd.addEventListener("click", () => {
  setActiveTab("add");
  closeDrawer();
  addPanel.classList.remove("hidden");
});

// =====================
// 10) ADD FORM (suggestions)
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
// 11) LOAD + INIT
// =====================
function fillFilterOptions(songs){
  const communes = new Set();
  const styles = new Set();
  const depts = new Set();

  songs.forEach(s => {
    const c = safe(s.lieu_principal).trim();
    if (c) communes.add(c);

    const st = safe(s.style).trim();
    if (st) {
      // on prend le premier style
      const first = st.split(",")[0].trim();
      if (first) styles.add(first);
    }

    const d = safe(s.code_departement).trim();
    if (d) depts.add(d);
  });

  const sortFR = (a,b) => a.localeCompare(b, "fr", { sensitivity: "base" });

  // clear
  fCommune.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
  fStyle.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
  fDept.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());

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

  [...depts].sort(sortFR).forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    fDept.appendChild(opt);
  });
}

async function loadSongs(){
  const { data, error } = await sb
    .from(TABLE_SONGS)
    .select(COLS)
    .order("id_text", { ascending: true })
    .limit(1000);

  if (error){
    console.error(error);
    showStatus("Erreur Supabase: " + error.message);
    return;
  }

  allSongs = data || [];
  elTotalSongs.textContent = String(allSongs.length);

  fillFilterOptions(allSongs);

  // Explorer au démarrage: carte + marqueurs (tout), mais pas de résultats drawer
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
