// app.js - Lógica principal de Tennistocles

import * as db from "./db.js";

// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
let playersList = [];
let activeGame = null;
let activeTournament = null;
let selectedStarRating = 3; // Rating por defecto al crear jugador

// Mapeo de puntajes tradicionales de tenis
const TENNIS_POINTS = ["0", "15", "30", "40", "Ad"];
const TENNIS_POINTS_45 = ["0", "15", "30", "45", "Ad"];

// ==========================================
// INICIALIZACIÓN Y NAVEGACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  initApp();
  setupEventListeners();
  await loadAndRenderPlayers();
  await loadAndRenderGames();
  await loadAndRenderTournaments();
  checkActiveSessions();
});

function initApp() {
  // Ajustar badge de conexión de base de datos
  updateDbBadge();

  // Escuchar cambios de estado en Firebase
  window.addEventListener("db-status-changed", (e) => {
    updateDbBadge(e.detail);
    loadAndRenderPlayers();
    loadAndRenderGames();
    loadAndRenderTournaments();
  });
}

function updateDbBadge(statusDetail) {
  const badge = document.getElementById("db-indicator");
  const badgeText = document.getElementById("db-badge-text");
  const statusVal = document.getElementById("settings-status-val");
  const statusBox = document.getElementById("settings-status-box");
  const dbStatus = db.getDbStatus();

  badge.className = "db-badge";
  
  if (dbStatus.connected) {
    badge.classList.add("online");
    badgeText.textContent = "Firebase";
    if (statusVal) {
      statusVal.textContent = "Conectado a Firebase (Nube)";
      statusVal.className = "status-value online";
      statusBox.style.borderColor = "var(--success)";
    }
  } else {
    badge.classList.add("local");
    let errorMsg = "";
    if (statusDetail && statusDetail.error) {
      errorMsg = ` (${statusDetail.error})`;
      badge.classList.add("error");
      badgeText.textContent = "Error DB";
    } else {
      badgeText.textContent = "Local";
    }
    
    if (statusVal) {
      statusVal.textContent = `Desconectado${errorMsg}. Usando LocalStorage.`;
      statusVal.className = "status-value offline";
      statusBox.style.borderColor = "var(--border-color)";
    }
  }

  // Pre-rellenar formulario de ajustes de Firebase
  const config = db.getFirebaseConfig();
  if (config) {
    document.getElementById("fb-apiKey").value = config.apiKey || "";
    document.getElementById("fb-projectId").value = config.projectId || "";
    document.getElementById("fb-authDomain").value = config.authDomain || "";
    document.getElementById("fb-appId").value = config.appId || "";
  }
}

// Comprobar si hay partidos o torneos activos guardados en LocalStorage para reanudar
function checkActiveSessions() {
  const savedGame = localStorage.getItem("tennistocles_active_game_session");
  if (savedGame) {
    activeGame = JSON.parse(savedGame);
    showView("view-quick-game");
    renderLiveScoreboard();
  }

  const savedTournament = localStorage.getItem("tennistocles_active_tournament_session");
  if (savedTournament) {
    activeTournament = JSON.parse(savedTournament);
    showView("view-tournaments");
    renderActiveTournament();
  }
}

// Cambiar de vista (Navegación SPA)
function showView(viewId) {
  // Ocultar todas
  document.querySelectorAll(".app-view").forEach(view => {
    view.classList.remove("active");
  });
  // Mostrar seleccionada
  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add("active");

  // Actualizar tabs de navegación
  document.querySelectorAll(".nav-tab").forEach(tab => {
    if (tab.getAttribute("data-view") === viewId) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Scroll al inicio
  document.querySelector(".app-content").scrollTop = 0;
}

// Configurar todos los Event Listeners
function setupEventListeners() {
  // Navegación
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const viewId = tab.getAttribute("data-view");
      showView(viewId);
    });
  });

  //Selector de Estrellas interactivo al crear jugador
  const starSelector = document.getElementById("star-selector");
  starSelector.addEventListener("click", (e) => {
    if (e.target.classList.contains("star-btn")) {
      const value = parseInt(e.target.getAttribute("data-value"));
      selectedStarRating = value;
      
      // Actualizar visualización
      document.querySelectorAll("#star-selector .star-btn").forEach(btn => {
        const btnVal = parseInt(btn.getAttribute("data-value"));
        if (btnVal <= value) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });
    }
  });

  // Formulario Agregar Jugador
  const addPlayerForm = document.getElementById("add-player-form");
  addPlayerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("player-name");
    const name = nameInput.value.trim();
    if (!name) return;

    await db.savePlayer({
      name: name,
      stars: selectedStarRating
    });

    nameInput.value = "";
    // Resetear estrellas a 3
    selectedStarRating = 3;
    document.querySelectorAll("#star-selector .star-btn").forEach(btn => {
      const val = parseInt(btn.getAttribute("data-value"));
      btn.classList.toggle("active", val <= 3);
    });

    await loadAndRenderPlayers();
  });

  // Ajustes de Firebase
  const configForm = document.getElementById("firebase-config-form");
  configForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const config = {
      apiKey: document.getElementById("fb-apiKey").value.trim(),
      projectId: document.getElementById("fb-projectId").value.trim(),
      authDomain: document.getElementById("fb-authDomain").value.trim(),
      appId: document.getElementById("fb-appId").value.trim()
    };
    db.saveFirebaseConfig(config);
    showAppModal("Ajustes Guardados", "Configuración de Firebase guardada. Intentando conectar...", "", "⚙️");
  });
 
  document.getElementById("btn-clear-config").addEventListener("click", () => {
    if (confirm("¿Estás seguro de volver al modo local? Se limpiarán las credenciales.")) {
      db.saveFirebaseConfig(null);
      document.getElementById("fb-apiKey").value = "";
      document.getElementById("fb-projectId").value = "";
      document.getElementById("fb-authDomain").value = "";
      document.getElementById("fb-appId").value = "";
      showAppModal("Ajustes Limpiados", "Configuración eliminada. Operando en LocalStorage.", "", "🧹");
    }
  });
 
  // Configuración de Partido Rápido
  const gameSetupForm = document.getElementById("game-setup-form");
  gameSetupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const p1Id = document.getElementById("select-p1").value;
    const p2Id = document.getElementById("select-p2").value;
 
    if (p1Id === p2Id) {
      showAppModal("Error de Selección", "Por favor selecciona jugadores diferentes para iniciar un partido.", "", "⚠️");
      return;
    }

    const p1 = playersList.find(p => p.id === p1Id);
    const p2 = playersList.find(p => p.id === p2Id);
    const format = document.getElementById("game-format").value;

    startNewGame(p1, p2, null, format);
  });

  // Botón Cancelar Partido En Vivo
  document.getElementById("btn-cancel-game").addEventListener("click", () => {
    if (confirm("¿Estás seguro de que quieres cancelar el partido actual? Se perderá el progreso.")) {
      activeGame = null;
      localStorage.removeItem("tennistocles_active_game_session");
      document.getElementById("game-live-card").classList.add("hidden");
      document.getElementById("game-setup-card").classList.remove("hidden");
    }
  });

  // Botones de sumar puntos
  document.getElementById("btn-p1-point").addEventListener("click", () => scorePoint(1));
  document.getElementById("btn-p2-point").addEventListener("click", () => scorePoint(2));

  // Botón Deshacer
  document.getElementById("btn-undo-point").addEventListener("click", undoLastPoint);

  // Botón Forzar Fin del Partido
  document.getElementById("btn-force-finish").addEventListener("click", () => {
    if (confirm("¿Deseas terminar el partido ahora y declarar ganador al jugador que va al frente?")) {
      forceFinishGame();
    }
  });

  // Alternar pestañas del creador de torneos (Exprés, Normal, Personalizado)
  const btnTabExpress = document.getElementById("btn-tab-express");
  const btnTabNormal = document.getElementById("btn-tab-normal");
  const btnTabCustom = document.getElementById("btn-tab-custom");
  const panelExpress = document.getElementById("panel-tournament-express");
  const panelNormal = document.getElementById("panel-tournament-normal");
  const panelCustom = document.getElementById("panel-tournament-custom");

  function resetTournamentTabs() {
    [btnTabExpress, btnTabNormal, btnTabCustom].forEach(btn => btn.classList.remove("active"));
    [panelExpress, panelNormal, panelCustom].forEach(panel => panel.classList.remove("active"));
  }

  btnTabExpress.addEventListener("click", () => {
    resetTournamentTabs();
    btnTabExpress.classList.add("active");
    panelExpress.classList.add("active");
  });

  btnTabNormal.addEventListener("click", () => {
    resetTournamentTabs();
    btnTabNormal.classList.add("active");
    panelNormal.classList.add("active");
  });

  btnTabCustom.addEventListener("click", () => {
    resetTournamentTabs();
    btnTabCustom.classList.add("active");
    panelCustom.classList.add("active");
  });

  // Formulario de Torneo Exprés
  const expressTournamentForm = document.getElementById("express-tournament-form");
  expressTournamentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const isDoubles = document.getElementById("express-doubles").checked;
    const dateStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const name = `Torneo Exprés ${isDoubles ? 'Dobles ' : ''}(${dateStr})`;
    const size = 4; // 4 jugadores o parejas
    const format = "3-games-45"; 

    createTournament(name, size, format, isDoubles);
  });

  // Formulario de Torneo Normal
  const normalTournamentForm = document.getElementById("normal-tournament-form");
  normalTournamentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const isDoubles = document.getElementById("normal-doubles").checked;
    const dateStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const name = `Torneo Normal ${isDoubles ? 'Dobles ' : ''}(${dateStr})`;
    const size = 8; // 8 jugadores o parejas
    const format = "3-sets"; 

    createTournament(name, size, format, isDoubles);
  });

  // Formulario de Torneo Personalizado
  const tournamentSetupForm = document.getElementById("tournament-setup-form");
  tournamentSetupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("tournament-name").value.trim();
    const size = parseInt(document.getElementById("tournament-size").value);
    const mode = document.getElementById("tournament-mode").value;
    const isDoubles = mode === "doubles";
    const format = document.getElementById("tournament-format").value;

    createTournament(name, size, format, isDoubles);
  });

  // Botón Cancelar/Salir Torneo
  document.getElementById("btn-cancel-tournament").addEventListener("click", () => {
    if (activeTournament.status === "finished") {
      // Si ya finalizó, salir sin advertencia
      activeTournament = null;
      localStorage.removeItem("tennistocles_active_tournament_session");
      document.getElementById("tournament-active-card").classList.add("hidden");
      document.getElementById("tournament-setup-card").classList.remove("hidden");
      loadAndRenderTournaments();
    } else if (confirm("¿Quieres salir del cuadro del torneo? El torneo se mantendrá activo en segundo plano y podrás retomarlo desde el historial.")) {
      activeTournament = null;
      localStorage.removeItem("tennistocles_active_tournament_session");
      document.getElementById("tournament-active-card").classList.add("hidden");
      document.getElementById("tournament-setup-card").classList.remove("hidden");
      loadAndRenderTournaments();
    }
  });

  // Botones de ayuda (Tutoriales colapsables)
  document.getElementById("btn-help-game").addEventListener("click", () => {
    document.getElementById("help-game-card").classList.toggle("hidden");
  });

  document.getElementById("btn-help-tournament").addEventListener("click", () => {
    document.getElementById("help-tournament-card").classList.toggle("hidden");
  });
}

// ==========================================
// LÓGICA DE JUGADORES
// ==========================================
async function loadAndRenderPlayers() {
  playersList = await db.getPlayers();
  
  // Actualizar contador
  document.getElementById("player-count").textContent = playersList.length;

  // Renderizar Lista
  const container = document.getElementById("players-list");
  container.innerHTML = "";

  if (playersList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay jugadores registrados todavía. ¡Agrega el primero arriba!</p>
      </div>`;
    updatePlayerDropdowns();
    return;
  }

  playersList.forEach(player => {
    const card = document.createElement("div");
    card.className = "player-item";
    
    // Generar estrellas visuales
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      if (i <= player.stars) {
        starsHtml += "★";
      } else {
        starsHtml += '<span class="star-empty">★</span>';
      }
    }

    card.innerHTML = `
      <div class="player-info">
        <span class="player-name-lbl">${escapeHTML(player.name)}</span>
        <div class="star-display">${starsHtml}</div>
      </div>
      <button class="btn-delete" data-id="${player.id}" title="Eliminar jugador">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      </button>
    `;

    // Evento de eliminar
    card.querySelector(".btn-delete").addEventListener("click", async () => {
      if (confirm(`¿Estás seguro de eliminar a ${player.name}?`)) {
        await db.deletePlayer(player.id);
        await loadAndRenderPlayers();
      }
    });

    container.appendChild(card);
  });

  updatePlayerDropdowns();
}

// Rellenar dropdowns de selección de jugadores
function updatePlayerDropdowns() {
  const selectP1 = document.getElementById("select-p1");
  const selectP2 = document.getElementById("select-p2");
  const selectP1b = document.getElementById("select-p1b");
  const selectP2b = document.getElementById("select-p2b");

  // Guardar valores seleccionados previamente
  const val1 = selectP1.value;
  const val2 = selectP2.value;
  const val1b = selectP1b ? selectP1b.value : null;
  const val2b = selectP2b ? selectP2b.value : null;

  selectP1.innerHTML = '<option value="" disabled selected>Selecciona jugador 1</option>';
  selectP2.innerHTML = '<option value="" disabled selected>Selecciona jugador 2</option>';
  if (selectP1b) selectP1b.innerHTML = '<option value="" disabled selected>Selecciona compañero</option>';
  if (selectP2b) selectP2b.innerHTML = '<option value="" disabled selected>Selecciona compañero</option>';

  playersList.forEach(player => {
    const opt1 = document.createElement("option");
    opt1.value = player.id;
    opt1.textContent = `${player.name} (${"★".repeat(player.stars)})`;
    selectP1.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = player.id;
    opt2.textContent = `${player.name} (${"★".repeat(player.stars)})`;
    selectP2.appendChild(opt2);

    if (selectP1b) {
      const opt1b = document.createElement("option");
      opt1b.value = player.id;
      opt1b.textContent = `${player.name} (${"★".repeat(player.stars)})`;
      selectP1b.appendChild(opt1b);
    }

    if (selectP2b) {
      const opt2b = document.createElement("option");
      opt2b.value = player.id;
      opt2b.textContent = `${player.name} (${"★".repeat(player.stars)})`;
      selectP2b.appendChild(opt2b);
    }
  });

  // Restaurar selecciones si aún existen
  if (playersList.some(p => p.id === val1)) selectP1.value = val1;
  if (playersList.some(p => p.id === val2)) selectP2.value = val2;
  if (selectP1b && playersList.some(p => p.id === val1b)) selectP1b.value = val1b;
  if (selectP2b && playersList.some(p => p.id === val2b)) selectP2b.value = val2b;
}

// ==========================================
// LÓGICA DE MARCADOR EN VIVO (JUEGO RÁPIDO)
// ==========================================
function startNewGame(p1, p2, tournamentMeta = null, format = "3-sets") {
  activeGame = {
    p1: p1,
    p2: p2,
    p1Score: 0, // Indice de TENNIS_POINTS (0,1,2,3) o puntos directos
    p2Score: 0,
    p1Games: 0,
    p2Games: 0,
    p1Sets: 0,
    p2Sets: 0,
    setsHistory: [], // ej: [{p1: 6, p2: 4}] o [{p1: 45, p2: 38}]
    isTiebreak: false,
    tbP1Points: 0,
    tbP2Points: 0,
    history: [], // Para deshacer
    tournamentMeta: tournamentMeta, // { tournamentId, roundIdx, matchIdx }
    format: format
  };

  localStorage.setItem("tennistocles_active_game_session", JSON.stringify(activeGame));

  // Ocultar formulario de inicio, mostrar scoreboard
  document.getElementById("game-setup-card").classList.add("hidden");
  document.getElementById("game-live-card").classList.remove("hidden");

  renderLiveScoreboard();
}

function renderLiveScoreboard() {
  if (!activeGame) return;

  // Nombres
  document.getElementById("sb-p1-name").textContent = activeGame.p1.name;
  document.getElementById("sb-p2-name").textContent = activeGame.p2.name;

  // Puntos del Game / Tiebreak / 45 Puntos
  const pointsP1El = document.getElementById("sb-p1-points");
  const pointsP2El = document.getElementById("sb-p2-points");

  if (activeGame.format === "3-games-45") {
    pointsP1El.textContent = TENNIS_POINTS_45[activeGame.p1Score];
    pointsP2El.textContent = TENNIS_POINTS_45[activeGame.p2Score];
    pointsP1El.style.fontSize = "48px";
    pointsP2El.style.fontSize = "48px";
  } else if (activeGame.isTiebreak) {
    pointsP1El.textContent = activeGame.tbP1Points;
    pointsP2El.textContent = activeGame.tbP2Points;
    pointsP1El.style.fontSize = "38px";
    pointsP2El.style.fontSize = "38px";
  } else {
    pointsP1El.textContent = TENNIS_POINTS[activeGame.p1Score];
    pointsP2El.textContent = TENNIS_POINTS[activeGame.p2Score];
    pointsP1El.style.fontSize = "48px";
    pointsP2El.style.fontSize = "48px";
  }

  // Games y Sets
  document.getElementById("sb-p1-sets").textContent = activeGame.p1Sets;
  document.getElementById("sb-p2-sets").textContent = activeGame.p2Sets;

  // Historial de Sets anteriores
  const historyContainer = document.getElementById("sets-history-container");
  historyContainer.innerHTML = "";
  
  if (activeGame.setsHistory.length > 0) {
    activeGame.setsHistory.forEach(set => {
      const setEl = document.createElement("span");
      setEl.className = "set-hist-val";
      setEl.innerHTML = `<span style="color: ${set.p1 > set.p2 ? 'var(--accent)' : 'inherit'}">${set.p1}</span>-<span style="color: ${set.p2 > set.p1 ? 'var(--accent)' : 'inherit'}">${set.p2}</span>`;
      historyContainer.appendChild(setEl);
    });
  }

  // Agregar el set actual al historial de forma visual si hay juegos (no aplica para formato 45 puntos)
  if (activeGame.format !== "3-games-45" && (activeGame.p1Games > 0 || activeGame.p2Games > 0)) {
    const currentSetEl = document.createElement("span");
    currentSetEl.className = "set-hist-val";
    currentSetEl.style.borderBottom = "2px solid var(--accent)";
    currentSetEl.innerHTML = `${activeGame.p1Games}-${activeGame.p2Games}`;
    historyContainer.appendChild(currentSetEl);
  }

  // Habilitar / deshabilitar Deshacer
  document.getElementById("btn-undo-point").disabled = activeGame.history.length === 0;
}

// Guardar snapshot de estado para deshacer
function pushToHistory() {
  const snapshot = {
    p1Score: activeGame.p1Score,
    p2Score: activeGame.p2Score,
    p1Games: activeGame.p1Games,
    p2Games: activeGame.p2Games,
    p1Sets: activeGame.p1Sets,
    p2Sets: activeGame.p2Sets,
    isTiebreak: activeGame.isTiebreak,
    tbP1Points: activeGame.tbP1Points,
    tbP2Points: activeGame.tbP2Points,
    setsHistory: JSON.parse(JSON.stringify(activeGame.setsHistory))
  };
  activeGame.history.push(snapshot);
}

function undoLastPoint() {
  if (!activeGame || activeGame.history.length === 0) return;

  const previousState = activeGame.history.pop();
  activeGame.p1Score = previousState.p1Score;
  activeGame.p2Score = previousState.p2Score;
  activeGame.p1Games = previousState.p1Games;
  activeGame.p2Games = previousState.p2Games;
  activeGame.p1Sets = previousState.p1Sets;
  activeGame.p2Sets = previousState.p2Sets;
  activeGame.isTiebreak = previousState.isTiebreak;
  activeGame.tbP1Points = previousState.tbP1Points;
  activeGame.tbP2Points = previousState.tbP2Points;
  activeGame.setsHistory = previousState.setsHistory;

  localStorage.setItem("tennistocles_active_game_session", JSON.stringify(activeGame));
  renderLiveScoreboard();
}

// Incrementar punto
function scorePoint(playerNum) {
  if (!activeGame) return;

  pushToHistory();

  if (activeGame.format === "3-games-45") {
    // LÓGICA DE JUEGO DE TENIS CON ESCALA 15-30-45
    if (playerNum === 1) {
      if (activeGame.p1Score === 3) { // 45
        if (activeGame.p2Score === 4) { // Ventaja P2
          activeGame.p2Score = 3; // Regresa a Deuce (45)
        } else if (activeGame.p2Score === 3) { // Deuce
          activeGame.p1Score = 4; // Ventaja P1
        } else { // P2 tiene 30 o menos
          winGame45(1);
        }
      } else if (activeGame.p1Score === 4) { // Ventaja P1 y anota
        winGame45(1);
      } else {
        activeGame.p1Score++; // 0 -> 15 -> 30 -> 45
      }
    } else {
      if (activeGame.p2Score === 3) { // 45
        if (activeGame.p1Score === 4) { // Ventaja P1
          activeGame.p1Score = 3; // Regresa a Deuce (45)
        } else if (activeGame.p1Score === 3) { // Deuce
          activeGame.p2Score = 4; // Ventaja P2
        } else { // P1 tiene 30 o menos
          winGame45(2);
        }
      } else if (activeGame.p2Score === 4) { // Ventaja P2 y anota
        winGame45(2);
      } else {
        activeGame.p2Score++; // 0 -> 15 -> 30 -> 45
      }
    }
  } else if (activeGame.isTiebreak) {
    // LÓGICA DE TIEBREAK (Numérica: 1, 2, 3...)
    if (playerNum === 1) {
      activeGame.tbP1Points++;
    } else {
      activeGame.tbP2Points++;
    }

    // Ganar Tiebreak: al menos 7 puntos y diferencia de 2
    const p1Pt = activeGame.tbP1Points;
    const p2Pt = activeGame.tbP2Points;

    if (p1Pt >= 7 && (p1Pt - p2Pt) >= 2) {
      winGame(1);
    } else if (p2Pt >= 7 && (p2Pt - p1Pt) >= 2) {
      winGame(2);
    }
  } else {
    // LÓGICA DE TENIS ESTÁNDAR (0 -> 15 -> 30 -> 40 -> Ad)
    if (playerNum === 1) {
      if (activeGame.p1Score === 3) { // 40
        if (activeGame.p2Score === 4) { // Ventaja P2
          activeGame.p2Score = 3; // Regresa a Deuce (40)
        } else if (activeGame.p2Score === 3) { // Deuce
          activeGame.p1Score = 4; // Ventaja P1
        } else { // P2 tiene 30 o menos
          winGame(1);
        }
      } else if (activeGame.p1Score === 4) { // Ventaja P1 y anota
        winGame(1);
      } else {
        activeGame.p1Score++; // 0 -> 15 -> 30 -> 40
      }
    } else {
      if (activeGame.p2Score === 3) { // 40
        if (activeGame.p1Score === 4) { // Ventaja P1
          activeGame.p1Score = 3; // Regresa a Deuce (40)
        } else if (activeGame.p1Score === 3) { // Deuce
          activeGame.p2Score = 4; // Ventaja P2
        } else { // P1 tiene 30 o menos
          winGame(2);
        }
      } else if (activeGame.p2Score === 4) { // Ventaja P2 y anota
        winGame(2);
      } else {
        activeGame.p2Score++; // 0 -> 15 -> 30 -> 40
      }
    }
  }

  localStorage.setItem("tennistocles_active_game_session", JSON.stringify(activeGame));
  renderLiveScoreboard();
}

function winGame(playerNum) {
  // Limpiar puntuaciones del game actual
  activeGame.p1Score = 0;
  activeGame.p2Score = 0;
  activeGame.isTiebreak = false;
  activeGame.tbP1Points = 0;
  activeGame.tbP2Points = 0;

  // Asignar el juego ganado
  if (playerNum === 1) {
    activeGame.p1Games++;
  } else {
    activeGame.p2Games++;
  }

  // Evaluar Set
  const g1 = activeGame.p1Games;
  const g2 = activeGame.p2Games;

  // Un set se gana con 6 juegos si hay diferencia de 2, o por tiebreak a los 7
  if (g1 >= 6 && (g1 - g2) >= 2) {
    winSet(1);
  } else if (g2 >= 6 && (g2 - g1) >= 2) {
    winSet(2);
  } else if (g1 === 6 && g2 === 6) {
    // Entrar a Tiebreak
    activeGame.isTiebreak = true;
  }
}

function winGame45(playerNum) {
  // Registrar en historial de sets (1-0 o 0-1 representando el juego ganado)
  activeGame.setsHistory.push({
    p1: playerNum === 1 ? 1 : 0,
    p2: playerNum === 2 ? 1 : 0
  });

  // Resetear puntuación
  activeGame.p1Score = 0;
  activeGame.p2Score = 0;

  // Asignar Set (juego de 45 ganado)
  if (playerNum === 1) {
    activeGame.p1Sets++;
  } else {
    activeGame.p2Sets++;
  }

  // Evaluar fin del partido (al mejor de 3 juegos de 45 -> se ganan 2)
  if (activeGame.p1Sets === 2) {
    finishGame(1);
  } else if (activeGame.p2Sets === 2) {
    finishGame(2);
  }
}

function winSet(playerNum) {
  // Registrar en historial de sets
  activeGame.setsHistory.push({
    p1: activeGame.p1Games,
    p2: activeGame.p2Games
  });

  // Resetear juegos del set
  activeGame.p1Games = 0;
  activeGame.p2Games = 0;

  // Asignar Set
  if (playerNum === 1) {
    activeGame.p1Sets++;
  } else {
    activeGame.p2Sets++;
  }

  // Evaluar fin del partido (Mejor de 3 sets o Set Único)
  const maxSets = activeGame.format === "1-set" ? 1 : 2;
  if (activeGame.p1Sets === maxSets) {
    finishGame(1);
  } else if (activeGame.p2Sets === maxSets) {
    finishGame(2);
  }
}

async function finishGame(winnerNum) {
  const winner = winnerNum === 1 ? activeGame.p1 : activeGame.p2;
  const loser = winnerNum === 1 ? activeGame.p2 : activeGame.p1;

  // Chistes aleatorios
  const randomWinnerJoke = WINNER_JOKES[Math.floor(Math.random() * WINNER_JOKES.length)];
  const randomLoserJoke = LOSER_JOKES[Math.floor(Math.random() * LOSER_JOKES.length)];
  const jokeText = `🏆 Para el campeón (${winner.name}): "${randomWinnerJoke}"\n\n💪 Para el perdedor (${loser.name}): "${randomLoserJoke}"`;

  // Historial de sets
  let setsDetailHtml = "";
  if (activeGame.setsHistory && activeGame.setsHistory.length > 0) {
    setsDetailHtml = activeGame.setsHistory.map(s => `${s.p1}-${s.p2}`).join(", ");
  }

  const messageHtml = `
    ¡Felicidades a <strong>${escapeHTML(winner.name)}</strong> por llevarse la victoria!<br><br>
    <strong>Marcador Final:</strong> ${activeGame.p1Sets} - ${activeGame.p2Sets}<br>
    <span style="font-size:12px; color:var(--text-muted);">Historial de sets: ${setsDetailHtml}</span>
  `;

  // Guardar datos temporales para cuando cierre el modal
  const savedTournamentMeta = activeGame.tournamentMeta;
  const gameRecord = {
    player1Id: activeGame.p1.id,
    player2Id: activeGame.p2.id,
    player1Name: activeGame.p1.name,
    player2Name: activeGame.p2.name,
    score: {
      p1Sets: activeGame.p1Sets,
      p2Sets: activeGame.p2Sets,
      setsHistory: activeGame.setsHistory
    },
    status: "finished",
    winnerId: winner.id
  };

  showAppModal("¡Partido Concluido!", messageHtml, jokeText, "🏆", async () => {
    // Guardar en la base de datos
    await db.saveGame(gameRecord);

    // Si este partido pertenecía a un torneo, avanzar el torneo
    if (savedTournamentMeta) {
      await advanceTournamentMatch(savedTournamentMeta, winner.id, gameRecord.score);
    }

    // Limpiar sesión de juego activo
    activeGame = null;
    localStorage.removeItem("tennistocles_active_game_session");

    // Mostrar el panel correcto
    if (savedTournamentMeta) {
      showView("view-tournaments");
    } else {
      // Volver a configurar juego y recargar historial
      document.getElementById("game-live-card").classList.add("hidden");
      document.getElementById("game-setup-card").classList.remove("hidden");
      await loadAndRenderGames();
    }
  });
}

function forceFinishGame() {
  if (!activeGame) return;

  // Quién tiene más sets, o si están iguales en sets, quién tiene más games en el actual
  let winnerNum = 1;
  if (activeGame.format === "3-games-45") {
    if (activeGame.p2Sets > activeGame.p1Sets) {
      winnerNum = 2;
    } else if (activeGame.p1Sets === activeGame.p2Sets) {
      if (activeGame.p2Score > activeGame.p1Score) {
        winnerNum = 2;
      }
    }
    // Añadir set incompleto actual (juego de 45 activo) al historial
    const leaderNum = activeGame.p2Score > activeGame.p1Score ? 2 : 1;
    activeGame.setsHistory.push({
      p1: leaderNum === 1 ? 1 : 0,
      p2: leaderNum === 2 ? 1 : 0
    });
  } else {
    if (activeGame.p2Sets > activeGame.p1Sets) {
      winnerNum = 2;
    } else if (activeGame.p1Sets === activeGame.p2Sets) {
      if (activeGame.p2Games > activeGame.p1Games) {
        winnerNum = 2;
      } else if (activeGame.p1Games === activeGame.p2Games) {
        // Desempate por puntos en el game
        if (activeGame.isTiebreak) {
          if (activeGame.tbP2Points > activeGame.tbP1Points) winnerNum = 2;
        } else {
          if (activeGame.p2Score > activeGame.p1Score) winnerNum = 2;
        }
      }
    }
    // Añadir set incompleto actual al historial
    activeGame.setsHistory.push({
      p1: activeGame.p1Games,
      p2: activeGame.p2Games
    });
  }

  finishGame(winnerNum);
}

// Renderizar historial de juegos rápidos
async function loadAndRenderGames() {
  const games = await db.getGames();
  const container = document.getElementById("games-list");
  container.innerHTML = "";

  if (games.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No hay partidos registrados en el historial.</p></div>`;
    return;
  }

  games.forEach(game => {
    const card = document.createElement("div");
    card.className = "game-history-card";

    // Formatear score
    const p1Sets = game.score.p1Sets;
    const p2Sets = game.score.p2Sets;
    const isP1Winner = game.winnerId === game.player1Id;
    const isP2Winner = game.winnerId === game.player2Id;

    let setsDetailHtml = "";
    if (game.score.setsHistory && game.score.setsHistory.length > 0) {
      setsDetailHtml = game.score.setsHistory.map(s => `${s.p1}-${s.p2}`).join(", ");
    }

    card.innerHTML = `
      <div class="gh-players">
        <div class="gh-player ${isP1Winner ? 'winner' : ''}">
          <span>${escapeHTML(game.player1Name)}</span>
          ${isP1Winner ? '<span class="winner-crown">👑</span>' : ''}
        </div>
        <div class="gh-player ${isP2Winner ? 'winner' : ''}">
          <span>${escapeHTML(game.player2Name)}</span>
          ${isP2Winner ? '<span class="winner-crown">👑</span>' : ''}
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
          ${setsDetailHtml}
        </div>
      </div>
      <div class="gh-score">
        ${p1Sets}-${p2Sets}
      </div>
    `;
    container.appendChild(card);
  });
}

// ==========================================
// LÓGICA DE TORNEOS
// ==========================================
async function createTournament(name, size, format = "3-sets", isDoubles = false) {
  if (size < 2) {
    showAppModal("Error de Creación", "Se requieren al menos 2 competidores para crear un torneo.", "", "⚠️");
    return;
  }
  const playersNeeded = isDoubles ? size * 2 : size;

  // Validar si hay suficientes jugadores
  if (playersList.length < playersNeeded) {
    showAppModal("Error de Capacidad", `Se requieren al menos ${playersNeeded} jugadores registrados para este torneo de modalidad ${isDoubles ? 'Dobles' : 'Individuales'}. Actualmente tienes ${playersList.length}.`, "", "⚠️");
    return;
  }

  // 1. Elegir automáticamente a los mejores jugadores según su puntaje
  // Ordenar por estrellas de mayor a menor y por fecha de creación como fallback
  const sortedPlayers = [...playersList].sort((a, b) => {
    if (b.stars !== a.stars) {
      return b.stars - a.stars;
    }
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  const selectedPlayers = sortedPlayers.slice(0, playersNeeded);

  // Mapear a competidores (Individuales o Parejas balanceadas)
  let competitors = [];
  if (isDoubles) {
    for (let i = 0; i < size; i++) {
      const pA = selectedPlayers[i];
      const pB = selectedPlayers[2 * size - 1 - i];
      competitors.push({
        id: `team_${pA.id}_${pB.id}`,
        name: `${pA.name} / ${pB.name}`,
        stars: Math.round((pA.stars + pB.stars) / 2)
      });
    }
  } else {
    competitors = selectedPlayers;
  }

  // Calcular la siguiente potencia de 2 (P)
  let P = 2;
  while (P < size) {
    P *= 2;
  }

  // Obtener el orden de cabezas de serie para tamaño P
  const seedOrder = getSeedOrder(P);

  // Crear partidos de la Ronda 0
  const matchesRound0 = [];
  for (let m = 0; m < P / 2; m++) {
    const s1 = seedOrder[2 * m];
    const s2 = seedOrder[2 * m + 1];
    const p1 = s1 <= size ? competitors[s1 - 1] : null;
    const p2 = s2 <= size ? competitors[s2 - 1] : null;
    matchesRound0.push(createBracketMatch(p1, p2));
  }

  // Estructura de Rondas
  const rounds = [matchesRound0];
  let numMatches = P / 4;
  while (numMatches >= 1) {
    const roundMatches = [];
    for (let i = 0; i < numMatches; i++) {
      roundMatches.push(createEmptyBracketMatch());
    }
    rounds.push(roundMatches);
    numMatches /= 2;
  }

  // Resolver exenciones (Byes) de la Ronda 0
  if (size < P) {
    rounds[0].forEach((match, matchIdx) => {
      if (match.player1 && !match.player2) {
        match.status = "finished";
        match.winnerId = match.player1.id;
        match.score = { p1Sets: 1, p2Sets: 0 };
        advanceWinnerInLocalRounds(rounds, 0, matchIdx, match.player1.id, match.player1.name);
      } else if (!match.player1 && match.player2) {
        match.status = "finished";
        match.winnerId = match.player2.id;
        match.score = { p1Sets: 0, p2Sets: 1 };
        advanceWinnerInLocalRounds(rounds, 0, matchIdx, match.player2.id, match.player2.name);
      }
    });
  }

  const newTournament = {
    name: name,
    size: size,
    format: format,
    players: selectedPlayers.map(p => p.id),
    rounds: rounds,
    status: "active",
    winnerId: null
  };

  const saved = await db.saveTournament(newTournament);
  activeTournament = saved;
  localStorage.setItem("tennistocles_active_tournament_session", JSON.stringify(activeTournament));

  // Resetear formulario
  document.getElementById("tournament-name").value = "";

  // Mostrar el cuadro del torneo
  document.getElementById("tournament-setup-card").classList.add("hidden");
  document.getElementById("tournament-active-card").classList.remove("hidden");
  
  renderActiveTournament();
}

function getSeedOrder(p) {
  let order = [1];
  while (order.length < p) {
    const nextOrder = [];
    const len = order.length;
    for (let i = 0; i < len; i++) {
      nextOrder.push(order[i]);
      nextOrder.push(2 * len + 1 - order[i]);
    }
    order = nextOrder;
  }
  return order;
}

function advanceWinnerInLocalRounds(rounds, roundIdx, matchIdx, winnerId, winnerName) {
  const nextRoundIdx = roundIdx + 1;
  if (nextRoundIdx < rounds.length) {
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const nextMatch = rounds[nextRoundIdx][nextMatchIdx];
    const isFirstSlot = matchIdx % 2 === 0;

    if (isFirstSlot) {
      nextMatch.player1 = { id: winnerId, name: winnerName };
    } else {
      nextMatch.player2 = { id: winnerId, name: winnerName };
    }
    nextMatch.status = "pending";
  }
}

function createBracketMatch(p1, p2) {
  return {
    id: 'm_' + Math.random().toString(36).substr(2, 9),
    player1: p1 ? { id: p1.id, name: p1.name } : null,
    player2: p2 ? { id: p2.id, name: p2.name } : null,
    score: null, // { p1Sets, p2Sets }
    winnerId: null,
    status: "pending" // pending | playing | finished
  };
}

function createEmptyBracketMatch() {
  return createBracketMatch(null, null);
}

// Dibujar el cuadro (bracket) del torneo activo
function renderActiveTournament() {
  if (!activeTournament) return;

  document.getElementById("t-active-name").textContent = activeTournament.name;

  const bracketContainer = document.getElementById("bracket-container");
  bracketContainer.innerHTML = "";

  // Determinar los títulos de ronda dinámicamente según la cantidad de rondas
  const totalRounds = activeTournament.rounds.length;
  const getRoundName = (roundIdx) => {
    const roundsFromFinal = totalRounds - 1 - roundIdx;
    if (roundsFromFinal === 0) return "Final";
    if (roundsFromFinal === 1) return "Semifinales";
    if (roundsFromFinal === 2) return "Cuartos de final";
    if (roundsFromFinal === 3) return "Octavos de final";
    return `Ronda ${roundIdx + 1}`;
  };

  activeTournament.rounds.forEach((round, roundIdx) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = "bracket-round";
    
    // Título de la ronda
    const roundTitle = document.createElement("div");
    roundTitle.className = "bracket-round-name";
    roundTitle.textContent = getRoundName(roundIdx);
    roundDiv.appendChild(roundTitle);

    round.forEach((match, matchIdx) => {
      const matchDiv = document.createElement("div");
      matchDiv.className = "bracket-match";
      
      const p1 = match.player1;
      const p2 = match.player2;
      const hasBothPlayers = p1 && p2;
      const isFinished = match.status === "finished";

      if (hasBothPlayers && !isFinished) {
        matchDiv.classList.add("clickable");
        matchDiv.title = "Toca para jugar este partido";
      }

      // Clases para ganadores/perdedores
      const p1Winner = isFinished && match.winnerId === p1?.id;
      const p2Winner = isFinished && match.winnerId === p2?.id;

      const p1Class = p1Winner ? "bm-player winner" : (isFinished ? "bm-player loser" : "bm-player");
      const p2Class = p2Winner ? "bm-player winner" : (isFinished ? "bm-player loser" : "bm-player");

      const p1ScoreVal = isFinished ? match.score.p1Sets : "";
      const p2ScoreVal = isFinished ? match.score.p2Sets : "";

      const p1NameHtml = p1 ? escapeHTML(p1.name) : (isFinished ? "(BYE)" : "<i>Por definir</i>");
      const p2NameHtml = p2 ? escapeHTML(p2.name) : (isFinished ? "(BYE)" : "<i>Por definir</i>");

      matchDiv.innerHTML = `
        <div class="${p1Class}">
          <span class="bm-player-name">${p1NameHtml}</span>
          <span class="bm-player-score">${p1ScoreVal}</span>
        </div>
        <div class="vs-divider" style="margin: 0; font-size: 10px;">VS</div>
        <div class="${p2Class}">
          <span class="bm-player-name">${p2NameHtml}</span>
          <span class="bm-player-score">${p2ScoreVal}</span>
        </div>
      `;

      // Si es clickeable, preguntar si jugar en vivo o ingresar resultado manual
      if (hasBothPlayers && !isFinished) {
        matchDiv.addEventListener("click", () => {
          const choice = confirm(`¿Deseas jugar este partido con el Marcador en Vivo?\n\nPresiona [Aceptar] para ir al Marcador en Vivo.\nPresiona [Cancelar] para registrar el resultado de forma manual.`);
          if (choice) {
            // Ir al marcador en vivo
            showView("view-quick-game");
            startNewGame(p1, p2, {
              tournamentId: activeTournament.id,
              roundIdx: roundIdx,
              matchIdx: matchIdx
            }, activeTournament.format);
          } else {
            // Registro manual del resultado
            const winnerChoice = prompt(`¿Quién ganó el partido?\n\nEscribe "1" para: ${p1.name}\nEscribe "2" para: ${p2.name}`);
            if (winnerChoice === "1" || winnerChoice === "2") {
              const winnerNum = parseInt(winnerChoice);
              const maxSets = activeTournament.format === "1-set" ? 1 : 2;
              const defaultScore = winnerNum === 1 ? `${maxSets}-0` : `0-${maxSets}`;
              const scoreStr = prompt(`Ingresa el resultado final de Sets (ej. 2-0, 2-1, 1-0):`, defaultScore);
              if (scoreStr) {
                const parts = scoreStr.split("-").map(Number);
                const p1Sets = isNaN(parts[0]) ? 0 : parts[0];
                const p2Sets = isNaN(parts[1]) ? 0 : parts[1];
                const winnerId = winnerNum === 1 ? p1.id : p2.id;
                
                advanceTournamentMatch({
                  tournamentId: activeTournament.id,
                  roundIdx: roundIdx,
                  matchIdx: matchIdx
                }, winnerId, { p1Sets, p2Sets });
              }
            }
          }
        });
      }

      roundDiv.appendChild(matchDiv);
    });

    bracketContainer.appendChild(roundDiv);
  });

  // Mostrar pancarta de Campeón si el torneo finalizó
  if (activeTournament.status === "finished") {
    const winnerPlayer = playersList.find(p => p.id === activeTournament.winnerId);
    if (winnerPlayer) {
      const winnerBanner = document.createElement("div");
      winnerBanner.className = "bracket-winner-banner";
      winnerBanner.innerHTML = `
        <h4>🏆 Campeón del Torneo 🏆</h4>
        <p>${escapeHTML(winnerPlayer.name)}</p>
      `;
      bracketContainer.appendChild(winnerBanner);
    }
  }
}

// Avanzar partido y re-escribir llaves en el torneo
async function advanceTournamentMatch(meta, winnerId, score) {
  if (!activeTournament || activeTournament.id !== meta.tournamentId) return;

  const round = activeTournament.rounds[meta.roundIdx];
  const match = round[meta.matchIdx];

  // Actualizar el partido
  match.score = score;
  match.winnerId = winnerId;
  match.status = "finished";

  // Buscar el siguiente partido al que avanza el ganador
  const nextRoundIdx = meta.roundIdx + 1;
  if (nextRoundIdx < activeTournament.rounds.length) {
    const nextMatchIdx = Math.floor(meta.matchIdx / 2);
    const nextMatch = activeTournament.rounds[nextRoundIdx][nextMatchIdx];
    const isFirstSlot = meta.matchIdx % 2 === 0;

    const winnerName = match.player1.id === winnerId ? match.player1.name : match.player2.name;

    if (isFirstSlot) {
      nextMatch.player1 = { id: winnerId, name: winnerName };
    } else {
      nextMatch.player2 = { id: winnerId, name: winnerName };
    }
    nextMatch.status = "pending";
  } else {
    // Si fue el partido final de la última ronda, terminar el torneo
    activeTournament.status = "finished";
    activeTournament.winnerId = winnerId;
  }

  // Guardar torneo actualizado
  await db.saveTournament(activeTournament);
  localStorage.setItem("tennistocles_active_tournament_session", JSON.stringify(activeTournament));

  // Volver a renderizar
  renderActiveTournament();
}

// Cargar lista de torneos históricos
async function loadAndRenderTournaments() {
  const tournaments = await db.getTournaments();
  const container = document.getElementById("tournaments-list");
  container.innerHTML = "";

  if (tournaments.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No hay torneos registrados en el historial.</p></div>`;
    return;
  }

  tournaments.forEach(tournament => {
    const card = document.createElement("div");
    card.className = "player-item"; // Usamos los mismos estilos base de ítems para ahorrar código CSS
    
    const isFinished = tournament.status === "finished";
    const statusText = isFinished ? "Finalizado" : "En Progreso";
    const statusClass = isFinished ? "color: var(--success)" : "color: var(--accent)";

    // Encontrar ganador si finalizó
    let winnerName = "";
    if (isFinished && tournament.winnerId) {
      // Podría no estar en playersList temporal si se borró, pero intentamos buscar
      const winner = playersList.find(p => p.id === tournament.winnerId);
      winnerName = winner ? ` - Campeón: ${winner.name}` : "";
    }

    card.innerHTML = `
      <div class="player-info">
        <span class="player-name-lbl">${escapeHTML(tournament.name)}</span>
        <span style="font-size:12px; ${statusClass}; font-weight:600;">
          ${statusText} ${winnerName}
        </span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-sm btn-resume" style="padding: 6px 12px; border-radius: 8px;">Ver</button>
        <button class="btn-delete" title="Eliminar torneo">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;

    // Reanudar/Ver el torneo seleccionado
    card.querySelector(".btn-resume").addEventListener("click", () => {
      activeTournament = tournament;
      localStorage.setItem("tennistocles_active_tournament_session", JSON.stringify(activeTournament));
      document.getElementById("tournament-setup-card").classList.add("hidden");
      document.getElementById("tournament-active-card").classList.remove("hidden");
      renderActiveTournament();
    });

    // Eliminar torneo del historial
    card.querySelector(".btn-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`¿Estás seguro de eliminar el torneo "${tournament.name}"?`)) {
        await db.deleteTournament(tournament.id);
        if (activeTournament && activeTournament.id === tournament.id) {
          activeTournament = null;
          localStorage.removeItem("tennistocles_active_tournament_session");
          document.getElementById("tournament-active-card").classList.add("hidden");
          document.getElementById("tournament-setup-card").classList.remove("hidden");
        }
        await loadAndRenderTournaments();
      }
    });

    container.appendChild(card);
  });
}

// ==========================================
// AUXILIARES
// ==========================================

// Repertorio de frases humorísticas e ingeniosas para el fin de partido
const WINNER_JOKES = [
  "¡Felicidades! Roger Federer ha estado llamando, quiere que le devuelvas sus superpoderes.",
  "¡Increíble victoria! Has corrido tanto que tu sombra todavía está intentando alcanzarte en la cancha.",
  "¡Victoria aplastante! Los científicos están analizando tus golpes para ver si rompen las leyes de la gravedad.",
  "¡Qué partidazo! Has ganado con tanta clase que la raqueta de tu rival está pidiendo un autógrafo.",
  "¡Ganador indiscutible! Tu oponente ya está buscando tutoriales de ping-pong para cambiarse de deporte.",
  "¡Magnífico triunfo! Dicen que la bola viajó tan rápido que pasó por tres zonas horarias diferentes.",
  "¡Campeón! Tu nivel de juego hoy fue tan alto que la red del medio parecía un simple dibujo en el suelo."
];

const LOSER_JOKES = [
  "Corriste con mucha dignidad, pero tu raqueta parecía tener un agujero negro invisible en el centro.",
  "Buen intento. Recuerda: en el tenis, el viento siempre sopla en contra de quien va perdiendo... ¡y hoy sopló un huracán!",
  "Buen partido. Para el próximo, intenta no golpear las bolas con los ojos cerrados... ¡ayuda bastante!",
  "No te preocupes por la derrota. La gravedad terrestre claramente estaba saboteando la trayectoria de tu bola.",
  "Bueno, al menos sudaste la camiseta. Tu raqueta ya está redactando una carta de disculpas formal.",
  "¡Buen esfuerzo! La buena noticia es que tu nivel de frustración ha alcanzado el nivel de un profesional.",
  "Recuerda que lo importante es participar... y darle algo de esperanza a tu rival de vez en cuando."
];

// Función para mostrar el modal dinámico premium en lugar del alert nativo
function showAppModal(title, message, jokeText = '', icon = '🏆', onClose = null) {
  const modal = document.getElementById("custom-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalMessage = document.getElementById("modal-message");
  const modalIcon = document.getElementById("modal-icon");
  const modalJokeBox = document.getElementById("modal-joke-box");
  const modalJokeText = document.getElementById("modal-joke-text");
  const btnClose = document.getElementById("btn-close-modal");

  modalTitle.textContent = title;
  modalMessage.innerHTML = message; // Permitir HTML para saltos de línea elegantes
  modalIcon.textContent = icon;

  if (jokeText) {
    modalJokeText.innerHTML = jokeText.replace(/\n/g, "<br>");
    modalJokeBox.classList.remove("hidden");
  } else {
    modalJokeBox.classList.add("hidden");
  }

  modal.classList.remove("hidden");

  // Eliminar listeners previos del botón
  const newBtnClose = btnClose.cloneNode(true);
  btnClose.parentNode.replaceChild(newBtnClose, btnClose);

  newBtnClose.addEventListener("click", () => {
    modal.classList.add("hidden");
    if (onClose && typeof onClose === "function") {
      onClose();
    }
  });
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
