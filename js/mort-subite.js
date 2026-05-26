import { db, ref, onValue, update, runTransaction } from "./firebase.js";

const ROUND5_PATH = "rounds/round5";
const DEFAULT_PHASE = "setup";
const PHASES = {
  SETUP: "setup",
  TARGET_SELECTION: "target_selection",
  DUEL: "duel",
  OUTSIDERS_ANSWER: "outsiders_answer",
  RESULT: "result",
  FINISHED: "finished",
};

const defaultRound5 = {
  name: "Mort Subite",
  phase: DEFAULT_PHASE,
  damage: 10,
  participants: {},
  turn: { order: [], currentIndex: 0, currentPlayerId: null },
  duel: {
    attackerId: null,
    targetId: null,
    question: "",
    buzzerOpen: false,
    buzzedBy: null,
    answeredPlayers: {},
  },
  outsiders: { enabled: false, answers: {}, winnerId: null },
  lastResult: { type: null, message: "", damagedPlayers: {} },
  updatedAt: 0,
  updatedBy: "",
};

function toRound5(value) {
  const merged = { ...defaultRound5, ...(value || {}) };
  merged.turn = { ...defaultRound5.turn, ...(value?.turn || {}) };
  merged.duel = { ...defaultRound5.duel, ...(value?.duel || {}) };
  merged.outsiders = { ...defaultRound5.outsiders, ...(value?.outsiders || {}) };
  merged.lastResult = { ...defaultRound5.lastResult, ...(value?.lastResult || {}) };
  merged.participants = value?.participants || {};
  return merged;
}

function isAlive(round5, id) {
  const p = round5?.participants?.[id];
  return Boolean(p && p.alive !== false && p.eliminated !== true && Number(p.hp || 0) > 0);
}

function sessionToParticipant(id, session, previous = {}) {
  const score = Math.max(0, Number(session?.score || 0));
  const hp = previous.hp != null ? Math.max(0, Number(previous.hp || 0)) : score;
  const alive = hp > 0;
  return {
    name: String(session?.nickname || previous?.name || id),
    score,
    hp,
    alive,
    eliminated: !alive,
    color: session?.color || previous?.color || "#ffffff",
  };
}

function buildRound5FromSessions(sessionsById = {}, prevRound5 = defaultRound5) {
  const activeEntries = Object.entries(sessionsById || {})
    .filter(([, session]) => session && session.active !== false)
    .sort((a, b) => Number(b[1]?.score || 0) - Number(a[1]?.score || 0));

  const participants = {};
  const order = [];
  for (const [id, session] of activeEntries) {
    order.push(id);
    participants[id] = sessionToParticipant(id, session, prevRound5?.participants?.[id]);
  }

  const aliveOrder = order.filter((id) => isAlive({ participants }, id));
  const previousCurrent = prevRound5?.turn?.currentPlayerId;
  const currentPlayerId = aliveOrder.includes(previousCurrent) ? previousCurrent : (aliveOrder[0] || null);
  const currentIndex = currentPlayerId ? Math.max(0, order.indexOf(currentPlayerId)) : 0;

  return {
    ...toRound5(prevRound5),
    name: "Mort Subite",
    participants,
    turn: { order, currentIndex, currentPlayerId },
    phase: aliveOrder.length > 1 ? PHASES.TARGET_SELECTION : PHASES.FINISHED,
    duel: { ...defaultRound5.duel },
    outsiders: { ...defaultRound5.outsiders },
    lastResult: { ...defaultRound5.lastResult },
  };
}

function getAliveOrder(round5) {
  return (round5?.turn?.order || []).filter((id) => isAlive(round5, id));
}

function resolveNextPlayerId(round5) {
  const aliveOrder = getAliveOrder(round5);
  if (aliveOrder.length <= 1) return null;
  const current = round5?.turn?.currentPlayerId;
  const currentIdx = Math.max(0, aliveOrder.indexOf(current));
  return aliveOrder[(currentIdx + 1) % aliveOrder.length] || null;
}

export function initMortSubiteAdmin({ getCurrentAdminId, getSessionsById }) {
  const root = document.getElementById("m5-admin");
  if (!root) return;
  const damageInput = document.getElementById("m5-damage");
  const status = document.getElementById("m5-status");
  const player1Select = document.getElementById("m5-player1");
  const player2Select = document.getElementById("m5-player2");
  const questionInput = document.getElementById("m5-question");
  const live = document.getElementById("m5-live");
  let round5 = { ...defaultRound5 };

  onValue(ref(db, ROUND5_PATH), (snap) => { round5 = toRound5(snap.val()); render(); });

  function save(patch) {
    return update(ref(db, ROUND5_PATH), { ...patch, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });
  }

  function render() {
    const sessionsById = getSessionsById?.() || {};
    const currentPlayerName = round5.participants?.[round5.turn?.currentPlayerId]?.name || sessionsById[round5.turn?.currentPlayerId]?.nickname || "—";
    status.textContent = `Tour: ${currentPlayerName} | Phase: ${round5.phase || DEFAULT_PHASE}`;
    damageInput.value = Number(round5.damage || 10);

    const alivePlayers = getAliveOrder(round5);
    player1Select.innerHTML = "";
    player2Select.innerHTML = "";

    for (const id of alivePlayers) {
      const label = round5.participants?.[id]?.name || sessionsById[id]?.nickname || id;
      const p1 = document.createElement("option");
      p1.value = id;
      p1.textContent = label;
      if (id === (round5.duel?.attackerId || round5.turn?.currentPlayerId)) p1.selected = true;
      player1Select.appendChild(p1);

      const p2 = document.createElement("option");
      p2.value = id;
      p2.textContent = label;
      if (id === round5.duel?.targetId) p2.selected = true;
      player2Select.appendChild(p2);
    }

    live.textContent = JSON.stringify(round5, null, 2);
  }

  document.getElementById("m5-init-hp").onclick = async () => {
    const next = buildRound5FromSessions(getSessionsById?.() || {}, round5);
    await save(next);
  };

  document.getElementById("m5-save-config").onclick = async () => save({ damage: Number(damageInput.value || 10) });

  document.getElementById("m5-start-duel").onclick = async () => {
    const attackerId = player1Select.value;
    const targetId = player2Select.value;
    if (!attackerId || !targetId || attackerId === targetId) return;
    await save({
      phase: PHASES.DUEL,
      turn: {
        ...round5.turn,
        currentPlayerId: attackerId,
        currentIndex: Math.max(0, (round5.turn?.order || []).indexOf(attackerId)),
      },
      duel: {
        attackerId,
        targetId,
        question: questionInput.value.trim(),
        buzzerOpen: true,
        buzzedBy: null,
        answeredPlayers: {},
      },
      outsiders: { ...defaultRound5.outsiders },
      lastResult: { ...defaultRound5.lastResult },
    });
  };

  document.getElementById("m5-mark-correct").onclick = async () => {
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr);
      const winner = s.duel?.buzzedBy;
      if (!winner || !s.duel?.attackerId || !s.duel?.targetId) return s;
      const loser = winner === s.duel.attackerId ? s.duel.targetId : s.duel.attackerId;
      const participants = { ...(s.participants || {}) };
      const damage = Number(s.damage || 0);
      const previousHp = Number(participants[loser]?.hp || 0);
      const nextHp = Math.max(0, previousHp - damage);

      participants[loser] = {
        ...(participants[loser] || {}),
        hp: nextHp,
        alive: nextHp > 0,
        eliminated: nextHp <= 0,
      };

      const eliminatedMessage = nextHp <= 0 ? ` — ${participants[loser]?.name || loser} est éliminé(e)` : "";
      return {
        ...s,
        participants,
        phase: getAliveOrder({ ...s, participants }).length <= 1 ? PHASES.FINISHED : PHASES.RESULT,
        duel: { ...s.duel, buzzerOpen: false },
        lastResult: {
          type: nextHp <= 0 ? "elimination" : "duel_correct",
          message: `${participants[winner]?.name || winner} inflige ${damage} dégâts à ${participants[loser]?.name || loser}${eliminatedMessage}`,
          damagedPlayers: { [loser]: damage },
        },
        updatedAt: Date.now(),
      };
    });
  };

  document.getElementById("m5-mark-fail").onclick = async () => {
    await save({
      phase: PHASES.OUTSIDERS_ANSWER,
      duel: { ...round5.duel, buzzerOpen: false, buzzedBy: null },
      outsiders: { ...round5.outsiders, enabled: true },
      lastResult: { type: "duel_failed", message: "Le duel a échoué, les outsiders peuvent répondre.", damagedPlayers: {} },
    });
  };

  document.getElementById("m5-next-turn").onclick = async () => {
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr);
      const nextPlayerId = resolveNextPlayerId(s);
      if (!nextPlayerId) {
        return {
          ...s,
          phase: PHASES.FINISHED,
          duel: { ...defaultRound5.duel },
          outsiders: { ...defaultRound5.outsiders },
          updatedAt: Date.now(),
        };
      }
      return {
        ...s,
        phase: PHASES.TARGET_SELECTION,
        turn: {
          ...s.turn,
          currentPlayerId: nextPlayerId,
          currentIndex: Math.max(0, (s.turn?.order || []).indexOf(nextPlayerId)),
        },
        duel: { ...defaultRound5.duel },
        outsiders: { ...defaultRound5.outsiders },
        lastResult: { ...defaultRound5.lastResult },
        updatedAt: Date.now(),
      };
    });
  };

  document.getElementById("m5-outsider-correct").onclick = async () => {
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr);
      const entries = Object.entries(s.outsiders?.answers || {}).sort((a, b) => Number(a[1]?.timestamp || 0) - Number(b[1]?.timestamp || 0));
      const first = entries[0];
      if (!first || !s.duel?.attackerId || !s.duel?.targetId) return s;
      const [winnerId] = first;
      const participants = { ...(s.participants || {}) };
      const damage = Number(s.damage || 0);
      const damagedPlayers = {};

      for (const id of [s.duel.attackerId, s.duel.targetId]) {
        const hp = Math.max(0, Number(participants[id]?.hp || 0) - damage);
        participants[id] = { ...(participants[id] || {}), hp, alive: hp > 0, eliminated: hp <= 0 };
        damagedPlayers[id] = damage;
      }

      return {
        ...s,
        participants,
        phase: getAliveOrder({ ...s, participants }).length <= 1 ? PHASES.FINISHED : PHASES.RESULT,
        outsiders: { enabled: true, answers: {}, winnerId },
        duel: { ...s.duel, buzzedBy: winnerId, buzzerOpen: false },
        lastResult: {
          type: "outsider_correct",
          message: `${participants[winnerId]?.name || winnerId} (outsider) a répondu juste : ${damage} dégâts aux duelistes.`,
          damagedPlayers,
        },
        updatedAt: Date.now(),
      };
    });
  };
}

export function initMortSubiteGuest({ getCurrentSessionId }) {
  const root = document.getElementById("guest-round5");
  if (!root) return;
  const hpList = document.getElementById("m5-guest-hp");
  const status = document.getElementById("m5-guest-status");
  const targetWrap = document.getElementById("m5-guest-target-wrap");
  const targetSelect = document.getElementById("m5-guest-target");
  const targetBtn = document.getElementById("m5-guest-target-btn");
  const buzzBtn = document.getElementById("m5-guest-buzz");
  const outsiderForm = document.getElementById("m5-outsider-form");
  const outsiderInput = document.getElementById("m5-outsider-input");
  let round5 = defaultRound5;

  onValue(ref(db, ROUND5_PATH), (s) => { round5 = toRound5(s.val()); render(); });

  function canBuzz(me) {
    return round5.phase === PHASES.DUEL && round5.duel?.buzzerOpen && [round5.duel.attackerId, round5.duel.targetId].includes(me);
  }

  function render() {
    const me = getCurrentSessionId?.();
    const aliveList = getAliveOrder(round5);
    hpList.innerHTML = aliveList.map((id) => `<li>${round5.participants?.[id]?.name || id}: ${round5.participants?.[id]?.hp || 0} PV</li>`).join("");
    status.textContent = `Phase ${round5.phase || DEFAULT_PHASE} | Tour: ${round5.participants?.[round5.turn?.currentPlayerId]?.name || "—"}`;

    const canChoose = me && me === round5.turn?.currentPlayerId && round5.phase === PHASES.TARGET_SELECTION && isAlive(round5, me);
    targetWrap.classList.toggle("hidden", !canChoose);
    targetSelect.innerHTML = aliveList.filter((id) => id !== me).map((id) => `<option value="${id}">${round5.participants?.[id]?.name || id}</option>`).join("");

    buzzBtn.disabled = !canBuzz(me);
    const outsiderAllowed = round5.phase === PHASES.OUTSIDERS_ANSWER && me && isAlive(round5, me) && ![round5.duel.attackerId, round5.duel.targetId].includes(me);
    outsiderForm.classList.toggle("hidden", !outsiderAllowed);
  }

  targetBtn.onclick = async () => {
    const me = getCurrentSessionId?.();
    const targetId = targetSelect.value;
    if (!me || !targetId) return;
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr);
      if (s.turn?.currentPlayerId !== me || s.phase !== PHASES.TARGET_SELECTION || !isAlive(s, me)) return s;
      return {
        ...s,
        phase: PHASES.DUEL,
        duel: {
          ...s.duel,
          attackerId: me,
          targetId,
          buzzerOpen: true,
          buzzedBy: null,
          answeredPlayers: {},
        },
        outsiders: { ...defaultRound5.outsiders },
        updatedAt: Date.now(),
      };
    });
  };

  buzzBtn.onclick = async () => {
    const me = getCurrentSessionId?.();
    if (!canBuzz(me)) return;
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr);
      if (s.phase !== PHASES.DUEL || !s.duel?.buzzerOpen || s.duel?.buzzedBy) return s;
      return {
        ...s,
        duel: {
          ...s.duel,
          buzzerOpen: false,
          buzzedBy: me,
          answeredPlayers: { ...(s.duel?.answeredPlayers || {}), [me]: "correct" },
        },
        updatedAt: Date.now(),
      };
    });
  };

  outsiderForm.onsubmit = async (e) => {
    e.preventDefault();
    const me = getCurrentSessionId?.();
    if (!me) return;
    const answer = outsiderInput.value.trim();
    if (!answer) return;
    await update(ref(db, `${ROUND5_PATH}/outsiders/answers/${me}`), { answer, timestamp: Date.now() });
    outsiderInput.value = "";
  };
}

export function initMortSubiteOverlay() {
  const title = document.getElementById("m5o-title");
  if (!title) return;
  const list = document.getElementById("m5o-players");
  const turn = document.getElementById("m5o-turn");
  const duel = document.getElementById("m5o-duel");
  const buzz = document.getElementById("m5o-buzz");
  const question = document.getElementById("m5o-question");
  const phase = document.getElementById("m5o-phase");

  onValue(ref(db, ROUND5_PATH), (s) => {
    const st = toRound5(s.val());
    list.innerHTML = (st.turn?.order || []).map((id) => {
      const p = st.participants?.[id] || {};
      return `<li class="${isAlive(st, id) ? "" : "dead"}">${p.name || id} <strong>${p.hp || 0} PV</strong></li>`;
    }).join("");
    turn.textContent = st.participants?.[st.turn?.currentPlayerId]?.name || "—";
    duel.textContent = `${st.participants?.[st.duel?.attackerId]?.name || "—"} VS ${st.participants?.[st.duel?.targetId]?.name || "—"}`;
    buzz.textContent = st.participants?.[st.duel?.buzzedBy]?.name || "—";
    question.textContent = st.duel?.question || "";
    phase.textContent = st.phase || DEFAULT_PHASE;
    title.textContent = st.name || "Mort Subite";
  });
}
