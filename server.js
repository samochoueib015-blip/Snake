const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_ACTIVE_PLAYERS = 4;
const MAP_SIZE = 40;
const TICK_MS = 100;
const HEARTBEAT_INTERVAL_MS = 5000;
const COLOR_SET = [
  { id: 'blue', label: 'Blau', head: '#66ccff', body: '#3399ff' },
  { id: 'green', label: 'Grün', head: '#7CFC00', body: '#32CD32' },
  { id: 'orange', label: 'Orange', head: '#ffb347', body: '#ff8c42' },
  { id: 'pink', label: 'Pink', head: '#ff7ad9', body: '#e056c2' },
  { id: 'red', label: 'Rot', head: '#ff6b6b', body: '#ff3b3b' },
  { id: 'purple', label: 'Lila', head: '#b388ff', body: '#8c5cff' },
  { id: 'yellow', label: 'Gelb', head: '#ffe066', body: '#ffcc00' },
  { id: 'teal', label: 'Türkis', head: '#4dd0e1', body: '#00acc1' }
];
const MAX_ROOM_MEMBERS = COLOR_SET.length;

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

function randomId(size) {
  return crypto.randomBytes(size).toString('hex');
}

function makeRoomId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let roomId = '';
  do {
    roomId = '';
    for (let i = 0; i < 5; i += 1) {
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

function getColorById(colorId) {
  for (let i = 0; i < COLOR_SET.length; i += 1) {
    if (COLOR_SET[i].id === colorId) {
      return COLOR_SET[i];
    }
  }
  return null;
}

function getUsedColorIds(room, excludeId) {
  const used = new Set();
  room.memberOrder.forEach(function (memberId) {
    const member = room.members.get(memberId);
    if (!member || memberId === excludeId) {
      return;
    }
    if (member.colorId) {
      used.add(member.colorId);
    }
  });
  return used;
}

function getFirstFreeColorId(room, excludeId) {
  const used = getUsedColorIds(room, excludeId);
  for (let i = 0; i < COLOR_SET.length; i += 1) {
    if (!used.has(COLOR_SET[i].id)) {
      return COLOR_SET[i].id;
    }
  }
  return null;
}

function reserveColorId(room, requestedColorId, excludeId) {
  const requested = getColorById(requestedColorId);
  const used = getUsedColorIds(room, excludeId);

  if (requested && !used.has(requested.id)) {
    return requested.id;
  }

  return getFirstFreeColorId(room, excludeId);
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
  for (let i = 0; i < max; i += 1) {
    if (body[i].x === pos.x && body[i].y === pos.y) {
      return true;
    }
  }
  return false;
}

function makeIdleSnake() {
  return {
    body: [{ x: 0, y: 0 }],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    alive: true
  };
}

function roomAlivePlayers(room) {
  return room.activePlayerIds.filter(function (playerId) {
    const snake = room.snakes.get(playerId);
    return snake && snake.alive;
  });
}

function ensureRoomOwner(room) {
  if (room.ownerId && room.members.has(room.ownerId)) {
    return;
  }
  room.ownerId = room.memberOrder.length > 0 ? room.memberOrder[0] : null;
}

function activateMember(room, memberId) {
  if (!room.members.has(memberId)) {
    return false;
  }
  if (room.activePlayerIds.indexOf(memberId) !== -1) {
    return true;
  }
  if (room.activePlayerIds.length >= MAX_ACTIVE_PLAYERS) {
    return false;
  }
  room.activePlayerIds.push(memberId);
  room.snakes.set(memberId, makeIdleSnake());
  return true;
}

function promoteWaitingMembers(room) {
  if (!room || room.state !== 'lobby') {
    return;
  }

  for (let i = 0; i < room.memberOrder.length && room.activePlayerIds.length < MAX_ACTIVE_PLAYERS; i += 1) {
    activateMember(room, room.memberOrder[i]);
  }
}

function roomMemberSummaries(room) {
  const activeSet = new Set(room.activePlayerIds);

  return room.memberOrder.map(function (memberId) {
    const member = room.members.get(memberId);
    const snake = room.snakes.get(memberId);
    const color = getColorById(member && member.colorId) || COLOR_SET[0];
    const isActive = activeSet.has(memberId);

    return {
      id: memberId,
      nickname: member ? member.nickname : 'Unbekannt',
      colorId: color.id,
      color: color.head,
      bodyColor: color.body,
      isOwner: memberId === room.ownerId,
      isActive: isActive,
      isSpectator: !isActive,
      alive: isActive ? !!(snake && snake.alive) : false,
      length: isActive && snake && snake.body ? snake.body.length : 1,
      rematch: isActive && room.rematchVotes.has(memberId)
    };
  });
}

function publicRoomState(room, viewerId) {
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    state: room.state,
    players: roomMemberSummaries(room),
    activePlayerCount: room.activePlayerIds.length,
    maxPlayers: MAX_ACTIVE_PLAYERS,
    memberCount: room.memberOrder.length,
    maxMembers: MAX_ROOM_MEMBERS,
    rematchDeadlineTs: room.rematchDeadlineTs || 0,
    lastResultMessage: room.lastResultMessage || '',
    yourRole: room.activePlayerIds.indexOf(viewerId) !== -1 ? 'player' : 'spectator'
  };
}

function publicGameState(room) {
  return {
    food: room.food,
    snakes: room.activePlayerIds.map(function (playerId) {
      const member = room.members.get(playerId);
      const snake = room.snakes.get(playerId);
      const color = getColorById(member && member.colorId) || COLOR_SET[0];
      return {
        id: playerId,
        nickname: member ? member.nickname : 'Unbekannt',
        body: snake && snake.body ? snake.body : [],
        alive: snake ? !!snake.alive : false,
        length: snake && snake.body ? snake.body.length : 1,
        headColor: color.head,
        bodyColor: color.body
      };
    })
  };
}

function publicRoomListEntry(room) {
  const owner = room.members.get(room.ownerId);
  return {
    id: room.id,
    name: room.name,
    ownerName: owner ? owner.nickname : 'Unbekannt',
    state: room.state,
    activePlayerCount: room.activePlayerIds.length,
    maxPlayers: MAX_ACTIVE_PLAYERS,
    memberCount: room.memberOrder.length,
    maxMembers: MAX_ROOM_MEMBERS,
    canJoin: room.memberOrder.length < MAX_ROOM_MEMBERS
  };
}

function broadcastRoomList() {
  const roomEntries = [];

  rooms.forEach(function (room) {
    roomEntries.push(publicRoomListEntry(room));
  });

  roomEntries.sort(function (a, b) {
    if (a.state !== b.state) {
      const order = { lobby: 0, playing: 1, finished: 2 };
      return (order[a.state] || 99) - (order[b.state] || 99);
    }
    return a.name.localeCompare(b.name, 'de');
  });

  clients.forEach(function (client) {
    send(client, { type: 'room_list', rooms: roomEntries });
  });
}

function broadcastRoomState(room) {
  room.memberOrder.forEach(function (memberId) {
    const client = clients.get(memberId);
    if (!client) {
      return;
    }
    send(client, {
      type: 'room_state',
      room: publicRoomState(room, memberId)
    });
  });
}

function broadcastGameState(room) {
  const payload = {
    type: 'game_state',
    state: publicGameState(room)
  };

  room.memberOrder.forEach(function (memberId) {
    const client = clients.get(memberId);
    send(client, payload);
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

function placeFood(room) {
  const taken = new Set();

  room.activePlayerIds.forEach(function (playerId) {
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
    members: new Map(),
    memberOrder: [],
    activePlayerIds: [],
    snakes: new Map(),
    food: null,
    loopId: null,
    rematchVotes: new Set(),
    rematchDeadlineTs: 0,
    rematchTimer: null,
    lastResultMessage: ''
  };

  rooms.set(room.id, room);
  joinRoom(client, room.id);
}

function addMemberToRoom(client, room) {
  let colorId;
  let assignedFallback = false;

  colorId = reserveColorId(room, client.preferredColorId, null);
  if (!colorId) {
    send(client, { type: 'error', message: 'In diesem Raum ist keine Farbe mehr frei.' });
    return false;
  }

  if (client.preferredColorId && client.preferredColorId !== colorId) {
    assignedFallback = true;
  }

  client.roomId = room.id;
  room.members.set(client.id, {
    id: client.id,
    nickname: client.nickname,
    colorId: colorId
  });
  room.memberOrder.push(client.id);
  ensureRoomOwner(room);

  if (room.state === 'lobby' && room.activePlayerIds.length < MAX_ACTIVE_PLAYERS) {
    activateMember(room, client.id);
  }

  if (assignedFallback) {
    const color = getColorById(colorId);
    send(client, { type: 'info', message: 'Deine Wunschfarbe war belegt. Zugewiesen: ' + (color ? color.label : colorId) + '.' });
  }

  if (room.state === 'playing') {
    send(client, { type: 'info', message: 'Das Spiel läuft bereits. Du schaust zunächst zu.' });
  } else if (room.state === 'finished') {
    send(client, { type: 'info', message: 'Das Match ist gerade beendet. Du wartest auf die nächste Runde.' });
  } else if (room.activePlayerIds.indexOf(client.id) === -1) {
    send(client, { type: 'info', message: 'Die Spielerplätze sind voll. Du wartest in der Lobby auf einen freien Slot.' });
  }

  return true;
}

function joinRoom(client, roomId) {
  const room = rooms.get(roomId);

  if (!room) {
    send(client, { type: 'error', message: 'Raum nicht gefunden.' });
    return;
  }

  if (room.memberOrder.length >= MAX_ROOM_MEMBERS) {
    send(client, { type: 'error', message: 'Dieser Raum ist vollständig belegt.' });
    return;
  }

  leaveRoom(client, true);

  if (!addMemberToRoom(client, room)) {
    client.roomId = null;
    return;
  }

  broadcastRoomList();
  broadcastRoomState(room);
  if (room.state === 'playing' || room.state === 'finished') {
    broadcastGameState(room);
  }
}

function maybeFinalizeActiveGame(room) {
  if (!room || room.state !== 'playing') {
    return;
  }
  const alive = roomAlivePlayers(room);
  if (alive.length <= 1) {
    endGame(room, alive.length === 1 ? alive[0] : null);
  } else {
    broadcastRoomState(room);
    broadcastGameState(room);
  }
}

function removeMemberFromRoom(room, memberId) {
  const orderIndex = room.memberOrder.indexOf(memberId);
  const activeIndex = room.activePlayerIds.indexOf(memberId);
  const wasActive = activeIndex !== -1;

  if (orderIndex !== -1) {
    room.memberOrder.splice(orderIndex, 1);
  }
  if (activeIndex !== -1) {
    room.activePlayerIds.splice(activeIndex, 1);
  }

  room.members.delete(memberId);
  room.snakes.delete(memberId);
  room.rematchVotes.delete(memberId);
  ensureRoomOwner(room);

  if (room.memberOrder.length === 0) {
    cleanupRoom(room);
    broadcastRoomList();
    return;
  }

  if (room.state === 'playing' && wasActive) {
    maybeFinalizeActiveGame(room);
    broadcastRoomList();
    return;
  }

  if (room.state === 'lobby') {
    promoteWaitingMembers(room);
  }

  if (room.state === 'finished' && room.activePlayerIds.length < 2) {
    room.rematchVotes.clear();
  }

  broadcastRoomList();
  broadcastRoomState(room);
  if (room.state === 'playing' || room.state === 'finished') {
    broadcastGameState(room);
  }
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

  removeMemberFromRoom(room, client.id);

  if (!silent) {
    send(client, { type: 'room_state', room: null });
  }
}

function startGame(room) {
  promoteWaitingMembers(room);

  if (room.activePlayerIds.length < 2) {
    return false;
  }

  room.state = 'playing';
  room.lastResultMessage = '';
  room.rematchVotes.clear();
  room.rematchDeadlineTs = 0;

  if (room.rematchTimer) {
    clearTimeout(room.rematchTimer);
    room.rematchTimer = null;
  }

  room.activePlayerIds = room.activePlayerIds.filter(function (memberId) {
    return room.members.has(memberId);
  }).slice(0, MAX_ACTIVE_PLAYERS);

  room.activePlayerIds.forEach(function (playerId, index) {
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
  broadcastGameState(room);
  return true;
}

function endGame(room, winnerId) {
  if (room.loopId) {
    clearInterval(room.loopId);
    room.loopId = null;
  }

  room.state = 'finished';
  room.rematchVotes.clear();
  room.rematchDeadlineTs = Date.now() + 5000;

  if (winnerId && room.members.get(winnerId)) {
    room.lastResultMessage = room.members.get(winnerId).nickname + ' gewinnt!';
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
  broadcastGameState(room);
}

function maybeProcessRematch(room) {
  if (!room || room.state !== 'finished') {
    return;
  }

  if (room.activePlayerIds.length >= 2 && room.activePlayerIds.every(function (playerId) {
    return room.rematchVotes.has(playerId);
  })) {
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

  if (room.activePlayerIds.length >= 2 && room.activePlayerIds.every(function (playerId) {
    return room.rematchVotes.has(playerId);
  })) {
    startGame(room);
    return;
  }

  room.state = 'lobby';
  room.lastResultMessage = '';
  room.rematchVotes.clear();
  room.rematchDeadlineTs = 0;

  room.snakes = new Map();
  room.activePlayerIds = room.activePlayerIds.filter(function (memberId) {
    return room.members.has(memberId);
  });

  promoteWaitingMembers(room);
  room.activePlayerIds.forEach(function (playerId) {
    room.snakes.set(playerId, makeIdleSnake());
  });

  broadcastRoomList();
  broadcastRoomState(room);
}

function setPlayerDirection(client, directionName) {
  const room = rooms.get(client.roomId);
  const snake = room ? room.snakes.get(client.id) : null;
  const nextDirection = directionFromName(directionName);

  if (!room || room.state !== 'playing' || room.activePlayerIds.indexOf(client.id) === -1 || !snake || !snake.alive || !nextDirection) {
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

  room.activePlayerIds.forEach(function (playerId) {
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

  for (let i = 0; i < aliveIds.length; i += 1) {
    for (let j = i + 1; j < aliveIds.length; j += 1) {
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

    room.activePlayerIds.forEach(function (targetId) {
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

  broadcastGameState(room);
}

function updateClientProfile(client, nickname, colorId) {
  let room;
  let member;
  let reservedColor;
  let colorChanged = false;

  client.nickname = sanitizeNickname(nickname || client.nickname);
  if (getColorById(colorId)) {
    client.preferredColorId = colorId;
  }

  room = client.roomId ? rooms.get(client.roomId) : null;
  if (!room) {
    return;
  }

  member = room.members.get(client.id);
  if (!member) {
    return;
  }

  member.nickname = client.nickname;

  if (client.preferredColorId) {
    reservedColor = reserveColorId(room, client.preferredColorId, client.id);

    if (!reservedColor) {
      send(client, { type: 'error', message: 'In diesem Raum ist aktuell keine freie Farbe verfügbar.' });
    } else if (reservedColor !== client.preferredColorId && member.colorId !== client.preferredColorId) {
      send(client, { type: 'error', message: 'Diese Farbe ist in diesem Raum bereits belegt.' });
    } else if (member.colorId !== reservedColor) {
      member.colorId = reservedColor;
      colorChanged = true;
    }
  }

  broadcastRoomList();
  broadcastRoomState(room);
  if (room.state === 'playing' || room.state === 'finished' || colorChanged) {
    broadcastGameState(room);
  }
}

function handleMessage(client, message) {
  let room;

  client.ws.isAlive = true;
  client.lastSeenTs = Date.now();

  if (message.type === 'hello') {
    client.nickname = sanitizeNickname(message.nickname);
    if (getColorById(message.colorId)) {
      client.preferredColorId = message.colorId;
    }
    send(client, {
      type: 'self',
      playerId: client.id,
      colors: COLOR_SET.map(function (color) {
        return {
          id: color.id,
          label: color.label,
          head: color.head,
          body: color.body
        };
      })
    });
    broadcastRoomList();
    return;
  }

  if (message.type === 'list_rooms') {
    broadcastRoomList();
    return;
  }

  if (message.type === 'set_profile') {
    updateClientProfile(client, message.nickname, message.colorId);
    return;
  }

  if (message.type === 'create_room') {
    client.nickname = sanitizeNickname(message.nickname || client.nickname);
    if (getColorById(message.colorId)) {
      client.preferredColorId = message.colorId;
    }
    createRoom(client, message.roomName);
    return;
  }

  if (message.type === 'join_room') {
    client.nickname = sanitizeNickname(message.nickname || client.nickname);
    if (getColorById(message.colorId)) {
      client.preferredColorId = message.colorId;
    }
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
    promoteWaitingMembers(room);
    if (room.activePlayerIds.length < 2) {
      send(client, { type: 'error', message: 'Mindestens 2 aktive Spieler werden benötigt.' });
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
    if (room.activePlayerIds.indexOf(client.id) === -1) {
      return;
    }
    room.rematchVotes.add(client.id);
    broadcastRoomState(room);
    maybeProcessRematch(room);
  }
}

const server = http.createServer(function (req, res) {
  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
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
    preferredColorId: COLOR_SET[0].id,
    roomId: null,
    lastSeenTs: Date.now()
  };

  ws.isAlive = true;
  clients.set(client.id, client);

  send(client, {
    type: 'self',
    playerId: client.id,
    colors: COLOR_SET.map(function (color) {
      return {
        id: color.id,
        label: color.label,
        head: color.head,
        body: color.body
      };
    })
  });
  broadcastRoomList();

  ws.on('pong', function () {
    ws.isAlive = true;
    client.lastSeenTs = Date.now();
  });

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

const heartbeatInterval = setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      ws.terminate();
    }
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', function () {
  clearInterval(heartbeatInterval);
});

server.listen(PORT, function () {
  console.log('Snake-Server läuft auf http://localhost:' + PORT);
});
