// Rounds: freeze -> buy -> live -> (planted) -> end. First to 8, max 15.
// Wins: eliminate the enemy team, detonate the planted bomb, or defuse it.
// Economy: kill +$300, win +$3,250, loss +$1,900 (loss streak +$500, cap
// $3,400), plant +$300. Money persists across rounds.
import { ROUND, ECONOMY, WEAPONS, makeRng } from './state.js';
import { spawns, sites } from './map.js';
import { assignRoutes, onBotDeath } from './bots.js';
import { clearSmoke } from './combat.js';

function aliveCount(state, team) {
  return state.players.filter((p) => p.team === team && p.alive).length;
}

function pickCarrier(state) {
  // The carrier is a random Kestrel bot (or the player if they are Kestrel).
  const attackers = state.players.filter((p) => p.team === 'kestrel' && p.alive);
  if (attackers.length === 0) return null;
  const idx = Math.floor(state.rng() * attackers.length);
  return attackers[idx];
}

export function startRound(state, scene) {
  state.seed = state.round * 7919 + 13;
  state.rng = makeRng(state.seed);
  state.phase = 'freeze';
  state.timer = ROUND.freezeSeconds;
  state.timeLeft = ROUND.roundSeconds;
  state.winner = null;
  state.winReason = '';
  state.bomb = { state: 'carried', site: null, fuse: 0, carrier: null, plantProgress: 0, defuseProgress: 0, defuser: null, siteKey: null };
  clearSmoke(state, scene);
  state.killFeed.length = 0;

  // Respawn everyone at their team's spawn, facing the yard.
  for (const p of state.players) {
    const list = p.team === 'kestrel' ? spawns.kestrel : spawns.harbor;
    const i = state.players.filter((q) => q.team === p.team).indexOf(p);
    const s = list[i % list.length];
    p.pos.set(s.x, 0, s.z);
    p.yaw = s.yaw;
    p.pitch = 0;
    p.vel.set(0, 0, 0);
    p.alive = true;
    p.health = 100;
    p.armor = p.armor > 0 ? p.armor : 0;
    p.mag = WEAPONS[p.weapon].mag;
    p.reserve = WEAPONS[p.weapon].reserve;
    p.reloading = false;
    p.state = 'advance';
    p.waypoint = 0;
    p.target = null;
    if (p.mesh) p.mesh.visible = true;
  }

  // The carrier is chosen fresh each round; the plant target alternates so
  // both sites see play across the match.
  state.bomb.carrier = pickCarrier(state);
  state.bomb.siteKey = state.round % 2 === 1 ? 'A' : 'B';
  const bots = state.players.filter((p) => !p.isPlayer);
  assignRoutes(state, bots);
  state.events.push({ kind: 'round', text: `ROUND ${state.round} — KESTREL ${state.score.kestrel} : ${state.score.harbor} HARBOR`, at: state.tick });
}

function endRound(state, winner, reason) {
  if (state.phase === 'end') return;
  state.phase = 'end';
  state.timer = ROUND.endSeconds;
  state.winner = winner;
  state.winReason = reason;
  state.score[winner] += 1;
  const loser = winner === 'kestrel' ? 'harbor' : 'kestrel';
  state.lossStreak[loser] += 1;
  state.lossStreak[winner] = 0;
  // Economy payout.
  for (const p of state.players) {
    if (p.team === winner) {
      p.money += ECONOMY.winReward;
    } else {
      const streak = Math.min(state.lossStreak[loser], 5);
      p.money += Math.min(ECONOMY.lossReward + (streak - 1) * ECONOMY.lossStreakBonus, ECONOMY.lossStreakCap);
    }
  }
  state.roundLog.push({ round: state.round, winner, reason, score: { ...state.score } });
  state.events.push({ kind: 'round-end', text: `${winner.toUpperCase()} WINS THE ROUND — ${reason}`, at: state.tick });
}

function nextRoundOrMatch(state, scene) {
  if (state.score.kestrel >= ROUND.winRounds || state.score.harbor >= ROUND.winRounds || state.round >= ROUND.maxRounds) {
    state.phase = 'menu';
    state.winner = state.score.kestrel > state.score.harbor ? 'kestrel' : 'harbor';
    state.winReason = 'MATCH WON';
    state.events.push({ kind: 'match', text: `${state.winner.toUpperCase()} WINS THE MATCH ${state.score.kestrel}–${state.score.harbor}`, at: state.tick });
    return;
  }
  state.round += 1;
  startRound(state, scene);
}

// Plant / defuse progress. Called every tick while live or planted.
function updateBomb(state, dt, input) {
  const bomb = state.bomb;
  if (bomb.state === 'carried') {
    const carrier = bomb.carrier;
    if (!carrier || !carrier.alive) {
      // Carrier died: the bomb drops to the nearest living attacker.
      const next = state.players.find((p) => p.team === 'kestrel' && p.alive);
      bomb.carrier = next || null;
      bomb.plantProgress = 0;
      return;
    }
    // Planting: hold E inside a site radius for 3.5 s.
    const site = sites[bomb.siteKey];
    const inSite = Math.hypot(carrier.pos.x - site.x, carrier.pos.z - site.z) < 4.5;
    const wantsPlant = carrier.isPlayer ? input.useHeld : carrier.state === 'plant' || inSite;
    if (inSite && wantsPlant) {
      bomb.plantProgress += dt;
      if (bomb.plantProgress >= ROUND.plantSeconds) {
        bomb.state = 'planted';
        bomb.site = bomb.siteKey;
        bomb.fuse = ROUND.fuseSeconds;
        state.phase = 'planted';
        carrier.money += ECONOMY.plantReward;
        state.events.push({ kind: 'bomb', text: `BOMB PLANTED AT SITE ${bomb.site} — 40s FUSE`, at: state.tick });
        // Harbor bots start rotating in bots.js on the planted state.
      }
    } else {
      bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 2);
    }
    // Bots walk to the site on their own: when the carrier bot arrives, it plants.
    if (!carrier.isPlayer && inSite && carrier.state !== 'plant') {
      carrier.state = 'plant';
    }
  } else if (bomb.state === 'planted') {
    bomb.fuse -= dt;
    if (bomb.fuse <= 0) {
      endRound(state, 'kestrel', 'Bomb detonated');
      return;
    }
    // Defuse: a Harbor combatant holds E on the planted bomb.
    const defuser = state.players.find((p) => p.team === 'harbor' && p.alive
      && Math.hypot(p.pos.x - sites[bomb.site].x, p.pos.z - sites[bomb.site].z) < 3.5);
    if (defuser) {
      const rate = defuser.hasKit ? ROUND.defuseKitSeconds : ROUND.defuseSeconds;
      bomb.defuser = defuser;
      bomb.defuseProgress += dt / rate;
      if (bomb.defuseProgress >= 1) {
        endRound(state, 'harbor', 'Bomb defused');
      }
    } else {
      bomb.defuser = null;
      bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt / 2);
    }
  }
}

export function stepRounds(state, dt, input, scene) {
  if (state.phase === 'menu') return;
  state.timer -= dt;
  const kestrelAlive = aliveCount(state, 'kestrel');
  const harborAlive = aliveCount(state, 'harbor');

  switch (state.phase) {
    case 'freeze':
      if (state.timer <= 0) {
        state.phase = 'buy';
        state.timer = ROUND.buySeconds;
      }
      break;
    case 'buy':
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND.roundSeconds;
        state.timeLeft = ROUND.roundSeconds;
      }
      break;
    case 'live':
      state.timeLeft = Math.max(0, state.timer);
      updateBomb(state, dt, input);
      if (state.phase !== 'live') break; // plant switched to 'planted', or end
      if (kestrelAlive === 0) endRound(state, 'harbor', 'KESTREL eliminated');
      else if (harborAlive === 0) endRound(state, 'kestrel', 'HARBOR eliminated');
      else if (state.timer <= 0) endRound(state, 'harbor', 'Time expired — no plant');
      break;
    case 'planted':
      state.timeLeft = Math.max(0, bombFuse(state));
      updateBomb(state, dt, input);
      if (state.phase === 'end') break;
      if (kestrelAlive === 0 && state.bomb.state === 'planted') {
        // Attackers all dead but the bomb is down: Harbor must still defuse.
        // If nobody defuses in the remaining fuse, it detonates.
      } else if (kestrelAlive === 0 && state.bomb.state !== 'planted') {
        endRound(state, 'harbor', 'KESTREL eliminated');
      } else if (harborAlive === 0) {
        // No defenders left: the bomb will detonate unless the fuse is cut.
        // (Detonation is handled by updateBomb's fuse countdown.)
      }
      break;
    case 'end':
      if (state.timer <= 0) nextRoundOrMatch(state, scene);
      break;
    default:
      break;
  }
}

function bombFuse(state) {
  return state.bomb.fuse;
}

// Death hook: called by combat when a combatant is killed.
export function onKill(state, victim) {
  if (!victim.isPlayer) onBotDeath(victim);
  if (state.bomb.carrier === victim) {
    state.bomb.plantProgress = 0;
  }
}
