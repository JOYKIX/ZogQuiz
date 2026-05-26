import { db, ref, onValue, update, get, runTransaction, remove } from "./firebase.js";

const PATH = "rooms/manche5/state";
const ANSWERS_PATH = "rooms/manche5/outsiderAnswers";

const defaultState = {
  active: false,
  damage: 10,
  turnOrder: [],
  hpByPlayer: {},
  eliminated: {},
  currentTurnPlayerId: null,
  targetPlayerId: null,
  duel: { attackerId: null, targetId: null, question: "", buzzerOpen: false, buzzedBy: null, phase: "target" },
  updatedAt: 0,
};

function alive(state, id) { return Number(state?.hpByPlayer?.[id] || 0) > 0 && !state?.eliminated?.[id]; }
function toState(value) { return { ...defaultState, ...(value || {}) }; }
function buildAutoStateFromSessions(sessionsById = {}, prevState = defaultState) {
  const order = Object.entries(sessionsById)
    .filter(([, session]) => session && session.active !== false)
    .sort((a, b) => Number(b[1]?.score || 0) - Number(a[1]?.score || 0))
    .map(([id]) => id);
  const hpByPlayer = {};
  const eliminated = {};
  for (const id of order) {
    const hp = Math.max(0, Number(sessionsById[id]?.score || 0));
    hpByPlayer[id] = hp;
    if (hp <= 0) eliminated[id] = true;
  }
  const aliveOrder = order.filter((id) => hpByPlayer[id] > 0);
  const keepTurn = prevState?.currentTurnPlayerId && aliveOrder.includes(prevState.currentTurnPlayerId);
  return {
    ...toState(prevState),
    turnOrder: order,
    hpByPlayer,
    eliminated,
    currentTurnPlayerId: keepTurn ? prevState.currentTurnPlayerId : (aliveOrder[0] || null),
    targetPlayerId: null,
    duel: { attackerId: null, targetId: null, question: "", buzzerOpen: false, buzzedBy: null, phase: "target" },
    active: aliveOrder.length > 1,
  };
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
  let state = { ...defaultState };
  let outsiderAnswers = {};

  onValue(ref(db, PATH), (snap) => {
    state = toState(snap.val());
    render();
  });
  onValue(ref(db, ANSWERS_PATH), (snap) => {
    outsiderAnswers = snap.val() || {};
    render();
  });

  function save(patch) { return update(ref(db, PATH), { ...patch, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" }); }

  function render() {
    const sessionsById = getSessionsById?.() || {};
    status.textContent = `Tour: ${sessionsById[state.currentTurnPlayerId]?.nickname || "—"} | Phase: ${state.duel?.phase || "target"}`;
    damageInput.value = state.damage || 10;
    const alivePlayers = (state.turnOrder || []).filter((id) => alive(state, id));
    player1Select.innerHTML = "";
    player2Select.innerHTML = "";
    for (const id of alivePlayers) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = sessionsById[id]?.nickname || id;
      const p1 = o.cloneNode(true);
      const p2 = o.cloneNode(true);
      if (id === (state.duel?.attackerId || state.currentTurnPlayerId)) p1.selected = true;
      if (id === (state.duel?.targetId || state.targetPlayerId)) p2.selected = true;
      player1Select.appendChild(p1);
      player2Select.appendChild(p2);
    }
    live.textContent = JSON.stringify({ duel: state.duel || {}, outsiderAnswers }, null, 2);
  }

  document.getElementById("m5-init-hp").onclick = async () => save(buildAutoStateFromSessions(getSessionsById?.() || {}, state));

  document.getElementById("m5-save-config").onclick = async () => {
    await save({ damage: Number(damageInput.value || 10) });
  };

  document.getElementById("m5-start-duel").onclick = async () => {
    const attackerId = player1Select.value;
    const targetId = player2Select.value;
    if (!attackerId || !targetId || attackerId === targetId) return;
    await save({
      currentTurnPlayerId: attackerId,
      targetPlayerId: targetId,
      duel: { attackerId, targetId, question: questionInput.value.trim(), buzzerOpen: true, buzzedBy: null, phase: "duel" },
    });
  };

  document.getElementById("m5-mark-correct").onclick = async () => {
    await runTransaction(ref(db, PATH), (curr) => {
      const s = toState(curr);
      const winner = s.duel?.buzzedBy;
      if (!winner || !s.duel?.attackerId || !s.duel?.targetId) return s;
      const loser = winner === s.duel.attackerId ? s.duel.targetId : s.duel.attackerId;
      const hpByPlayer = { ...(s.hpByPlayer || {}) };
      hpByPlayer[loser] = Number(hpByPlayer[loser] || 0) - Number(s.damage || 0);
      const eliminated = { ...(s.eliminated || {}) };
      if (hpByPlayer[loser] <= 0) eliminated[loser] = true;
      s.hpByPlayer = hpByPlayer;
      s.eliminated = eliminated;
      s.duel = { ...s.duel, phase: "result", buzzerOpen: false };
      s.updatedAt = Date.now();
      return s;
    });
  };

  document.getElementById("m5-mark-fail").onclick = async () => save({ duel: { ...state.duel, phase: "outsiders", buzzerOpen: false, buzzedBy: null } });

  document.getElementById("m5-next-turn").onclick = async () => {
    const aliveList = (state.turnOrder || []).filter((id) => alive(state, id));
    if (aliveList.length <= 1) return save({ duel: { ...state.duel, phase: "finished" }, active: false });
    const idx = Math.max(0, aliveList.indexOf(state.currentTurnPlayerId));
    const nextId = aliveList[(idx + 1) % aliveList.length];
    await save({ currentTurnPlayerId: nextId, targetPlayerId: null, duel: { attackerId: null, targetId: null, question: "", buzzerOpen: false, buzzedBy: null, phase: "target" } });
    await remove(ref(db, ANSWERS_PATH));
  };

  document.getElementById("m5-outsider-correct").onclick = async () => {
    const answersSnap = await get(ref(db, ANSWERS_PATH));
    const answers = answersSnap.val() || {};
    const first = Object.values(answers).sort((a, b) => a.at - b.at)[0];
    if (!first) return;
    await runTransaction(ref(db, PATH), (curr) => {
      const s = toState(curr);
      if (!s.duel?.attackerId || !s.duel?.targetId) return s;
      const hpByPlayer = { ...(s.hpByPlayer || {}) };
      const eliminated = { ...(s.eliminated || {}) };
      for (const id of [s.duel.attackerId, s.duel.targetId]) {
        hpByPlayer[id] = Number(hpByPlayer[id] || 0) - Number(s.damage || 0);
        if (hpByPlayer[id] <= 0) eliminated[id] = true;
      }
      s.hpByPlayer = hpByPlayer;
      s.eliminated = eliminated;
      s.duel = { ...s.duel, phase: "result", buzzedBy: first.playerId, buzzerOpen: false };
      s.updatedAt = Date.now();
      return s;
    });
    await remove(ref(db, ANSWERS_PATH));
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
  let state = defaultState;
  let sessions = {};

  onValue(ref(db, "rooms/manche1/guestSessions"), (s) => { sessions = s.val() || {}; render(); });
  onValue(ref(db, PATH), (s) => { state = toState(s.val()); render(); });

  function canBuzz(me) { return state.duel?.phase === "duel" && state.duel?.buzzerOpen && [state.duel.attackerId, state.duel.targetId].includes(me); }
  function render() {
    const me = getCurrentSessionId?.();
    const aliveList = (state.turnOrder || []).filter((id) => alive(state, id));
    hpList.innerHTML = aliveList.map((id) => `<li>${sessions[id]?.nickname || id}: ${state.hpByPlayer[id]} PV</li>`).join("");
    status.textContent = `Phase ${state.duel?.phase || "target"} | Tour: ${sessions[state.currentTurnPlayerId]?.nickname || "—"}`;
    const canChoose = me && me === state.currentTurnPlayerId && state.duel?.phase === "target" && alive(state, me);
    targetWrap.classList.toggle("hidden", !canChoose);
    targetSelect.innerHTML = aliveList.filter((id) => id !== me).map((id) => `<option value="${id}">${sessions[id]?.nickname || id}</option>`).join("");
    buzzBtn.disabled = !canBuzz(me);
    const outsiderAllowed = state.duel?.phase === "outsiders" && me && alive(state, me) && ![state.duel.attackerId, state.duel.targetId].includes(me);
    outsiderForm.classList.toggle("hidden", !outsiderAllowed);
  }

  targetBtn.onclick = async () => {
    const me = getCurrentSessionId?.();
    const targetId = targetSelect.value;
    if (!me || !targetId) return;
    await runTransaction(ref(db, PATH), (curr) => {
      const s = toState(curr);
      if (s.currentTurnPlayerId !== me || s.duel?.phase !== "target") return s;
      s.targetPlayerId = targetId;
      s.duel = { ...s.duel, attackerId: me, targetId, phase: "duel", buzzerOpen: true, buzzedBy: null };
      s.updatedAt = Date.now();
      return s;
    });
  };

  buzzBtn.onclick = async () => {
    const me = getCurrentSessionId?.();
    if (!canBuzz(me)) return;
    await runTransaction(ref(db, PATH), (curr) => {
      const s = toState(curr);
      if (!s.duel?.buzzerOpen || s.duel?.buzzedBy) return s;
      s.duel.buzzerOpen = false;
      s.duel.buzzedBy = me;
      s.updatedAt = Date.now();
      return s;
    });
  };

  outsiderForm.onsubmit = async (e) => {
    e.preventDefault();
    const me = getCurrentSessionId?.();
    if (!me) return;
    const answer = outsiderInput.value.trim();
    if (!answer) return;
    await update(ref(db, `${ANSWERS_PATH}/${me}`), { playerId: me, answer, at: Date.now() });
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
  let sessions = {};
  onValue(ref(db, "rooms/manche1/guestSessions"), (s) => { sessions = s.val() || {}; });
  onValue(ref(db, PATH), (s) => {
    const st = toState(s.val());
    list.innerHTML = (st.turnOrder || []).map((id) => `<li class="${alive(st, id) ? "" : "dead"}">${sessions[id]?.nickname || id} <strong>${st.hpByPlayer?.[id] || 0} PV</strong></li>`).join("");
    turn.textContent = sessions[st.currentTurnPlayerId]?.nickname || "—";
    duel.textContent = `${sessions[st.duel?.attackerId]?.nickname || "—"} VS ${sessions[st.duel?.targetId]?.nickname || "—"}`;
    buzz.textContent = sessions[st.duel?.buzzedBy]?.nickname || "—";
    question.textContent = st.duel?.question || "";
    phase.textContent = st.duel?.phase || "target";
  });
}
