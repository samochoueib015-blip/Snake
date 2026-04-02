
    var wrapperEl = null;
    var canvas = null;
    var ctx = null;

    var menuPanelEl = null;
    var multiplayerPanelEl = null;
    var lobbyPanelEl = null;
    var gamePanelEl = null;

    var singleInfoEl = null;
    var twoInfoEl = null;
    var onlineInfoEl = null;
    var controlsTextEl = null;
    var statusEl = null;

    var scoreEl = null;
    var levelEl = null;
    var highscoreEl = null;
    var recordNameEl = null;

    var scoreP1El = null;
    var scoreP2El = null;

    var menuHighscoreEl = null;
    var menuRecordNameEl = null;

    var roomListEl = null;
    var nicknameInputEl = null;
    var roomNameInputEl = null;
    var multiplayerStatusEl = null;
    var lobbyRoomNameEl = null;
    var lobbyOwnerNameEl = null;
    var lobbyStatusTextEl = null;
    var lobbyPlayerListEl = null;
    var lobbyStartButtonEl = null;
    var onlineRoomNameEl = null;
    var onlineNicknameEl = null;
    var onlinePlayerSummaryEl = null;
    var localActionsEl = null;
    var onlineActionsEl = null;
    var rematchButtonEl = null;

    var gridSize = 24;
    var tileCount = 20;

    var gameMode = 0;

    var snake1 = null;
    var snake2 = null;

    var direction1 = null;
    var direction2 = null;

    var nextDirection1 = null;
    var nextDirection2 = null;

    var food = null;
    var gameOver = false;
    var loopId = null;

    var currentLevel = 1;
    var speed = 180;
    var levelSpeeds = [180, 165, 150, 135, 120, 105, 95, 85, 75, 65];
    var twoPlayerSpeed = 125;

    var highscore = 1;
    var highscoreName = "Unbekannt";
    var highscoreStorageKey = "snakeHighscoreData";

    var socket = null;
    var socketConnected = false;
    var socketConnecting = false;
    var localPlayerId = "";
    var currentRoom = null;
    var roomList = [];
    var onlineGameState = null;
    var onlineCountdownTimer = null;
    var multiplayerNicknameStorageKey = "snakeMultiplayerNickname";
    var onlineLeaveTarget = "";

    function setElementText(el, value) {
      if (!el) {
        return;
      }

      if (typeof el.innerText !== "undefined") {
        el.innerText = value;
      } else if (typeof el.textContent !== "undefined") {
        el.textContent = value;
      } else {
        el.innerHTML = value;
      }
    }

    function setElementHtml(el, value) {
      if (!el) {
        return;
      }
      el.innerHTML = value;
    }

    function htmlEscape(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function copyDirection(dir) {
      return {
        x: dir.x,
        y: dir.y
      };
    }

    function positionsEqual(a, b) {
      return a.x === b.x && a.y === b.y;
    }

    function wrapPosition(pos) {
      if (pos.x < 0) pos.x = tileCount - 1;
      if (pos.x >= tileCount) pos.x = 0;
      if (pos.y < 0) pos.y = tileCount - 1;
      if (pos.y >= tileCount) pos.y = 0;
      return pos;
    }

    function isPositionInSnake(pos, snake, ignoreTail) {
      var i;
      var max = snake.length;

      if (ignoreTail && max > 0) {
        max = max - 1;
      }

      for (i = 0; i < max; i++) {
        if (snake[i].x === pos.x && snake[i].y === pos.y) {
          return true;
        }
      }

      return false;
    }

    function initHighscoreFilePath() {
    }

    function updateRecordDisplay() {
      setElementText(highscoreEl, highscore);
      setElementText(recordNameEl, highscoreName);
      setElementText(menuHighscoreEl, highscore);
      setElementText(menuRecordNameEl, highscoreName);
    }

    function loadHighscore() {
      var content;
      var parts;
      var parsedScore;
      var parsedName;

      try {
        content = window.localStorage ? localStorage.getItem(highscoreStorageKey) : null;

        if (content === null || typeof content === "undefined" || content === "") {
          highscore = 1;
          highscoreName = "Unbekannt";
          saveHighscore();
          return;
        }

        content = String(content).replace(/^\s+|\s+$/g, "");

        if (content.indexOf("|") !== -1) {
          parts = content.split("|");
          parsedName = parts[0];
          parsedScore = parseInt(parts[1], 10);

          if (!parsedName || parsedName.replace(/\s+/g, "") === "") {
            parsedName = "Unbekannt";
          }

          if (isNaN(parsedScore) || parsedScore < 1) {
            parsedScore = 1;
          }

          highscoreName = parsedName;
          highscore = parsedScore;
        } else {
          parsedScore = parseInt(content, 10);

          if (isNaN(parsedScore) || parsedScore < 1) {
            parsedScore = 1;
          }

          highscore = parsedScore;
          highscoreName = "Unbekannt";
          saveHighscore();
        }
      } catch (e) {
        highscore = 1;
        highscoreName = "Unbekannt";
      }
    }

    function saveHighscore() {
      try {
        if (!window.localStorage) {
          return;
        }

        localStorage.setItem(highscoreStorageKey, String(highscoreName) + "|" + String(highscore));
      } catch (e) {
      }
    }

    function loadSavedNickname() {
      var name = "";

      try {
        if (window.localStorage) {
          name = localStorage.getItem(multiplayerNicknameStorageKey) || "";
        }
      } catch (e) {
        name = "";
      }

      if (!name) {
        name = "Spieler" + Math.floor(Math.random() * 900 + 100);
      }

      if (nicknameInputEl) {
        nicknameInputEl.value = name;
      }
    }

    function saveNickname() {
      try {
        if (window.localStorage && nicknameInputEl) {
          localStorage.setItem(multiplayerNicknameStorageKey, sanitizeNickname(nicknameInputEl.value));
        }
      } catch (e) {
      }
    }

    function sanitizeNickname(name) {
      name = String(name || "").replace(/^\s+|\s+$/g, "");
      name = name.replace(/[\r\n]+/g, " ");
      if (name === "") {
        name = "Anonym";
      }
      if (name.length > 20) {
        name = name.substring(0, 20);
      }
      return name;
    }

    function sanitizeRoomName(name) {
      name = String(name || "").replace(/^\s+|\s+$/g, "");
      name = name.replace(/[\r\n]+/g, " ");
      if (name.length > 30) {
        name = name.substring(0, 30);
      }
      return name;
    }

    function initCanvasContext() {
      if (!canvas || typeof canvas.getContext !== "function") {
        alert("Dein Browser unterstützt Canvas nicht. Bitte öffne die Seite in einem modernen Browser.");
        return false;
      }

      try {
        ctx = canvas.getContext("2d");
      } catch (e) {
        alert("Canvas konnte nicht initialisiert werden.");
        return false;
      }

      if (!ctx) {
        alert("Canvas konnte nicht initialisiert werden.");
        return false;
      }

      return true;
    }

    function resizeWindowForGame() {
      return;
    }

    function hideAllPanels() {
      if (menuPanelEl) menuPanelEl.style.display = "none";
      if (multiplayerPanelEl) multiplayerPanelEl.style.display = "none";
      if (lobbyPanelEl) lobbyPanelEl.style.display = "none";
      if (gamePanelEl) gamePanelEl.style.display = "none";
    }

    function setWrapperWidth(width) {
      if (wrapperEl) {
        wrapperEl.style.width = width + "px";
      }
    }

    function configureBoardForMode() {
      if (!canvas || !wrapperEl) {
        return;
      }

      if (gameMode === 1) {
        gridSize = 24;
        tileCount = 20;
        canvas.width = gridSize * tileCount;
        canvas.height = gridSize * tileCount;
        setWrapperWidth(560);
      } else if (gameMode === 2 || gameMode === 3) {
        gridSize = 16;
        tileCount = 40;
        canvas.width = gridSize * tileCount;
        canvas.height = gridSize * tileCount;
        setWrapperWidth(740);
      }

      if (!initCanvasContext()) {
        return;
      }
      resizeWindowForGame();
    }

    function clearOnlineCountdown() {
      if (onlineCountdownTimer !== null) {
        clearInterval(onlineCountdownTimer);
        onlineCountdownTimer = null;
      }
    }

    function showMainMenu() {
      gameMode = 0;
      gameOver = true;

      if (loopId !== null) {
        clearInterval(loopId);
        loopId = null;
      }

      clearOnlineCountdown();
      hideAllPanels();

      if (menuPanelEl) {
        menuPanelEl.style.display = "block";
      }

      setWrapperWidth(560);
      updateRecordDisplay();
    }

    function showMultiplayerBrowser() {
      gameMode = 0;
      hideAllPanels();
      if (multiplayerPanelEl) {
        multiplayerPanelEl.style.display = "block";
      }
      setWrapperWidth(740);
      setElementText(multiplayerStatusEl, socketConnected ? "Verbunden." : "Verbinde mit Server...");
    }

    function showMultiplayerLobby() {
      gameMode = 0;
      hideAllPanels();
      if (lobbyPanelEl) {
        lobbyPanelEl.style.display = "block";
      }
      setWrapperWidth(740);
      renderLobby();
    }

    function showLocalGamePanel() {
      hideAllPanels();
      if (gamePanelEl) {
        gamePanelEl.style.display = "block";
      }

      if (localActionsEl) localActionsEl.style.display = "block";
      if (onlineActionsEl) onlineActionsEl.style.display = "none";

      if (gameMode === 1) {
        if (singleInfoEl) singleInfoEl.style.display = "block";
        if (twoInfoEl) twoInfoEl.style.display = "none";
        if (onlineInfoEl) onlineInfoEl.style.display = "none";
        setElementText(controlsTextEl, "Steuerung: W A S D, Pfeiltasten oder NUM-Pad 8 4 5 6 | Neustart: Leertaste");
      } else if (gameMode === 2) {
        if (singleInfoEl) singleInfoEl.style.display = "none";
        if (twoInfoEl) twoInfoEl.style.display = "block";
        if (onlineInfoEl) onlineInfoEl.style.display = "none";
        setElementText(controlsTextEl, "2 Spieler: Spieler 1 = Pfeiltasten oder NUM-Pad 8 4 5 6 | Spieler 2 = W A S D | Neustart: Leertaste");
      }
    }

    function showOnlineGamePanel() {
      gameMode = 3;
      configureBoardForMode();
      hideAllPanels();
      if (gamePanelEl) {
        gamePanelEl.style.display = "block";
      }

      if (singleInfoEl) singleInfoEl.style.display = "none";
      if (twoInfoEl) twoInfoEl.style.display = "none";
      if (onlineInfoEl) onlineInfoEl.style.display = "block";
      if (localActionsEl) localActionsEl.style.display = "none";
      setElementText(controlsTextEl, "Online-Steuerung: W A S D, Pfeiltasten oder NUM-Pad 8 4 5 6");
      updateOnlinePanels();
    }

    function updateOnlinePanels() {
      var i;
      var html = "";
      var roomPlayers;
      var player;
      var marker;
      var rematchVisible = false;

      if (!currentRoom) {
        return;
      }

      setElementText(onlineRoomNameEl, currentRoom.name || "-");
      setElementText(onlineNicknameEl, getLocalNickname());

      roomPlayers = currentRoom.players || [];
      for (i = 0; i < roomPlayers.length; i++) {
        player = roomPlayers[i];
        marker = [];

        if (player.id === currentRoom.ownerId) {
          marker.push("Ersteller");
        }
        if (player.id === localPlayerId) {
          marker.push("Du");
        }
        if (player.alive === false && currentRoom.state === "playing") {
          marker.push("ausgeschieden");
        }
        if (player.rematch) {
          marker.push("Revanche");
        }

        html += '<div><span class="player-color" style="background:' + htmlEscape(player.color) + ';"></span>' +
          htmlEscape(player.nickname) + ' (' + player.length + ')' +
          (marker.length ? ' - ' + htmlEscape(marker.join(', ')) : '') +
          '</div>';
      }

      setElementHtml(onlinePlayerSummaryEl, html);

      rematchVisible = currentRoom.state === "finished";
      if (onlineActionsEl) {
        onlineActionsEl.style.display = rematchVisible ? "block" : "none";
      }
      if (rematchButtonEl) {
        rematchButtonEl.disabled = !rematchVisible || isLocalPlayerRematchReady();
      }
    }

    function renderLobby() {
      var i;
      var roomPlayers;
      var player;
      var html = "";
      var ownerName = "-";
      var statusText = "Warten auf Spieler";
      var canStart = false;

      if (!currentRoom) {
        return;
      }

      setElementText(lobbyRoomNameEl, currentRoom.name || "-");

      roomPlayers = currentRoom.players || [];
      for (i = 0; i < roomPlayers.length; i++) {
        player = roomPlayers[i];
        if (player.id === currentRoom.ownerId) {
          ownerName = player.nickname;
        }

        html += '<li>' +
          '<span><span class="player-color" style="background:' + htmlEscape(player.color) + ';"></span>' + htmlEscape(player.nickname) + '</span>' +
          '<span>' +
          (player.id === currentRoom.ownerId ? '<span class="owner-badge">Ersteller</span>' : '') +
          (player.id === localPlayerId ? (player.id === currentRoom.ownerId ? ' | ' : '') + '<span class="online-badge">Du</span>' : '') +
          '</span>' +
          '</li>';
      }

      if (!html) {
        html = '<li>Keine Spieler im Raum.</li>';
      }

      if (currentRoom.state === "lobby") {
        statusText = roomPlayers.length >= 2 ? "Bereit zum Start" : "Warten auf mindestens 2 Spieler";
      } else if (currentRoom.state === "playing") {
        statusText = "Spiel läuft";
      } else if (currentRoom.state === "finished") {
        statusText = "Match beendet";
      }

      setElementText(lobbyOwnerNameEl, ownerName);
      setElementText(lobbyStatusTextEl, statusText);
      setElementHtml(lobbyPlayerListEl, html);

      canStart = currentRoom.state === "lobby" && currentRoom.ownerId === localPlayerId && roomPlayers.length >= 2;
      if (lobbyStartButtonEl) {
        lobbyStartButtonEl.disabled = !canStart;
      }
    }

    function renderRoomList() {
      var i;
      var room;
      var html = "";

      if (!roomListEl) {
        return;
      }

      if (!roomList || roomList.length === 0) {
        roomListEl.innerHTML = '<div class="empty-note">Aktuell gibt es keine offenen Räume.</div>';
        return;
      }

      for (i = 0; i < roomList.length; i++) {
        room = roomList[i];
        html += '<div class="room-row">' +
          '<div>' +
            '<div><strong>' + htmlEscape(room.name) + '</strong></div>' +
            '<div class="room-meta">Ersteller: ' + htmlEscape(room.ownerName) + ' | Spieler: ' + room.playerCount + '/' + room.maxPlayers + '</div>' +
          '</div>' +
          '<div><button type="button" onclick="joinOnlineRoom(\'' + htmlEscape(room.id) + '\')">Beitreten</button></div>' +
        '</div>';
      }

      roomListEl.innerHTML = html;
    }

    function getLevelFromScore(score) {
      var lvl = Math.floor((score - 1) / 10) + 1;

      if (lvl < 1) lvl = 1;
      if (lvl > 10) lvl = 10;

      return lvl;
    }

    function getSpeedForLevel(level) {
      if (level < 1) level = 1;
      if (level > 10) level = 10;
      return levelSpeeds[level - 1];
    }

    function updateLevelDisplay() {
      setElementText(levelEl, currentLevel);
    }

    function startLoop() {
      if (loopId !== null) {
        clearInterval(loopId);
      }

      if (gameMode === 1) {
        loopId = setInterval(gameLoopSinglePlayer, speed);
      } else if (gameMode === 2) {
        loopId = setInterval(gameLoopTwoPlayer, speed);
      }
    }

    function updateDifficultySinglePlayer() {
      var score = snake1.length;
      var newLevel = getLevelFromScore(score);

      if (newLevel !== currentLevel) {
        currentLevel = newLevel;
        speed = getSpeedForLevel(currentLevel);
        updateLevelDisplay();

        if (!gameOver) {
          startLoop();
          setElementText(statusEl, "Level " + currentLevel + "!");
        }
      } else {
        updateLevelDisplay();
      }
    }

    function updateSinglePlayerScore() {
      setElementText(scoreEl, snake1.length);
      updateDifficultySinglePlayer();
      updateRecordDisplay();
    }

    function updateTwoPlayerScore() {
      setElementText(scoreP1El, snake1.length);
      setElementText(scoreP2El, snake2.length);
    }

    function placeFood() {
      var newFood;
      var valid;

      do {
        valid = true;
        newFood = {
          x: Math.floor(Math.random() * tileCount),
          y: Math.floor(Math.random() * tileCount)
        };

        if (snake1 && isPositionInSnake(newFood, snake1, false)) {
          valid = false;
        }

        if (valid && snake2 && isPositionInSnake(newFood, snake2, false)) {
          valid = false;
        }
      } while (!valid);

      return newFood;
    }

    function startSinglePlayer() {
      gameMode = 1;
      configureBoardForMode();
      if (!ctx) {
        return;
      }
      showLocalGamePanel();
      initSinglePlayerGame();
    }

    function startTwoPlayer() {
      gameMode = 2;
      configureBoardForMode();
      if (!ctx) {
        return;
      }
      showLocalGamePanel();
      initTwoPlayerGame();
    }

    function initSinglePlayerGame() {
      snake1 = [{ x: 10, y: 10 }];
      snake2 = null;

      direction1 = { x: 1, y: 0 };
      nextDirection1 = { x: 1, y: 0 };

      direction2 = null;
      nextDirection2 = null;

      food = placeFood();
      gameOver = false;

      currentLevel = 1;
      speed = getSpeedForLevel(currentLevel);

      updateLevelDisplay();
      setElementText(statusEl, "");
      updateSinglePlayerScore();
      startLoop();
      draw();
    }

    function initTwoPlayerGame() {
      var startY = tileCount - 6;

      snake1 = [{ x: 10, y: startY }];
      snake2 = [{ x: tileCount - 11, y: startY }];

      direction1 = { x: 0, y: -1 };
      nextDirection1 = { x: 0, y: -1 };

      direction2 = { x: 0, y: -1 };
      nextDirection2 = { x: 0, y: -1 };

      food = placeFood();
      gameOver = false;

      currentLevel = 1;
      speed = twoPlayerSpeed;

      setElementText(statusEl, "");
      updateTwoPlayerScore();
      startLoop();
      draw();
    }

    function restartGame() {
      if (gameMode === 1) {
        initSinglePlayerGame();
      } else if (gameMode === 2) {
        initTwoPlayerGame();
      }
    }

    function endSinglePlayerGame() {
      var score = snake1.length;

      gameOver = true;

      if (loopId !== null) {
        clearInterval(loopId);
        loopId = null;
      }

      if (score > highscore) {
        highscore = score;
        highscoreName = askForHighscoreName();
        saveHighscore();
        updateRecordDisplay();
        setElementText(statusEl, "Neuer Highscore von " + highscoreName + ": " + highscore + "!");
      } else {
        setElementText(statusEl, "Game Over! Drücke Leertaste oder klicke auf Neustart.");
      }
    }

    function askForHighscoreName() {
      var name = prompt("Neuer Highscore! Bitte Namen eingeben:", "");

      if (name === null) {
        name = "Anonym";
      }

      name = String(name).replace(/^\s+|\s+$/g, "");
      name = name.replace(/\|/g, "/");
      name = name.replace(/[\r\n]+/g, " ");

      if (name === "") {
        name = "Anonym";
      }

      if (name.length > 20) {
        name = name.substring(0, 20);
      }

      return name;
    }

    function endTwoPlayerGame(message) {
      gameOver = true;

      if (loopId !== null) {
        clearInterval(loopId);
        loopId = null;
      }

      setElementText(statusEl, message);
    }

    function gameLoopSinglePlayer() {
      var head;
      var ateFood;

      if (gameOver) {
        return;
      }

      direction1 = copyDirection(nextDirection1);

      head = {
        x: snake1[0].x + direction1.x,
        y: snake1[0].y + direction1.y
      };

      wrapPosition(head);
      ateFood = positionsEqual(head, food);

      if (isPositionInSnake(head, snake1, !ateFood)) {
        endSinglePlayerGame();
        return;
      }

      snake1.unshift(head);

      if (ateFood) {
        food = placeFood();
      } else {
        snake1.pop();
      }

      updateSinglePlayerScore();
      draw();
    }

    function gameLoopTwoPlayer() {
      var oldHead1;
      var oldHead2;
      var newHead1;
      var newHead2;
      var ateFood1;
      var ateFood2;
      var dead1;
      var dead2;
      var sameCell;
      var swappedHeads;

      if (gameOver) {
        return;
      }

      direction1 = copyDirection(nextDirection1);
      direction2 = copyDirection(nextDirection2);

      oldHead1 = { x: snake1[0].x, y: snake1[0].y };
      oldHead2 = { x: snake2[0].x, y: snake2[0].y };

      newHead1 = {
        x: oldHead1.x + direction1.x,
        y: oldHead1.y + direction1.y
      };

      newHead2 = {
        x: oldHead2.x + direction2.x,
        y: oldHead2.y + direction2.y
      };

      wrapPosition(newHead1);
      wrapPosition(newHead2);

      sameCell = positionsEqual(newHead1, newHead2);
      swappedHeads = positionsEqual(newHead1, oldHead2) && positionsEqual(newHead2, oldHead1);

      if (sameCell || swappedHeads) {
        endTwoPlayerGame("Unentschieden! Beide Köpfe sind zusammengestoßen.");
        return;
      }

      ateFood1 = positionsEqual(newHead1, food);
      ateFood2 = positionsEqual(newHead2, food);

      dead1 = false;
      dead2 = false;

      if (isPositionInSnake(newHead1, snake1, !ateFood1)) {
        dead1 = true;
      }

      if (isPositionInSnake(newHead2, snake2, !ateFood2)) {
        dead2 = true;
      }

      if (isPositionInSnake(newHead1, snake2, !ateFood2)) {
        dead1 = true;
      }

      if (isPositionInSnake(newHead2, snake1, !ateFood1)) {
        dead2 = true;
      }

      if (dead1 && dead2) {
        endTwoPlayerGame("Unentschieden! Beide Spieler sind gleichzeitig gestorben.");
        return;
      }

      if (dead1) {
        endTwoPlayerGame("Spieler 2 gewinnt! Spieler 1 ist kollidiert.");
        return;
      }

      if (dead2) {
        endTwoPlayerGame("Spieler 1 gewinnt! Spieler 2 ist kollidiert.");
        return;
      }

      snake1.unshift(newHead1);
      snake2.unshift(newHead2);

      if (!ateFood1) {
        snake1.pop();
      }

      if (!ateFood2) {
        snake2.pop();
      }

      if (ateFood1 || ateFood2) {
        food = placeFood();
      }

      updateTwoPlayerScore();

      if (snake1.length >= snake2.length + 10) {
        draw();
        endTwoPlayerGame("Spieler 1 gewinnt! 10 Punkte Vorsprung erreicht.");
        return;
      }

      if (snake2.length >= snake1.length + 10) {
        draw();
        endTwoPlayerGame("Spieler 2 gewinnt! 10 Punkte Vorsprung erreicht.");
        return;
      }

      draw();
    }

    function drawBoard() {
      var i;
      var pos;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1;

      for (i = 0; i <= tileCount; i++) {
        pos = i * gridSize;

        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, canvas.height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(canvas.width, pos);
        ctx.stroke();
      }
    }

    function drawSnake(snake, headColor, bodyColor, isAlive) {
      var i;
      var part;
      var currentHeadColor = headColor;
      var currentBodyColor = bodyColor;

      if (!snake) {
        return;
      }

      if (isAlive === false) {
        currentHeadColor = "#888";
        currentBodyColor = "#555";
      }

      for (i = 0; i < snake.length; i++) {
        part = snake[i];

        if (i === 0) {
          ctx.fillStyle = currentHeadColor;
        } else {
          ctx.fillStyle = currentBodyColor;
        }

        ctx.fillRect(
          part.x * gridSize + 1,
          part.y * gridSize + 1,
          gridSize - 2,
          gridSize - 2
        );
      }
    }

    function drawFood() {
      if (!food) {
        return;
      }
      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect(
        food.x * gridSize + 2,
        food.y * gridSize + 2,
        gridSize - 4,
        gridSize - 4
      );
    }

    function drawOnlineState() {
      var i;
      var snake;

      drawBoard();

      if (!onlineGameState) {
        return;
      }

      food = onlineGameState.food;
      drawFood();

      for (i = 0; i < onlineGameState.snakes.length; i++) {
        snake = onlineGameState.snakes[i];
        drawSnake(snake.body, snake.headColor, snake.bodyColor, snake.alive);
      }
    }

    function draw() {
      if (!ctx || !canvas) {
        return;
      }

      drawBoard();
      drawFood();

      if (gameMode === 1) {
        drawSnake(snake1, "#7CFC00", "#32CD32", true);
      } else if (gameMode === 2) {
        drawSnake(snake1, "#66ccff", "#3399ff", true);
        drawSnake(snake2, "#7CFC00", "#32CD32", true);
      } else if (gameMode === 3) {
        drawOnlineState();
      }
    }

    function setDirectionSingle(key) {
      key = key.toLowerCase();

      if (key === "w" && direction1.y !== 1) {
        nextDirection1 = { x: 0, y: -1 };
      } else if (key === "s" && direction1.y !== -1) {
        nextDirection1 = { x: 0, y: 1 };
      } else if (key === "a" && direction1.x !== 1) {
        nextDirection1 = { x: -1, y: 0 };
      } else if (key === "d" && direction1.x !== -1) {
        nextDirection1 = { x: 1, y: 0 };
      }
    }

    function setDirectionPlayer1(key) {
      key = key.toLowerCase();

      if (key === "up" && direction1.y !== 1) {
        nextDirection1 = { x: 0, y: -1 };
      } else if (key === "down" && direction1.y !== -1) {
        nextDirection1 = { x: 0, y: 1 };
      } else if (key === "left" && direction1.x !== 1) {
        nextDirection1 = { x: -1, y: 0 };
      } else if (key === "right" && direction1.x !== -1) {
        nextDirection1 = { x: 1, y: 0 };
      }
    }

    function setDirectionPlayer2(key) {
      key = key.toLowerCase();

      if (key === "w" && direction2.y !== 1) {
        nextDirection2 = { x: 0, y: -1 };
      } else if (key === "s" && direction2.y !== -1) {
        nextDirection2 = { x: 0, y: 1 };
      } else if (key === "a" && direction2.x !== 1) {
        nextDirection2 = { x: -1, y: 0 };
      } else if (key === "d" && direction2.x !== -1) {
        nextDirection2 = { x: 1, y: 0 };
      }
    }

    function getKeyName(event) {
      var key = "";
      var code = 0;

      if (event.key) {
        key = String(event.key).toLowerCase();

        if (key === "arrowup") return "up";
        if (key === "arrowdown") return "down";
        if (key === "arrowleft") return "left";
        if (key === "arrowright") return "right";
        if (key === " ") return "space";
        if (key === "spacebar") return "space";
        if (key === "w" || key === "a" || key === "s" || key === "d") return key;

        if (key === "8" || key === "numpad8") return "num8";
        if (key === "4" || key === "numpad4") return "num4";
        if (key === "5" || key === "numpad5") return "num5";
        if (key === "6" || key === "numpad6") return "num6";
      }

      code = event.keyCode || event.which;

      if (code === 38) return "up";
      if (code === 40) return "down";
      if (code === 37) return "left";
      if (code === 39) return "right";
      if (code === 87) return "w";
      if (code === 65) return "a";
      if (code === 83) return "s";
      if (code === 68) return "d";
      if (code === 32) return "space";

      if (code === 104) return "num8";
      if (code === 100) return "num4";
      if (code === 101) return "num5";
      if (code === 102) return "num6";

      return "";
    }

    function mapOnlineDirection(keyName) {
      if (keyName === "up" || keyName === "num8" || keyName === "w") return "up";
      if (keyName === "down" || keyName === "num5" || keyName === "s") return "down";
      if (keyName === "left" || keyName === "num4" || keyName === "a") return "left";
      if (keyName === "right" || keyName === "num6" || keyName === "d") return "right";
      return "";
    }

    function getLocalNickname() {
      return sanitizeNickname(nicknameInputEl ? nicknameInputEl.value : "Anonym");
    }

    function connectSocket(callback) {
      var protocol;

      if (socketConnected) {
        if (callback) {
          callback(true);
        }
        return;
      }

      if (socketConnecting) {
        return;
      }

      if (location.protocol === "file:") {
        setElementText(multiplayerStatusEl, "Multiplayer benötigt den Server. Öffne das Spiel über http://localhost:8080.");
        if (callback) {
          callback(false);
        }
        return;
      }

      socketConnecting = true;
      protocol = location.protocol === "https:" ? "wss://" : "ws://";
      socket = new WebSocket(protocol + location.host);

      socket.onopen = function () {
        socketConnected = true;
        socketConnecting = false;
        sendSocketMessage({
          type: "hello",
          nickname: getLocalNickname()
        });
        refreshRoomList();
        setElementText(multiplayerStatusEl, "Verbunden.");
        if (callback) {
          callback(true);
        }
      };

      socket.onmessage = function (event) {
        var message;
        try {
          message = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        handleSocketMessage(message);
      };

      socket.onclose = function () {
        socketConnected = false;
        socketConnecting = false;
        localPlayerId = "";
        currentRoom = null;
        onlineGameState = null;
        clearOnlineCountdown();
        if (multiplayerStatusEl) {
          setElementText(multiplayerStatusEl, "Verbindung getrennt.");
        }
        if (gameMode === 3) {
          alert("Die Verbindung zum Multiplayer-Server wurde getrennt.");
          showMainMenu();
        }
      };

      socket.onerror = function () {
        setElementText(multiplayerStatusEl, "Verbindung zum Multiplayer-Server fehlgeschlagen.");
      };
    }

    function sendSocketMessage(message) {
      if (!socket || socket.readyState !== 1) {
        return;
      }
      socket.send(JSON.stringify(message));
    }

    function openMultiplayerMenu() {
      saveNickname();
      showMultiplayerBrowser();
      connectSocket(function (ok) {
        if (ok) {
          refreshRoomList();
        }
      });
    }

    function refreshRoomList() {
      sendSocketMessage({ type: "list_rooms" });
    }

    function createOnlineRoom() {
      var roomName = sanitizeRoomName(roomNameInputEl ? roomNameInputEl.value : "");

      saveNickname();
      connectSocket(function (ok) {
        if (!ok) {
          return;
        }
        sendSocketMessage({
          type: "create_room",
          nickname: getLocalNickname(),
          roomName: roomName
        });
      });
    }

    function joinOnlineRoom(roomId) {
      saveNickname();
      connectSocket(function (ok) {
        if (!ok) {
          return;
        }
        sendSocketMessage({
          type: "join_room",
          roomId: roomId,
          nickname: getLocalNickname()
        });
      });
    }

    function leaveOnlineRoomToBrowser() {
      onlineLeaveTarget = "browser";
      clearOnlineCountdown();
      sendSocketMessage({ type: "leave_room" });
      currentRoom = null;
      onlineGameState = null;
      showMultiplayerBrowser();
      refreshRoomList();
    }

    function leaveOnlineRoomToMenu() {
      onlineLeaveTarget = "menu";
      clearOnlineCountdown();
      sendSocketMessage({ type: "leave_room" });
      currentRoom = null;
      onlineGameState = null;
      showMainMenu();
      refreshRoomList();
    }

    function startOnlineGame() {
      sendSocketMessage({ type: "start_game" });
    }

    function requestRematch() {
      sendSocketMessage({ type: "rematch" });
      if (rematchButtonEl) {
        rematchButtonEl.disabled = true;
      }
    }

    function isLocalPlayerRematchReady() {
      var i;
      if (!currentRoom || !currentRoom.players) {
        return false;
      }
      for (i = 0; i < currentRoom.players.length; i++) {
        if (currentRoom.players[i].id === localPlayerId) {
          return !!currentRoom.players[i].rematch;
        }
      }
      return false;
    }

    function startOnlineCountdown() {
      clearOnlineCountdown();
      onlineCountdownTimer = setInterval(function () {
        var secondsLeft;
        var winnerText = "";
        if (!currentRoom || currentRoom.state !== "finished") {
          clearOnlineCountdown();
          return;
        }

        if (currentRoom.lastResultMessage) {
          winnerText = currentRoom.lastResultMessage + " ";
        }

        secondsLeft = Math.max(0, Math.ceil((currentRoom.rematchDeadlineTs - new Date().getTime()) / 1000));
        setElementText(statusEl, winnerText + "Revanche oder Menü in " + secondsLeft + " Sek.");
        if (secondsLeft <= 0) {
          clearOnlineCountdown();
        }
      }, 200);
    }

    function handleSocketMessage(message) {
      if (message.type === "self") {
        localPlayerId = message.playerId || "";
        return;
      }

      if (message.type === "room_list") {
        roomList = message.rooms || [];
        renderRoomList();
        return;
      }

      if (message.type === "room_state") {
        currentRoom = message.room || null;

        if (!currentRoom) {
          onlineGameState = null;
          clearOnlineCountdown();
          if (onlineLeaveTarget === "menu") {
            showMainMenu();
          } else {
            showMultiplayerBrowser();
          }
          onlineLeaveTarget = "";
          return;
        }

        onlineLeaveTarget = "";
        updateOnlinePanels();

        if (currentRoom.state === "lobby") {
          clearOnlineCountdown();
          setElementText(statusEl, "");
          showMultiplayerLobby();
        } else if (currentRoom.state === "playing") {
          clearOnlineCountdown();
          showOnlineGamePanel();
          setElementText(statusEl, "Match läuft. Sieger ist der letzte Überlebende.");
        } else if (currentRoom.state === "finished") {
          showOnlineGamePanel();
          startOnlineCountdown();
        }
        return;
      }

      if (message.type === "game_state") {
        onlineGameState = message.state || null;
        if (gameMode === 3) {
          draw();
        }
        return;
      }

      if (message.type === "info") {
        if (gameMode === 3) {
          setElementText(statusEl, message.message || "");
        } else {
          setElementText(multiplayerStatusEl, message.message || "");
        }
        return;
      }

      if (message.type === "error") {
        alert(message.message || "Unbekannter Fehler.");
      }
    }

    window.onload = function () {
      wrapperEl = document.getElementById("wrapper");
      canvas = document.getElementById("game");
      menuPanelEl = document.getElementById("menuPanel");
      multiplayerPanelEl = document.getElementById("multiplayerPanel");
      lobbyPanelEl = document.getElementById("lobbyPanel");
      gamePanelEl = document.getElementById("gamePanel");

      singleInfoEl = document.getElementById("singleInfo");
      twoInfoEl = document.getElementById("twoInfo");
      onlineInfoEl = document.getElementById("onlineInfo");
      controlsTextEl = document.getElementById("controlsText");
      statusEl = document.getElementById("status");

      scoreEl = document.getElementById("score");
      levelEl = document.getElementById("level");
      highscoreEl = document.getElementById("highscore");
      recordNameEl = document.getElementById("recordName");

      scoreP1El = document.getElementById("scoreP1");
      scoreP2El = document.getElementById("scoreP2");

      menuHighscoreEl = document.getElementById("menuHighscore");
      menuRecordNameEl = document.getElementById("menuRecordName");

      roomListEl = document.getElementById("roomList");
      nicknameInputEl = document.getElementById("nicknameInput");
      roomNameInputEl = document.getElementById("roomNameInput");
      multiplayerStatusEl = document.getElementById("multiplayerStatus");
      lobbyRoomNameEl = document.getElementById("lobbyRoomName");
      lobbyOwnerNameEl = document.getElementById("lobbyOwnerName");
      lobbyStatusTextEl = document.getElementById("lobbyStatusText");
      lobbyPlayerListEl = document.getElementById("lobbyPlayerList");
      lobbyStartButtonEl = document.getElementById("lobbyStartButton");
      onlineRoomNameEl = document.getElementById("onlineRoomName");
      onlineNicknameEl = document.getElementById("onlineNickname");
      onlinePlayerSummaryEl = document.getElementById("onlinePlayerSummary");
      localActionsEl = document.getElementById("localActions");
      onlineActionsEl = document.getElementById("onlineActions");
      rematchButtonEl = document.getElementById("rematchButton");

      if (!canvas) {
        alert("Canvas mit ID 'game' wurde nicht gefunden.");
        return;
      }

      if (!initCanvasContext()) {
        return;
      }

      nicknameInputEl.onchange = saveNickname;
      nicknameInputEl.onkeyup = saveNickname;

      loadSavedNickname();
      initHighscoreFilePath();
      loadHighscore();
      updateRecordDisplay();
      showMainMenu();

      document.onkeydown = function (event) {
        var keyName;
        var onlineDirection;

        event = event || window.event;
        keyName = getKeyName(event);

        if (gameMode === 0) {
          return true;
        }

        if (gameMode === 3) {
          if (!currentRoom || currentRoom.state !== "playing") {
            return true;
          }

          onlineDirection = mapOnlineDirection(keyName);
          if (onlineDirection) {
            if (event.preventDefault) event.preventDefault();
            event.returnValue = false;
            sendSocketMessage({ type: "set_direction", direction: onlineDirection });
            return false;
          }
          return true;
        }

        if (keyName === "space") {
          if (event.preventDefault) event.preventDefault();
          event.returnValue = false;
          restartGame();
          return false;
        }

        if (gameMode === 1) {
          if (keyName === "up" || keyName === "num8") keyName = "w";
          else if (keyName === "left" || keyName === "num4") keyName = "a";
          else if (keyName === "down" || keyName === "num5") keyName = "s";
          else if (keyName === "right" || keyName === "num6") keyName = "d";

          if (keyName === "w" || keyName === "a" || keyName === "s" || keyName === "d") {
            if (event.preventDefault) event.preventDefault();
            event.returnValue = false;
            setDirectionSingle(keyName);
            return false;
          }
        } else if (gameMode === 2) {
          if (
            keyName === "up" || keyName === "down" || keyName === "left" || keyName === "right" ||
            keyName === "num8" || keyName === "num4" || keyName === "num5" || keyName === "num6"
          ) {
            if (event.preventDefault) event.preventDefault();
            event.returnValue = false;

            if (keyName === "num8") keyName = "up";
            else if (keyName === "num4") keyName = "left";
            else if (keyName === "num5") keyName = "down";
            else if (keyName === "num6") keyName = "right";

            setDirectionPlayer1(keyName);
            return false;
          }

          if (keyName === "w" || keyName === "a" || keyName === "s" || keyName === "d") {
            if (event.preventDefault) event.preventDefault();
            event.returnValue = false;
            setDirectionPlayer2(keyName);
            return false;
          }
        }

        return true;
      };
    };
  