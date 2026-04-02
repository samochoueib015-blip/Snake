const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_PLAYERS = 4;
const MAP_SIZE = 40;
const TICK_MS = 125;

const COLOR_SET = [
  { head: '#66ccff', body: '#3399ff' },
  { head: '#7CFC00', body: '#32CD32' },
  { head: '#ffb347', body: '#ff8c42' },
  { head: '#ff7ad9', body: '#e056c2' }
];

const SPAWNS = [
  { x: 10, y: 34, direction: { x: 0, y: -1 } },
  { x: 29, y: 34, direction: { x: 0, y: -1 } },
  { x: 10, y: 5, direction: { x: 0, y: 1 } },
  { x: 29, y: 5, direction: { x: 0, y: 1 } }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const clients = new Map();
const rooms = new Map();

function send(client, payload) {
  if (!client || !client.ws || client.ws.readyState !== WebSocket.OPEN) {
    return;
  }
  client.ws.send(JSON.stringify(payload));
}

function broadcast(payload) {
  clients.forEach(function (client) {
    send(client, payload);
  });
}

function randomId(size) {
  return crypto.randomBytes(size).toString('hex');
}

function makeRoomId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let roomId = '';
  do {
    roomId = '';
    for (let i = 0; i < 5; i++) {
      roomId += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
  } while (rooms.has(roomId));
  return roomId;
}

function sanitizeNickname(name) {
  name = String(name || '').trim().replace(/[\r\n]+/g, ' ');
  if (!name) {
    name = 'Anonym';
  }
  if (name.length > 20) {
    name = name.substring(0, 20);
  }
  return name;
}

function sanitizeRoomName(name) {
  name = String(name || '').trim().replace(/[\r\n]+/g, ' ');
  if (!name) {
    name = 'Raum ' + Math.floor(Math.random() * 900 + 100);
  }
  if (name.length > 30) {
    name = name.substring(0, 30);
  }
  return name;
}

function wrapPosition(pos) {
  if (pos.x < 0) pos.x = MAP_SIZE - 1;
  if (pos.x >= MAP_SIZE) pos.x = 0;
  if (pos.y < 0) pos.y = MAP_SIZE - 1;
  if (pos.y >= MAP_SIZE) pos.y = 0;
  return pos;
}

function positionsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isReverseDirection(current, next) {
  return current.x + next.x === 0 && current.y + next.y === 0;
}

function directionFromName(name) {
  if (name === 'up') return { x: 0, y: -1 };
  if (name === 'down') return { x: 0, y: 1 };
  if (name === 'left') return { x: -1, y: 0 };
  if (name === 'right') return { x: 1, y: 0 };
  return null;
}

function isPositionInBody(pos, body, ignoreTail) {
  let max = body.length;
  if (ignoreTail && max > 0) {
    max -= 1;
  }
  for (let i = 0; i < max; i++) {
    if (body[i].x === pos.x && body[i].y === pos.y) {
      return true;
    }
  }
  return false;
}

function roomPlayerSummaries(room) {
  return room.playerOrder.map(function (playerId, index) {
    const player = room.players.get(playerId);
    const snake = room.snakes.get(playerId);
    return {
      id: playerId,
      nickname: player ? player.nickname : 'Unbekannt',
      color: COLOR_SET[index] ? COLOR_SET[index].head : '#ffffff',
      isOwner: playerId === room.ownerId,
      alive: snake ? !!snake.alive : true,
      length: snake && snake.body ? snake.body.length : 1,
      rematch: room.rematchVotes.has(playerId)
    };
  });
}

function publicRoomState(room) {
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    state: room.state,
    players: roomPlayerSummaries(room),
    rematchDeadlineTs: room.rematchDeadlineTs || 0,
    lastResultMessage: room.lastResultMessage || ''
  };
}

function publicGameState(room) {
  return {
    food: room.food,
    snakes: room.playerOrder.map(function (playerId, index) {
      const player = room.players.get(playerId);
      const snake = room.snakes.get(playerId);
      return {
        id: playerId,
        nickname: player ? player.nickname : 'Unbekannt',
        body: snake && snake.body ? snake.body : [],
        alive: snake ? !!snake.alive : false,
        headColor: COLOR_SET[index] ? COLOR_SET[index].head : '#ffffff',
        bodyColor: COLOR_SET[index] ? COLOR_SET[index].body : '#cccccc'
      };
    })
  };
}

function broadcastRoomList() {
  const openRooms = [];

  rooms.forEach(function (room) {
    if (room.state !== 'lobby') {
      return;
    }
    if (room.playerOrder.length >= MAX_PLAYERS) {
      return;
    }
    openRooms.push({
      id: room.id,
      name: room.name,
      ownerName: room.players.get(room.ownerId) ? room.players.get(room.ownerId).nickname : 'Unbekannt',
      playerCount: room.playerOrder.length,
      maxPlayers: MAX_PLAYERS
    });
  });

  openRooms.sort(function (a, b) {
    return a.name.localeCompare(b.name, 'de');
  });

  broadcast({ type: 'room_list', rooms: openRooms });
}

function broadcastRoomState(room) {
  room.playerOrder.forEach(function (playerId) {
    const client = clients.get(playerId);
    if (!client) {
      return;
    }
    send(client, {
      type: 'room_state',
      room: publicRoomState(room)
    });

    if (room.state === 'playing' || room.state === 'finished') {
      send(client, {
        type: 'game_state',
        state: publicGameState(room)
      });
    }
  });
}

function cleanupRoom(room) {
  if (!room) {
    return;
  }
  if (room.loopId) {
    clearInterval(room.loopId);
    room.loopId = null;
  }
  if (room.rematchTimer) {
    clearTimeout(room.rematchTimer);
    room.rematchTimer = null;
  }
  rooms.delete(room.id);
}

function ensureRoomOwner(room) {
  if (room.ownerId && room.players.has(room.ownerId)) {
    return;
  }
  room.ownerId = room.playerOrder.length > 0 ? room.playerOrder[0] : null;
}

function roomAlivePlayers(room) {
  return room.playerOrder.filter(function (playerId) {
    const snake = room.snakes.get(playerId);
    return snake && snake.alive;
  });
}

function placeFood(room) {
  const taken = new Set();
  room.playerOrder.forEach(function (playerId) {
    const snake = room.snakes.get(playerId);
    if (!snake || !snake.body) {
      return;
    }
    snake.body.forEach(function (part) {
      taken.add(part.x + ',' + part.y);
    });
  });

  if (taken.size >= MAP_SIZE * MAP_SIZE) {
    return { x: 0, y: 0 };
  }

  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * MAP_SIZE),
      y: Math.floor(Math.random() * MAP_SIZE)
    };
  } while (taken.has(pos.x + ',' + pos.y));

  return pos;
}

function createRoom(client, roomName) {
  leaveRoom(client, true);

  const room = {
    id: makeRoomId(),
    name: sanitizeRoomName(roomName),
    ownerId: client.id,
    state: 'lobby',
    players: new Map(),
    playerOrder: [],
    snakes: new Map(),
    food: null,
    loopId: null,
    rematchVotes: new Set(),
    rematchDeadlineTs: 0,
    rematchTimer: null,
    lastResultMessage: ''
  };

  rooms.set(room.id, room);
  joinRoomInternal(client, room);
}

function joinRoomInternal(client, room) {
  client.roomId = room.id;
  room.players.set(client.id, {
    id: client.id,
    nickname: client.nickname
  });
  room.playerOrder.push(client.id);
  ensureRoomOwner(room);
  room.snakes.set(client.id, {
    body: [{ x: 0, y: 0 }],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    alive: true
  });

  broadcastRoomState(room);
  broadcastRoomList();
}

function joinRoom(client, roomId) {
  const room = rooms.get(roomId);

  if (!room) {
    send(client, { type: 'error', message: 'Raum nicht gefunden.' });
    return;
  }

  if (room.state !== 'lobby') {
    send(client, { type: 'error', message: 'Diesem Raum kann gerade nicht beigetreten werden.' });
    return;
  }

  if (room.playerOrder.length >= MAX_PLAYERS) {
    send(client, { type: 'error', message: 'Der Raum ist bereits voll.' });
    return;
  }

  leaveRoom(client, true);
  joinRoomInternal(client, room);
}

function maybeFinalizeActiveGame(room) {
  if (!room || room.state !== 'playing') {
    return;
  }
  const alive = roomAlivePlayers(room);
  if (alive.length <= 1) {
    endGame(room, alive.length === 1 ? alive[0] : null);
  }
}

function removePlayerFromRoom(room, playerId) {
  const index = room.playerOrder.indexOf(playerId);
  if (index !== -1) {
    room.playerOrder.splice(index, 1);
  }

  room.players.delete(playerId);
  room.snakes.delete(playerId);
  room.rematchVotes.delete(playerId);
  ensureRoomOwner(room);

  if (room.playerOrder.length === 0) {
    cleanupRoom(room);
    broadcastRoomList();
    return;
  }

  if (room.state === 'playing') {
    maybeFinalizeActiveGame(room);
  } else if (room.state === 'finished') {
    maybeProcessRematch(room);
  }

  broadcastRoomState(room);
  broadcastRoomList();
}

function leaveRoom(client, silent) {
  if (!client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  client.roomId = null;

  if (!room) {
    return;
  }

  removePlayerFromRoom(room, client.id);

  if (!silent) {
    send(client, { type: 'room_state', room: null });
  }
}

function startGame(room) {
  const playerCount = room.playerOrder.length;

  if (playerCount < 2) {
    return;
  }

  room.state = 'playing';
  room.lastResultMessage = '';
  room.rematchVotes.clear();
  room.rematchDeadlineTs = 0;

  if (room.rematchTimer) {
    clearTimeout(room.rematchTimer);
    room.rematchTimer = null;
  }

  room.playerOrder.forEach(function (playerId, index) {
    const spawn = SPAWNS[index];
    room.snakes.set(playerId, {
      body: [{ x: spawn.x, y: spawn.y }],
      direction: { x: spawn.direction.x, y: spawn.direction.y },
      nextDirection: { x: spawn.direction.x, y: spawn.direction.y },
      alive: true
    });
  });

  room.food = placeFood(room);

  if (room.loopId) {
    clearInterval(room.loopId);
  }
  room.loopId = setInterval(function () {
    tickRoom(room.id);
  }, TICK_MS);

  broadcastRoomList();
  broadcastRoomState(room);
}

function endGame(room, winnerId) {
  if (room.loopId) {
    clearInterval(room.loopId);
    room.loopId = null;
  }

  room.state = 'finished';
  room.rematchVotes.clear();
  room.rematchDeadlineTs = Date.now() + 5000;

  if (winnerId && room.players.get(winnerId)) {
    room.lastResultMessage = room.players.get(winnerId).nickname + ' gewinnt!';
  } else {
    room.lastResultMessage = 'Unentschieden!';
  }

  if (room.rematchTimer) {
    clearTimeout(room.rematchTimer);
  }

  room.rematchTimer = setTimeout(function () {
    finalizeRematch(room.id);
  }, 5000);

  broadcastRoomList();
  broadcastRoomState(room);
}

function maybeProcessRematch(room) {
  if (!room || room.state !== 'finished') {
    return;
  }

  if (room.playerOrder.length >= 2 && room.rematchVotes.size === room.playerOrder.length) {
    if (room.rematchTimer) {
      clearTimeout(room.rematchTimer);
      room.rematchTimer = null;
    }
    startGame(room);
  }
}

function finalizeRematch(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.state !== 'finished') {
    return;
  }

  room.rematchTimer = null;

  if (room.playerOrder.length >= 2 && room.rematchVotes.size === room.playerOrder.length) {
    startGame(room);
    return;
  }

  room.state = 'lobby';
  room.lastResultMessage = '';
  room.rematchVotes.clear();
  room.rematchDeadlineTs = 0;
  room.snakes = new Map(room.playerOrder.map(function (playerId) {
    return [playerId, {
      body: [{ x: 0, y: 0 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      alive: true
    }];
  }));

  broadcastRoomList();
  broadcastRoomState(room);
}

function setPlayerDirection(client, directionName) {
  const room = rooms.get(client.roomId);
  const snake = room ? room.snakes.get(client.id) : null;
  const nextDirection = directionFromName(directionName);

  if (!room || room.state !== 'playing' || !snake || !snake.alive || !nextDirection) {
    return;
  }

  if (isReverseDirection(snake.direction, nextDirection)) {
    return;
  }

  snake.nextDirection = nextDirection;
}

function tickRoom(roomId) {
  const room = rooms.get(roomId);
  const aliveIds = [];
  const oldHeads = {};
  const nextHeads = {};
  const ateFood = {};
  const dead = {};

  if (!room || room.state !== 'playing') {
    return;
  }

  room.playerOrder.forEach(function (playerId) {
    const snake = room.snakes.get(playerId);
    if (!snake || !snake.alive) {
      return;
    }
    aliveIds.push(playerId);
    if (!isReverseDirection(snake.direction, snake.nextDirection)) {
      snake.direction = { x: snake.nextDirection.x, y: snake.nextDirection.y };
    }
    oldHeads[playerId] = { x: snake.body[0].x, y: snake.body[0].y };
    nextHeads[playerId] = wrapPosition({
      x: snake.body[0].x + snake.direction.x,
      y: snake.body[0].y + snake.direction.y
    });
    ateFood[playerId] = positionsEqual(nextHeads[playerId], room.food);
    dead[playerId] = false;
  });

  for (let i = 0; i < aliveIds.length; i++) {
    for (let j = i + 1; j < aliveIds.length; j++) {
      const a = aliveIds[i];
      const b = aliveIds[j];

      if (positionsEqual(nextHeads[a], nextHeads[b])) {
        dead[a] = true;
        dead[b] = true;
      }

      if (positionsEqual(nextHeads[a], oldHeads[b]) && positionsEqual(nextHeads[b], oldHeads[a])) {
        dead[a] = true;
        dead[b] = true;
      }
    }
  }

  aliveIds.forEach(function (playerId) {
    if (dead[playerId]) {
      return;
    }

    room.playerOrder.forEach(function (targetId) {
      const targetSnake = room.snakes.get(targetId);
      const ignoreTail = playerId !== targetId ? !ateFood[targetId] : !ateFood[playerId];

      if (!targetSnake || !targetSnake.body) {
        return;
      }

      if (isPositionInBody(nextHeads[playerId], targetSnake.body, ignoreTail)) {
        dead[playerId] = true;
      }
    });
  });

  aliveIds.forEach(function (playerId) {
    const snake = room.snakes.get(playerId);
    if (!snake) {
      return;
    }

    if (dead[playerId]) {
      snake.alive = false;
      return;
    }

    snake.body.unshift(nextHeads[playerId]);
    if (!ateFood[playerId]) {
      snake.body.pop();
    }
  });

  if (aliveIds.some(function (playerId) { return ateFood[playerId] && !dead[playerId]; })) {
    room.food = placeFood(room);
  }

  if (roomAlivePlayers(room).length <= 1) {
    const alive = roomAlivePlayers(room);
    endGame(room, alive.length === 1 ? alive[0] : null);
    return;
  }

  broadcastRoomState(room);
}

function handleMessage(client, message) {
  let room;

  if (message.type === 'hello') {
    client.nickname = sanitizeNickname(message.nickname);
    send(client, { type: 'self', playerId: client.id });
    broadcastRoomList();
    return;
  }

  if (message.type === 'list_rooms') {
    broadcastRoomList();
    return;
  }

  if (message.type === 'create_room') {
    client.nickname = sanitizeNickname(message.nickname || client.nickname);
    createRoom(client, message.roomName);
    return;
  }

  if (message.type === 'join_room') {
    client.nickname = sanitizeNickname(message.nickname || client.nickname);
    joinRoom(client, String(message.roomId || '').trim());
    return;
  }

  if (message.type === 'leave_room') {
    leaveRoom(client, false);
    return;
  }

  room = client.roomId ? rooms.get(client.roomId) : null;

  if (!room) {
    if (message.type === 'start_game' || message.type === 'set_direction' || message.type === 'rematch') {
      send(client, { type: 'error', message: 'Du bist in keinem Raum.' });
    }
    return;
  }

  if (message.type === 'start_game') {
    if (room.state !== 'lobby') {
      send(client, { type: 'error', message: 'Das Spiel kann gerade nicht gestartet werden.' });
      return;
    }
    if (room.ownerId !== client.id) {
      send(client, { type: 'error', message: 'Nur der Ersteller kann das Spiel starten.' });
      return;
    }
    if (room.playerOrder.length < 2) {
      send(client, { type: 'error', message: 'Mindestens 2 Spieler werden benötigt.' });
      return;
    }
    startGame(room);
    return;
  }

  if (message.type === 'set_direction') {
    setPlayerDirection(client, message.direction);
    return;
  }

  if (message.type === 'rematch') {
    if (room.state !== 'finished') {
      return;
    }
    room.rematchVotes.add(client.id);
    broadcastRoomState(room);
    maybeProcessRematch(room);
  }
}

const server = http.createServer(function (req, res) {
  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(requestPath).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Datei nicht gefunden.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', function (ws) {
  const client = {
    id: randomId(8),
    ws: ws,
    nickname: 'Spieler' + Math.floor(Math.random() * 900 + 100),
    roomId: null
  };

  clients.set(client.id, client);
  send(client, { type: 'self', playerId: client.id });
  broadcastRoomList();

  ws.on('message', function (rawMessage) {
    let message;
    try {
      message = JSON.parse(String(rawMessage));
    } catch (e) {
      return;
    }
    handleMessage(client, message);
  });

  ws.on('close', function () {
    leaveRoom(client, true);
    clients.delete(client.id);
    broadcastRoomList();
  });
});

server.listen(PORT, function () {
  console.log('Snake-Server läuft auf http://localhost:' + PORT);
});
