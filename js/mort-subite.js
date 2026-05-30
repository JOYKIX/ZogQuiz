import { db, ref, onValue, update, runTransaction } from "./firebase.js";
import { watchOverlayConfig } from "./overlay-config.js";

const ROUND5_PATH = "rounds/round5";
const ROUND5_LEGACY_PATH = "rooms/manche5/state";
const QUIZ_STATE_PATH = "quiz/state";
const ROUND5_LIVE_ROUND = "manche5";
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

const defaultRound5 = {
  name: "Mort Subite",
  phase: PHASES.SETUP,
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

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[char]));

const clampPositiveNumber = (value, fallback = DEFAULT_DAMAGE) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const formatPhase = (phase) => PHASE_LABELS[phase] || phase || "—";

const formatBuzzKeyLabel = (code) => {
  if (!code || code === "Space") return "Espace";
  if (code === "Enter") return "Entrée";
  if (code.startsWith?.("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith?.("Digit")) return code.slice(5);
  return code;
};

function cleanParticipant(id, participant = {}) {
  const score = Math.max(0, Number(participant.score || 0));
  const hp = Math.max(0, Number(participant.hp ?? participant.initialHp ?? score ?? 0));
  const initialHp = Math.max(1, Number(participant.initialHp || score || hp || DEFAULT_DAMAGE));
  const maxHp = Math.max(1, Number(participant.maxHp || 0), initialHp, hp, score);
  const alive = hp > 0 && participant.alive !== false && participant.eliminated !== true;
  return {
    name: String(participant.name || participant.nickname || id),
    score,
    initialHp,
    maxHp,
    hp,
    alive,
    eliminated: !alive,
    color: participant.color || "#fff",
  };
}

function normalizeOrder(order = [], participants = {}) {
  return Array.from(new Set([...(Array.isArray(order) ? order : []), ...Object.keys(participants)].filter(Boolean)));
}

function toRound5(value = {}) {
  const participants = {};
  Object.entries(value?.participants || {}).forEach(([id, participant]) => {
    participants[id] = cleanParticipant(id, participant);
  });

  const order = normalizeOrder(value?.turn?.order, participants);
  const aliveOrder = order.filter((id) => isAlive({ participants }, id));
  const requestedCurrent = value?.turn?.currentPlayerId;
  const currentPlayerId = aliveOrder.includes(requestedCurrent) ? requestedCurrent : (aliveOrder[0] || null);

  return {
    ...defaultRound5,
    ...(value || {}),
    participants,
    turn: {
      ...defaultRound5.turn,
      ...(value?.turn || {}),
      order,
      currentPlayerId,
      currentIndex: Math.max(0, order.indexOf(currentPlayerId)),
    },
    duel: { ...defaultRound5.duel, ...(value?.duel || {}) },
    outsiders: {
      ...defaultRound5.outsiders,
      ...(value?.outsiders || {}),
      answers: value?.outsiders?.answers || {},
    },
    settings: {
      ...defaultRound5.settings,
      ...(value?.settings || {}),
      damage: clampPositiveNumber(value?.settings?.damage ?? value?.damage, DEFAULT_DAMAGE),
    },
    lastResult: { ...defaultRound5.lastResult, ...(value?.lastResult || {}) },
    actionLog: value?.actionLog || {},
    updatedAt: Number(value?.updatedAt || 0),
    updatedBy: value?.updatedBy || "",
  };
}

function legacyToRound5(value) {
  if (!value || value.participants || value.turn) return toRound5(value || {});

  const ids = Array.from(new Set([
    ...(value.turnOrder || []),
    ...Object.keys(value.hpByPlayer || {}),
    ...Object.keys(value.eliminated || {}),
    value.currentTurnPlayerId,
    value.targetPlayerId,
    value.duel?.attackerId,
    value.duel?.targetId,
  ].filter(Boolean)));

  const participants = {};
  ids.forEach((id) => {
    const hp = Math.max(0, Number(value.hpByPlayer?.[id] ?? DEFAULT_DAMAGE));
    const eliminated = Boolean(value.eliminated?.[id]) || hp <= 0;
    participants[id] = cleanParticipant(id, {
      name: id,
      score: hp,
      initialHp: Math.max(hp, DEFAULT_DAMAGE),
      maxHp: Math.max(hp, DEFAULT_DAMAGE),
      hp,
      alive: !eliminated,
      eliminated,
    });
  });

  const legacyPhase = value.duel?.phase;
  const phase = value.phase
    || (legacyPhase === "duel" ? PHASES.DUEL : null)
    || (legacyPhase === "target" ? PHASES.TARGET_SELECTION : null)
    || (value.active ? PHASES.TARGET_SELECTION : PHASES.SETUP);

  return toRound5({
    name: value.name || "Mort Subite",
    phase,
    participants,
    turn: {
      order: ids,
      currentPlayerId: value.currentTurnPlayerId || ids[0] || null,
    },
    duel: {
      ...(value.duel || {}),
      attackerId: value.duel?.attackerId || value.currentTurnPlayerId || null,
      targetId: value.duel?.targetId || value.targetPlayerId || null,
      buzzerOpen: Boolean(value.duel?.buzzerOpen),
    },
    settings: { damage: value.damage || value.settings?.damage || DEFAULT_DAMAGE },
    updatedAt: Number(value.updatedAt || 0),
    updatedBy: value.updatedBy || "",
  });
}

function toLegacyRound5Patch(state) {
  const s = toRound5(state);
  const hpByPlayer = {};
  const eliminated = {};
  Object.entries(s.participants).forEach(([id, participant]) => {
    hpByPlayer[id] = Math.max(0, Number(participant.hp || 0));
    eliminated[id] = !isAlive(s, id);
  });

  return {
    active: ![PHASES.SETUP, PHASES.FINISHED].includes(s.phase),
    turnOrder: s.turn.order,
    hpByPlayer,
    eliminated,
    currentTurnPlayerId: s.turn.currentPlayerId || null,
    targetPlayerId: s.duel.targetId || null,
    duel: { ...s.duel, phase: s.phase === PHASES.DUEL ? "duel" : "target" },
    phase: s.phase,
    settings: s.settings,
    participants: s.participants,
    outsiders: s.outsiders,
    lastResult: s.lastResult,
    updatedAt: s.updatedAt || Date.now(),
    updatedBy: s.updatedBy || "",
  };
}

function chooseNewestRound5(primary, legacy) {
  const main = toRound5(primary || {});
  const fallback = legacyToRound5(legacy || {});
  return Number(fallback.updatedAt || 0) > Number(main.updatedAt || 0) ? fallback : main;
}

function isAlive(state, id) {
  const participant = state?.participants?.[id];
  return Boolean(participant && participant.alive !== false && participant.eliminated !== true && Number(participant.hp || 0) > 0);
}

function getAliveOrder(state) {
  return normalizeOrder(state?.turn?.order, state?.participants).filter((id) => isAlive(state, id));
}

function getParticipantName(state, id, fallback = "—") {
  return (id && state?.participants?.[id]?.name) || (id || fallback);
}

function addLog(state, message) {
  const log = { ...(state?.actionLog || {}) };
  log[String(Date.now())] = message;
  const keys = Object.keys(log).sort().slice(-30);
  return Object.fromEntries(keys.map((key) => [key, log[key]]));
}

function getNextAliveTurn(state, fromPlayerId = state?.turn?.currentPlayerId) {
  const order = normalizeOrder(state?.turn?.order, state?.participants);
  const alive = getAliveOrder({ ...state, turn: { ...state?.turn, order } });
  if (alive.length <= 1) return { next: alive[0] || null, alive };
  const fromIndex = order.indexOf(fromPlayerId);
  const startIndex = fromIndex >= 0 ? fromIndex : -1;
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(startIndex + offset + order.length) % order.length];
    if (alive.includes(candidate)) return { next: candidate, alive };
  }
  return { next: alive[0] || null, alive };
}

function makeTurn(state, currentPlayerId) {
  const order = normalizeOrder(state?.turn?.order, state?.participants);
  return { order, currentPlayerId: currentPlayerId || null, currentIndex: Math.max(0, order.indexOf(currentPlayerId)) };
}

function closeDuel() {
  return { ...defaultRound5.duel };
}

function closeOutsiders() {
  return { ...defaultRound5.outsiders };
}

function finalOrNextPhase(state, fallback = PHASES.RESULT) {
  return getAliveOrder(state).length <= 1 ? PHASES.FINISHED : fallback;
}

function sessionToParticipant(id, session, previous = {}, resetHp = false) {
  const score = Math.max(0, Number(session?.score || 0));
  const initialHp = Math.max(1, score || DEFAULT_DAMAGE);
  const previousHp = previous?.hp == null ? null : Math.max(0, Number(previous.hp || 0));
  const hp = resetHp || previousHp == null ? initialHp : previousHp;
  return cleanParticipant(id, {
    name: session?.nickname || previous?.name || id,
    score,
    initialHp,
    maxHp: Math.max(initialHp, Number(previous?.maxHp || 0), hp),
    hp,
    color: session?.color || previous?.color || "#fff",
  });
}

function buildRound5FromSessions(sessionsById = {}, previousState = defaultRound5, { resetHp = false } = {}) {
  const previous = toRound5(previousState);
  const entries = Object.entries(sessionsById || {})
    .filter(([, session]) => session && session.active !== false && String(session.nickname || "").trim())
    .sort((a, b) => Number(b[1]?.score || 0) - Number(a[1]?.score || 0));

  const participants = {};
  const order = [];
  entries.forEach(([id, session]) => {
    order.push(id);
    participants[id] = sessionToParticipant(id, session, previous.participants[id], resetHp);
  });

  const hydrated = toRound5({ ...previous, participants, turn: { ...previous.turn, order } });
  const alive = getAliveOrder(hydrated);
  const currentPlayerId = alive.includes(previous.turn.currentPlayerId) ? previous.turn.currentPlayerId : (alive[0] || null);
  return toRound5({
    ...hydrated,
    phase: alive.length > 1 ? PHASES.TARGET_SELECTION : PHASES.FINISHED,
    turn: makeTurn({ ...hydrated, turn: { ...hydrated.turn, order } }, currentPlayerId),
    duel: closeDuel(),
    outsiders: closeOutsiders(),
    lastResult: { type: "initialized", message: alive.length > 1 ? "Manche 5 initialisée." : "Pas assez de joueurs pour lancer la mort subite.", damagedPlayers: {} },
  });
}

async function writeSyncedRound5(nextState) {
  const state = toRound5({ ...nextState, updatedAt: nextState?.updatedAt || Date.now() });
  await update(ref(db, ROUND5_PATH), state);
  await update(ref(db, ROUND5_LEGACY_PATH), toLegacyRound5Patch(state));
  return state;
}

async function runRound5SyncedTransaction(updater) {
  const result = await runTransaction(ref(db, ROUND5_PATH), (current) => {
    const next = updater(toRound5(current || {}));
    return toRound5({ ...(next || current || {}), updatedAt: Date.now() });
  });
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

export function initMortSubiteAdmin({ getCurrentAdminId, getSessionsById } = {}) {
  const adminRoot = document.getElementById("m5-admin");
  if (!adminRoot) return;

  const $ = (id) => document.getElementById(id);
  let primaryRound5 = null;
  let legacyRound5 = null;
  let round5 = toRound5(defaultRound5);

  const getAdminId = () => getCurrentAdminId?.() || "admin";
  const getDamage = () => clampPositiveNumber($("m5-damage")?.value || round5.settings.damage, round5.settings.damage);

  async function savePatch(patch) {
    const next = toRound5({ ...round5, ...patch, updatedAt: Date.now(), updatedBy: getAdminId() });
    await writeSyncedRound5(next);
    await publishRound5Live(getAdminId());
  }

  async function saveTransaction(updater) {
    const result = await runRound5SyncedTransaction((current) => {
      const base = chooseNewestRound5(current, legacyRound5);
      const next = updater(base);
      return toRound5({ ...(next || base), updatedBy: getAdminId() });
    });
    if (result?.committed) await publishRound5Live(getAdminId());
    return result;
  }

  function syncDamageInput() {
    const input = $("m5-damage");
    if (input && document.activeElement !== input) input.value = String(round5.settings.damage || DEFAULT_DAMAGE);
  }

  function setSelectOptions(id, optionIds, selectedId = null, { preserveUserSelection = true } = {}) {
    const select = $(id);
    if (!select) return;
    const previous = preserveUserSelection ? select.value : "";
    const values = optionIds.filter(Boolean);
    select.innerHTML = values.map((optionId) => `<option value="${escapeHtml(optionId)}">${escapeHtml(getParticipantName(round5, optionId, optionId))}</option>`).join("");
    select.value = values.includes(selectedId) ? selectedId : (values.includes(previous) ? previous : (values[0] || ""));
  }

  function readDuelSelection(state = round5) {
    const alive = getAliveOrder(state);
    const selectedAttacker = $("m5-duel-attacker")?.value || state.turn.currentPlayerId || alive[0] || null;
    let selectedTarget = $("m5-duel-target")?.value || state.duel.targetId || alive.find((id) => id !== selectedAttacker) || null;
    if (selectedTarget === selectedAttacker) selectedTarget = alive.find((id) => id !== selectedAttacker) || null;
    return { attackerId: selectedAttacker, targetId: selectedTarget };
  }

  function canStartDuel(state, attackerId, targetId) {
    return Boolean(attackerId && targetId && attackerId !== targetId && isAlive(state, attackerId) && isAlive(state, targetId));
  }

  function getPlayableRound5() {
    if (getAliveOrder(round5).length >= 2) return round5;
    return buildRound5FromSessions(getSessionsById?.() || {}, round5, { resetHp: false });
  }

  function render() {
    syncDamageInput();
    const alive = getAliveOrder(round5);
    const order = normalizeOrder(round5.turn.order, round5.participants);
    const attackerId = alive.includes(round5.duel.attackerId) ? round5.duel.attackerId : (alive.includes(round5.turn.currentPlayerId) ? round5.turn.currentPlayerId : alive[0] || null);
    const targetId = alive.includes(round5.duel.targetId) && round5.duel.targetId !== attackerId ? round5.duel.targetId : (alive.find((id) => id !== attackerId) || null);
    const buzzedName = getParticipantName(round5, round5.duel.buzzedBy, "");

    $("m5-status").textContent = `${formatPhase(round5.phase)} · Joueur actif : ${getParticipantName(round5, round5.turn.currentPlayerId, "—")}`;
    $("m5-buzz-live").textContent = round5.duel.buzzedBy ? `🔔 ${buzzedName}` : (round5.duel.buzzerOpen ? "Buzzer ouvert · aucun buzz" : "Aucun buzz");

    setSelectOptions("m5-duel-attacker", alive, attackerId, { preserveUserSelection: !round5.duel.attackerId });
    const selectedAttacker = $("m5-duel-attacker")?.value || attackerId;
    setSelectOptions("m5-duel-target", alive.filter((id) => id !== selectedAttacker), targetId, { preserveUserSelection: !round5.duel.targetId });
    setSelectOptions("m5-current-player", alive, round5.turn.currentPlayerId);
    setSelectOptions("m5-hp-player", order, $("m5-hp-player")?.value || round5.turn.currentPlayerId);
    setSelectOptions("m5-outsider-winner", Object.keys(round5.outsiders.answers || {}), round5.outsiders.winnerId, { preserveUserSelection: true });

    $("m5-participants-live").innerHTML = order.map((id) => {
      const participant = round5.participants[id] || {};
      return `<li>${escapeHtml(participant.name || id)} · score:${Number(participant.score || 0)} · PV:${Number(participant.hp || 0)}/${Number(participant.maxHp || 1)} · ${isAlive(round5, id) ? "vivant" : "éliminé"}</li>`;
    }).join("") || "<li>Aucun joueur initialisé.</li>";

    $("m5-outsider-live").innerHTML = Object.entries(round5.outsiders.answers || {})
      .map(([id, answer]) => `<li>${escapeHtml(getParticipantName(round5, id, id))}: ${escapeHtml(answer?.answer || "")}</li>`)
      .join("") || "<li>Aucune réponse</li>";
  }

  function renderSyncedRound5() {
    round5 = chooseNewestRound5(primaryRound5, legacyRound5);
    render();
  }

  onValue(ref(db, ROUND5_PATH), (snap) => { primaryRound5 = snap.val(); renderSyncedRound5(); });
  onValue(ref(db, ROUND5_LEGACY_PATH), (snap) => { legacyRound5 = snap.val(); renderSyncedRound5(); });

  $("m5-damage")?.addEventListener("change", () => savePatch({ settings: { ...round5.settings, damage: getDamage() } }));
  $("m5-duel-attacker")?.addEventListener("change", render);

  $("m5-init-hp").onclick = async () => savePatch(buildRound5FromSessions(getSessionsById?.() || {}, round5, { resetHp: true }));
  $("m5-reset").onclick = async () => savePatch({ ...defaultRound5, updatedBy: getAdminId() });

  $("m5-set-active-player").onclick = async () => {
    const currentPlayerId = $("m5-current-player").value;
    if (!currentPlayerId || !isAlive(round5, currentPlayerId)) return;
    await savePatch({
      phase: PHASES.TARGET_SELECTION,
      turn: makeTurn(round5, currentPlayerId),
      duel: closeDuel(),
      outsiders: closeOutsiders(),
    });
  };

  const startOrOpenDuel = async ({ keepQuestion = false } = {}) => {
    const base = getPlayableRound5();
    const { attackerId, targetId } = readDuelSelection(base);
    if (!canStartDuel(base, attackerId, targetId)) return;
    const question = keepQuestion ? (base.duel.question || $("m5-question").value.trim()) : $("m5-question").value.trim();
    await savePatch({
      ...base,
      phase: PHASES.DUEL,
      duel: { attackerId, targetId, question, buzzerOpen: true, buzzedBy: null, buzzedAt: 0, answerStatus: "pending" },
      outsiders: closeOutsiders(),
      lastResult: { type: "duel_started", message: `${getParticipantName(base, attackerId)} défie ${getParticipantName(base, targetId)}.`, damagedPlayers: {} },
    });
  };

  $("m5-start-duel").onclick = () => startOrOpenDuel();
  $("m5-open-buzzer").onclick = () => startOrOpenDuel({ keepQuestion: true });

  const openOutsiders = async (message) => savePatch({
    phase: PHASES.OUTSIDERS_ANSWER,
    duel: { ...round5.duel, buzzerOpen: false, answerStatus: round5.duel.buzzedBy ? "wrong" : "no_answer" },
    outsiders: { enabled: true, answers: {}, winnerId: null },
    lastResult: { type: round5.duel.buzzedBy ? "duel_failed" : "duel_no_answer", message, damagedPlayers: {} },
  });

  $("m5-close-buzzer").onclick = async () => {
    if (round5.phase === PHASES.DUEL && !round5.duel.buzzedBy) {
      await openOutsiders("Personne n’a buzzé : les autres joueurs peuvent répondre.");
      return;
    }
    await savePatch({ duel: { ...round5.duel, buzzerOpen: false } });
  };
  $("m5-mark-fail").onclick = () => openOutsiders(round5.duel.buzzedBy ? "Duel raté : les autres joueurs peuvent répondre." : "Personne n’a répondu : les autres joueurs peuvent répondre.");

  const adjustHp = async (delta) => saveTransaction((state) => {
    const id = $("m5-hp-player").value;
    if (!id || !state.participants[id]) return state;
    const participant = state.participants[id];
    const hp = Math.max(0, Number(participant.hp || 0) + delta);
    const participants = {
      ...state.participants,
      [id]: cleanParticipant(id, { ...participant, hp, maxHp: Math.max(participant.maxHp || 0, hp), alive: hp > 0, eliminated: hp <= 0 }),
    };
    const updated = toRound5({ ...state, participants });
    const { next, alive } = getNextAliveTurn(updated);
    return {
      ...updated,
      phase: alive.length <= 1 ? PHASES.FINISHED : (updated.phase === PHASES.FINISHED ? PHASES.TARGET_SELECTION : updated.phase),
      turn: isAlive(updated, updated.turn.currentPlayerId) ? updated.turn : makeTurn(updated, next),
      actionLog: addLog(updated, `${delta > 0 ? "+" : ""}${delta} PV -> ${getParticipantName(updated, id, id)}`),
    };
  });

  const getHpAmount = () => Math.max(1, Number($("m5-hp-amount").value || 1));
  $("m5-hp-plus").onclick = () => adjustHp(getHpAmount());
  $("m5-hp-minus").onclick = () => adjustHp(-getHpAmount());

  $("m5-mark-correct").onclick = async () => saveTransaction((state) => {
    const winner = state.duel.buzzedBy;
    if (!winner) return state;
    const loser = winner === state.duel.attackerId ? state.duel.targetId : state.duel.attackerId;
    if (!loser || !state.participants[loser]) return state;
    const damage = clampPositiveNumber(state.settings.damage, DEFAULT_DAMAGE);
    const loserParticipant = state.participants[loser];
    const hp = Math.max(0, Number(loserParticipant.hp || 0) - damage);
    const participants = { ...state.participants, [loser]: cleanParticipant(loser, { ...loserParticipant, hp, alive: hp > 0, eliminated: hp <= 0 }) };
    const updated = toRound5({ ...state, participants });
    return {
      ...updated,
      phase: finalOrNextPhase(updated, PHASES.RESULT),
      duel: { ...updated.duel, buzzerOpen: false, answerStatus: "correct" },
      outsiders: closeOutsiders(),
      lastResult: { type: "duel_correct", message: `${getParticipantName(updated, winner)} touche ${getParticipantName(updated, loser)} (-${damage} PV).`, damagedPlayers: { [loser]: damage } },
      actionLog: addLog(updated, `Bonne réponse duel: ${winner}`),
    };
  });

  $("m5-outsider-correct").onclick = async () => saveTransaction((state) => {
    const winner = $("m5-outsider-winner").value || Object.keys(state.outsiders.answers || {})[0];
    if (!winner || !state.outsiders.answers?.[winner]) return state;
    const damage = clampPositiveNumber(state.settings.damage, DEFAULT_DAMAGE);
    const duelists = [state.duel.attackerId, state.duel.targetId].filter((id) => id && state.participants[id]);
    const participants = { ...state.participants };
    const damagedPlayers = {};
    duelists.forEach((id) => {
      const hp = Math.max(0, Number(participants[id].hp || 0) - damage);
      participants[id] = cleanParticipant(id, { ...participants[id], hp, alive: hp > 0, eliminated: hp <= 0 });
      damagedPlayers[id] = damage;
    });
    const updated = toRound5({ ...state, participants });
    return {
      ...updated,
      phase: finalOrNextPhase(updated, PHASES.RESULT),
      outsiders: { ...updated.outsiders, winnerId: winner },
      lastResult: { type: "outsider_correct", message: `${getParticipantName(updated, winner)} vole la question : les duellistes perdent ${damage} PV.`, damagedPlayers },
      actionLog: addLog(updated, `Outsider correct: ${winner}`),
    };
  });

  $("m5-next-turn").onclick = async () => saveTransaction((state) => {
    const { next, alive } = getNextAliveTurn(state);
    return {
      ...state,
      phase: alive.length <= 1 ? PHASES.FINISHED : PHASES.TARGET_SELECTION,
      turn: makeTurn(state, next),
      duel: closeDuel(),
      outsiders: closeOutsiders(),
      lastResult: alive.length <= 1 ? { type: "finished", message: `${getParticipantName(state, next)} remporte la mort subite.`, damagedPlayers: {} } : state.lastResult,
    };
  });
}

export function initMortSubiteGuest({ getCurrentSessionId, getBuzzKeyCode, isTypingContext: isGuestTypingContext } = {}) {
  const root = document.getElementById("guest-round5");
  if (!root) return;

  const $ = (id) => document.getElementById(id);
  const els = {
    action: $("m5-guest-action"),
    playerState: $("m5-guest-player-state"),
    phase: $("m5-guest-phase"),
    duel: $("m5-guest-duel"),
    duelCard: $("m5-duel-card"),
    duelTitle: $("m5-guest-duel-title"),
    question: $("m5-guest-question"),
    buzz: $("m5-guest-buzz"),
    buzzStatus: $("m5-guest-buzz-status"),
    outsiderCard: $("m5-outsider-card"),
    outsiderForm: $("m5-outsider-form"),
    outsiderInput: $("m5-outsider-input"),
    outsiderStatus: $("m5-outsider-status"),
    hp: $("m5-guest-hp"),
    result: $("m5-guest-result"),
  };

  let primaryRound5 = null;
  let legacyRound5 = null;
  let round5 = toRound5(defaultRound5);
  let buzzInFlight = false;

  const getMe = () => getCurrentSessionId?.() || null;
  const isGuestRoundVisible = () => !root.classList.contains("hidden");

  function getRoleState(sessionId = getMe()) {
    const duelists = [round5.duel.attackerId, round5.duel.targetId].filter(Boolean);
    const hasConfiguredDuel = duelists.length === 2;
    const hasActiveDuel = round5.phase === PHASES.DUEL && hasConfiguredDuel;
    const isDuelist = Boolean(sessionId && duelists.includes(sessionId));
    const alive = Boolean(sessionId && isAlive(round5, sessionId));
    const canBuzz = Boolean(hasActiveDuel && isDuelist && alive && round5.duel.buzzerOpen && !round5.duel.buzzedBy && !buzzInFlight);
    const outsiderAllowed = Boolean(round5.phase === PHASES.OUTSIDERS_ANSWER && round5.outsiders.enabled && alive && !isDuelist);
    return { duelists, hasConfiguredDuel, hasActiveDuel, isDuelist, alive, canBuzz, outsiderAllowed };
  }

  function renderHpList() {
    const orderedIds = normalizeOrder(round5.turn.order, round5.participants);
    if (!orderedIds.length) {
      els.hp.innerHTML = "<li>Aucun joueur initialisé pour la mort subite.</li>";
      return;
    }

    els.hp.innerHTML = orderedIds.map((id) => {
      const participant = round5.participants[id] || {};
      const alive = isAlive(round5, id);
      const badges = [id === round5.turn.currentPlayerId ? "Tour" : "", [round5.duel.attackerId, round5.duel.targetId].includes(id) ? "Duel" : "", alive ? "Vivant" : "Éliminé"].filter(Boolean);
      return `<li class="m5-hp-item ${alive ? "" : "is-dead"}"><span><strong>${escapeHtml(participant.name || id)}</strong><small>${escapeHtml(badges.join(" · "))}</small></span><strong>${Number(participant.hp || 0)} PV</strong></li>`;
    }).join("");
  }

  function render() {
    const me = getMe();
    const role = getRoleState(me);
    const alreadyAnswered = Boolean(me && round5.outsiders.answers?.[me]);
    const attackerName = getParticipantName(round5, round5.duel.attackerId, "—");
    const targetName = getParticipantName(round5, round5.duel.targetId, "—");
    const buzzedName = getParticipantName(round5, round5.duel.buzzedBy, "");

    renderHpList();
    els.playerState.textContent = me ? `${getParticipantName(round5, me, "—")} · ${role.alive ? "vivant" : "éliminé / spectateur"}` : "Non connecté";
    els.phase.textContent = formatPhase(round5.phase);
    els.duel.textContent = role.hasConfiguredDuel ? `${attackerName} VS ${targetName}` : "En attente";
    els.question.textContent = round5.duel.question || "Question en attente côté admin.";
    els.result.textContent = round5.lastResult.message || (round5.phase === PHASES.FINISHED ? "Mort subite terminée." : "Aucun résultat pour le moment.");

    els.duelCard.classList.toggle("hidden", !role.hasConfiguredDuel && !role.isDuelist);
    els.duelCard.classList.toggle("is-duelist", role.isDuelist);
    els.duelCard.classList.toggle("is-buzzer-open", role.canBuzz);
    els.buzz.classList.toggle("hidden", !role.isDuelist || !role.hasActiveDuel);
    els.buzz.disabled = !role.canBuzz;

    els.outsiderCard.classList.toggle("hidden", !me || role.isDuelist || ![PHASES.DUEL, PHASES.OUTSIDERS_ANSWER].includes(round5.phase));
    els.outsiderForm.classList.toggle("hidden", !role.outsiderAllowed || alreadyAnswered);

    if (!me) {
      els.action.textContent = "Connectez-vous pour participer à la mort subite.";
    } else if (!round5.participants[me]) {
      els.action.textContent = "Vous n’êtes pas dans la liste de la manche 5 : demandez une initialisation à l’admin.";
    } else if (!role.alive) {
      els.action.textContent = "Vous êtes éliminé : suivez la fin de la manche.";
    } else if (role.canBuzz) {
      els.action.textContent = "Duel ouvert : buzzez le plus vite possible !";
    } else if (role.isDuelist && round5.duel.buzzedBy === me) {
      els.action.textContent = "Vous avez buzzé : donnez votre réponse à l’oral.";
    } else if (role.isDuelist && round5.phase === PHASES.DUEL) {
      els.action.textContent = round5.duel.buzzedBy ? `${buzzedName} a buzzé.` : "Vous êtes en duel : attendez l’ouverture du buzzer.";
    } else if (role.outsiderAllowed) {
      els.action.textContent = alreadyAnswered ? "Réponse envoyée, attendez la validation admin." : "Les duellistes ont raté : envoyez votre réponse écrite.";
    } else if (round5.phase === PHASES.TARGET_SELECTION) {
      els.action.textContent = me === round5.turn.currentPlayerId ? "C’est votre tour : annoncez votre cible à l’admin." : "Choix de la cible en cours.";
    } else if (round5.phase === PHASES.FINISHED) {
      els.action.textContent = "La mort subite est terminée.";
    } else {
      els.action.textContent = "Attendez les instructions admin.";
    }

    els.duelTitle.textContent = role.isDuelist ? "Vous êtes en duel" : "Duel en cours";
    if (!role.hasActiveDuel) {
      els.buzzStatus.textContent = "Duel en attente de deux joueurs côté admin.";
    } else if (buzzInFlight) {
      els.buzzStatus.textContent = "Buzz en cours d’envoi…";
    } else if (role.canBuzz) {
      els.buzzStatus.textContent = `Buzzer ouvert · touche ${formatBuzzKeyLabel(getBuzzKeyCode?.() || "Space")}.`;
    } else if (round5.duel.buzzedBy) {
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
    if (!getRoleState(me).canBuzz) return;
    buzzInFlight = true;
    render();
    try {
      await runRound5SyncedTransaction((state) => {
        const duelist = [state.duel.attackerId, state.duel.targetId].includes(me);
        if (!(state.phase === PHASES.DUEL && state.duel.buzzerOpen && duelist && isAlive(state, me) && !state.duel.buzzedBy)) return state;
        return { ...state, duel: { ...state.duel, buzzerOpen: false, buzzedBy: me, buzzedAt: Date.now() } };
      });
    } finally {
      buzzInFlight = false;
      render();
    }
  }

  function isBuzzKey(event) {
    const expected = getBuzzKeyCode?.() || "Space";
    return event.code === expected || event.key === expected || (expected === "Space" && event.key === " ");
  }

  els.buzz.onclick = buzzDuel;
  document.addEventListener("keydown", async (event) => {
    if (!isGuestRoundVisible()) return;
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!isBuzzKey(event)) return;
    if (typeof isGuestTypingContext === "function") {
      if (isGuestTypingContext(event.target)) return;
    } else {
      const tag = event.target instanceof HTMLElement ? event.target.tagName.toLowerCase() : "";
      if (event.target?.isContentEditable || ["input", "textarea", "select"].includes(tag)) return;
    }
    if (!getRoleState(getMe()).canBuzz) return;
    event.preventDefault();
    await buzzDuel();
  });

  els.outsiderForm.onsubmit = async (event) => {
    event.preventDefault();
    const me = getMe();
    const answer = els.outsiderInput.value.trim();
    if (!answer || !getRoleState(me).outsiderAllowed) return;
    await runRound5SyncedTransaction((state) => {
      const duelist = [state.duel.attackerId, state.duel.targetId].includes(me);
      if (!(state.phase === PHASES.OUTSIDERS_ANSWER && state.outsiders.enabled && isAlive(state, me) && !duelist)) return state;
      return { ...state, outsiders: { ...state.outsiders, answers: { ...(state.outsiders.answers || {}), [me]: { answer, timestamp: Date.now() } } } };
    });
    els.outsiderInput.value = "";
  };

  window.addEventListener("zogquiz:guest-auth-changed", render);
  const renderSyncedRound5 = () => {
    round5 = chooseNewestRound5(primaryRound5, legacyRound5);
    render();
  };
  onValue(ref(db, ROUND5_PATH), (snap) => { primaryRound5 = snap.val(); renderSyncedRound5(); });
  onValue(ref(db, ROUND5_LEGACY_PATH), (snap) => { legacyRound5 = snap.val(); renderSyncedRound5(); });
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

  let roundState = toRound5(defaultRound5);
  let overlayConfig = null;
  let primaryRound5 = null;
  let legacyRound5 = null;

  function applyOverlayConfig(config) {
    overlayConfig = config;
    root.style.setProperty("--m5-name-font-size", `${config.nameFontSizePx}px`);
    root.style.setProperty("--m5-hp-font-size", `${config.hpFontSizePx}px`);
    root.style.setProperty("--m5-text-color", config.textColor);
    root.style.setProperty("--m5-health-color", config.healthColor);
    root.style.setProperty("--m5-health-danger-color", config.dangerColor);
    root.style.setProperty("--m5-health-height", `${config.barHeightPx}px`);
    root.style.setProperty("--m5-health-radius", `${config.cornerRadiusPx}px`);
    root.style.setProperty("--m5-health-max-width", `${config.maxWidthPx}px`);
    root.style.setProperty("--m5-health-padding", `${config.screenPaddingPx}px`);
    root.style.setProperty("--m5-health-gap", `${config.barGapPx}px`);
    root.style.setProperty("--m5-frame-opacity", String(config.frameOpacity));
    root.style.setProperty("--m5-dimmed-opacity", String(config.dimmedOpacity));
    render();
  }

  function getDuelistIds(state) {
    if (state.duel.attackerId || state.duel.targetId) return [state.duel.attackerId, state.duel.targetId];
    const alive = getAliveOrder(state);
    const first = state.turn.currentPlayerId || alive[0] || null;
    return [first, alive.find((id) => id !== first) || null];
  }

  function getHpPercent(id) {
    if (!id) return 0;
    const participant = roundState.participants[id] || {};
    const hp = Math.max(0, Number(participant.hp || 0));
    const configuredMax = Number(overlayConfig?.maxHp || 0);
    const maxHp = configuredMax > 0 ? configuredMax : Math.max(Number(participant.maxHp || 0), Number(participant.initialHp || 0), Number(participant.score || 0), hp, 1);
    return Math.max(0, Math.min(100, (hp / maxHp) * 100));
  }

  function renderSide(side, id) {
    const refs = elements[side];
    const participant = id ? roundState.participants[id] : null;
    const hp = Math.max(0, Number(participant?.hp || 0));
    refs.name.textContent = participant?.name || "—";
    refs.hp.textContent = `${hp} PV`;
    refs.bar.style.setProperty("--hp-percent", String(getHpPercent(id)));
    refs.fighter.classList.toggle("is-empty", !id || !participant);
    refs.fighter.classList.toggle("is-dead", Boolean(id && !isAlive(roundState, id)));
  }

  function render() {
    const [leftId, rightId] = getDuelistIds(roundState);
    renderSide("left", leftId);
    renderSide("right", rightId);
  }

  const renderSyncedRound5 = () => {
    roundState = chooseNewestRound5(primaryRound5, legacyRound5);
    render();
  };

  watchOverlayConfig("round5", applyOverlayConfig);
  onValue(ref(db, ROUND5_PATH), (snap) => { primaryRound5 = snap.val(); renderSyncedRound5(); });
  onValue(ref(db, ROUND5_LEGACY_PATH), (snap) => { legacyRound5 = snap.val(); renderSyncedRound5(); });
}
