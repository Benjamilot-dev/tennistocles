// CONFIGURACIÓN POR DEFECTO DE FIREBASE
// Si deseas dejar configurada la base de datos de manera permanente para todos los celulares,
// rellena estos datos aquí y guarda el archivo. Si los dejas vacíos, la app
// cargará la configuración que se ingrese en la pestaña "Ajustes".
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBkiZvLZMm6rHlAO3NN4XcjGmKZ9l4jYBE",
  projectId: "tennistocles",
  authDomain: "tennistocles.firebaseapp.com",
  appId: "1:964690549990:web:7f012216889685c2a8ef27"
};

let db = null;
let firebaseApp = null;
let isConnected = false;

// Intentar inicializar Firebase si hay una configuración válida guardada
export function initDatabase() {
  const config = getFirebaseConfig();
  if (config && config.apiKey && config.projectId) {
    try {
      // Importación dinámica de los SDKs de Firebase desde CDN
      import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js")
        .then(({ initializeApp }) => {
          firebaseApp = initializeApp(config);
          return import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        })
        .then(({ getFirestore }) => {
          db = getFirestore(firebaseApp);
          isConnected = true;
          console.log("Firebase Firestore inicializado correctamente.");
          // Despachar evento para notificar a la UI
          window.dispatchEvent(new CustomEvent("db-status-changed", { detail: { connected: true } }));
        })
        .catch(err => {
          console.error("Error al inicializar Firebase SDK:", err);
          isConnected = false;
          window.dispatchEvent(new CustomEvent("db-status-changed", { detail: { connected: false, error: err.message } }));
        });
    } catch (e) {
      console.error("Error crítico de inicialización Firebase:", e);
      isConnected = false;
    }
  } else {
    isConnected = false;
    console.log("Usando LocalStorage: No se detectó configuración de Firebase.");
  }
}

export function getFirebaseConfig() {
  // 1. Intentar cargar la configuración hardcodeada por defecto en este archivo
  if (DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.projectId) {
    return DEFAULT_FIREBASE_CONFIG;
  }
  // 2. Si no, intentar cargarla del LocalStorage (Ajustes de la app)
  const config = localStorage.getItem("tennistocles_firebase_config");
  return config ? JSON.parse(config) : null;
}

export function saveFirebaseConfig(config) {
  if (!config) {
    localStorage.removeItem("tennistocles_firebase_config");
  } else {
    localStorage.setItem("tennistocles_firebase_config", JSON.stringify(config));
  }
  initDatabase(); // Re-inicializar con la nueva configuración
}

export function getDbStatus() {
  return {
    connected: isConnected,
    mode: isConnected ? "firebase" : "local"
  };
}

// Auxiliar para generar IDs aleatorios si estamos en LocalStorage
function generateUUID() {
  return 'ts_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// ==========================================
// SECCIÓN: JUGADORES
// ==========================================

export async function getPlayers() {
  if (isConnected && db) {
    try {
      const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const q = query(collection(db, "players"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const players = [];
      querySnapshot.forEach(doc => {
        players.push({ id: doc.id, ...doc.data() });
      });
      return players;
    } catch (error) {
      console.warn("Fallo lectura Firebase (Jugadores). Usando LocalStorage fallback.", error);
    }
  }

  // LocalStorage fallback
  const local = localStorage.getItem("tennistocles_players");
  return local ? JSON.parse(local) : [];
}

export async function savePlayer(player) {
  const playerToSave = {
    name: player.name,
    stars: parseInt(player.stars) || 3,
    createdAt: player.createdAt || new Date().toISOString()
  };

  if (isConnected && db) {
    try {
      const { doc, setDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const id = player.id || doc(collection(db, "players")).id;
      await setDoc(doc(db, "players", id), playerToSave);
      return { id, ...playerToSave };
    } catch (error) {
      console.warn("Fallo escritura Firebase (Jugadores). Guardando en LocalStorage.", error);
    }
  }

  // LocalStorage fallback
  const players = await getPlayers();
  if (player.id) {
    const idx = players.findIndex(p => p.id === player.id);
    if (idx !== -1) {
      players[idx] = { ...players[idx], ...playerToSave };
    }
  } else {
    player.id = generateUUID();
    players.unshift({ id: player.id, ...playerToSave });
  }
  localStorage.setItem("tennistocles_players", JSON.stringify(players));
  return player;
}

export async function deletePlayer(id) {
  if (isConnected && db) {
    try {
      const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      await deleteDoc(doc(db, "players", id));
      return true;
    } catch (error) {
      console.warn("Fallo borrado Firebase (Jugadores). Eliminando en LocalStorage.", error);
    }
  }

  // LocalStorage
  let players = await getPlayers();
  players = players.filter(p => p.id !== id);
  localStorage.setItem("tennistocles_players", JSON.stringify(players));
  return true;
}

// ==========================================
// SECCIÓN: PARTIDOS (JUEGOS RÁPIDOS)
// ==========================================

export async function getGames() {
  if (isConnected && db) {
    try {
      const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const q = query(collection(db, "games"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const games = [];
      querySnapshot.forEach(doc => {
        games.push({ id: doc.id, ...doc.data() });
      });
      return games;
    } catch (error) {
      console.warn("Fallo lectura Firebase (Juegos). Usando LocalStorage fallback.", error);
    }
  }

  const local = localStorage.getItem("tennistocles_games");
  return local ? JSON.parse(local) : [];
}

export async function saveGame(game) {
  const gameToSave = {
    player1Id: game.player1Id,
    player2Id: game.player2Id,
    player1Name: game.player1Name,
    player2Name: game.player2Name,
    score: game.score,
    status: game.status || "active", // active | finished
    winnerId: game.winnerId || null,
    createdAt: game.createdAt || new Date().toISOString()
  };

  if (isConnected && db) {
    try {
      const { doc, setDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const id = game.id || doc(collection(db, "games")).id;
      await setDoc(doc(db, "games", id), gameToSave);
      return { id, ...gameToSave };
    } catch (error) {
      console.warn("Fallo escritura Firebase (Juegos). Guardando en LocalStorage.", error);
    }
  }

  const games = await getGames();
  if (game.id) {
    const idx = games.findIndex(g => g.id === game.id);
    if (idx !== -1) {
      games[idx] = { ...games[idx], ...gameToSave };
    }
  } else {
    game.id = generateUUID();
    games.unshift({ id: game.id, ...gameToSave });
  }
  localStorage.setItem("tennistocles_games", JSON.stringify(games));
  return game;
}

export async function deleteGame(id) {
  if (isConnected && db) {
    try {
      const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      await deleteDoc(doc(db, "games", id));
      return true;
    } catch (error) {
      console.warn("Fallo borrado Firebase (Juegos).", error);
    }
  }

  let games = await getGames();
  games = games.filter(g => g.id !== id);
  localStorage.setItem("tennistocles_games", JSON.stringify(games));
  return true;
}

// ==========================================
// SECCIÓN: TORNEOS
// ==========================================

export async function getTournaments() {
  if (isConnected && db) {
    try {
      const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const q = query(collection(db, "tournaments"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const tournaments = [];
      querySnapshot.forEach(doc => {
        tournaments.push({ id: doc.id, ...doc.data() });
      });
      return tournaments;
    } catch (error) {
      console.warn("Fallo lectura Firebase (Torneos). Usando LocalStorage fallback.", error);
    }
  }

  const local = localStorage.getItem("tennistocles_tournaments");
  return local ? JSON.parse(local) : [];
}

export async function saveTournament(tournament) {
  const tournamentToSave = {
    name: tournament.name,
    size: tournament.size, // 4 | 8
    players: tournament.players, // Array de IDs de jugadores
    rounds: tournament.rounds, // Array de rondas conteniendo partidos
    status: tournament.status || "active", // active | finished
    winnerId: tournament.winnerId || null,
    createdAt: tournament.createdAt || new Date().toISOString()
  };

  if (isConnected && db) {
    try {
      const { doc, setDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const id = tournament.id || doc(collection(db, "tournaments")).id;
      await setDoc(doc(db, "tournaments", id), tournamentToSave);
      return { id, ...tournamentToSave };
    } catch (error) {
      console.warn("Fallo escritura Firebase (Torneos). Guardando en LocalStorage.", error);
    }
  }

  const tournaments = await getTournaments();
  if (tournament.id) {
    const idx = tournaments.findIndex(t => t.id === tournament.id);
    if (idx !== -1) {
      tournaments[idx] = { ...tournaments[idx], ...tournamentToSave };
    }
  } else {
    tournament.id = generateUUID();
    tournaments.unshift({ id: tournament.id, ...tournamentToSave });
  }
  localStorage.setItem("tennistocles_tournaments", JSON.stringify(tournaments));
  return tournament;
}

export async function deleteTournament(id) {
  if (isConnected && db) {
    try {
      const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      await deleteDoc(doc(db, "tournaments", id));
      return true;
    } catch (error) {
      console.warn("Fallo borrado Firebase (Torneos).", error);
    }
  }

  let tournaments = await getTournaments();
  tournaments = tournaments.filter(t => t.id !== id);
  localStorage.setItem("tennistocles_tournaments", JSON.stringify(tournaments));
  return true;
}

// Iniciar base de datos automáticamente
initDatabase();
