import { db, ref, onValue, update, runTransaction } from "./firebase.js";
import { playBuzzerSound } from "./audio.js";
import { watchOverlayConfig } from "./overlay-config.js";

const ROUND5_PATH = "rounds/round5";
const DEFAULT_PHASE = "setup";
const DEFAULT_DAMAGE = 10;
const DAMAGE_STORAGE_KEY = "zogquiz.round5.damage.v1";
const PHASES = {
  SETUP: "setup",
  TARGET_SELECTION: "target_selection",
  DUEL: "duel",
  OUTSIDERS_ANSWER: "outsiders_answer",
  RESULT: "result",
  FINISHED: "finished",
};


const PHASE_LABELS = {
  [PHASES.SETUP]: "Préparation",
  [PHASES.TARGET_SELECTION]: "Choix de la cible",
  [PHASES.DUEL]: "Duel au buzzer",
  [PHASES.OUTSIDERS_ANSWER]: "Réponse des autres",
  [PHASES.RESULT]: "Résultat",
  [PHASES.FINISHED]: "Terminé",
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[char]));

const getParticipantName = (s, id, fallback = "—") => (id && s?.participants?.[id]?.name) || (id || fallback);
const formatPhase = (phase) => PHASE_LABELS[phase] || phase || "—";
const formatBuzzKeyLabel = (code) => {
  if (!code || code === "Space") return "Espace";
  if (code === "Enter") return "Entrée";
  if (code.startsWith?.("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith?.("Digit")) return code.slice(5);
  return code;
};

const defaultRound5 = {
  name: "Mort Subite",
  phase: DEFAULT_PHASE,
  participants: {},
  turn: { order: [], currentIndex: 0, currentPlayerId: null },
  duel: {
    attackerId: null,
    targetId: null,
    question: "",
    buzzerOpen: false,
    buzzedBy: null,
    buzzedAt: 0,
    answerStatus: "pending",
  },
  outsiders: { enabled: false, answers: {}, winnerId: null },
  lastResult: { type: null, message: "", damagedPlayers: {} },
  actionLog: {},
  updatedAt: 0,
  updatedBy: "",
};

const toRound5 = (value) => {
  const normalized = {
    ...defaultRound5,
    ...(value || {}),
    turn: { ...defaultRound5.turn, ...(value?.turn || {}) },
    duel: { ...defaultRound5.duel, ...(value?.duel || {}) },
    outsiders: { ...defaultRound5.outsiders, ...(value?.outsiders || {}) },
    lastResult: { ...defaultRound5.lastResult, ...(value?.lastResult || {}) },
    actionLog: value?.actionLog || {},
    participants: value?.participants || {},
  };
  delete normalized.damage;
  return normalized;
};

const isAlive = (s, id) => {
  const p = s?.participants?.[id];
  return Boolean(p && p.alive !== false && p.eliminated !== true && Number(p.hp || 0) > 0);
};
const getAliveOrder = (s) => (s?.turn?.order || []).filter((id) => isAlive(s, id));
const addLog = (s, msg) => {
  const log = { ...(s.actionLog || {}) };
  log[String(Date.now())] = msg;
  const keys = Object.keys(log).sort().slice(-30);
  const compact = {};
  for (const k of keys) compact[k] = log[k];
  return compact;
};

function sessionToParticipant(id, session, previous = {}) {
  const score = Math.max(0, Number(session?.score || 0));
  const hp = previous.hp != null ? Math.max(0, Number(previous.hp || 0)) : score;
  const alive = hp > 0;
  return { name: String(session?.nickname || previous?.name || id), score, hp, alive, eliminated: !alive, color: session?.color || previous?.color || "#fff" };
}

function buildRound5FromSessions(sessionsById = {}, prev = defaultRound5) {
  const entries = Object.entries(sessionsById || {}).filter(([, v]) => v && v.active !== false).sort((a, b) => Number(b[1]?.score || 0) - Number(a[1]?.score || 0));
  const participants = {}; const order = [];
  for (const [id, session] of entries) { order.push(id); participants[id] = sessionToParticipant(id, session, prev?.participants?.[id]); }
  const alive = order.filter((id) => isAlive({ participants }, id));
  const currentPlayerId = alive.includes(prev?.turn?.currentPlayerId) ? prev.turn.currentPlayerId : (alive[0] || null);
  return { ...toRound5(prev), participants, turn: { order, currentIndex: Math.max(0, order.indexOf(currentPlayerId)), currentPlayerId }, phase: alive.length > 1 ? PHASES.TARGET_SELECTION : PHASES.FINISHED, duel: { ...defaultRound5.duel }, outsiders: { ...defaultRound5.outsiders } };
}

export function initMortSubiteAdmin({ getCurrentAdminId, getSessionsById }) {
  if (!document.getElementById("m5-admin")) return;
  const $ = (id) => document.getElementById(id);
  let round5 = { ...defaultRound5 };
  const save = (patch) => update(ref(db, ROUND5_PATH), { ...patch, damage: null, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });

  onValue(ref(db, ROUND5_PATH), (snap) => { round5 = toRound5(snap.val()); render(); });


  function readStoredDamage() {
    const raw = Number(localStorage.getItem(DAMAGE_STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAMAGE;
  }

  function getConfiguredDamage() {
    const input = $("m5-damage");
    const value = Number(input?.value || 0);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAMAGE;
  }

  function initDamageControl() {
    const input = $("m5-damage");
    if (!input) return;
    input.value = String(readStoredDamage());
    input.addEventListener("input", () => {
      localStorage.setItem(DAMAGE_STORAGE_KEY, String(getConfiguredDamage()));
    });
  }

  function render() {
    const r = round5;
    const alive = getAliveOrder(r);
    const buzzedName = getParticipantName(r, r.duel?.buzzedBy, "");
    const buzzLabel = r.duel?.buzzedBy ? `🔔 ${buzzedName}` : (r.duel?.buzzerOpen ? "Buzzer ouvert · aucun buzz" : "Aucun buzz");
    $("m5-status").textContent = `Phase: ${r.phase} | Joueur actif: ${r.participants?.[r.turn?.currentPlayerId]?.name || "—"}`;
    $("m5-buzz-live").textContent = buzzLabel;
    const options = alive.map((id) => `<option value="${id}">${r.participants?.[id]?.name || id}</option>`).join("");
    $("m5-duel-attacker").innerHTML = options;
    $("m5-duel-target").innerHTML = options;
    $("m5-current-player").innerHTML = options;
    $("m5-hp-player").innerHTML = (r.turn?.order || []).map((id) => `<option value="${id}">${r.participants?.[id]?.name || id}</option>`).join("");
    $("m5-outsider-winner").innerHTML = Object.keys(r.outsiders?.answers || {}).map((id) => `<option value="${id}">${r.participants?.[id]?.name || id}</option>`).join("");
    if (r.duel?.attackerId) $("m5-duel-attacker").value = r.duel.attackerId;
    if (r.duel?.targetId) $("m5-duel-target").value = r.duel.targetId;
    if (r.turn?.currentPlayerId) $("m5-current-player").value = r.turn.currentPlayerId;
    $("m5-participants-live").innerHTML = (r.turn?.order || []).map((id) => {
      const p = r.participants?.[id] || {};
      return `<li>${p.name || id} · score:${p.score || 0} · PV:${p.hp || 0} · ${isAlive(r, id) ? "vivant" : "éliminé"}</li>`;
    }).join("");
    $("m5-outsider-live").innerHTML = Object.entries(r.outsiders?.answers || {}).map(([id, a]) => `<li>${r.participants?.[id]?.name || id}: ${a?.answer || ""}</li>`).join("") || "<li>Aucune réponse</li>";
  }

  initDamageControl();

  $("m5-init-hp").onclick = async () => save(buildRound5FromSessions(getSessionsById?.() || {}, round5));
  $("m5-set-active-player").onclick = async () => save({ turn: { ...round5.turn, currentPlayerId: $("m5-current-player").value, currentIndex: Math.max(0, (round5.turn?.order || []).indexOf($("m5-current-player").value)) } });
  $("m5-start-duel").onclick = async () => save({ phase: PHASES.DUEL, duel: { ...round5.duel, attackerId: $("m5-duel-attacker").value, targetId: $("m5-duel-target").value, question: $("m5-question").value.trim(), buzzerOpen: true, buzzedBy: null, buzzedAt: 0, answerStatus: "pending" }, outsiders: { ...defaultRound5.outsiders } });
  $("m5-open-buzzer").onclick = async () => save({ duel: { ...round5.duel, buzzerOpen: true, buzzedBy: null, buzzedAt: 0 } });
  $("m5-close-buzzer").onclick = async () => save({ duel: { ...round5.duel, buzzerOpen: false } });
  $("m5-mark-fail").onclick = async () => save({ phase: PHASES.OUTSIDERS_ANSWER, duel: { ...round5.duel, buzzerOpen: false, answerStatus: "wrong" }, outsiders: { ...round5.outsiders, enabled: true }, lastResult: { type: "duel_failed", message: "Duel raté, outsiders autorisés.", damagedPlayers: {} } });
  $("m5-reset").onclick = async () => save({ ...defaultRound5, name: "Mort Subite" });

  const adjustHp = async (delta) => runTransaction(ref(db, ROUND5_PATH), (curr) => {
    const s = toRound5(curr); const id = $("m5-hp-player").value; if (!id || !s.participants?.[id]) return s;
    const hp = Math.max(0, Number(s.participants[id].hp || 0) + delta);
    s.participants[id] = { ...s.participants[id], hp, alive: hp > 0, eliminated: hp <= 0 };
    return { ...s, participants: s.participants, actionLog: addLog(s, `${delta > 0 ? "+" : ""}${delta} PV -> ${s.participants[id].name}`), updatedAt: Date.now() };
  });
  $("m5-hp-plus").onclick = () => adjustHp(Number($("m5-hp-amount").value || 1));
  $("m5-hp-minus").onclick = () => adjustHp(-Number($("m5-hp-amount").value || 1));

  $("m5-mark-correct").onclick = async () => runTransaction(ref(db, ROUND5_PATH), (curr) => {
    const s = toRound5(curr); const winner = s.duel?.buzzedBy; if (!winner) return s;
    const loser = winner === s.duel.attackerId ? s.duel.targetId : s.duel.attackerId;
    const damage = getConfiguredDamage(); const hp = Math.max(0, Number(s.participants?.[loser]?.hp || 0) - damage);
    s.participants[loser] = { ...s.participants[loser], hp, alive: hp > 0, eliminated: hp <= 0 };
    return { ...s, participants: s.participants, phase: getAliveOrder({ ...s, participants: s.participants }).length <= 1 ? PHASES.FINISHED : PHASES.RESULT, duel: { ...s.duel, buzzerOpen: false, answerStatus: "correct" }, lastResult: { type: "duel_correct", message: `${s.participants?.[winner]?.name || winner} touche ${s.participants?.[loser]?.name || loser}`, damagedPlayers: { [loser]: damage } }, actionLog: addLog(s, `Bonne réponse duel: ${winner}`), updatedAt: Date.now() };
  });

  $("m5-outsider-correct").onclick = async () => runTransaction(ref(db, ROUND5_PATH), (curr) => {
    const s = toRound5(curr); const win = $("m5-outsider-winner").value || Object.keys(s.outsiders?.answers || {})[0]; if (!win) return s;
    const damage = getConfiguredDamage(); const damagedPlayers = {};
    for (const id of [s.duel.attackerId, s.duel.targetId]) {
      if (!id || !s.participants[id]) continue;
      const hp = Math.max(0, Number(s.participants[id].hp || 0) - damage);
      s.participants[id] = { ...s.participants[id], hp, alive: hp > 0, eliminated: hp <= 0 };
      damagedPlayers[id] = damage;
    }
    return { ...s, participants: s.participants, phase: getAliveOrder({ ...s, participants: s.participants }).length <= 1 ? PHASES.FINISHED : PHASES.RESULT, outsiders: { ...s.outsiders, winnerId: win }, lastResult: { type: "outsider_correct", message: `${s.participants?.[win]?.name || win} a répondu juste`, damagedPlayers }, actionLog: addLog(s, `Outsider correct: ${win}`), updatedAt: Date.now() };
  });

  $("m5-next-turn").onclick = async () => runTransaction(ref(db, ROUND5_PATH), (curr) => {
    const s = toRound5(curr); const alive = getAliveOrder(s); if (alive.length <= 1) return { ...s, phase: PHASES.FINISHED };
    const i = Math.max(0, alive.indexOf(s.turn?.currentPlayerId)); const next = alive[(i + 1) % alive.length];
    return { ...s, phase: PHASES.TARGET_SELECTION, turn: { ...s.turn, currentPlayerId: next, currentIndex: Math.max(0, (s.turn?.order || []).indexOf(next)) }, duel: { ...defaultRound5.duel }, outsiders: { ...defaultRound5.outsiders }, updatedAt: Date.now() };
  });
}

export function initMortSubiteGuest({ getCurrentSessionId, getBuzzKeyCode, isTypingContext: isGuestTypingContext } = {}) {
  const root = document.getElementById("guest-round5");
  if (!root) return;

  const $ = (id) => document.getElementById(id);
  const els = {
    hp: $("m5-guest-hp"),
    playerState: $("m5-guest-player-state"),
    duel: $("m5-guest-duel"),
    phase: $("m5-guest-phase"),
    action: $("m5-guest-action"),
    duelCard: $("m5-duel-card"),
    duelTitle: $("m5-guest-duel-title"),
    question: $("m5-guest-question"),
    buzz: $("m5-guest-buzz"),
    buzzStatus: $("m5-guest-buzz-status"),
    outsiderCard: $("m5-outsider-card"),
    outsiderForm: $("m5-outsider-form"),
    outsiderInput: $("m5-outsider-input"),
    outsiderStatus: $("m5-outsider-status"),
    result: $("m5-guest-result"),
  };

  let round5 = defaultRound5;
  let lastBuzzToken = null;
  let buzzInFlight = false;
  const meAlive = (me) => Boolean(me && isAlive(round5, me));
  const getMe = () => getCurrentSessionId?.() || null;

  function triggerDuelBuzzSound(state) {
    const buzzedBy = state?.duel?.buzzedBy;
    if (!buzzedBy) {
      lastBuzzToken = null;
      return;
    }

    const token = `${Number(state.duel?.buzzedAt || 0)}::${buzzedBy}`;
    if (token === lastBuzzToken) return;

    lastBuzzToken = token;
    playBuzzerSound();
  }

  onValue(ref(db, ROUND5_PATH), (snap) => {
    round5 = toRound5(snap.val());
    triggerDuelBuzzSound(round5);
    render();
  });

  function getRoleState(me) {
    const duelists = [round5.duel?.attackerId, round5.duel?.targetId].filter(Boolean);
    const hasActiveDuel = duelists.length === 2 && round5.phase === PHASES.DUEL;
    const isDuelist = Boolean(me && duelists.includes(me));
    const alive = meAlive(me);
    const canBuzz = hasActiveDuel && round5.duel?.buzzerOpen && alive && isDuelist && !round5.duel?.buzzedBy && !buzzInFlight;
    const outsiderAllowed = round5.phase === PHASES.OUTSIDERS_ANSWER && round5.outsiders?.enabled && alive && !isDuelist;
    return { duelists, hasActiveDuel, isDuelist, alive, canBuzz, outsiderAllowed };
  }

  function renderHpList() {
    const orderedIds = round5.turn?.order || [];
    if (!orderedIds.length) {
      els.hp.innerHTML = "<li>Aucun joueur initialisé pour la mort subite.</li>";
      return;
    }

    els.hp.innerHTML = orderedIds.map((id) => {
      const participant = round5.participants?.[id] || {};
      const alive = isAlive(round5, id);
      const isCurrent = id === round5.turn?.currentPlayerId;
      const isDuelist = [round5.duel?.attackerId, round5.duel?.targetId].includes(id);
      const badges = [isCurrent ? "Tour" : "", isDuelist ? "Duel" : "", alive ? "Vivant" : "Éliminé"].filter(Boolean);
      return `<li class="m5-hp-item ${alive ? "" : "is-dead"}"><span><strong>${escapeHtml(participant.name || id)}</strong><small>${escapeHtml(badges.join(" · "))}</small></span><strong>${Number(participant.hp || 0)} PV</strong></li>`;
    }).join("");
  }

  function render() {
    const me = getMe();
    const role = getRoleState(me);
    const meName = getParticipantName(round5, me, "—");
    const attackerName = getParticipantName(round5, round5.duel?.attackerId, "—");
    const targetName = getParticipantName(round5, round5.duel?.targetId, "—");
    const buzzedName = getParticipantName(round5, round5.duel?.buzzedBy, "");
    const alreadyAnswered = Boolean(me && round5.outsiders?.answers?.[me]);

    renderHpList();

    els.playerState.textContent = me ? `${meName} · ${role.alive ? "vivant" : "éliminé"}` : "Non connecté";
    els.duel.textContent = `${attackerName} VS ${targetName}`;
    els.phase.textContent = formatPhase(round5.phase);
    els.question.textContent = round5.duel?.question || "Question en attente côté admin.";
    els.result.textContent = round5.lastResult?.message || (round5.phase === PHASES.FINISHED ? "Mort subite terminée." : "Aucun résultat pour le moment.");

    els.duelCard.classList.toggle("hidden", !role.hasActiveDuel && !role.isDuelist);
    els.duelCard.classList.toggle("is-duelist", role.isDuelist);
    els.duelCard.classList.toggle("is-buzzer-open", role.canBuzz);
    els.outsiderCard.classList.toggle("hidden", role.isDuelist || ![PHASES.DUEL, PHASES.OUTSIDERS_ANSWER].includes(round5.phase));
    els.outsiderForm.classList.toggle("hidden", !role.outsiderAllowed || alreadyAnswered);
    els.buzz.classList.toggle("hidden", !role.isDuelist || !role.hasActiveDuel);
    els.buzz.disabled = !role.canBuzz;

    if (!me) {
      els.action.textContent = "Connectez-vous pour participer à la mort subite.";
    } else if (!role.alive) {
      els.action.textContent = "Vous êtes éliminé : suivez la fin de la manche.";
    } else if (role.canBuzz) {
      els.action.textContent = "Duel ouvert : buzzez le plus vite possible !";
    } else if (role.isDuelist && round5.duel?.buzzedBy === me) {
      els.action.textContent = "Vous avez buzzé : donnez votre réponse à l’oral.";
    } else if (role.isDuelist && round5.phase === PHASES.DUEL) {
      els.action.textContent = round5.duel?.buzzedBy ? `${buzzedName} a buzzé.` : "Vous êtes en duel : attendez l’ouverture du buzzer.";
    } else if (role.outsiderAllowed) {
      els.action.textContent = alreadyAnswered ? "Réponse envoyée, attendez la validation admin." : "Les duellistes ont raté : envoyez votre réponse écrite.";
    } else if (round5.phase === PHASES.TARGET_SELECTION) {
      els.action.textContent = me === round5.turn?.currentPlayerId ? "C’est votre tour : annoncez votre cible à l’admin." : "Choix de la cible en cours.";
    } else {
      els.action.textContent = "Attendez les instructions admin.";
    }

    els.duelTitle.textContent = role.isDuelist ? "Vous êtes en duel" : "Duel en cours";
    if (!role.hasActiveDuel) {
      els.buzzStatus.textContent = "Duel en attente de deux joueurs côté admin.";
    } else if (role.canBuzz) {
      els.buzzStatus.textContent = `Buzzer ouvert · touche ${formatBuzzKeyLabel(getBuzzKeyCode?.() || "Space")}.`;
    } else if (buzzInFlight && role.isDuelist) {
      els.buzzStatus.textContent = "Buzz en cours d’envoi…";
    } else if (round5.duel?.buzzedBy) {
      els.buzzStatus.textContent = `Buzz pris par ${buzzedName}.`;
    } else {
      els.buzzStatus.textContent = role.isDuelist ? "Buzzer fermé pour l’instant." : "Réservé aux deux joueurs du duel.";
    }

    if (alreadyAnswered) {
      els.outsiderStatus.textContent = `Réponse envoyée : ${round5.outsiders.answers[me]?.answer || "—"}`;
    } else if (role.outsiderAllowed) {
      els.outsiderStatus.textContent = "Champ actif : envoyez une seule réponse claire.";
    } else if (role.isDuelist) {
      els.outsiderStatus.textContent = "Les joueurs en duel n’ont pas accès au champ texte.";
    } else {
      els.outsiderStatus.textContent = "Le champ texte s’ouvrira si l’admin passe la main aux autres joueurs.";
    }
  }

  async function buzzDuel() {
    const me = getMe();
    const role = getRoleState(me);
    if (!role.canBuzz) return;
    buzzInFlight = true;
    render();
    try {
      await runTransaction(ref(db, ROUND5_PATH), (curr) => {
        const s = toRound5(curr);
        const duelist = [s.duel?.attackerId, s.duel?.targetId].includes(me);
        if (!(s.phase === PHASES.DUEL && s.duel?.buzzerOpen && duelist && isAlive(s, me) && !s.duel?.buzzedBy)) return s;
        return { ...s, duel: { ...s.duel, buzzerOpen: false, buzzedBy: me, buzzedAt: Date.now() }, updatedAt: Date.now() };
      });
    } finally {
      buzzInFlight = false;
      render();
    }
  }

  els.buzz.onclick = buzzDuel;

  document.addEventListener("keydown", async (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if ((event.code || event.key) !== (getBuzzKeyCode?.() || "Space")) return;
    if (typeof isGuestTypingContext === "function") {
      if (isGuestTypingContext(event.target)) return;
    } else {
      const target = event.target;
      const tag = target instanceof HTMLElement ? target.tagName.toLowerCase() : "";
      if (target?.isContentEditable || ["input", "textarea", "select"].includes(tag)) return;
    }
    const role = getRoleState(getMe());
    if (!role.canBuzz) return;
    event.preventDefault();
    await buzzDuel();
  });

  els.outsiderForm.onsubmit = async (event) => {
    event.preventDefault();
    const me = getMe();
    const answer = els.outsiderInput.value.trim();
    if (!answer) return;
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr);
      const duelist = [s.duel?.attackerId, s.duel?.targetId].includes(me);
      if (!(s.phase === PHASES.OUTSIDERS_ANSWER && s.outsiders?.enabled && isAlive(s, me) && !duelist)) return s;
      const answers = { ...(s.outsiders?.answers || {}), [me]: { answer, timestamp: Date.now() } };
      return { ...s, outsiders: { ...s.outsiders, answers }, updatedAt: Date.now() };
    });
    els.outsiderInput.value = "";
  };
}

export function initMortSubiteOverlay() {
  const leftFighter = document.getElementById("m5o-left-fighter");
  const rightFighter = document.getElementById("m5o-right-fighter");
  if (!leftFighter || !rightFighter) return;

  const root = document.documentElement;
  const elements = {
    left: {
      fighter: leftFighter,
      name: document.getElementById("m5o-left-name"),
      hp: document.getElementById("m5o-left-hp"),
      bar: document.getElementById("m5o-left-bar"),
    },
    right: {
      fighter: rightFighter,
      name: document.getElementById("m5o-right-name"),
      hp: document.getElementById("m5o-right-hp"),
      bar: document.getElementById("m5o-right-bar"),
    },
  };

  let roundState = defaultRound5;
  let overlayConfig = null;

  const setCssVar = (name, value) => root.style.setProperty(name, value);

  function applyOverlayConfig(config) {
    overlayConfig = config;
    setCssVar("--m5-name-font-size", `${config.nameFontSizePx}px`);
    setCssVar("--m5-hp-font-size", `${config.hpFontSizePx}px`);
    setCssVar("--m5-text-color", config.textColor);
    setCssVar("--m5-health-color", config.healthColor);
    setCssVar("--m5-health-danger-color", config.dangerColor);
    setCssVar("--m5-health-height", `${config.barHeightPx}px`);
    setCssVar("--m5-health-radius", `${config.cornerRadiusPx}px`);
    setCssVar("--m5-health-max-width", `${config.maxWidthPx}px`);
    setCssVar("--m5-health-padding", `${config.screenPaddingPx}px`);
    setCssVar("--m5-health-gap", `${config.barGapPx}px`);
    setCssVar("--m5-frame-opacity", String(config.frameOpacity));
    setCssVar("--m5-dimmed-opacity", String(config.dimmedOpacity));
    render();
  }

  function getDuelistIds(state) {
    const attackerId = state.duel?.attackerId;
    const targetId = state.duel?.targetId;
    if (attackerId || targetId) return [attackerId, targetId];
    const alive = getAliveOrder(state);
    return [state.turn?.currentPlayerId || alive[0] || null, alive.find((id) => id !== state.turn?.currentPlayerId) || alive[1] || null];
  }

  function getHpPercent(state, id) {
    if (!id) return 0;
    const participant = state.participants?.[id] || {};
    const hp = Math.max(0, Number(participant.hp || 0));
    const configuredMax = Number(overlayConfig?.maxHp || 0);
    const scoreMax = Math.max(0, Number(participant.score || 0));
    const liveMax = Math.max(...Object.values(state.participants || {}).map((p) => Number(p?.hp || 0)), 0);
    const maxHp = configuredMax > 0 ? configuredMax : Math.max(scoreMax, liveMax, hp, 1);
    return Math.max(0, Math.min(100, (hp / maxHp) * 100));
  }

  function renderSide(side, id) {
    const refs = elements[side];
    const participant = id ? roundState.participants?.[id] : null;
    const hp = Math.max(0, Number(participant?.hp || 0));
    const alive = id ? isAlive(roundState, id) : false;
    refs.name.textContent = participant?.name || "—";
    refs.hp.textContent = `${hp} PV`;
    refs.bar.style.setProperty("--hp-percent", String(getHpPercent(roundState, id)));
    refs.fighter.classList.toggle("is-empty", !id || !participant);
    refs.fighter.classList.toggle("is-dead", Boolean(id && !alive));
  }

  function render() {
    const [leftId, rightId] = getDuelistIds(roundState);
    renderSide("left", leftId);
    renderSide("right", rightId);
  }

  watchOverlayConfig("round5", applyOverlayConfig);
  onValue(ref(db, ROUND5_PATH), (snap) => {
    roundState = toRound5(snap.val());
    render();
  });
}
