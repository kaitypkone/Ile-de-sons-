// ===============================
// Île-de-sons — app.js (à jour)
// CSV: ile_de_sons.csv à la racine du dépôt
// ===============================

// Variables globales
let mainMap, userMarker, songMarkers = [];
let currentPosition = { lat: 48.8566, lng: 2.3522 }; // Paris par défaut
let selectedPosition = null;

// Données chansons (alimentées depuis CSV)
let sampleSongs = [];

// ---------- Utils DOM (anti-crash) ----------
function $(id) { return document.getElementById(id); }

function on(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

// ---------- Chargement CSV ----------
async function loadSongsFromCSV() {
  const res = await fetch("ile_de_sons.csv", { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV introuvable: ${res.status} ${res.statusText}`);

  const text = await res.text();

  // Gère Windows \r\n
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Excel FR => souvent ";"
  const headers = lines.shift().split(";").map(h => h.trim());

  const rows = lines.map(line => {
    const values = line.split(";");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (values[i] ?? "").trim()));
    return obj;
  });

  // Helpers pour lire une colonne avec plusieurs noms possibles
  const pick = (r, names) => {
    for (const n of names) {
      if (r[n] !== undefined && String(r[n]).trim() !== "") return String(r[n]).trim();
    }
    return "";
  };

  const toNum = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    // gère "2,3522"
    return parseFloat(s.replace(",", "."));
  };

  // MAPPING colonnes Excel -> format app
  // ⚠️ Si tes en-têtes sont différents, adapte la liste de noms ci-dessous.
  const songs = rows
    .map((r, idx) => {
      const lat = toNum(pick(r, ["Latitude", "lat", "LAT", "Lat"]));
      const lng = toNum(pick(r, ["Longitude", "lng", "LNG", "Long", "Lon"]));

      return {
        id: idx + 1,
        title: pick(r, ["Titre", "title", "Chanson", "Nom", "Song"]) || "Sans titre",
        artist: pick(r, ["Artiste", "artist"]) || "Artiste inconnu",
        year: pick(r, ["Année", "Annee", "year"]),
        location: pick(r, ["Lieu principal", "Lieu", "Commune", "Ville"]) || "Lieu inconnu",
        lyrics: pick(r, ["Extrait des paroles", "Extrait", "Paroles", "Lyrics"]),
        link: pick(r, ["Lien", "Link", "URL"]),
        style: pick(r, ["Style", "Genre"]),
        lat,
        lng,
        address: pick(r, ["Lieu principal", "Adresse", "Address", "Lieu"])
      };
    })
    // garder uniquement les lignes géolocalisées
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  return songs;
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async function() {
  // Init map
  initMainMap();

  // Events (avec garde-fou si l’élément n’existe pas)
  on('locate-btn', 'click', locateUser);
  on('explore-btn', 'click', exploreParis);
  on('refresh-btn', 'click', refreshSongs);
  on('song-form', 'submit', submitSong);
  on('use-map-location', 'click', useMapLocation);
  on('randomize-location', 'click', randomizeLocation);
  on('search-songs', 'input', filterSongs);

  // Tabs
  setupTabs();

  // Charger le CSV
  try {
    sampleSongs = await loadSongsFromCSV();
  } catch (e) {
    console.error("Erreur chargement CSV :", e);
    alert("Impossible de charger ile_de_sons.csv. Vérifie le nom du fichier et le séparateur ';'.");
    sampleSongs = [];
  }

  // Rendu
  addSongMarkers();
  loadAllSongs();
});

// ---------- Carte ----------
function initMainMap() {
  mainMap = L.map('main-map').setView([48.8566, 2.3522], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(mainMap);

  // clic carte = position sélectionnée
  mainMap.on('click', function(e) {
    selectedPosition = e.latlng;
    updateMapLocation(selectedPosition.lat, selectedPosition.lng);
  });
}

// Ajouter les marqueurs des chansons sur la carte
function addSongMarkers() {
  // Supprimer les anciens marqueurs
  songMarkers.forEach(marker => mainMap.removeLayer(marker));
  songMarkers = [];

  if (!sampleSongs || sampleSongs.length === 0) return;

  sampleSongs.forEach(song => {
    const popupHTML = `
      <div style="min-width: 230px; background: #fffdd4; padding: 15px; border-radius: 12px; border: 2px solid #ebcbff;">
        <h4 style="margin: 0 0 8px 0; color: #e250bd; font-weight: 800;">${escapeHTML(song.title)}</h4>
        <p style="margin: 0 0 6px 0; font-size: 0.9rem; color: #2d1b42;">
          <strong>${escapeHTML(song.artist)}</strong> ${song.year ? `(${escapeHTML(song.year)})` : ""}
        </p>
        <p style="margin: 0 0 8px 0; font-size: 0.85rem; color: #2d1b42;">📍 ${escapeHTML(song.location)}</p>
        ${song.lyrics ? `<p style="margin: 0; font-style: italic; font-size: 0.85rem; color: #2d1b42; background: rgba(183, 230, 255, 0.3); padding: 8px; border-radius: 6px;">"${escapeHTML(song.lyrics)}"</p>` : ""}
        ${song.link ? `<p style="margin-top:10px;"><a href="${song.link}" target="_blank" rel="noopener">🎧 Ouvrir le lien</a></p>` : ""}
      </div>
    `;

    const marker = L.marker([song.lat, song.lng]).addTo(mainMap).bindPopup(popupHTML);
    songMarkers.push(marker);
  });
}

// ---------- Géolocalisation ----------
function locateUser() {
  const locateBtn = $('locate-btn');
  if (locateBtn) {
    locateBtn.textContent = "📍 Localisation...";
    locateBtn.disabled = true;
  }

  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée par votre navigateur.");
    if (locateBtn) {
      locateBtn.textContent = "🎯 Ma position";
      locateBtn.disabled = false;
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      mainMap.setView([currentPosition.lat, currentPosition.lng], 15);

      if (userMarker) mainMap.removeLayer(userMarker);

      userMarker = L.marker([currentPosition.lat, currentPosition.lng])
        .addTo(mainMap)
        .bindPopup("Vous êtes ici")
        .openPopup();

      selectedPosition = currentPosition;

      if (locateBtn) {
        locateBtn.textContent = "🎯 Ma position";
        locateBtn.disabled = false;
      }
    },
    function(error) {
      console.error("Erreur de géolocalisation:", error);
      alert("Impossible de vous géolocaliser. Utilisation de Paris comme position par défaut.");

      if (locateBtn) {
        locateBtn.textContent = "🎯 Ma position";
        locateBtn.disabled = false;
      }
    }
  );
}

// Explorer Paris (vue d'ensemble)
function exploreParis() {
  mainMap.setView([48.8566, 2.3522], 12);
}

// ---------- Liste ----------
function loadAllSongs() {
  const songsList = $('songs-list-container');
  const noSongsMessage = $('no-songs-message');
  if (!songsList) return;

  songsList.innerHTML = '';

  if (!sampleSongs || sampleSongs.length === 0) {
    if (noSongsMessage) noSongsMessage.style.display = 'block';
    return;
  }

  if (noSongsMessage) noSongsMessage.style.display = 'none';

  sampleSongs.forEach(song => {
    const songCard = document.createElement('div');
    songCard.className = 'song-card';

    songCard.innerHTML = `
      <div class="song-header">
        <h3 class="song-title">${escapeHTML(song.title)}</h3>
      </div>
      <div class="song-artist">${escapeHTML(song.artist)} ${song.year ? `(${escapeHTML(song.year)})` : ""}</div>
      <div class="song-location">📍 ${escapeHTML(song.location)}</div>
      ${song.lyrics ? `<div class="song-lyrics">"${escapeHTML(song.lyrics)}"</div>` : ""}
      <button class="btn-map-preview" type="button">📍 Voir sur la carte</button>
      ${song.link ? `<a class="btn-map-preview" style="display:inline-block; margin-top:10px; text-decoration:none;" href="${song.link}" target="_blank" rel="noopener">🎧 Ouvrir le lien</a>` : ""}
    `;

    songCard.querySelector(".btn-map-preview").addEventListener("click", () => {
      showSongOnMap(song.lat, song.lng);
    });

    songsList.appendChild(songCard);
  });
}

// Filtrer les chansons selon la recherche
function filterSongs() {
  const input = $('search-songs');
  const searchTerm = (input ? input.value : "").toLowerCase();

  const songs = document.querySelectorAll('.song-card');
  let visibleCount = 0;

  songs.forEach(song => {
    const title = song.querySelector('.song-title')?.textContent.toLowerCase() || "";
    const artist = song.querySelector('.song-artist')?.textContent.toLowerCase() || "";
    const location = song.querySelector('.song-location')?.textContent.toLowerCase() || "";

    if (title.includes(searchTerm) || artist.includes(searchTerm) || location.includes(searchTerm)) {
      song.style.display = 'block';
      visibleCount++;
    } else {
      song.style.display = 'none';
    }
  });

  const noSongsMessage = $('no-songs-message');
  if (noSongsMessage) noSongsMessage.style.display = visibleCount === 0 ? 'block' : 'none';
}

// ---------- Position sélectionnée ----------
function useMapLocation() {
  if (selectedPosition) {
    updateMapLocation(selectedPosition.lat, selectedPosition.lng);
  } else {
    alert("Veuillez d'abord cliquer sur la carte pour sélectionner un emplacement.");
  }
}

function updateMapLocation(lat, lng) {
  if (window.tempMarker) mainMap.removeLayer(window.tempMarker);

  window.tempMarker = L.marker([lat, lng])
    .addTo(mainMap)
    .bindPopup("Emplacement sélectionné pour la nouvelle chanson")
    .openPopup();

  selectedPosition = { lat, lng };
}

// Générer une position aléatoire dans Paris
function randomizeLocation() {
  const parisBounds = {
    north: 48.9022,
    south: 48.8156,
    east: 2.4150,
    west: 2.2250
  };

  const lat = parisBounds.south + Math.random() * (parisBounds.north - parisBounds.south);
  const lng = parisBounds.west + Math.random() * (parisBounds.east - parisBounds.west);

  mainMap.setView([lat, lng], 15);
  updateMapLocation(lat, lng);
}

// Afficher une chanson sur la carte
function showSongOnMap(lat, lng) {
  mainMap.setView([lat, lng], 16);
}

// ---------- Ajout manuel ----------
function submitSong(e) {
  e.preventDefault();

  if (!selectedPosition) {
    alert("Veuillez sélectionner un emplacement sur la carte.");
    return;
  }

  const title = $('new-song-title')?.value || "";
  const artist = $('new-song-artist')?.value || "";

  if (!title.trim() || !artist.trim()) {
    alert("Titre et artiste sont obligatoires.");
    return;
  }

  // Ces champs peuvent ne pas exister dans ton HTML actuel
  const commune = $('new-song-commune')?.value || "Lieu non spécifié";
  const year = $('new-song-year')?.value || "";
  const address = $('new-song-address')?.value || "";
  const lyrics = $('new-song-lyrics')?.value || "";

  const newSong = {
    id: Date.now(),
    title: title.trim(),
    artist: artist.trim(),
    year: year.trim(),
    location: commune.trim(),
    lyrics: lyrics.trim() || "Aucun extrait fourni",
    lat: selectedPosition.lat,
    lng: selectedPosition.lng,
    address: address.trim(),
    link: ""
  };

  sampleSongs.push(newSong);

  const form = $('song-form');
  if (form) form.reset();

  addSongMarkers();
  loadAllSongs();

  alert(`"${newSong.title}" a été ajoutée à la bibliothèque !`);
  switchToTab('songs-list');
}

// Actualiser la liste des chansons
function refreshSongs() {
  loadAllSongs();
  addSongMarkers();
}

// ---------- Tabs ----------
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      switchToTab(tabId);
    });
  });
}

function switchToTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const activePane = $(tabId);

  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-selected', 'true');
  }
  if (activePane) activePane.classList.add('active');
}

// ---------- Sécurité (évite injection HTML) ----------
function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
