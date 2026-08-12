(function () {
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const preferHost = !isMobileUA && window.innerWidth >= 860;
  const DEVICE_KEY = 'dartdeck_device_name';
  const DEVICE_ID_KEY = 'dartdeck_device_id';

  const app = document.getElementById('app');
  let socket = null;
  let state = {
    code: '----',
    hostHint: 'pikado.lan',
    networkUrl: '',
    profiles: [],
    game: null,
    sessionStart: Date.now(),
    joined: false,
    selectedPlayers: [],
    setup: {
      mode: 'x01',
      startScore: 501,
      inRule: 'straight',
      outRule: 'double',
      solo: false,
      bot: false,
      botDifficulty: 'medium'
    },
    currentScoreInput: '',
    view: 'loading',
    lastActivity: Date.now(),
    deviceName: localStorage.getItem(DEVICE_KEY) || '',
    deviceId: localStorage.getItem(DEVICE_ID_KEY) || ''
  };

  const COLORS = [
    '#FF5500', '#FF3B30', '#FF9500', '#FFCC00',
    '#34C759', '#00C7BE', '#30B0C7', '#32ADE6',
    '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
    '#A2845E', '#8E8E93'
  ];
  const IDLE_MS = 5 * 60 * 1000;

  function connect() {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      if (state.view === 'loading') {
        if (preferHost) showHost();
        else showJoin();
      }
    });

    socket.on('code', (code) => {
      state.code = code;
      document.querySelectorAll('[data-code]').forEach(el => el.textContent = code);
    });

    socket.on('status', (data) => {
      state.code = data.code;
      state.hostHint = data.hostHint || 'pikado.lan';
      state.networkUrl = data.networkUrl || '';
      state.profiles = data.profiles || [];
      state.game = data.game;
      state.sessionStart = data.sessionStart || Date.now();
      
      document.querySelectorAll('[data-code]').forEach(el => el.textContent = state.code);
      document.querySelectorAll('[data-host]').forEach(el => el.textContent = state.networkUrl || state.hostHint);
      
      if (state.view === 'host') renderHost();
      if (state.view === 'lobby') renderLobby();
      if (state.view === 'game') {
        if (state.game && state.game.status === 'playing') renderMobileGame();
        else if (state.game && state.game.status === 'finished') showEndScreen();
        else showLobby();
      }
    });

    socket.on('profiles', (list) => {
      state.profiles = list;
      state.selectedPlayers = state.selectedPlayers.filter(sel => list.some(x => x.id === sel.id));
      
      if (state.deviceId && !list.some(x => x.id === state.deviceId)) {
        state.deviceId = '';
        state.deviceName = '';
        localStorage.removeItem(DEVICE_ID_KEY);
        localStorage.removeItem(DEVICE_KEY);
      } else if (state.deviceId) {
        const mine = list.find(x => x.id === state.deviceId);
        if (mine && mine.name !== state.deviceName) {
          state.deviceName = mine.name;
          localStorage.setItem(DEVICE_KEY, mine.name);
        }
      }
      if (state.view === 'lobby') renderLobby();
    });

    socket.on('profile-created', (profile) => {
      if (!state.deviceId) {
        state.deviceId = profile.id;
        localStorage.setItem(DEVICE_ID_KEY, profile.id);
      }
    });

    socket.on('game-started', (game) => {
      state.game = game;
      state.lastActivity = Date.now();
      if (state.view === 'host') renderHost();
      else {
        state.view = 'game';
        renderMobileGame();
      }
    });

    // Human-like Bot Dart Updates
    socket.on('bot-dart', (data) => {
      state.lastActivity = Date.now();
      if (data.score === 0) {
        Sounds.bust();
      } else {
        Sounds.hit(data.score);
      }

      if (state.view === 'host') {
        renderHost();
        const activeCard = document.querySelector('.player-card.active');
        if (activeCard) {
          const scoreDisp = activeCard.querySelector('.score-display');
          if (scoreDisp) scoreDisp.textContent = data.remaining;
          const flashEl = activeCard.querySelector('.score-flash');
          if (flashEl) {
            flashEl.textContent = `${data.dartText} (+${data.score})`;
            flashEl.classList.remove('show');
            void flashEl.offsetWidth;
            flashEl.classList.add('show');
          }
        }
      }

      if (state.view === 'game') {
        const who = document.querySelector('.who');
        const nameBig = document.querySelector('.name-big');
        const remainingBig = document.querySelector('.remaining-big');
        if (who) who.textContent = `BOT THREW DART ${data.dartNum}/3`;
        if (nameBig) nameBig.textContent = `Threw ${data.dartText} (+${data.score})`;
        if (remainingBig) remainingBig.textContent = data.remaining;
      }
    });

    socket.on('score-applied', (data) => {
      state.game = data.game;
      state.lastActivity = Date.now();
      if (data.undo) {
        if (state.view === 'host') renderHost();
        if (state.view === 'game') renderMobileGame();
        return;
      }
      if (data.bust) {
        Sounds.bust();
        showScorePopup(0, 'bust');
        if (state.view === 'host') flashBust();
      } else if (data.finished) {
        Sounds.checkout();
        showScorePopup(data.score, 'finish');
        triggerConfetti();
        triggerScreenShake();
        if (state.view === 'host') {
          flashScore(data.score);
          const card = document.querySelector('.player-card.active');
          if (card) card.classList.add('celebrate-glow');
        }
        setTimeout(() => {
          if (state.view === 'host') renderHost();
          else showEndScreen();
        }, 1500);
      } else {
        Sounds.hit(data.score || 0);
        if (!data.fromBot) showScorePopup(data.score, 'normal');
        
        if (data.score >= 100) {
          triggerScreenShake();
        }
        if (data.score === 180) {
          triggerConfetti();
        }
        
        if (state.view === 'host') flashScore(data.score);
      }
      
      if (state.view === 'host') setTimeout(() => renderHost(), 40);
      if (state.view === 'game' && state.game && state.game.status === 'playing') {
        setTimeout(() => renderMobileGame(), data.finished ? 1600 : (data.fromBot ? 100 : 400));
      }
    });

    socket.on('game-ended', () => {
      state.game = null;
      if (state.view === 'host') renderHost();
      else if (state.view !== 'join' && state.view !== 'device-name') showLobby();
    });

    socket.on('idle-timeout', () => {
      state.game = null;
      if (state.view === 'host') renderHost();
      else {
        alert('Game ended due to 5 minutes of inactivity');
        if (state.view === 'game' || state.view === 'end') showLobby();
      }
    });

    socket.on('error', (err) => alert(err.message || 'Error'));
    socket.on('joined', () => {
      state.joined = true;
      const storedId = localStorage.getItem(DEVICE_ID_KEY) || state.deviceId;
      const storedName = localStorage.getItem(DEVICE_KEY) || state.deviceName;
      if (storedId) {
        const p = state.profiles.find(x => x.id === storedId);
        if (p) {
          state.deviceId = p.id;
          state.deviceName = p.name;
          localStorage.setItem(DEVICE_ID_KEY, p.id);
          localStorage.setItem(DEVICE_KEY, p.name);
          showLobby();
          return;
        }
      }
      if (storedName) {
        const p = state.profiles.find(x => x.name.toLowerCase() === storedName.toLowerCase());
        if (p) {
          state.deviceId = p.id;
          state.deviceName = p.name;
          localStorage.setItem(DEVICE_ID_KEY, p.id);
          localStorage.setItem(DEVICE_KEY, p.name);
          showLobby();
          return;
        }
      }
      showDeviceName();
    });
  }

  function triggerScreenShake() {
    const el = document.getElementById('host-screen') || document.getElementById('mobile-screen');
    if (el) {
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 450);
    }
  }

  function triggerConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    const colors = ['#FF5500', '#FF3B30', '#FFCC00', '#34C759', '#007AFF', '#AF52DE'];
    for (let i = 0; i < 90; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--dur', (1.4 + Math.random() * 2.2) + 's');
      piece.style.transform = `scale(${0.5 + Math.random() * 1})`;
      container.appendChild(piece);
    }
    document.body.appendChild(container);
    setTimeout(() => container.remove(), 3500);
  }

  setInterval(() => {
    if (state.game && state.game.status === 'playing' && Date.now() - state.lastActivity > IDLE_MS) {
      socket.emit('end-game-idle');
    }
  }, 15000);

  // ---------- First-time phone registration ----------
  function showDeviceName() {
    state.view = 'device-name';
    const profiles = state.profiles || [];
    const options = profiles.map(p =>
      `<option value="${p.id}" data-name="${escapeHtml(p.name)}" style="color:${p.color}">${escapeHtml(p.name)}</option>`
    ).join('');

    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1>DARTDECK</h1>
          <div class="sub">Who is playing on this phone?</div>
        </div>
        <div class="mobile-body">
          <div class="join-box" style="max-width:400px">
            <h2>Select player</h2>
            <p>Pick an existing profile or add a new one. Saved on this phone.</p>

            ${profiles.length ? `
              <label class="label">Existing players</label>
              <select class="input" id="existing-player" style="font-size:18px;margin-bottom:12px">
                <option value="">— choose —</option>
                ${options}
              </select>
              <button class="btn btn-primary btn-block btn-lg" id="use-existing">CONTINUE WITH SELECTED</button>
              <div style="margin:18px 0;color:var(--text-muted);font-weight:700;font-size:12px;letter-spacing:1px">OR ADD NEW</div>
            ` : `<p style="margin-bottom:16px;color:var(--text-muted)">No players yet — create the first one.</p>`}

            <label class="label">New name</label>
            <input class="input" id="device-name-input" maxlength="20" placeholder="Your name" style="text-align:center;font-size:20px" />
            <button class="btn btn-ghost btn-block btn-lg mt-12" id="save-device-name">CREATE & CONTINUE</button>
          </div>
        </div>
      </div>
    `;

    const useExisting = () => {
      const sel = document.getElementById('existing-player');
      if (!sel || !sel.value) return alert('Select a player from the list');
      const id = sel.value;
      const p = state.profiles.find(x => x.id === id);
      if (!p) return alert('Player not found');
      state.deviceName = p.name;
      state.deviceId = p.id;
      localStorage.setItem(DEVICE_KEY, p.name);
      localStorage.setItem(DEVICE_ID_KEY, p.id);
      showLobby();
    };

    const createNew = () => {
      const input = document.getElementById('device-name-input');
      const name = (input.value || '').trim();
      if (!name) return alert('Enter a name');
      const existing = state.profiles.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        state.deviceName = existing.name;
        state.deviceId = existing.id;
        localStorage.setItem(DEVICE_KEY, existing.name);
        localStorage.setItem(DEVICE_ID_KEY, existing.id);
        showLobby();
        return;
      }
      state.deviceName = name;
      localStorage.setItem(DEVICE_KEY, name);
      const taken = new Set(state.profiles.map(p => (p.color || '').toUpperCase()));
      const color = COLORS.find(c => !taken.has(c.toUpperCase())) || COLORS[0];
      socket.emit('create-profile', { name, color });
      setTimeout(() => {
        const created = state.profiles.find(p => p.name === name);
        if (created) {
          state.deviceId = created.id;
          localStorage.setItem(DEVICE_ID_KEY, created.id);
        }
        showLobby();
      }, 450);
    };

    const exBtn = document.getElementById('use-existing');
    if (exBtn) exBtn.addEventListener('click', useExisting);
    document.getElementById('save-device-name').addEventListener('click', createNew);
    document.getElementById('device-name-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') createNew();
    });
  }

  // ---------- Host Screen rendering ----------
  function showHost() {
    state.view = 'host';
    app.innerHTML = `
      <div id="host-screen" class="screen active">
        <header class="host-header">
          <div class="brand-title">DARTDECK</div>
          <div class="timer" id="host-timer">00:00</div>
          <div class="room-code">CODE <span data-code>${state.code}</span></div>
        </header>
        <main class="host-main" id="host-main"></main>
        <footer class="host-footer" id="host-footer">WAITING FOR MATCH</footer>
        <button class="emergency-btn" id="emergency-btn" title="Emergency Input">⌨</button>
        <div class="emergency-pad" id="emergency-pad">
          <div class="display" id="em-display">0</div>
          <div class="emergency-grid">
            <button data-n="1">1</button><button data-n="2">2</button><button data-n="3">3</button>
            <button data-n="4">4</button><button data-n="5">5</button><button data-n="6">6</button>
            <button data-n="7">7</button><button data-n="8">8</button><button data-n="9">9</button>
            <button data-n="del">⌫</button><button data-n="0">0</button>
            <button class="enter" data-n="enter">↵</button>
          </div>
        </div>
        <div class="score-popup" id="score-popup">
          <div class="inner"><div class="num" id="pop-num">0</div><div class="label-pop" id="pop-label">SCORED</div></div>
        </div>
      </div>
    `;
    renderHost();
    startTimer();
    setupEmergency();
  }

  function renderHost() {
    const main = document.getElementById('host-main');
    const footer = document.getElementById('host-footer');
    const timerEl = document.getElementById('host-timer');
    if (!main) return;

    if (!state.game) {
      if (timerEl) timerEl.classList.remove('visible');
      main.removeAttribute('data-players');
      main.innerHTML = `
        <div class="host-idle">
          <div class="brand-big">DARTDECK</div>
          <div class="big-code" data-code>${state.code}</div>
          <p>Connect using your phone to:<br><strong style="color:var(--accent-orange);font-size:1.35rem;letter-spacing:1px" data-host>${state.networkUrl || state.hostHint}</strong></p>
        </div>
      `;
      if (footer) footer.textContent = 'WAITING FOR MATCH';
      return;
    }

    if (timerEl) timerEl.classList.add('visible');
    const g = state.game;
    main.setAttribute('data-players', g.players.length);
    if (footer) {
      const botNote = g.players.some(p => p.isBot) ? ' • VS BOT' : '';
      footer.textContent = `${g.startScore} • ${g.outRule.toUpperCase()} OUT${botNote}` +
        (g.status === 'finished' ? ' • FINISHED' : '');
    }

    main.innerHTML = g.players.map((p, i) => {
      const isActive = i === g.currentPlayerIndex && g.status === 'playing';
      const suggestion = getCheckoutSuggestion(p.remaining, g.outRule);
      const simple = formatSimpleCheckout(p.remaining);
      const nameColor = p.color || 'var(--text-main)';
      const botTag = p.isBot ? ' 🤖' : '';
      return `
        <section class="player-card ${isActive ? 'active' : ''}">
          <div class="player-header">
            <div class="turn-indicator"></div>
            <div class="player-name" style="color:${isActive ? 'var(--accent-orange)' : nameColor}">
              ${escapeHtml(p.name)}${botTag}${isActive ? ' • TURN' : ''}
            </div>
          </div>
          <div class="score-container">
            <div class="score-display">${p.remaining}</div>
          </div>
          <div>
            <div class="checkout-line">${suggestion || ''}</div>
            <div class="simple-out-line">${simple && suggestion !== simple ? simple : ''}</div>
            <div class="stats-bar">
              <div>AVG <span>${p.average || '–'}</span></div>
              <div>DARTS <span>${p.dartsThrown || 0}</span></div>
            </div>
          </div>
          <div class="score-flash" id="flash-${i}"></div>
          <div class="bust-flash" id="bust-${i}"></div>
        </section>
      `;
    }).join('');
  }

  function flashScore(score) {
    if (!state.game) return;
    const idx = state.game.currentPlayerIndex;
    const prev = (idx - 1 + state.game.players.length) % state.game.players.length;
    const el = document.getElementById('flash-' + prev) || document.getElementById('flash-' + idx);
    if (el) {
      el.textContent = score;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }
  }
  function flashBust() {
    if (!state.game) return;
    const idx = state.game.currentPlayerIndex;
    const prev = (idx - 1 + state.game.players.length) % state.game.players.length;
    const el = document.getElementById('bust-' + prev) || document.getElementById('bust-' + idx);
    if (el) {
      el.textContent = 'BUST';
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }
  }

  let timerInterval = null;
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const el = document.getElementById('host-timer');
      if (!el || !state.game) return;
      const sec = Math.floor((Date.now() - state.sessionStart) / 1000);
      el.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }, 1000);
  }

  function setupEmergency() {
    const btn = document.getElementById('emergency-btn');
    const pad = document.getElementById('emergency-pad');
    const display = document.getElementById('em-display');
    let val = '';
    if (!btn) return;
    btn.addEventListener('click', () => pad.classList.toggle('open'));
    pad.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        const n = b.dataset.n;
        if (n === 'del') val = val.slice(0, -1);
        else if (n === 'enter') {
          if (val !== '') {
            socket.emit('score', { score: parseInt(val, 10) || 0 });
            val = '';
          }
          pad.classList.remove('open');
        } else if (val.length < 3) val += n;
        display.textContent = val || '0';
      });
    });
  }

  function showScorePopup(num, type) {
    let popup = document.getElementById('score-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'score-popup';
      popup.className = 'score-popup';
      popup.innerHTML = '<div class="inner"><div class="num" id="pop-num">0</div><div class="label-pop" id="pop-label">SCORED</div></div>';
      document.body.appendChild(popup);
    }
    const numEl = document.getElementById('pop-num');
    const labEl = document.getElementById('pop-label');
    popup.classList.remove('bust', 'finish');
    if (type === 'bust') {
      popup.classList.add('bust');
      numEl.textContent = 'BUST';
      labEl.textContent = 'NO SCORE';
    } else if (type === 'finish') {
      popup.classList.add('finish');
      numEl.textContent = num;
      labEl.textContent = 'GAME SHOT';
    } else {
      numEl.textContent = num;
      labEl.textContent = 'SCORED';
    }
    popup.classList.add('show');
    setTimeout(() => popup.classList.remove('show'), type === 'finish' ? 1400 : 900);
  }

  // ---------- Join Mobile Screen ----------
  function showJoin() {
    state.view = 'join';
    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1>DARTDECK</h1>
          <div class="sub">Local darts scoring</div>
        </div>
        <div class="mobile-body">
          <div class="join-box">
            <h2>Enter Code</h2>
            <p>Type the 4-digit room code from the TV screen</p>
            <input class="input code-input" id="join-code" type="text" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off" />
            <button class="btn btn-primary btn-block btn-lg" id="join-btn">JOIN</button>
          </div>
        </div>
      </div>
    `;
    const input = document.getElementById('join-code');
    const btn = document.getElementById('join-btn');
    input.focus();
    const tryJoin = () => {
      const code = input.value.trim();
      if (code.length === 4) socket.emit('join', { code });
    };
    btn.addEventListener('click', tryJoin);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); });
  }

  // ---------- Lobby Screen ----------
  function showLobby() {
    state.view = 'lobby';
    state.selectedPlayers = [];
    if (state.deviceId) {
      const mine = state.profiles.find(p => p.id === state.deviceId);
      if (mine) state.selectedPlayers = [mine];
    } else if (state.deviceName) {
      const mine = state.profiles.find(p => p.name === state.deviceName);
      if (mine) {
        state.selectedPlayers = [mine];
        state.deviceId = mine.id;
        localStorage.setItem(DEVICE_ID_KEY, mine.id);
      }
    }
    renderLobby();
  }

  function takenColors() {
    return new Set(state.profiles.map(p => (p.color || '').toUpperCase()));
  }

  function renderLobby() {
    if (state.view !== 'lobby') return;
    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1>DARTDECK</h1>
          <div class="sub">Code <span data-code>${state.code}</span>${state.deviceName ? ' · ' + escapeHtml(state.deviceName) : ''}</div>
        </div>
        <div class="mobile-body" id="lobby-body"></div>
      </div>
    `;
    const body = document.getElementById('lobby-body');

    let html = `<div class="section-title">Players</div><div class="player-list">`;
    state.profiles.forEach(p => {
      const sel = state.selectedPlayers.find(s => s.id === p.id);
      html += `
        <div class="player-card-m ${sel ? 'selected' : ''}" data-id="${p.id}">
          <div class="dot" style="background:${p.color}"></div>
          <div class="info">
            <div class="name" style="color:${p.color}">${escapeHtml(p.name)}</div>
            <div class="meta">${p.gamesPlayed || 0} games · AVG ${p.average || '–'}</div>
          </div>
          <div style="display:flex; gap:12px; align-items:center;">
            <button class="edit-profile-btn" data-id="${p.id}" style="background:none; border:none; font-size:18px; cursor:pointer; padding:6px; z-index:10;">✏️</button>
            <div class="check">✓</div>
          </div>
        </div>`;
    });
    html += `</div>
      <button class="btn btn-ghost btn-block mt-12" id="add-player-btn">+ ADD PLAYER</button>

      <div class="section-title">Mode</div>
      <div class="mode-grid">
        <button class="mode-btn ${!state.setup.solo && !state.setup.bot ? 'active' : ''}" data-mode="multi">MULTI</button>
        <button class="mode-btn ${state.setup.solo ? 'active' : ''}" data-mode="solo">SOLO</button>
        <button class="mode-btn ${state.setup.bot ? 'active' : ''}" data-mode="bot">VS BOT</button>
      </div>

      ${state.setup.bot ? `
        <div class="section-title">Bot Difficulty</div>
        <div class="mode-grid">
          <button class="mode-btn ${state.setup.botDifficulty==='easy'?'active':''}" data-diff="easy">EASY</button>
          <button class="mode-btn ${state.setup.botDifficulty==='medium'?'active':''}" data-diff="medium">MEDIUM</button>
          <button class="mode-btn ${state.setup.botDifficulty==='hard'?'active':''}" data-diff="hard">HARD</button>
        </div>
      ` : ''}

      <div class="section-title">Start Score</div>
      <div class="mode-grid">
        <button class="mode-btn ${state.setup.startScore===301?'active':''}" data-score="301">301</button>
        <button class="mode-btn ${state.setup.startScore===501?'active':''}" data-score="501">501</button>
        <button class="mode-btn ${state.setup.startScore===701?'active':''}" data-score="701">701</button>
        <button class="mode-btn" data-score="custom">CUSTOM</button>
      </div>

      <div class="section-title">Finish Rule</div>
      <div class="mode-grid">
        <button class="mode-btn ${state.setup.outRule==='double'?'active':''}" data-out="double">DOUBLE OUT</button>
        <button class="mode-btn ${state.setup.outRule==='master'?'active':''}" data-out="master">MASTER OUT</button>
        <button class="mode-btn ${state.setup.outRule==='straight'?'active':''}" data-out="straight">STRAIGHT OUT</button>
      </div>

      <div class="mt-20">
        <button class="btn btn-primary btn-block btn-lg" id="start-btn"
          ${(state.selectedPlayers.length===0 && !state.setup.solo) || (state.setup.solo && state.selectedPlayers.length===0) ? 'disabled' : ''}>
          START ${state.setup.solo ? 'SOLO' : state.setup.bot ? 'VS BOT' : 'MATCH'} (${Math.max(state.selectedPlayers.length, state.setup.solo ? 1 : 0)}${state.setup.bot ? '+1' : ''})
        </button>
      </div>
      <div class="mt-12 text-center">
        <button class="btn btn-ghost" id="view-stats-btn">STATS</button>
      </div>`;
    body.innerHTML = html;

    body.querySelectorAll('.player-card-m').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.edit-profile-btn')) return;
        const id = card.dataset.id;
        const p = state.profiles.find(x => x.id === id);
        const idx = state.selectedPlayers.findIndex(s => s.id === id);
        if (idx >= 0) state.selectedPlayers.splice(idx, 1);
        else if (state.selectedPlayers.length < 4) state.selectedPlayers.push(p);
        renderLobby();
      });
    });

    body.querySelectorAll('.edit-profile-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        showEditPlayer(id);
      });
    });

    body.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        state.setup.solo = m === 'solo';
        state.setup.bot = m === 'bot';
        renderLobby();
      });
    });
    body.querySelectorAll('[data-diff]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.setup.botDifficulty = btn.dataset.diff;
        renderLobby();
      });
    });
    body.querySelectorAll('[data-score]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.score;
        if (s === 'custom') {
          const v = prompt('Start score?', '501');
          if (v && !isNaN(v)) state.setup.startScore = parseInt(v, 10);
        } else state.setup.startScore = parseInt(s, 10);
        renderLobby();
      });
    });
    body.querySelectorAll('[data-out]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.setup.outRule = btn.dataset.out;
        renderLobby();
      });
    });

    document.getElementById('add-player-btn').addEventListener('click', showAddPlayer);
    document.getElementById('start-btn').addEventListener('click', startMatch);
    document.getElementById('view-stats-btn').addEventListener('click', () => {
      if (state.profiles.length) showPlayerStats(state.selectedPlayers[0]?.id || state.profiles[0].id);
    });
  }

  function buildMatchPlayers() {
    let players = state.selectedPlayers.slice();
    if (state.setup.solo) {
      if (players.length === 0) return null;
      players = [players[0]];
    }
    if (players.length === 0) return null;
    return players;
  }

  function emitStartGame(players, startPlayerId) {
    const payload = {
      players,
      mode: 'x01',
      startScore: state.setup.startScore,
      inRule: state.setup.inRule,
      outRule: state.setup.outRule,
      startPlayerId: startPlayerId || players[0].id
    };
    if (state.setup.bot) {
      payload.bot = {
        name: 'BOT',
        difficulty: state.setup.botDifficulty
      };
    }
    socket.emit('start-game', payload);
  }

  function startMatch() {
    const players = buildMatchPlayers();
    if (!players) {
      alert(state.setup.solo ? 'Select yourself first' : 'Select at least one player');
      return;
    }
    const choosable = players.slice();
    if (choosable.length < 2 && !state.setup.bot) {
      emitStartGame(players, players[0].id);
      return;
    }
    showWhoStarts(players);
  }

  function showWhoStarts(players) {
    state.view = 'who-starts';
    const names = players.map(p =>
      `<button class="btn btn-ghost btn-block mt-12 pick-starter" data-id="${p.id}" style="border:2px solid ${p.color};color:${p.color}">${escapeHtml(p.name)}</button>`
    ).join('');

    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1>WHO STARTS?</h1>
          <div class="sub">Choose how to decide</div>
        </div>
        <div class="mobile-body">
          <button class="btn btn-primary btn-block btn-lg" id="opt-coinflip">COIN FLIP</button>
          <button class="btn btn-ghost btn-block btn-lg mt-12" id="opt-offline">PICK OFFLINE</button>
          <button class="btn btn-ghost btn-block mt-20" id="who-back">BACK</button>
          <div id="offline-picks" class="hidden mt-20">
            <div class="section-title">Tap who throws first</div>
            ${names}
          </div>
          <div id="coin-result" class="hidden text-center mt-20"></div>
        </div>
      </div>
    `;

    document.getElementById('who-back').addEventListener('click', showLobby);

    document.getElementById('opt-coinflip').addEventListener('click', () => {
      const pool = players.slice();
      const resultEl = document.getElementById('coin-result');
      const offline = document.getElementById('offline-picks');
      offline.classList.add('hidden');
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = '<p style="font-weight:800;color:var(--text-muted)">Flipping…</p>';

      setTimeout(() => {
        if (state.setup.bot && pool.length === 1) {
          const botStarts = Math.random() < 0.5;
          if (botStarts) {
            resultEl.innerHTML = '<p style="font-size:28px;font-weight:900;color:var(--accent-orange)">BOT STARTS</p>';
            setTimeout(() => {
              const payload = {
                players: pool,
                mode: 'x01',
                startScore: state.setup.startScore,
                inRule: state.setup.inRule,
                outRule: state.setup.outRule,
                startPlayerIndex: 1,
                bot: { name: 'BOT', difficulty: state.setup.botDifficulty }
              };
              socket.emit('start-game', payload);
            }, 700);
          } else {
            resultEl.innerHTML = `<p style="font-size:28px;font-weight:900;color:${pool[0].color}">${escapeHtml(pool[0].name)} STARTS</p>`;
            setTimeout(() => emitStartGame(pool, pool[0].id), 700);
          }
          return;
        }
        const winner = pool[Math.floor(Math.random() * pool.length)];
        resultEl.innerHTML = `<p style="font-size:28px;font-weight:900;color:${winner.color}">${escapeHtml(winner.name)} STARTS</p>`;
        setTimeout(() => emitStartGame(pool, winner.id), 700);
      }, 600);
    });

    document.getElementById('opt-offline').addEventListener('click', () => {
      document.getElementById('coin-result').classList.add('hidden');
      document.getElementById('offline-picks').classList.remove('hidden');
    });

    document.querySelectorAll('.pick-starter').forEach(btn => {
      btn.addEventListener('click', () => {
        emitStartGame(players, btn.dataset.id);
      });
    });
  }

  function showAddPlayer() {
    const taken = takenColors();
    let selectedColor = COLORS.find(c => !taken.has(c.toUpperCase())) || COLORS[0];
    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1>ADD PLAYER</h1>
          <div class="sub">Create profile</div>
        </div>
        <div class="mobile-body">
          <label class="label">Name</label>
          <input class="input" id="new-name" maxlength="20" placeholder="Player name" />
          <label class="label mt-12">Color</label>
          <div class="color-picker" id="color-picker">
            ${COLORS.map(c => {
              const isTaken = taken.has(c.toUpperCase());
              return `<div class="color-swatch ${c===selectedColor?'selected':''} ${isTaken?'taken':''}" data-color="${c}" style="background:${c}"></div>`;
            }).join('')}
          </div>
          <button class="btn btn-primary btn-block btn-lg mt-20" id="save-player">SAVE</button>
          <button class="btn btn-ghost btn-block mt-12" id="cancel-add">CANCEL</button>
        </div>
      </div>
    `;
    document.getElementById('color-picker').addEventListener('click', e => {
      const sw = e.target.closest('.color-swatch:not(.taken)');
      if (!sw) return;
      selectedColor = sw.dataset.color;
      document.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.toggle('selected', s.dataset.color === selectedColor)
      );
    });
    document.getElementById('save-player').addEventListener('click', () => {
      const name = document.getElementById('new-name').value.trim();
      if (!name) return alert('Enter a name');
      socket.emit('create-profile', { name, color: selectedColor });
      setTimeout(showLobby, 350);
    });
    document.getElementById('cancel-add').addEventListener('click', showLobby);
  }

  function showEditPlayer(id) {
    const p = state.profiles.find(x => x.id === id);
    if (!p) return;
    const taken = takenColors();
    taken.delete((p.color || '').toUpperCase());

    let selectedColor = p.color || COLORS[0];
    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1>EDIT PLAYER</h1>
          <div class="sub">Modify or delete profile</div>
        </div>
        <div class="mobile-body">
          <label class="label">Name</label>
          <input class="input" id="edit-name" maxlength="20" value="${escapeHtml(p.name)}" placeholder="Player name" />
          <label class="label mt-12">Color</label>
          <div class="color-picker" id="color-picker">
            ${COLORS.map(c => {
              const isTaken = taken.has(c.toUpperCase());
              return `<div class="color-swatch ${c===selectedColor?'selected':''} ${isTaken?'taken':''}" data-color="${c}" style="background:${c}"></div>`;
            }).join('')}
          </div>
          <button class="btn btn-primary btn-block btn-lg mt-20" id="save-edit-player">SAVE CHANGES</button>
          <button class="btn btn-danger btn-block mt-12" id="delete-player-btn">DELETE PROFILE</button>
          <button class="btn btn-ghost btn-block mt-12" id="cancel-edit">CANCEL</button>
        </div>
      </div>
    `;

    document.getElementById('color-picker').addEventListener('click', e => {
      const sw = e.target.closest('.color-swatch:not(.taken)');
      if (!sw) return;
      selectedColor = sw.dataset.color;
      document.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.toggle('selected', s.dataset.color === selectedColor)
      );
    });

    document.getElementById('save-edit-player').addEventListener('click', () => {
      const name = document.getElementById('edit-name').value.trim();
      if (!name) return alert('Enter a name');
      socket.emit('edit-profile', { id: p.id, name, color: selectedColor });
      setTimeout(showLobby, 350);
    });

    document.getElementById('delete-player-btn').addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete ${p.name}? All stats will be permanently lost.`)) {
        socket.emit('delete-profile', { id: p.id });
        setTimeout(showLobby, 350);
      }
    });

    document.getElementById('cancel-edit').addEventListener('click', showLobby);
  }

  // ---------- In-Game Mobile View ----------
  function renderMobileGame() {
    state.view = 'game';
    if (!state.game || state.game.status !== 'playing') {
      if (state.game && state.game.status === 'finished') showEndScreen();
      else showLobby();
      return;
    }
    const g = state.game;
    const cur = g.players[g.currentPlayerIndex];
    const suggestion = getCheckoutSuggestion(cur.remaining, g.outRule);
    const simple = formatSimpleCheckout(cur.remaining);
    const isBotTurn = cur.isBot;

    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1>DARTDECK</h1>
          <div class="sub">${g.startScore} · ${g.outRule.toUpperCase()} OUT${g.players.some(p=>p.isBot)?' · BOT':''}</div>
        </div>
        <div class="mobile-body" style="padding-bottom:8px;">
          <div class="game-status">
            <div class="who">${isBotTurn ? 'BOT THINKING…' : 'NOW THROWING'}</div>
            <div class="name-big" style="color:${cur.color}">${escapeHtml(cur.name)}${cur.isBot?' 🤖':''}</div>
            <div class="remaining-big">${cur.remaining}</div>
            <div class="checkout-hint">${suggestion || ''}${simple && suggestion !== simple ? ' · ' + simple : ''}</div>
          </div>
          ${isBotTurn ? `
            <div class="text-center" style="padding:40px 0;color:var(--text-muted);font-weight:700;">Bot is throwing darts one-by-one…</div>
          ` : `
            <div class="score-display-m" id="score-display">${state.currentScoreInput || '0'}</div>
            <div class="keypad" id="keypad">
              <button class="key" data-k="1">1</button>
              <button class="key" data-k="2">2</button>
              <button class="key" data-k="3">3</button>
              <button class="key" data-k="4">4</button>
              <button class="key" data-k="5">5</button>
              <button class="key" data-k="6">6</button>
              <button class="key" data-k="7">7</button>
              <button class="key" data-k="8">8</button>
              <button class="key" data-k="9">9</button>
              <button class="key del" data-k="del">⌫</button>
              <button class="key" data-k="0">0</button>
              <button class="key enter" data-k="enter">↵</button>
            </div>
          `}
          <div class="text-center mt-12" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            ${!isBotTurn ? `<button class="btn btn-ghost" id="bust-btn" style="color:var(--danger)">BUST / 0</button>` : ''}
            <button class="btn btn-ghost" id="undo-btn">UNDO</button>
            <button class="btn btn-danger" id="end-game-btn">END</button>
          </div>
        </div>
      </div>
    `;

    if (!isBotTurn) {
      const display = document.getElementById('score-display');
      document.getElementById('keypad').addEventListener('click', e => {
        const btn = e.target.closest('.key');
        if (!btn) return;
        Sounds.click();
        const k = btn.dataset.k;
        if (k === 'del') state.currentScoreInput = state.currentScoreInput.slice(0, -1);
        else if (k === 'enter') { submitScore(); return; }
        else if (state.currentScoreInput.length < 3) state.currentScoreInput += k;
        display.textContent = state.currentScoreInput || '0';
      });
      document.getElementById('bust-btn').addEventListener('click', () => {
        state.currentScoreInput = '0';
        submitScore();
      });
    }
    document.getElementById('undo-btn').addEventListener('click', () => {
      socket.emit('undo');
    });
    document.getElementById('end-game-btn').addEventListener('click', () => {
      if (confirm('End this game?')) {
        socket.emit('new-game');
        showLobby();
      }
    });
  }

  function submitScore() {
    const score = parseInt(state.currentScoreInput || '0', 10);
    if (isNaN(score) || score < 0 || score > 180) {
      alert('Score must be 0–180');
      return;
    }
    socket.emit('score', { score });
    state.currentScoreInput = '';
    state.lastActivity = Date.now();
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function showPlayerStats(id) {
    const p = state.profiles.find(x => x.id === id) || state.profiles[0];
    if (!p) return;
    state.view = 'stats';
    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header">
          <h1 style="color:${p.color}">${escapeHtml(p.name)}</h1>
          <div class="sub">Player stats</div>
        </div>
        <div class="mobile-body">
          <div class="stat-grid">
            <div class="stat-box"><div class="label">Games</div><div class="value">${p.gamesPlayed || 0}</div></div>
            <div class="stat-box"><div class="label">Wins</div><div class="value">${p.wins || 0}</div></div>
            <div class="stat-box"><div class="label">Average</div><div class="value">${p.average || '–'}</div></div>
            <div class="stat-box"><div class="label">Highest Out</div><div class="value">${p.highestCheckout || '–'}</div></div>
          </div>
          <button class="btn btn-ghost btn-block mt-20" id="back-lobby">BACK</button>
        </div>
      </div>
    `;
    document.getElementById('back-lobby').addEventListener('click', showLobby);
  }

  function showEndScreen() {
    state.view = 'end';
    const g = state.game;
    if (!g) { showLobby(); return; }
    const winner = g.players.find(p => p.id === g.winner) || g.players[0];
    app.innerHTML = `
      <div id="mobile-screen" class="screen active">
        <div class="mobile-header"><h1>GAME OVER</h1></div>
        <div class="mobile-body end-screen">
          <h2>WINNER</h2>
          <div class="winner-name" style="color:${winner.color}">${escapeHtml(winner.name)}${winner.isBot?' 🤖':''}</div>
          <div class="end-stats">
            ${g.players.map(p => `
              <div class="row">
                <span style="color:${p.color}">${escapeHtml(p.name)}${p.isBot?' 🤖':''}</span>
                <span>AVG ${p.average || '–'} · ${p.remaining} left</span>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="rematch-btn">REMATCH</button>
          <button class="btn btn-ghost btn-block mt-12" id="back-lobby-end">LOBBY</button>
        </div>
      </div>
    `;
    document.getElementById('rematch-btn').addEventListener('click', () => {
      socket.emit('new-game');
      setTimeout(() => {
        const humans = g.players.filter(p => !p.isBot).map(p => ({
          id: p.id, name: p.name, color: p.color
        }));
        const bot = g.players.find(p => p.isBot);
        const payload = {
          players: humans,
          mode: 'x01',
          startScore: g.startScore,
          outRule: g.outRule
        };
        if (bot) payload.bot = { name: bot.name, difficulty: bot.botDifficulty || 'medium' };
        socket.emit('start-game', payload);
      }, 200);
    });
    document.getElementById('back-lobby-end').addEventListener('click', () => {
      socket.emit('new-game');
      showLobby();
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  connect();
})();