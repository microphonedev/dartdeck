const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;
const HOST_HINT = process.env.HOST_HINT || 'pikado.lan';
const DATA_DIR = path.join(__dirname, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.error('Load error', file, e.message); }
  return fallback;
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('Save error', file, e.message); }
}

let profiles = loadJSON(PROFILES_FILE, []);
let history = loadJSON(HISTORY_FILE, []);
let roomCode = generateCode();
let game = null;
let sessionStart = Date.now();
let lastActivity = Date.now();
const IDLE_MS = 5 * 60 * 1000;

let botThrowTimer = null;

function getLocalIP() {
  const nets = os.networkInterfaces();
  let fallback = null;
  for (const name of Object.keys(nets)) {
    // Exclude virtual network adapters (WSL, Docker, VirtualBox, VPN tunnels, etc.)
    const isVirtual = /virtual|box|vmware|vbox|vpn|wsl|vEthernet|tailscale|zerotier/i.test(name);
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        // Prioritize your actual physical home Wi-Fi/Ethernet network range
        if (net.address.startsWith('192.168.')) {
          return net.address;
        }
        if (!isVirtual && !fallback) {
          fallback = net.address;
        }
      }
    }
  }
  return fallback || 'localhost';
}

const LOCAL_IP = getLocalIP();
const NETWORK_URL = `http://${LOCAL_IP}${PORT == 80 ? '' : ':' + PORT}`;

setInterval(() => {
  if (game && game.status === 'playing' && Date.now() - lastActivity > IDLE_MS) {
    console.log('Idle timeout – ending game');
    endGameInternal();
    io.emit('idle-timeout');
  }
}, 10000);

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function endGameInternal() {
  if (botThrowTimer) clearTimeout(botThrowTimer);
  game = null;
  io.emit('game-ended', {});
  broadcastStatus();
}

function broadcastStatus() {
  io.emit('status', {
    code: roomCode,
    hasGame: !!game,
    game: sanitizeGame(game),
    sessionStart,
    profiles,
    hostHint: HOST_HINT,
    networkUrl: NETWORK_URL
  });
}

function newGameState(config) {
  const players = config.players.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color || '#FF5500',
    isBot: !!p.isBot,
    botDifficulty: p.botDifficulty || null,
    score: config.startScore,
    remaining: config.startScore,
    dartsThrown: 0,
    totalScore: 0,
    visits: [],
    checkoutAttempts: 0,
    checkouts: 0,
    highestCheckout: 0,
    average: 0
  }));

  let startIdx = 0;
  if (config.startPlayerId) {
    const i = players.findIndex(p => p.id === config.startPlayerId);
    if (i >= 0) startIdx = i;
  } else if (typeof config.startPlayerIndex === 'number' && config.startPlayerIndex >= 0) {
    startIdx = config.startPlayerIndex % players.length;
  }

  return {
    id: uuidv4(),
    mode: config.mode || 'x01',
    startScore: config.startScore || 501,
    inRule: config.inRule || 'straight',
    outRule: config.outRule || 'double',
    players,
    currentPlayerIndex: startIdx,
    currentVisit: [],
    status: 'playing',
    winner: null,
    startedAt: Date.now(),
    finishedAt: null,
    historyStack: []
  };
}

function getCheckoutSuggestion(remaining, outRule = 'double') {
  if (remaining <= 0 || remaining > 170) return null;
  
  const singles = [];
  const doubles = [];
  const triples = [];
  
  for (let i = 1; i <= 20; i++) {
    singles.push({ label: `S${i}`, val: i });
    doubles.push({ label: `D${i}`, val: i * 2 });
    triples.push({ label: `T${i}`, val: i * 3 });
  }
  singles.push({ label: 'SB', val: 25 });
  doubles.push({ label: 'Bull', val: 50 });
  
  const valid1 = [];
  if (outRule === 'double') {
    valid1.push(...doubles);
  } else if (outRule === 'master') {
    valid1.push(...doubles, ...triples);
  } else {
    valid1.push(...singles, ...doubles, ...triples);
  }
  
  for (const d of valid1) {
    if (d.val === remaining) return d.label;
  }
  
  const standardDoubleRoutes = {
    170: 'T20 T20 Bull', 167: 'T20 T19 Bull', 164: 'T20 T18 Bull', 161: 'T20 T17 Bull',
    160: 'T20 T20 D20', 158: 'T20 T20 D19', 157: 'T20 T19 D20', 156: 'T20 T20 D18',
    155: 'T20 T19 D19', 154: 'T20 T18 D20', 153: 'T20 T19 D18', 152: 'T20 T20 D16',
    151: 'T20 T17 D20', 150: 'T20 T18 D18', 149: 'T20 T19 D16', 148: 'T20 T16 D20',
    147: 'T20 T17 D18', 146: 'T20 T18 D16', 145: 'T20 T15 D20', 144: 'T20 T20 D12',
    143: 'T20 T17 D16', 142: 'T20 T14 D20', 141: 'T20 T15 D18', 140: 'T20 T16 D16',
    139: 'T19 T14 D20', 138: 'T20 T18 D12', 137: 'T19 T16 D16', 136: 'T20 T20 D8',
    135: 'T20 T15 D20', 134: 'T20 T14 D16', 133: 'T20 T17 D11', 132: 'T20 T16 D12',
    131: 'T20 T13 D16', 130: 'T20 T18 D8', 129: 'T19 T16 D12', 128: 'T18 T14 D16',
    127: 'T20 T17 D8', 126: 'T19 T19 D6', 125: 'T18 T13 D16', 124: 'T20 T16 D8',
    123: 'T19 T16 D9', 122: 'T18 T16 D8', 121: 'T20 T15 D8', 120: 'T20 S20 D20',
    119: 'T19 T10 D16', 118: 'T20 S18 D20', 117: 'T20 S17 D20', 116: 'T20 S16 D20',
    115: 'T20 S15 D20', 114: 'T20 S14 D20', 113: 'T19 S16 D20', 112: 'T20 S12 D20',
    111: 'T20 S19 D16', 110: 'T20 S10 D20', 109: 'T19 S12 D20', 108: 'T20 S16 D16',
    107: 'T19 S10 D20', 106: 'T20 S14 D16', 105: 'T19 S16 D16', 104: 'T18 S18 D16',
    103: 'T20 S11 D16', 102: 'T20 S10 D16', 101: 'T20 S9 D16', 100: 'T20 D20',
    99: 'T19 S10 D16', 98: 'T20 D19', 97: 'T19 D20', 96: 'T20 D18',
    95: 'T19 D19', 94: 'T18 D20', 93: 'T19 D18', 92: 'T20 D16',
    91: 'T17 D20', 90: 'T20 D15', 89: 'T19 D16', 88: 'T16 D20',
    87: 'T17 D18', 86: 'T18 D16', 85: 'T15 D20', 84: 'T20 D12',
    83: 'T17 D16', 82: 'T14 D20', 81: 'T19 D12', 80: 'T20 D10',
    79: 'T13 D20', 78: 'T18 D12', 77: 'T19 D10', 76: 'T20 D8',
    75: 'T17 D12', 74: 'T14 D16', 73: 'T19 D8', 72: 'T16 D12',
    71: 'T13 D16', 70: 'T18 D8', 69: 'T15 D12', 68: 'T16 D10',
    67: 'T17 D8', 66: 'T10 D18', 65: 'T15 D10', 64: 'T16 D8',
    63: 'T13 D12', 62: 'T10 D16', 61: 'T15 D8', 60: 'S20 D20',
    59: 'S19 D20', 58: 'S18 D20', 57: 'S17 D20', 56: 'S16 D20',
    55: 'S15 D20', 54: 'S14 D20', 53: 'S13 D20', 52: 'S20 D16',
    51: 'S19 D16', 50: 'S10 D20', 49: 'S17 D16', 48: 'S16 D16',
    47: 'S15 D16', 46: 'S6 D20', 45: 'S13 D16', 44: 'S12 D16',
    43: 'S3 D20', 42: 'S10 D16', 41: 'S9 D16', 40: 'D20',
    39: 'S7 D16', 38: 'D19', 37: 'S5 D16', 36: 'D18',
    35: 'S3 D16', 34: 'D17', 33: 'S1 D16', 32: 'D16',
    31: 'S15 D8', 30: 'D15', 29: 'S13 D8', 28: 'D14',
    27: 'S11 D8', 26: 'D13', 25: 'S9 D8', 24: 'D12',
    23: 'S7 D8', 22: 'D11', 21: 'S5 D8', 20: 'D10',
    19: 'S3 D8', 18: 'D9', 17: 'S1 D8', 16: 'D8',
    15: 'S7 D4', 14: 'D7', 13: 'S5 D4', 12: 'D6',
    11: 'S3 D4', 10: 'D5', 9: 'S1 D4', 8: 'D4',
    7: 'S3 D2', 6: 'D3', 5: 'S1 D2', 4: 'D2',
    3: 'S1 D1', 2: 'D1'
  };

  if (outRule === 'double' && standardDoubleRoutes[remaining]) {
    return standardDoubleRoutes[remaining];
  }

  const allDarts = [...singles, ...doubles, ...triples];
  allDarts.sort((a, b) => b.val - a.val);
  
  for (const d1 of allDarts) {
    const left = remaining - d1.val;
    if (left > 0) {
      for (const d2 of valid1) {
        if (d2.val === left) return `${d1.label} ${d2.label}`;
      }
    }
  }
  
  for (const d1 of allDarts) {
    const left1 = remaining - d1.val;
    if (left1 > 0) {
      for (const d2 of allDarts) {
        const left2 = left1 - d2.val;
        if (left2 > 0) {
          for (const d3 of valid1) {
            if (d3.val === left2) return `${d1.label} ${d2.label} ${d3.label}`;
          }
        }
      }
    }
  }
  
  return null;
}

function formatSimpleCheckout(remaining) {
  if (remaining <= 0) return null;
  if (remaining % 2 === 0 && remaining <= 40) return `2× ${remaining / 2}`;
  if (remaining === 50) return 'Bull';
  return null;
}

function sanitizeGame(g) {
  if (!g) return null;
  return {
    ...g,
    players: g.players.map(p => ({
      ...p,
      checkoutSuggestion: getCheckoutSuggestion(p.remaining, g.outRule),
      simpleCheckout: formatSimpleCheckout(p.remaining)
    })),
    currentPlayer: g.players[g.currentPlayerIndex]
  };
}

function nextPlayer() {
  if (!game) return;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
}

function updateProfileStats(profileId, won, playerState) {
  if (!profileId || String(profileId).startsWith('bot-')) return;
  const p = profiles.find(x => x.id === profileId);
  if (!p) return;
  p.gamesPlayed = (p.gamesPlayed || 0) + 1;
  if (won) p.wins = (p.wins || 0) + 1;
  p.totalDarts = (p.totalDarts || 0) + (playerState.dartsThrown || 0);
  p.totalScore = (p.totalScore || 0) + (playerState.totalScore || 0);
  if (playerState.highestCheckout > (p.highestCheckout || 0)) {
    p.highestCheckout = playerState.highestCheckout;
  }
  p.checkouts = (p.checkouts || 0) + (playerState.checkouts || 0);
  if (p.totalDarts > 0) {
    p.average = Math.round((p.totalScore / p.totalDarts) * 3 * 10) / 10;
  }
  p.lastPlayed = Date.now();
  saveJSON(PROFILES_FILE, profiles);
}

function applyScore(score, opts = {}) {
  if (!game || game.status !== 'playing') return { ok: false, error: 'No active game' };
  score = Number(score);
  if (isNaN(score) || score < 0 || score > 180) return { ok: false, error: 'Invalid score' };

  const player = game.players[game.currentPlayerIndex];
  const prevRemaining = player.remaining;
  let newRemaining = prevRemaining - score;
  let bust = false;
  let finished = false;

  if (newRemaining < 0) bust = true;
  if (newRemaining === 1 && game.outRule !== 'straight') bust = true;
  if (newRemaining === 0) finished = true;

  game.historyStack.push({
    playerIndex: game.currentPlayerIndex,
    remaining: player.remaining,
    totalScore: player.totalScore,
    dartsThrown: player.dartsThrown,
    visits: player.visits.slice(),
    average: player.average,
    checkouts: player.checkouts,
    highestCheckout: player.highestCheckout,
    status: game.status,
    winner: game.winner
  });
  if (game.historyStack.length > 50) game.historyStack.shift();

  if (bust) {
    game.currentVisit = [];
    nextPlayer();
    maybeBotTurn();
    return { ok: true, bust: true, player: player.name, remaining: player.remaining, score: 0 };
  }

  player.remaining = newRemaining;
  player.score = newRemaining;
  player.totalScore += score;
  player.dartsThrown += 3;
  player.visits.push(score);
  player.average = player.dartsThrown > 0
    ? Math.round((player.totalScore / player.dartsThrown) * 3 * 10) / 10
    : 0;

  game.currentVisit = [];

  if (finished) {
    player.checkouts += 1;
    if (score > player.highestCheckout) player.highestCheckout = score;
    game.status = 'finished';
    game.winner = player.id;
    game.finishedAt = Date.now();

    history.unshift({
      id: game.id,
      mode: game.mode,
      startScore: game.startScore,
      outRule: game.outRule,
      players: game.players.map(p => ({
        id: p.id, name: p.name, color: p.color, isBot: p.isBot,
        remaining: p.remaining, average: p.average, highestCheckout: p.highestCheckout
      })),
      winner: player.id,
      winnerName: player.name,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      duration: game.finishedAt - game.startedAt
    });
    if (history.length > 100) history = history.slice(0, 100);
    saveJSON(HISTORY_FILE, history);

    updateProfileStats(player.id, true, player);
    game.players.forEach(p => {
      if (p.id !== player.id) updateProfileStats(p.id, false, p);
    });
  } else {
    nextPlayer();
    maybeBotTurn();
  }

  return {
    ok: true,
    bust: false,
    finished,
    winner: finished ? player.name : null,
    score,
    remaining: player.remaining
  };
}

function undoLast() {
  if (!game || !game.historyStack || game.historyStack.length === 0) {
    return { ok: false, error: 'Nothing to undo' };
  }
  if (game.status === 'finished') {
    game.status = 'playing';
    game.winner = null;
    game.finishedAt = null;
  }
  const snap = game.historyStack.pop();
  const p = game.players[snap.playerIndex];
  p.remaining = snap.remaining;
  p.score = snap.remaining;
  p.totalScore = snap.totalScore;
  p.dartsThrown = snap.dartsThrown;
  p.visits = snap.visits;
  p.average = snap.average;
  p.checkouts = snap.checkouts;
  p.highestCheckout = snap.highestCheckout;
  game.currentPlayerIndex = snap.playerIndex;
  game.status = 'playing';
  game.winner = null;
  return { ok: true };
}

// ---------- Bot AI (Throws One-by-One) ----------
function generateBotDarts(remaining, difficulty, outRule) {
  const suggest = getCheckoutSuggestion(remaining, outRule);
  const checkoutChances = { easy: 0.15, medium: 0.35, hard: 0.65 };
  const chance = checkoutChances[difficulty] || 0.35;
  
  if (suggest && Math.random() < chance) {
    const parts = suggest.split(' ');
    return parts.map(p => {
      let val = 0;
      if (p === 'Bull') val = 50;
      else if (p === 'SB') val = 25;
      else if (p.startsWith('T')) val = parseInt(p.slice(1)) * 3;
      else if (p.startsWith('D')) val = parseInt(p.slice(1)) * 2;
      else if (p.startsWith('S')) val = parseInt(p.slice(1));
      else val = parseInt(p) || 0;
      return { text: p, score: val };
    });
  }
  
  const darts = [];
  let tempRemaining = remaining;
  
  for (let d = 0; d < 3; d++) {
    let dartText = '0';
    let val = 0;
    
    if (difficulty === 'hard') {
      const r = Math.random();
      if (r < 0.55) { dartText = 'T20'; val = 60; }
      else if (r < 0.90) { dartText = 'S20'; val = 20; }
      else if (r < 0.95) { dartText = 'S5'; val = 5; }
      else { dartText = 'S1'; val = 1; }
    } else if (difficulty === 'medium') {
      const r = Math.random();
      if (r < 0.25) { dartText = 'T20'; val = 60; }
      else if (r < 0.75) { dartText = 'S20'; val = 20; }
      else if (r < 0.88) { dartText = 'S5'; val = 5; }
      else if (r < 0.96) { dartText = 'S1'; val = 1; }
      else { dartText = 'D20'; val = 40; }
    } else { // easy
      const r = Math.random();
      if (r < 0.05) { dartText = 'T20'; val = 60; }
      else if (r < 0.40) { dartText = 'S20'; val = 20; }
      else if (r < 0.65) { dartText = 'S5'; val = 5; }
      else if (r < 0.90) { dartText = 'S1'; val = 1; }
      else { dartText = 'S10'; val = 10; }
    }
    
    if (tempRemaining - val < 0) {
      dartText = 'Miss';
      val = 0;
    } else if (tempRemaining - val === 1 && outRule !== 'straight') {
      dartText = 'Miss';
      val = 0;
    }
    
    darts.push({ text: dartText, score: val });
    tempRemaining -= val;
    if (tempRemaining === 0) break;
  }
  
  return darts;
}

function maybeBotTurn() {
  if (!game || game.status !== 'playing') return;
  const cur = game.players[game.currentPlayerIndex];
  if (!cur || !cur.isBot) return;

  if (botThrowTimer) clearTimeout(botThrowTimer);

  const darts = generateBotDarts(cur.remaining, cur.botDifficulty || 'medium', game.outRule);
  let dartIdx = 0;
  let visitTotal = 0;
  
  function throwNextDart() {
    if (!game || game.status !== 'playing') return;
    const p = game.players[game.currentPlayerIndex];
    if (!p || !p.isBot) return;
    
    lastActivity = Date.now();
    const dart = darts[dartIdx];
    visitTotal += dart.score;
    
    io.emit('bot-dart', {
      playerIndex: game.currentPlayerIndex,
      playerName: p.name,
      dartNum: dartIdx + 1,
      dartText: dart.text,
      score: dart.score,
      visitTotal: visitTotal,
      remaining: p.remaining - dart.score
    });
    
    dartIdx++;
    if (dartIdx < darts.length && (p.remaining - dart.score > 0)) {
      botThrowTimer = setTimeout(throwNextDart, 1300 + Math.random() * 600);
    } else {
      botThrowTimer = setTimeout(() => {
        const result = applyScore(visitTotal);
        io.emit('score-applied', { ...result, game: sanitizeGame(game), fromBot: true });
        broadcastStatus();
      }, 1000);
    }
  }

  botThrowTimer = setTimeout(throwNextDart, 1500);
}

// ---------- Express ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    code: roomCode,
    hasGame: !!game,
    game: sanitizeGame(game),
    sessionStart,
    hostHint: HOST_HINT,
    networkUrl: NETWORK_URL
  });
});

app.get('/api/profiles', (req, res) => res.json(profiles));

app.post('/api/profiles', (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const chosen = (color || '#FF5500').toUpperCase();
  if (profiles.some(p => (p.color || '').toUpperCase() === chosen)) {
    return res.status(400).json({ error: 'Color taken' });
  }
  const profile = {
    id: uuidv4(),
    name: name.trim().slice(0, 20),
    color: color || '#FF5500',
    gamesPlayed: 0, wins: 0, average: 0, highestCheckout: 0,
    checkouts: 0, totalDarts: 0, totalScore: 0,
    createdAt: Date.now(), lastPlayed: null
  };
  profiles.push(profile);
  saveJSON(PROFILES_FILE, profiles);
  res.json(profile);
});

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  console.log('Client', socket.id);
  socket.emit('code', roomCode);
  socket.emit('status', {
    code: roomCode,
    hasGame: !!game,
    game: sanitizeGame(game),
    sessionStart,
    profiles,
    hostHint: HOST_HINT,
    networkUrl: NETWORK_URL
  });

  socket.on('join', (data) => {
    if (data.code !== roomCode) {
      socket.emit('error', { message: 'Wrong code' });
      return;
    }
    socket.join('room');
    socket.emit('joined', { ok: true });
    socket.emit('status', {
      code: roomCode,
      hasGame: !!game,
      game: sanitizeGame(game),
      sessionStart,
      profiles,
      hostHint: HOST_HINT,
      networkUrl: NETWORK_URL
    });
  });

  socket.on('create-profile', (data) => {
    const { name, color } = data;
    if (!name || !name.trim()) {
      socket.emit('error', { message: 'Name required' });
      return;
    }
    const trimmed = name.trim().slice(0, 20);
    const existing = profiles.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      io.emit('profiles', profiles);
      socket.emit('profile-created', existing);
      return;
    }
    const chosen = (color || '#FF5500').toUpperCase();
    if (profiles.some(p => (p.color || '').toUpperCase() === chosen)) {
      socket.emit('error', { message: 'Color already taken' });
      return;
    }
    const profile = {
      id: uuidv4(),
      name: trimmed,
      color: color || '#FF5500',
      gamesPlayed: 0, wins: 0, average: 0, highestCheckout: 0,
      checkouts: 0, totalDarts: 0, totalScore: 0,
      createdAt: Date.now(), lastPlayed: null
    };
    profiles.push(profile);
    saveJSON(PROFILES_FILE, profiles);
    io.emit('profiles', profiles);
    socket.emit('profile-created', profile);
  });

  socket.on('edit-profile', (data) => {
    const { id, name, color } = data;
    if (!id) {
      socket.emit('error', { message: 'Profile ID is required' });
      return;
    }
    const p = profiles.find(x => x.id === id);
    if (!p) {
      socket.emit('error', { message: 'Profile not found' });
      return;
    }
    if (name && name.trim()) {
      const trimmed = name.trim().slice(0, 20);
      const existing = profiles.find(x => x.id !== id && x.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        socket.emit('error', { message: 'Name already taken' });
        return;
      }
      p.name = trimmed;
    }
    if (color) {
      const chosen = color.toUpperCase();
      const existingColor = profiles.some(x => x.id !== id && (x.color || '').toUpperCase() === chosen);
      if (existingColor) {
        socket.emit('error', { message: 'Color already taken' });
        return;
      }
      p.color = color;
    }
    saveJSON(PROFILES_FILE, profiles);
    io.emit('profiles', profiles);
    socket.emit('profile-updated', p);
  });

  socket.on('delete-profile', (data) => {
    const { id } = data;
    if (!id) {
      socket.emit('error', { message: 'Profile ID is required' });
      return;
    }
    const idx = profiles.findIndex(x => x.id === id);
    if (idx === -1) {
      socket.emit('error', { message: 'Profile not found' });
      return;
    }
    profiles.splice(idx, 1);
    saveJSON(PROFILES_FILE, profiles);
    io.emit('profiles', profiles);
    socket.emit('profile-deleted', { id });
  });

  socket.on('start-game', (config) => {
    lastActivity = Date.now();
    if (!config.players || config.players.length < 1) {
      socket.emit('error', { message: 'Need at least 1 player' });
      return;
    }
    const players = config.players.slice();
    if (config.bot) {
      players.push({
        id: 'bot-' + uuidv4().slice(0, 8),
        name: config.bot.name || 'BOT',
        color: '#8E8E93',
        isBot: true,
        botDifficulty: config.bot.difficulty || 'medium'
      });
    }
    if (players.length > 4) {
      socket.emit('error', { message: 'Max 4 players' });
      return;
    }
    game = newGameState({
      ...config,
      players
    });
    sessionStart = Date.now();
    io.emit('game-started', sanitizeGame(game));
    broadcastStatus();
    maybeBotTurn();
  });

  socket.on('score', (data) => {
    lastActivity = Date.now();
    const result = applyScore(Number(data.score));
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }
    io.emit('score-applied', { ...result, game: sanitizeGame(game) });
    broadcastStatus();
  });

  socket.on('undo', () => {
    lastActivity = Date.now();
    const result = undoLast();
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }
    io.emit('score-applied', { ok: true, undo: true, game: sanitizeGame(game) });
    broadcastStatus();
  });

  socket.on('new-game', () => {
    endGameInternal();
  });

  socket.on('end-game-idle', () => {
    if (game && game.status === 'playing') {
      endGameInternal();
      io.emit('idle-timeout');
    }
  });

  socket.on('reset-code', () => {
    roomCode = generateCode();
    io.emit('code', roomCode);
  });

  socket.on('disconnect', () => {
    console.log('Disconnect', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║           D A R T D E C K            ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  Code:      ${roomCode}`);
  console.log(`  Local:     http://localhost:${PORT}`);
  console.log(`  Network:   ${NETWORK_URL}`);
  console.log('');
});