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
    buzzedAt: 0,
    answerStatus: "pending",
  },
  outsiders: { enabled: false, answers: {}, winnerId: null },
  lastResult: { type: null, message: "", damagedPlayers: {} },
  actionLog: {},
  updatedAt: 0,
  updatedBy: "",
};

const toRound5 = (value) => ({
  ...defaultRound5,
  ...(value || {}),
  turn: { ...defaultRound5.turn, ...(value?.turn || {}) },
  duel: { ...defaultRound5.duel, ...(value?.duel || {}) },
  outsiders: { ...defaultRound5.outsiders, ...(value?.outsiders || {}) },
  lastResult: { ...defaultRound5.lastResult, ...(value?.lastResult || {}) },
  actionLog: value?.actionLog || {},
  participants: value?.participants || {},
});

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
  const save = (patch) => update(ref(db, ROUND5_PATH), { ...patch, updatedAt: Date.now(), updatedBy: getCurrentAdminId?.() || "admin" });

  onValue(ref(db, ROUND5_PATH), (snap) => { round5 = toRound5(snap.val()); render(); });

  function render() {
    const r = round5;
    const alive = getAliveOrder(r);
    $("m5-status").textContent = `Phase: ${r.phase} | Joueur actif: ${r.participants?.[r.turn?.currentPlayerId]?.name || "—"}`;
    $("m5-damage").value = Number(r.damage || 10);
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
    $("m5-live").textContent = JSON.stringify(r, null, 2);
  }

  $("m5-init-hp").onclick = async () => save(buildRound5FromSessions(getSessionsById?.() || {}, round5));
  $("m5-save-config").onclick = async () => save({ damage: Number($("m5-damage").value || 10) });
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
    const damage = Number(s.damage || 0); const hp = Math.max(0, Number(s.participants?.[loser]?.hp || 0) - damage);
    s.participants[loser] = { ...s.participants[loser], hp, alive: hp > 0, eliminated: hp <= 0 };
    return { ...s, participants: s.participants, phase: getAliveOrder({ ...s, participants: s.participants }).length <= 1 ? PHASES.FINISHED : PHASES.RESULT, duel: { ...s.duel, buzzerOpen: false, answerStatus: "correct" }, lastResult: { type: "duel_correct", message: `${s.participants?.[winner]?.name || winner} touche ${s.participants?.[loser]?.name || loser}`, damagedPlayers: { [loser]: damage } }, actionLog: addLog(s, `Bonne réponse duel: ${winner}`), updatedAt: Date.now() };
  });

  $("m5-outsider-correct").onclick = async () => runTransaction(ref(db, ROUND5_PATH), (curr) => {
    const s = toRound5(curr); const win = $("m5-outsider-winner").value || Object.keys(s.outsiders?.answers || {})[0]; if (!win) return s;
    const damage = Number(s.damage || 0); const damagedPlayers = {};
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

export function initMortSubiteGuest({ getCurrentSessionId }) {
  const root = document.getElementById("guest-round5"); if (!root) return;
  const $ = (id) => document.getElementById(id); let round5 = defaultRound5;
  const meAlive = (me) => me && isAlive(round5, me);
  onValue(ref(db, ROUND5_PATH), (s) => { round5 = toRound5(s.val()); render(); });

  function render() {
    const me = getCurrentSessionId?.(); const isDuelist = [round5.duel?.attackerId, round5.duel?.targetId].includes(me);
    const outsiderAllowed = round5.phase === PHASES.OUTSIDERS_ANSWER && meAlive(me) && !isDuelist;
    const canBuzz = round5.phase === PHASES.DUEL && round5.duel?.buzzerOpen && meAlive(me) && isDuelist;
    $("m5-guest-hp").innerHTML = (round5.turn?.order || []).map((id) => `<li>${round5.participants?.[id]?.name || id}: ${round5.participants?.[id]?.hp || 0} PV (${isAlive(round5, id) ? "vivant" : "éliminé"})</li>`).join("");
    $("m5-guest-player-state").textContent = `Vous: ${round5.participants?.[me]?.name || "—"} · ${meAlive(me) ? "vivant" : "éliminé"}`;
    $("m5-guest-duel").textContent = `Duel: ${round5.participants?.[round5.duel?.attackerId]?.name || "—"} VS ${round5.participants?.[round5.duel?.targetId]?.name || "—"}`;
    $("m5-guest-phase").textContent = `Phase: ${round5.phase}`;
    $("m5-guest-action").textContent = !meAlive(me) ? "Aucune action (éliminé)." : canBuzz ? "Vous pouvez buzzer." : outsiderAllowed ? "Vous pouvez répondre à l'écrit." : "Attendez les instructions admin.";
    $("m5-guest-buzz").classList.toggle("hidden", !isDuelist || round5.phase !== PHASES.DUEL);
    $("m5-guest-buzz").disabled = !canBuzz;
    $("m5-outsider-form").classList.toggle("hidden", !outsiderAllowed);
  }

  $("m5-guest-buzz").onclick = async () => {
    const me = getCurrentSessionId?.();
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr); const duelist = [s.duel?.attackerId, s.duel?.targetId].includes(me);
      if (!(s.phase === PHASES.DUEL && s.duel?.buzzerOpen && duelist && isAlive(s, me) && !s.duel?.buzzedBy)) return s;
      return { ...s, duel: { ...s.duel, buzzerOpen: false, buzzedBy: me, buzzedAt: Date.now() }, updatedAt: Date.now() };
    });
  };

  $("m5-outsider-form").onsubmit = async (e) => {
    e.preventDefault();
    const me = getCurrentSessionId?.(); const answer = $("m5-outsider-input").value.trim();
    if (!answer) return;
    await runTransaction(ref(db, ROUND5_PATH), (curr) => {
      const s = toRound5(curr); const duelist = [s.duel?.attackerId, s.duel?.targetId].includes(me);
      if (!(s.phase === PHASES.OUTSIDERS_ANSWER && s.outsiders?.enabled && isAlive(s, me) && !duelist)) return s;
      const answers = { ...(s.outsiders?.answers || {}), [me]: { answer, timestamp: Date.now() } };
      return { ...s, outsiders: { ...s.outsiders, answers }, updatedAt: Date.now() };
    });
    $("m5-outsider-input").value = "";
  };
}

export function initMortSubiteOverlay() { /* unchanged functional data-only rendering */
  const title = document.getElementById("m5o-title"); if (!title) return;
  const list = document.getElementById("m5o-players"); const turn = document.getElementById("m5o-turn"); const duel = document.getElementById("m5o-duel"); const buzz = document.getElementById("m5o-buzz"); const question = document.getElementById("m5o-question"); const phase = document.getElementById("m5o-phase");
  onValue(ref(db, ROUND5_PATH), (s) => {
    const st = toRound5(s.val());
    list.innerHTML = (st.turn?.order || []).map((id) => `<li class="${isAlive(st, id) ? "" : "dead"}">${st.participants?.[id]?.name || id} <strong>${st.participants?.[id]?.hp || 0} PV</strong></li>`).join("");
    turn.textContent = st.participants?.[st.turn?.currentPlayerId]?.name || "—";
    duel.textContent = `${st.participants?.[st.duel?.attackerId]?.name || "—"} VS ${st.participants?.[st.duel?.targetId]?.name || "—"}`;
    buzz.textContent = st.participants?.[st.duel?.buzzedBy]?.name || "—";
    question.textContent = st.duel?.question || "";
    phase.textContent = st.phase || DEFAULT_PHASE;
    title.textContent = st.name || "Mort Subite";
  });
}
