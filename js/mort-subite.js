import { db, ref, onValue, update, get, runTransaction } from "./firebase.js";

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

export function initMortSubiteAdmin({ getCurrentAdminId, sessionsById }) {
  const root = document.getElementById("m5-admin");
  if (!root) return;
  const damageInput = document.getElementById("m5-damage");
  const turnOrderInput = document.getElementById("m5-turn-order");
  const status = document.getElementById("m5-status");
  const hpEditor = document.getElementById("m5-hp-editor");
  const targetSelect = document.getElementById("m5-target");
  const questionInput = document.getElementById("m5-question");
  const live = document.getElementById("m5-live");
  let state = { ...defaultState };

  onValue(ref(db, PATH), (snap) => {
    state = { ...defaultState, ...(snap.val() || {}) };
    render();
  });

  function save(patch) { return update(ref(db, PATH), { ...patch, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" }); }

  function render() {
    status.textContent = `Tour: ${sessionsById[state.currentTurnPlayerId]?.nickname || "—"} | Phase: ${state.duel?.phase || "target"}`;
    damageInput.value = state.damage || 10;
    turnOrderInput.value = (state.turnOrder || []).join(",");
    const alivePlayers = (state.turnOrder || []).filter((id) => alive(state, id));
    targetSelect.innerHTML = "";
    for (const id of alivePlayers) {
      if (id === state.currentTurnPlayerId) continue;
      const o = document.createElement("option"); o.value = id; o.textContent = sessionsById[id]?.nickname || id; targetSelect.appendChild(o);
    }
    hpEditor.innerHTML = "";
    for (const id of state.turnOrder || []) {
      const row = document.createElement("div"); row.className = "row";
      row.innerHTML = `<label>${sessionsById[id]?.nickname || id} PV <input data-id="${id}" type="number" value="${Number(state.hpByPlayer?.[id] || 0)}"/></label>`;
      hpEditor.appendChild(row);
    }
    live.textContent = JSON.stringify(state.duel || {}, null, 2);
  }

  document.getElementById("m5-init-hp").onclick = async () => {
    const hpByPlayer = {};
    const order = Object.keys(sessionsById);
    order.forEach((id) => { hpByPlayer[id] = Number(sessionsById[id]?.score || 0); });
    await save({ hpByPlayer, turnOrder: order, currentTurnPlayerId: order[0] || null, eliminated: {}, active: true, duel: { attackerId: null, targetId: null, question: "", buzzerOpen: false, buzzedBy: null, phase: "target" } });
  };
  document.getElementById("m5-save-config").onclick = async () => save({ damage: Number(damageInput.value || 10), turnOrder: turnOrderInput.value.split(",").map((v) => v.trim()).filter(Boolean) });
  document.getElementById("m5-save-hp").onclick = async () => {
    const hpByPlayer = { ...(state.hpByPlayer || {}) };
    hpEditor.querySelectorAll("input[data-id]").forEach((el) => { hpByPlayer[el.dataset.id] = Number(el.value || 0); });
    await save({ hpByPlayer });
  };
  document.getElementById("m5-set-target").onclick = async () => {
    const targetId = targetSelect.value;
    await save({ targetPlayerId: targetId, duel: { attackerId: state.currentTurnPlayerId, targetId, question: questionInput.value.trim(), buzzerOpen: true, buzzedBy: null, phase: "duel" } });
  };
  document.getElementById("m5-mark-correct").onclick = async () => {
    const winner = state.duel?.buzzedBy;
    if (!winner) return;
    const loser = winner === state.duel.attackerId ? state.duel.targetId : state.duel.attackerId;
    const hpByPlayer = { ...(state.hpByPlayer || {}) };
    hpByPlayer[loser] = Number(hpByPlayer[loser] || 0) - Number(state.damage || 0);
    const eliminated = { ...(state.eliminated || {}) };
    if (hpByPlayer[loser] <= 0) eliminated[loser] = true;
    await save({ hpByPlayer, eliminated, duel: { ...state.duel, phase: "result", buzzerOpen: false } });
  };
  document.getElementById("m5-mark-fail").onclick = async () => save({ duel: { ...state.duel, phase: "outsiders", buzzerOpen: false, buzzedBy: null } });
  document.getElementById("m5-next-turn").onclick = async () => {
    const aliveList = (state.turnOrder || []).filter((id) => alive(state, id));
    if (aliveList.length <= 1) return save({ duel: { ...state.duel, phase: "finished" }, active: false });
    const idx = aliveList.indexOf(state.currentTurnPlayerId);
    const nextId = aliveList[(idx + 1) % aliveList.length];
    await save({ currentTurnPlayerId: nextId, targetPlayerId: null, duel: { attackerId: null, targetId: null, question: "", buzzerOpen: false, buzzedBy: null, phase: "target" } });
  };

  document.getElementById("m5-outsider-correct").onclick = async () => {
    const answersSnap = await get(ref(db, ANSWERS_PATH));
    const answers = answersSnap.val() || {};
    const first = Object.values(answers).sort((a,b)=>a.at-b.at)[0];
    if (!first) return;
    const hpByPlayer = { ...(state.hpByPlayer || {}) };
    for (const id of [state.duel.attackerId, state.duel.targetId]) hpByPlayer[id] = Number(hpByPlayer[id] || 0) - Number(state.damage || 0);
    const eliminated = { ...(state.eliminated || {}) };
    for (const id of [state.duel.attackerId, state.duel.targetId]) if (hpByPlayer[id] <= 0) eliminated[id] = true;
    await save({ hpByPlayer, eliminated, duel: { ...state.duel, phase: "result", buzzedBy: first.playerId } });
    await update(ref(db, ANSWERS_PATH), {});
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

  onValue(ref(db, "rooms/manche1/guestSessions"), s => { sessions = s.val() || {}; render(); });
  onValue(ref(db, PATH), s => { state = { ...defaultState, ...(s.val() || {}) }; render(); });

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
    const me = getCurrentSessionId?.(); if (!me) return;
    await update(ref(db, PATH), { targetPlayerId: targetSelect.value, duel: { ...state.duel, attackerId: me, targetId: targetSelect.value, phase: "duel", buzzerOpen: true, buzzedBy: null }, updatedAt: Date.now() });
  };
  buzzBtn.onclick = async () => {
    const me = getCurrentSessionId?.(); if (!canBuzz(me)) return;
    await runTransaction(ref(db, PATH), (curr) => {
      const s = { ...defaultState, ...(curr || {}) };
      if (!s.duel?.buzzerOpen || s.duel?.buzzedBy) return s;
      s.duel.buzzerOpen = false; s.duel.buzzedBy = me; s.updatedAt = Date.now();
      return s;
    });
  };
  outsiderForm.onsubmit = async (e) => { e.preventDefault(); const me = getCurrentSessionId?.(); if (!me) return; await update(ref(db, `${ANSWERS_PATH}/${me}`), { playerId: me, answer: outsiderInput.value.trim(), at: Date.now() }); outsiderInput.value = ""; };
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
  onValue(ref(db, "rooms/manche1/guestSessions"), s => { sessions = s.val() || {}; });
  onValue(ref(db, PATH), (s) => {
    const st = { ...defaultState, ...(s.val() || {}) };
    list.innerHTML = (st.turnOrder || []).map((id) => `<li class="${alive(st,id)?"":"dead"}">${sessions[id]?.nickname || id} <strong>${st.hpByPlayer?.[id] || 0} PV</strong></li>`).join("");
    turn.textContent = sessions[st.currentTurnPlayerId]?.nickname || "—";
    duel.textContent = `${sessions[st.duel?.attackerId]?.nickname || "—"} VS ${sessions[st.duel?.targetId]?.nickname || "—"}`;
    buzz.textContent = sessions[st.duel?.buzzedBy]?.nickname || "—";
    question.textContent = st.duel?.question || "";
    phase.textContent = st.duel?.phase || "target";
  });
}
