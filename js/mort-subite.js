import { db, ref, onValue, update, runTransaction } from "./firebase.js";
import { playBuzzerSound } from "./audio.js";
import { watchOverlayConfig } from "./overlay-config.js";

const ROUND5_PATH = "rounds/round5";
const ROUND5_LEGACY_PATH = "rooms/manche5/state";
const QUIZ_STATE_PATH = "quiz/state";
const ROUND5_LIVE_ROUND = "manche5";
const DEFAULT_PHASE = "setup";
const DEFAULT_DAMAGE = 10;
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
  settings: { damage: DEFAULT_DAMAGE },
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
    settings: { ...defaultRound5.settings, ...(value?.settings || {}), damage: Number(value?.settings?.damage ?? value?.damage ?? DEFAULT_DAMAGE) },
    lastResult: { ...defaultRound5.lastResult, ...(value?.lastResult || {}) },
    actionLog: value?.actionLog || {},
    participants: value?.participants || {},
  };
  delete normalized.damage;
  return normalized;
};


function legacyToRound5(value) {
  if (!value || value.participants || value.turn) return toRound5(value);

  const participants = {};
  const ids = Array.from(new Set([
    ...(value.turnOrder || []),
    ...Object.keys(value.hpByPlayer || {}),
    ...Object.keys(value.eliminated || {}),
    value.currentTurnPlayerId,
    value.targetPlayerId,
    value.duel?.attackerId,
    value.duel?.targetId,
  ].filter(Boolean)));

  ids.forEach((id) => {
    const hp = Math.max(0, Number(value.hpByPlayer?.[id] ?? DEFAULT_DAMAGE));
    const eliminated = Boolean(value.eliminated?.[id]) || hp <= 0;
    participants[id] = {
      name: id,
      score: hp,
      initialHp: Math.max(hp, DEFAULT_DAMAGE),
      maxHp: Math.max(hp, DEFAULT_DAMAGE, 1),
      hp,
      alive: !eliminated,
      eliminated,
      color: "#fff",
    };
  });

  const duel = { ...defaultRound5.duel, ...(value.duel || {}) };
  const legacyPhase = value.duel?.phase;
  const phase = value.phase
    || (legacyPhase === "duel" ? PHASES.DUEL : null)
    || (legacyPhase === "target" ? PHASES.TARGET_SELECTION : null)
    || (value.active ? PHASES.TARGET_SELECTION : DEFAULT_PHASE);

  return toRound5({
    name: value.name || "Mort Subite",
    phase,
    participants,
    turn: {
      order: ids,
      currentIndex: Math.max(0, ids.indexOf(value.currentTurnPlayerId)),
      currentPlayerId: value.currentTurnPlayerId || ids[0] || null,
    },
    duel: {
      ...duel,
      attackerId: duel.attackerId || value.currentTurnPlayerId || null,
      targetId: duel.targetId || value.targetPlayerId || null,
      buzzerOpen: Boolean(duel.buzzerOpen),
    },
    settings: { damage: Number(value.damage || value.settings?.damage || DEFAULT_DAMAGE) },
    updatedAt: Number(value.updatedAt || 0),
    updatedBy: value.updatedBy || "",
  });
}

function toLegacyRound5Patch(state) {
  const s = toRound5(state);
  const hpByPlayer = {};
  const eliminated = {};
  Object.entries(s.participants || {}).forEach(([id, participant]) => {
    hpByPlayer[id] = Math.max(0, Number(participant?.hp || 0));
    eliminated[id] = participant?.alive === false || participant?.eliminated === true || hpByPlayer[id] <= 0;
  });
  return {
    active: s.phase !== PHASES.SETUP && s.phase !== PHASES.FINISHED,
    turnOrder: s.turn?.order || [],
    hpByPlayer,
    eliminated,
    currentTurnPlayerId: s.turn?.currentPlayerId || null,
    targetPlayerId: s.duel?.targetId || null,
    duel: { ...s.duel, phase: s.phase === PHASES.DUEL ? "duel" : "target" },
    phase: s.phase,
    settings: s.settings,
    participants: s.participants || {},
    updatedAt: s.updatedAt || Date.now(),
    updatedBy: s.updatedBy || "",
  };
}

function chooseNewestRound5(primary, legacy) {
  const main = toRound5(primary);
  const fallback = legacyToRound5(legacy);
  return Number(fallback.updatedAt || 0) > Number(main.updatedAt || 0) ? fallback : main;
}

async function runRound5SyncedTransaction(updater) {
  const result = await runTransaction(ref(db, ROUND5_PATH), updater);
  if (result?.committed) {
    await update(ref(db, ROUND5_LEGACY_PATH), toLegacyRound5Patch(result.snapshot.val()));
  }
  return result;
}

async function publishRound5Live(updatedBy = "admin") {
  await update(ref(db, QUIZ_STATE_PATH), {
    activeRound: ROUND5_LIVE_ROUND,
    liveRound: ROUND5_LIVE_ROUND,
    updatedBy,
    updatedAt: Date.now(),
  });
}

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
  const initialHp = score > 0 ? score : DEFAULT_DAMAGE;
  const hp = previous.hp != null ? Math.max(0, Number(previous.hp || 0)) : initialHp;
  const maxHp = Math.max(initialHp, Number(previous?.maxHp || 0), hp, 1);
  const alive = hp > 0;
  return { name: String(session?.nickname || previous?.name || id), score, initialHp, maxHp, hp, alive, eliminated: !alive, color: session?.color || previous?.color || "#fff" };
}

function buildRound5FromSessions(sessionsById = {}, prev = defaultRound5, { resetHp = false } = {}) {
  const previousRound = resetHp ? defaultRound5 : prev;
  const entries = Object.entries(sessionsById || {})
    .filter(([, v]) => v && v.active !== false && String(v.nickname || "").trim())
    .sort((a, b) => Number(b[1]?.score || 0) - Number(a[1]?.score || 0));
  const participants = {};
  const order = [];
  for (const [id, session] of entries) {
    order.push(id);
    participants[id] = sessionToParticipant(id, session, previousRound?.participants?.[id]);
  }
  const alive = order.filter((id) => isAlive({ participants }, id));
  const currentPlayerId = alive.includes(prev?.turn?.currentPlayerId) ? prev.turn.currentPlayerId : (alive[0] || null);
  return { ...toRound5(prev), participants, turn: { order, currentIndex: Math.max(0, order.indexOf(currentPlayerId)), currentPlayerId }, phase: alive.length > 1 ? PHASES.TARGET_SELECTION : PHASES.FINISHED, duel: { ...defaultRound5.duel }, outsiders: { ...defaultRound5.outsiders } };
}

function getNextAliveTurn(state, fromPlayerId = state?.turn?.currentPlayerId) {
  const order = state?.turn?.order || [];
  const alive = getAliveOrder(state);
  if (alive.length <= 1) return { next: alive[0] || null, alive };
  const fromOrderIndex = order.indexOf(fromPlayerId);
  const startIndex = fromOrderIndex >= 0 ? fromOrderIndex : -1;
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(startIndex + offset + order.length) % order.length];
    if (alive.includes(candidate)) return { next: candidate, alive };
  }
  return { next: alive[0] || null, alive };
}

export function initMortSubiteAdmin({ getCurrentAdminId, getSessionsById }) {
  if (!document.getElementById("m5-admin")) return;
  const $ = (id) => document.getElementById(id);
  let round5 = { ...defaultRound5 };
  const getAdminId = () => getCurrentAdminId?.() || "admin";
  const ensureRound5VisibleToGuests = () => publishRound5Live(getAdminId());
  const save = async (patch) => {
    const next = toRound5({ ...round5, ...patch, damage: null, updatedAt: Date.now(), updatedBy: getAdminId() });
    await update(ref(db, ROUND5_PATH), next);
    await update(ref(db, ROUND5_LEGACY_PATH), toLegacyRound5Patch(next));
    await ensureRound5VisibleToGuests();
  };

  const runAdminRound5Transaction = async (updater) => {
    const result = await runRound5SyncedTransaction(updater);
    if (result?.committed) await ensureRound5VisibleToGuests();
    return result;
  };

  let primaryRound5 = null;
  let legacyRound5 = null;
  const renderSyncedRound5 = () => {
    round5 = chooseNewestRound5(primaryRound5, legacyRound5);
    render();
  };
  onValue(ref(db, ROUND5_PATH), (snap) => { primaryRound5 = snap.val(); renderSyncedRound5(); });
  onValue(ref(db, ROUND5_LEGACY_PATH), (snap) => { legacyRound5 = snap.val(); renderSyncedRound5(); });


  function getRoundDamage(state = round5) {
    const raw = Number(state?.settings?.damage ?? DEFAULT_DAMAGE);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAMAGE;
  }

  function getConfiguredDamage() {
    const input = $("m5-damage");
    const value = Number(input?.value || 0);
    return Number.isFinite(value) && value > 0 ? value : getRoundDamage();
  }

  function syncDamageInput() {
    const input = $("m5-damage");
    if (!input || document.activeElement === input) return;
    input.value = String(getRoundDamage());
  }

  function initDamageControl() {
    const input = $("m5-damage");
    if (!input) return;
    input.value = String(getRoundDamage());
    input.addEventListener("change", () => {
      save({ settings: { ...round5.settings, damage: getConfiguredDamage() } });
    });
  }

  function setSelectOptions(id, optionIds, selectedId = null, { preserveUserSelection = true } = {}) {
    const select = $(id);
    if (!select) return;
    const previous = preserveUserSelection ? select.value : "";
    const values = optionIds.filter(Boolean);
    select.innerHTML = values.map((optionId) => `<option value="${escapeHtml(optionId)}">${escapeHtml(round5.participants?.[optionId]?.name || optionId)}</option>`).join("");
    const nextValue = values.includes(selectedId) ? selectedId : (values.includes(previous) ? previous : (values[0] || ""));
    select.value = nextValue;
  }

  function render() {
    const r = round5;
    syncDamageInput();
    const alive = getAliveOrder(r);
    const order = r.turn?.order || [];
    const attackerId = alive.includes(r.duel?.attackerId) ? r.duel.attackerId : (alive.includes(r.turn?.currentPlayerId) ? r.turn.currentPlayerId : alive[0] || null);
    const targetId = alive.includes(r.duel?.targetId) && r.duel.targetId !== attackerId ? r.duel.targetId : (alive.find((id) => id !== attackerId) || null);
    const buzzedName = getParticipantName(r, r.duel?.buzzedBy, "");
    const buzzLabel = r.duel?.buzzedBy ? `🔔 ${buzzedName}` : (r.duel?.buzzerOpen ? "Buzzer ouvert · aucun buzz" : "Aucun buzz");
    $("m5-status").textContent = `${formatPhase(r.phase)} · Joueur actif : ${r.participants?.[r.turn?.currentPlayerId]?.name || "—"}`;
    $("m5-buzz-live").textContent = buzzLabel;
    setSelectOptions("m5-duel-attacker", alive, attackerId, { preserveUserSelection: !r.duel?.attackerId });
    const selectedAttacker = $("m5-duel-attacker")?.value || attackerId;
    setSelectOptions("m5-duel-target", alive.filter((id) => id !== selectedAttacker), targetId, { preserveUserSelection: !r.duel?.targetId });
    setSelectOptions("m5-current-player", alive, r.turn?.currentPlayerId);
    setSelectOptions("m5-hp-player", order, $("m5-hp-player")?.value || r.turn?.currentPlayerId);
    setSelectOptions("m5-outsider-winner", Object.keys(r.outsiders?.answers || {}), r.outsiders?.winnerId, { preserveUserSelection: true });
    $("m5-participants-live").innerHTML = order.map((id) => {
      const p = r.participants?.[id] || {};
      const maxHp = Number(p.maxHp || p.initialHp || p.score || DEFAULT_DAMAGE);
      return `<li>${escapeHtml(p.name || id)} · score:${Number(p.score || 0)} · PV:${Number(p.hp || 0)}/${maxHp} · ${isAlive(r, id) ? "vivant" : "éliminé"}</li>`;
    }).join("") || "<li>Aucun joueur initialisé.</li>";
    $("m5-outsider-live").innerHTML = Object.entries(r.outsiders?.answers || {}).map(([id, a]) => `<li>${escapeHtml(r.participants?.[id]?.name || id)}: ${escapeHtml(a?.answer || "")}</li>`).join("") || "<li>Aucune réponse</li>";
  }

  initDamageControl();

  function readDuelSelection() {
    const alive = getAliveOrder(round5);
    const selectedAttacker = $("m5-duel-attacker").value || round5.turn?.currentPlayerId || alive[0] || null;
    let selectedTarget = $("m5-duel-target").value || alive.find((id) => id !== selectedAttacker) || null;
    if (selectedTarget === selectedAttacker) selectedTarget = alive.find((id) => id !== selectedAttacker) || null;
    return { attackerId: selectedAttacker, targetId: selectedTarget };
  }

  function canStartDuel(state, attackerId, targetId) {
    return Boolean(attackerId && targetId && attackerId !== targetId && isAlive(state, attackerId) && isAlive(state, targetId));
  }

  $("m5-duel-attacker").addEventListener("change", render);
  $("m5-init-hp").onclick = async () => save(buildRound5FromSessions(getSessionsById?.() || {}, round5, { resetHp: true }));

  function getPlayableRound5() {
    if (getAliveOrder(round5).length >= 2) return round5;
    const hydrated = buildRound5FromSessions(getSessionsById?.() || {}, round5, { resetHp: false });
    return getAliveOrder(hydrated).length >= 2 ? hydrated : round5;
  }

  function readDuelSelectionFrom(state) {
    const alive = getAliveOrder(state);
    const selectedAttacker = $("m5-duel-attacker").value || state.turn?.currentPlayerId || alive[0] || null;
    let selectedTarget = $("m5-duel-target").value || alive.find((id) => id !== selectedAttacker) || null;
    if (selectedTarget === selectedAttacker) selectedTarget = alive.find((id) => id !== selectedAttacker) || null;
    return { attackerId: selectedAttacker, targetId: selectedTarget };
  }
  $("m5-set-active-player").onclick = async () => {
    const currentPlayerId = $("m5-current-player").value;
    if (!currentPlayerId || !isAlive(round5, currentPlayerId)) return;
    await save({
      phase: PHASES.TARGET_SELECTION,
      turn: { ...round5.turn, currentPlayerId, currentIndex: Math.max(0, (round5.turn?.order || []).indexOf(currentPlayerId)) },
      duel: { ...defaultRound5.duel },
      outsiders: { ...defaultRound5.outsiders },
    });
  };
  $("m5-start-duel").onclick = async () => {
    const base = getPlayableRound5();
    const { attackerId, targetId } = readDuelSelectionFrom(base);
    if (!canStartDuel(base, attackerId, targetId)) return;
    await save({ ...base, phase: PHASES.DUEL, duel: { ...base.duel, attackerId, targetId, question: $("m5-question").value.trim(), buzzerOpen: true, buzzedBy: null, buzzedAt: 0, answerStatus: "pending" }, outsiders: { ...defaultRound5.outsiders } });
  };
  $("m5-open-buzzer").onclick = async () => {
    const base = getPlayableRound5();
    const { attackerId, targetId } = readDuelSelectionFrom(base);
    if (!canStartDuel(base, attackerId, targetId)) return;
    await save({ ...base, phase: PHASES.DUEL, duel: { ...base.duel, attackerId, targetId, buzzerOpen: true, buzzedBy: null, buzzedAt: 0, answerStatus: "pending" }, outsiders: { ...defaultRound5.outsiders } });
  };
  const openOutsiderAnswers = async (message = "Duel sans réponse, outsiders autorisés.") => save({
    phase: PHASES.OUTSIDERS_ANSWER,
    duel: { ...round5.duel, buzzerOpen: false, answerStatus: round5.duel?.buzzedBy ? "wrong" : "no_answer" },
    outsiders: { ...defaultRound5.outsiders, enabled: true },
    lastResult: { type: round5.duel?.buzzedBy ? "duel_failed" : "duel_no_answer", message, damagedPlayers: {} },
  });
  $("m5-close-buzzer").onclick = async () => {
    if (round5.phase === PHASES.DUEL && !round5.duel?.buzzedBy) {
      await openOutsiderAnswers();
      return;
    }
    await save({ duel: { ...round5.duel, buzzerOpen: false } });
  };
  $("m5-mark-fail").onclick = async () => openOutsiderAnswers(round5.duel?.buzzedBy ? "Duel raté, outsiders autorisés." : "Personne n’a répondu, outsiders autorisés.");
  $("m5-reset").onclick = async () => save({ ...defaultRound5, name: "Mort Subite" });

  const adjustHp = async (delta) => runAdminRound5Transaction((curr) => {
    const s = chooseNewestRound5(curr, legacyRound5); const id = $("m5-hp-player").value; if (!id || !s.participants?.[id]) return s;
    const hp = Math.max(0, Number(s.participants[id].hp || 0) + delta);
    const maxHp = Math.max(Number(s.participants[id].maxHp || 0), Number(s.participants[id].initialHp || 0), hp, 1);
    s.participants[id] = { ...s.participants[id], hp, maxHp, alive: hp > 0, eliminated: hp <= 0 };
    const { next, alive } = getNextAliveTurn({ ...s, participants: s.participants });
    const phase = alive.length <= 1 ? PHASES.FINISHED : (s.phase === PHASES.FINISHED ? PHASES.TARGET_SELECTION : s.phase);
    const turn = alive.includes(s.turn?.currentPlayerId)
      ? s.turn
      : { ...s.turn, currentPlayerId: next, currentIndex: Math.max(0, (s.turn?.order || []).indexOf(next)) };
    return { ...s, participants: s.participants, phase, turn, actionLog: addLog(s, `${delta > 0 ? "+" : ""}${delta} PV -> ${s.participants[id].name}`), updatedAt: Date.now() };
  });
  const getHpAmount = () => Math.max(1, Number($("m5-hp-amount").value || 1));
  $("m5-hp-plus").onclick = () => adjustHp(getHpAmount());
  $("m5-hp-minus").onclick = () => adjustHp(-getHpAmount());

  $("m5-mark-correct").onclick = async () => runAdminRound5Transaction((curr) => {
    const s = chooseNewestRound5(curr, legacyRound5); const winner = s.duel?.buzzedBy; if (!winner) return s;
    const loser = winner === s.duel.attackerId ? s.duel.targetId : s.duel.attackerId;
    if (!loser || !s.participants?.[loser]) return s;
    const damage = getConfiguredDamage(); const hp = Math.max(0, Number(s.participants[loser].hp || 0) - damage);
    s.participants[loser] = { ...s.participants[loser], hp, alive: hp > 0, eliminated: hp <= 0 };
    return { ...s, participants: s.participants, phase: getAliveOrder({ ...s, participants: s.participants }).length <= 1 ? PHASES.FINISHED : PHASES.RESULT, duel: { ...s.duel, buzzerOpen: false, answerStatus: "correct" }, lastResult: { type: "duel_correct", message: `${s.participants?.[winner]?.name || winner} touche ${s.participants?.[loser]?.name || loser}`, damagedPlayers: { [loser]: damage } }, actionLog: addLog(s, `Bonne réponse duel: ${winner}`), updatedAt: Date.now() };
  });

  $("m5-outsider-correct").onclick = async () => runAdminRound5Transaction((curr) => {
    const s = chooseNewestRound5(curr, legacyRound5); const win = $("m5-outsider-winner").value || Object.keys(s.outsiders?.answers || {})[0]; if (!win) return s;
    const damage = getConfiguredDamage(); const damagedPlayers = {};
    for (const id of [s.duel.attackerId, s.duel.targetId]) {
      if (!id || !s.participants[id]) continue;
      const hp = Math.max(0, Number(s.participants[id].hp || 0) - damage);
      s.participants[id] = { ...s.participants[id], hp, alive: hp > 0, eliminated: hp <= 0 };
      damagedPlayers[id] = damage;
    }
    return { ...s, participants: s.participants, phase: getAliveOrder({ ...s, participants: s.participants }).length <= 1 ? PHASES.FINISHED : PHASES.RESULT, outsiders: { ...s.outsiders, winnerId: win }, lastResult: { type: "outsider_correct", message: `${s.participants?.[win]?.name || win} a répondu juste`, damagedPlayers }, actionLog: addLog(s, `Outsider correct: ${win}`), updatedAt: Date.now() };
  });

  $("m5-next-turn").onclick = async () => runAdminRound5Transaction((curr) => {
    const s = chooseNewestRound5(curr, legacyRound5);
    const { next, alive } = getNextAliveTurn(s);
    if (alive.length <= 1) return { ...s, phase: PHASES.FINISHED, turn: { ...s.turn, currentPlayerId: next, currentIndex: Math.max(0, (s.turn?.order || []).indexOf(next)) }, updatedAt: Date.now() };
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

  let primaryRound5 = null;
  let legacyRound5 = null;
  const renderSyncedRound5 = () => {
    round5 = chooseNewestRound5(primaryRound5, legacyRound5);
    triggerDuelBuzzSound(round5);
    render();
  };

  onValue(ref(db, ROUND5_PATH), (snap) => { primaryRound5 = snap.val(); renderSyncedRound5(); });
  onValue(ref(db, ROUND5_LEGACY_PATH), (snap) => { legacyRound5 = snap.val(); renderSyncedRound5(); });

  function getRoleState(me) {
    const duelists = [round5.duel?.attackerId, round5.duel?.targetId].filter(Boolean);
    const hasConfiguredDuel = new Set(duelists).size === 2;
    const hasActiveDuel = hasConfiguredDuel && round5.phase === PHASES.DUEL;
    const isDuelist = Boolean(me && duelists.includes(me));
    const alive = meAlive(me);
    const canBuzz = hasActiveDuel && round5.duel?.buzzerOpen && alive && isDuelist && !round5.duel?.buzzedBy && !buzzInFlight;
    const outsiderAllowed = round5.phase === PHASES.OUTSIDERS_ANSWER && round5.outsiders?.enabled && alive && !isDuelist;
    return { duelists, hasConfiguredDuel, hasActiveDuel, isDuelist, alive, canBuzz, outsiderAllowed };
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

    els.duelCard.classList.toggle("hidden", !role.hasConfiguredDuel && !role.isDuelist);
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
      await runRound5SyncedTransaction((curr) => {
        const s = chooseNewestRound5(curr, legacyRound5);
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

  function isBuzzKey(event) {
    const expected = getBuzzKeyCode?.() || "Space";
    return event.code === expected || event.key === expected || (expected === "Space" && event.key === " ");
  }

  document.addEventListener("keydown", async (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!isBuzzKey(event)) return;
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

  window.addEventListener("zogquiz:guest-auth-changed", render);

  els.outsiderForm.onsubmit = async (event) => {
    event.preventDefault();
    const me = getMe();
    const answer = els.outsiderInput.value.trim();
    if (!answer) return;
    await runRound5SyncedTransaction((curr) => {
      const s = chooseNewestRound5(curr, legacyRound5);
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
    const storedMax = Math.max(0, Number(participant.maxHp || participant.initialHp || 0));
    const scoreMax = Math.max(0, Number(participant.score || 0));
    const maxHp = configuredMax > 0 ? configuredMax : Math.max(storedMax, scoreMax, hp, 1);
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
  let primaryRound5 = null;
  let legacyRound5 = null;
  const renderSyncedRound5 = () => {
    roundState = chooseNewestRound5(primaryRound5, legacyRound5);
    render();
  };
  onValue(ref(db, ROUND5_PATH), (snap) => { primaryRound5 = snap.val(); renderSyncedRound5(); });
  onValue(ref(db, ROUND5_LEGACY_PATH), (snap) => { legacyRound5 = snap.val(); renderSyncedRound5(); });
}
