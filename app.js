// Variables globales
let mainMap, userMarker, songMarkers = [];
let currentPosition = { lat: 48.8566, lng: 2.3522 }; // Paris par défaut
let selectedPosition = null;

// Échantillon de chansons pour la démonstration
const sampleSongs = [
    {
        id: 1,
        title: "Sous le ciel de Paris",
        artist: "Édith Piaf",
        year: 1954,
        location: "Paris 1er",
        lyrics: "Sous le ciel de Paris, s'envole une chanson...",
        lat: 48.8566,
        lng: 2.3522,
        address: "Île de la Cité"
    },
    {
        id: 2,
        title: "Les Champs-Élysées",
        artist: "Joe Dassin",
        year: 1969,
        location: "Paris 8ème",
        lyrics: "Aux Champs-Élysées, aux Champs-Élysées...",
        lat: 48.8738,
        lng: 2.2950,
        address: "Avenue des Champs-Élysées"
    },
    {
        id: 3,
        title: "La Bohème",
        artist: "Charles Aznavour",
        year: 1965,
        location: "Paris 18ème",
        lyrics: "Je vous parle d'un temps que les moins de vingt ans...",
        lat: 48.8924,
        lng: 2.3443,
        address: "Place du Tertre"
    },
    {
        id: 4,
        title: "Paris sera toujours Paris",
        artist: "Maurice Chevalier",
        year: 1939,
        location: "Paris 4ème",
        lyrics: "Paris sera toujours Paris, la plus belle ville du monde...",
        lat: 48.8550,
        lng: 2.3500,
        address: "Notre-Dame de Paris"
    }
];

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    // Initialisation de la carte principale
    initMainMap();
    
    // Configuration des écouteurs d'événements
    document.getElementById('locate-btn').addEventListener('click', locateUser);
    document.getElementById('explore-btn').addEventListener('click', exploreParis);
    document.getElementById('refresh-btn').addEventListener('click', refreshSongs);
    document.getElementById('song-form').addEventListener('submit', submitSong);
    document.getElementById('use-map-location').addEventListener('click', useMapLocation);
    document.getElementById('randomize-location').addEventListener('click', randomizeLocation);
    document.getElementById('search-songs').addEventListener('input', filterSongs);
    
    // Configuration des onglets
    setupTabs();
    
    // Chargement initial des chansons
    loadAllSongs();
});

// Initialisation de la carte principale
function initMainMap() {
    // Centrer sur Paris par défaut
    mainMap = L.map('main-map').setView([48.8566, 2.3522], 13);
    
    // Ajouter la couche de tuiles OpenStreetMap avec un style plus clair
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mainMap);
    
    // Gestion du clic sur la carte
    mainMap.on('click', function(e) {
        selectedPosition = e.latlng;
        updateMapLocation(selectedPosition.lat, selectedPosition.lng);
    });
    
    // Ajouter les marqueurs des chansons existantes
    addSongMarkers();
}

// Ajouter les marqueurs des chansons sur la carte
function addSongMarkers() {
    // Supprimer les anciens marqueurs
    songMarkers.forEach(marker => mainMap.removeLayer(marker));
    songMarkers = [];
    
    // Ajouter un marqueur pour chaque chanson
    sampleSongs.forEach(song => {
        const marker = L.marker([song.lat, song.lng])
            .addTo(mainMap)
            .bindPopup(`
                <div style="min-width: 220px; background: #fffdd4; padding: 15px; border-radius: 12px; border: 2px solid #ebcbff;">
                    <h4 style="margin: 0 0 8px 0; color: #e250bd; font-weight: 700;">${song.title}</h4>
                    <p style="margin: 0 0 5px 0; font-size: 0.9rem; color: #2d1b42;"><strong>${song.artist}</strong> (${song.year})</p>
                    <p style="margin: 0 0 8px 0; font-size: 0.8rem; color: #2d1b42;">📍 ${song.location}</p>
                    <p style="margin: 0; font-style: italic; font-size: 0.85rem; color: #2d1b42; background: rgba(183, 230, 255, 0.3); padding: 8px; border-radius: 6px;">"${song.lyrics}"</p>
                </div>
            `);
        songMarkers.push(marker);
    });
}

// Géolocalisation de l'utilisateur
function locateUser() {
    const locateBtn = document.getElementById('locate-btn');
    locateBtn.textContent = "📍 Localisation...";
    locateBtn.disabled = true;
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                // Succès de la géolocalisation
                currentPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Recentrer la carte sur la position de l'utilisateur
                mainMap.setView([currentPosition.lat, currentPosition.lng], 15);
                
                // Ajouter un marqueur pour la position utilisateur
                if (userMarker) {
                    mainMap.removeLayer(userMarker);
                }
                userMarker = L.marker([currentPosition.lat, currentPosition.lng])
                    .addTo(mainMap)
                    .bindPopup("Vous êtes ici")
                    .openPopup();
                
                // Mettre à jour la position sélectionnée
                selectedPosition = currentPosition;
                
                locateBtn.textContent = "🎯 Ma position";
                locateBtn.disabled = false;
            },
            function(error) {
                // Erreur de géolocalisation
                console.error("Erreur de géolocalisation:", error);
                alert("Impossible de vous géolocaliser. Utilisation de Paris comme position par défaut.");
                
                locateBtn.textContent = "🎯 Ma position";
                locateBtn.disabled = false;
            }
        );
    } else {
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
        locateBtn.textContent = "🎯 Ma position";
        locateBtn.disabled = false;
    }
}

// Explorer Paris (vue d'ensemble)
function exploreParis() {
    mainMap.setView([48.8566, 2.3522], 12);
}

// Charger toutes les chansons
function loadAllSongs() {
    const songsList = document.getElementById('songs-list-container');
    const noSongsMessage = document.getElementById('no-songs-message');
    
    // Vider la liste
    songsList.innerHTML = '';
    
    if (sampleSongs.length === 0) {
        noSongsMessage.style.display = 'block';
        return;
    }
    
    noSongsMessage.style.display = 'none';
    
    // Ajouter chaque chanson à la liste
    sampleSongs.forEach(song => {
        const songCard = document.createElement('div');
        songCard.className = 'song-card';
        songCard.innerHTML = `
            <div class="song-header">
                <h3 class="song-title">${song.title}</h3>
            </div>
            <div class="song-artist">${song.artist} (${song.year})</div>
            <div class="song-location">📍 ${song.location}</div>
            <div class="song-lyrics">"${song.lyrics}"</div>
            <button class="btn-map-preview" onclick="showSongOnMap(${song.lat}, ${song.lng})">
                📍 Voir sur la carte
            </button>
        `;
        songsList.appendChild(songCard);
    });
}

// Filtrer les chansons selon la recherche
function filterSongs() {
    const searchTerm = document.getElementById('search-songs').value.toLowerCase();
    const songs = document.querySelectorAll('.song-card');
    let visibleCount = 0;
    
    songs.forEach(song => {
        const title = song.querySelector('.song-title').textContent.toLowerCase();
        const artist = song.querySelector('.song-artist').textContent.toLowerCase();
        const location = song.querySelector('.song-location').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || artist.includes(searchTerm) || location.includes(searchTerm)) {
            song.style.display = 'block';
            visibleCount++;
        } else {
            song.style.display = 'none';
        }
    });
    
    // Afficher le message "aucune chanson" si nécessaire
    const noSongsMessage = document.getElementById('no-songs-message');
    noSongsMessage.style.display = visibleCount === 0 ? 'block' : 'none';
}

// Utiliser la position actuelle de la carte
function useMapLocation() {
    if (selectedPosition) {
        updateMapLocation(selectedPosition.lat, selectedPosition.lng);
    } else {
        alert("Veuillez d'abord cliquer sur la carte pour sélectionner un emplacement.");
    }
}

// Mettre à jour la position sur la carte
function updateMapLocation(lat, lng) {
    // Ajouter un marqueur temporaire pour la position sélectionnée
    if (window.tempMarker) {
        mainMap.removeLayer(window.tempMarker);
    }
    window.tempMarker = L.marker([lat, lng])
        .addTo(mainMap)
        .bindPopup("Emplacement sélectionné pour la nouvelle chanson")
        .openPopup();
    
    selectedPosition = { lat, lng };
}

// Générer une position aléatoire dans Paris
function randomizeLocation() {
    // Limites de Paris
    const parisBounds = {
        north: 48.9022,
        south: 48.8156,
        east: 2.4150,
        west: 2.2250
    };
    
    const lat = parisBounds.south + Math.random() * (parisBounds.north - parisBounds.south);
    const lng = parisBounds.west + Math.random() * (parisBounds.east - parisBounds.west);
    
    // Centrer la carte sur cette position
    mainMap.setView([lat, lng], 15);
    updateMapLocation(lat, lng);
}

// Afficher une chanson sur la carte
function showSongOnMap(lat, lng) {
    mainMap.setView([lat, lng], 16);
}

// Soumettre une nouvelle chanson
function submitSong(e) {
    e.preventDefault();
    
    if (!selectedPosition) {
        alert("Veuillez sélectionner un emplacement sur la carte.");
        return;
    }
    
    // Récupérer les valeurs du formulaire
    const title = document.getElementById('new-song-title').value;
    const artist = document.getElementById('new-song-artist').value;
    const commune = document.getElementById('new-song-commune').value;
    const year = document.getElementById('new-song-year').value;
    const address = document.getElementById('new-song-address').value;
    const lyrics = document.getElementById('new-song-lyrics').value;
    
    // Créer un nouvel objet chanson
    const newSong = {
        id: Date.now(), // ID unique basé sur le timestamp
        title,
        artist,
        year: year || "Inconnue",
        location: commune,
        lyrics: lyrics || "Aucun extrait fourni",
        lat: selectedPosition.lat,
        lng: selectedPosition.lng,
        address: address || "Non spécifié"
    };
    
    // Ajouter à notre liste de chansons
    sampleSongs.push(newSong);
    
    // Réinitialiser le formulaire
    document.getElementById('song-form').reset();
    
    // Mettre à jour l'interface
    addSongMarkers();
    loadAllSongs();
    
    // Afficher un message de confirmation
    alert(`"${title}" a été ajoutée à la bibliothèque !`);
    
    // Revenir à l'onglet des chansons
    switchToTab('songs-list');
}

// Actualiser la liste des chansons
function refreshSongs() {
    loadAllSongs();
}

// Configuration des onglets
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            switchToTab(tabId);
        });
    });
}

// Changer d'onglet
function switchToTab(tabId) {
    // Désactiver tous les onglets
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    // Activer l'onglet sélectionné
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).setAttribute('aria-selected', 'true');
    document.getElementById(tabId).classList.add('active');
}