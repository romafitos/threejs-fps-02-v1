// HUD: DOM overlays updated from state every frame. The HUD must show
// health, ammunition, the round timer and the score — plus money, the kill
// feed, the bomb status and the buy menu, so the screenshots and the code
// agree about what the game is.
import { WEAPONS, ROUND } from './state.js';
import { currentSpread } from './weapons.js';

const $ = (id) => document.getElementById(id);

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function alivePips(state, team) {
  return state.players
    .filter((p) => p.team === team)
    .map((p) => `<span class="pip ${p.alive ? 'alive' : 'dead'}"></span>`)
    .join('');
}

export function buildHud(state, player) {
  const root = $('hud');
  root.innerHTML = `
    <div id="crosshair"><i></i><i></i><i></i><i></i></div>
    <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
    <div id="damage-arc"></div>
    <div id="topbar">
      <div class="team-score kestrel"><span class="team-name">KESTREL</span><b id="score-k">0</b><span class="pips" id="pips-k"></span></div>
      <div id="timer">1:40</div>
      <div class="team-score harbor"><span class="pips" id="pips-h"></span><b id="score-h">0</b><span class="team-name">HARBOR</span></div>
    </div>
    <div id="bomb-status">BOMB: CARRIER</div>
    <div id="money">$800</div>
    <div id="killfeed"></div>
    <div id="health-wrap"><div id="health-bar"><div id="health-fill"></div></div><div id="health-num">100</div><div id="armor-num">ARMOR 0</div></div>
    <div id="ammo-wrap"><span id="ammo-mag">12</span><span id="ammo-reserve">/ 36</span><div id="weapon-name">P9 Sidearm</div><div id="reload-hint"></div></div>
    <div id="round-banner" hidden></div>
    <div id="buy-menu" hidden>
      <h2>BUY — KESTREL YARD ARMOURY</h2>
      <p class="buy-money">Money: <b id="buy-money">$800</b> &nbsp;·&nbsp; Press 1–6 to buy, B to close</p>
      <div class="buy-grid">
        <button data-key="1"><b>1 · Longspur AR-9</b><span>Rifle · 34 dmg · $2,700</span></button>
        <button data-key="2"><b>2 · Tempest-9</b><span>SMG · 26 dmg · $1,500</span></button>
        <button data-key="3"><b>3 · P9 Sidearm</b><span>Pistol · 28 dmg · $300</span></button>
        <button data-key="4"><b>4 · Vapor-9 Smoke</b><span>Grenade · blocks sight 12 s · $400</span></button>
        <button data-key="5"><b>5 · Kevlar Armor</b><span>Soaks 50% damage · $650</span></button>
        <button data-key="6"><b>6 · Defuse Kit</b><span>HARBOR only · defuse 2.5 s · $400</span></button>
      </div>
    </div>
    <div id="scoreboard" hidden>
      <h2 id="score-title">ROUND OVER</h2>
      <p id="score-reason"></p>
      <table><thead><tr><th>Player</th><th>Team</th><th>K</th><th>D</th><th>$</th></tr></thead><tbody id="score-rows"></tbody></table>
    </div>
    <div id="toast"></div>
  `;
  root.querySelectorAll('#buy-menu button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (window.__buyKey) window.__buyKey(Number(btn.dataset.key));
    });
  });
}

let hitUntil = 0;
let killUntil = 0;
let lastDamageFrom = null;

export function flashHitmarker(kill, nowMs) {
  const el = $('hitmarker');
  el.classList.add('on');
  if (kill) el.classList.add('kill');
  else el.classList.remove('kill');
  if (kill) killUntil = nowMs + 350;
  else hitUntil = nowMs + 140;
}

export function flashDamage(fromYaw, nowMs) {
  lastDamageFrom = { yaw: fromYaw, until: nowMs + 600 };
}

export function showToast(text, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('on'), ms);
}

export function updateHud(state, player, nowMs) {
  $('score-k').textContent = state.score.kestrel;
  $('score-h').textContent = state.score.harbor;
  $('pips-k').innerHTML = alivePips(state, 'kestrel');
  $('pips-h').innerHTML = alivePips(state, 'harbor');
  const t = state.phase === 'planted' ? state.bomb.fuse : state.timeLeft;
  $('timer').textContent = fmtTime(t);
  $('timer').classList.toggle('urgent', t <= 10 && (state.phase === 'live' || state.phase === 'planted'));

  // Bomb status line: carrier / planted fuse / defusing / defused.
  const bomb = state.bomb;
  const bs = $('bomb-status');
  if (bomb.state === 'carried') {
    const carrier = bomb.carrier;
    bs.textContent = carrier
      ? `BOMB: ${carrier.isPlayer ? 'YOU CARRY IT' : carrier.name + ' CARRIES IT'} → SITE ${bomb.siteKey}`
      : 'BOMB: DROPPED';
    bs.className = '';
  } else if (bomb.state === 'planted') {
    bs.textContent = bomb.defuser
      ? `BOMB PLANTED ${fmtTime(bomb.fuse)} — ${bomb.defuser.name} DEFUSING ${Math.round(bomb.defuseProgress * 100)}%`
      : `BOMB PLANTED AT ${bomb.site} — ${fmtTime(bomb.fuse)}`;
    bs.className = 'planted';
  } else {
    bs.textContent = 'BOMB: SAFE';
    bs.className = '';
  }

  $('money').textContent = `$${player.money}`;
  $('health-num').textContent = Math.max(0, Math.ceil(player.health));
  $('health-fill').style.width = `${Math.max(0, player.health)}%`;
  $('health-fill').classList.toggle('low', player.health <= 30);
  $('armor-num').textContent = `ARMOR ${Math.round(player.armor)}`;
  $('ammo-mag').textContent = player.mag;
  $('ammo-reserve').textContent = `/ ${player.reserve}`;
  $('weapon-name').textContent = WEAPONS[player.weapon].name;
  $('ammo-wrap').classList.toggle('empty', player.mag === 0);
  $('reload-hint').textContent = player.reloading ? 'RELOADING…' : player.mag === 0 ? 'Press R to reload' : '';

  // Crosshair gap mirrors live spread: wide while moving, tight while still.
  const gap = 3 + currentSpread(player) * 900;
  $('crosshair').style.setProperty('--gap', `${Math.min(26, gap).toFixed(1)}px`);

  // Hitmarker fade.
  const hm = $('hitmarker');
  if (nowMs > Math.max(hitUntil, killUntil)) hm.classList.remove('on');

  // Damage direction arc: rotate a red arc toward the shooter.
  const arc = $('damage-arc');
  if (lastDamageFrom && nowMs < lastDamageFrom.until) {
    const rel = lastDamageFrom.yaw - player.yaw;
    arc.style.transform = `translate(-50%, -50%) rotate(${(-rel * 180) / Math.PI}deg)`;
    arc.classList.add('on');
  } else {
    arc.classList.remove('on');
  }

  // Kill feed (last 4).
  $('killfeed').innerHTML = state.killFeed
    .map((k) => `<div class="${k.kill ? 'kill' : ''}">${k.text}</div>`)
    .join('');

  // Round banner + scoreboard. The scoreboard carries the round-end message,
  // so the banner hides whenever it (or the buy menu) is on screen.
  const banner = $('round-banner');
  const buyOpen = (state.phase === 'freeze' || state.phase === 'buy' || window.__buyOpen);
  if (state.phase === 'freeze' || state.phase === 'buy') {
    banner.hidden = buyOpen;
    banner.textContent = state.phase === 'freeze' ? `ROUND ${state.round} — GET READY` : `BUY PHASE — press B for the armoury (${Math.ceil(state.timer)}s)`;
    banner.className = 'info';
  } else {
    banner.hidden = true;
  }
  const sb = $('scoreboard');
  if (state.phase === 'end' || state.phase === 'menu') {
    sb.hidden = false;
    $('score-title').textContent = state.phase === 'menu'
      ? `${state.winner ? state.winner.toUpperCase() : 'MATCH'} — ${state.score.kestrel} : ${state.score.harbor}`
      : `ROUND ${state.round} — ${state.winner.toUpperCase()} WINS`;
    $('score-reason').textContent = state.winReason;
    $('score-rows').innerHTML = [...state.players]
      .sort((a, b) => b.kills - a.kills)
      .map((p) => `<tr class="${p.isPlayer ? 'me' : ''}"><td>${p.name}${p.isPlayer ? ' (YOU)' : ''}</td><td>${p.team}</td><td>${p.kills}</td><td>${p.deaths}</td><td>$${p.money}</td></tr>`)
      .join('');
  } else {
    sb.hidden = true;
  }

  // Buy menu visibility: open during freeze/buy, or when toggled mid-round
  // (buying mid-round is allowed but the menu blocks the view — a tradeoff).
  const buy = $('buy-menu');
  const wantBuy = (state.phase === 'freeze' || state.phase === 'buy' || window.__buyOpen);
  if (wantBuy && !buy.hidden) {
    $('buy-money').textContent = `$${player.money}`;
  }
  buy.hidden = !wantBuy;
}
