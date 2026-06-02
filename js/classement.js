import { db, ref, onValue, remove } from "./firebase.js";
import { showConfirm } from "./modal.js";

const participantsLeaderboard = document.getElementById("participants-leaderboard");
const viewersLeaderboard = document.getElementById("viewers-leaderboard");
const resetViewersLeaderboardButton = document.getElementById("reset-viewers-leaderboard");
const viewersResetStatus = document.getElementById("viewers-reset-status");
const viewersLeaderboardRef = ref(db, "rooms/manche1/viewerLeaderboard");

function renderLeaderboard(container, entries, emptyMessage, labelBuilder) {
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = `<li class="leader-item"><span class="muted">${emptyMessage}</span></li>`;
    return;
  }

  for (const [index, entry] of entries.entries()) {
    const li = document.createElement("li");
    li.className = "leader-item";

    const rank = document.createElement("span");
    rank.className = "status-badge";
    rank.textContent = `#${index + 1}`;

    const display = labelBuilder(entry);

    const name = document.createElement("span");
    name.className = "leader-name";
    name.textContent = display.name;

    const score = document.createElement("span");
    score.className = "leader-score";
    score.textContent = `${display.score} pts`;

    li.append(rank, name, score);
    container.appendChild(li);
  }
}

onValue(ref(db, "rooms/manche1/guestSessions"), (snap) => {
  const entries = Object.entries(snap.val() || {})
    .map(([id, session]) => ({
      id,
      nickname: session.nickname || "Anonyme",
      score: Number(session.score || 0),
      joinedAt: Number(session.joinedAt || 0),
    }))
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);

  renderLeaderboard(
    participantsLeaderboard,
    entries,
    "Aucun participant pour le moment.",
    (entry) => ({ name: entry.nickname, score: entry.score }),
  );
});

onValue(viewersLeaderboardRef, (snap) => {
  const entries = Object.values(snap.val() || {})
    .map((viewer) => ({
      twitchUser: viewer.twitchUser || "viewer",
      score: Number(viewer.score || 0),
      lastWinAt: Number(viewer.lastWinAt || 0),
    }))
    .sort((a, b) => b.score - a.score || b.lastWinAt - a.lastWinAt);

  if (resetViewersLeaderboardButton) resetViewersLeaderboardButton.disabled = entries.length === 0;

  renderLeaderboard(
    viewersLeaderboard,
    entries,
    "Aucun viewer classé pour le moment.",
    (entry) => ({ name: entry.twitchUser, score: entry.score }),
  );
});

function setViewersResetStatus(message, type = "") {
  if (!viewersResetStatus) return;
  viewersResetStatus.textContent = message;
  viewersResetStatus.className = `message${type ? ` ${type}` : ""}`;
}

resetViewersLeaderboardButton?.addEventListener("click", async () => {
  const confirmed = await showConfirm("Supprimer tous les viewers du classement et remettre le leaderboard à zéro ?", {
    title: "Reset viewers",
    confirmText: "Réinitialiser",
  });
  if (!confirmed) return;

  resetViewersLeaderboardButton.disabled = true;
  setViewersResetStatus("Réinitialisation du classement viewers...", "loading");

  try {
    await remove(viewersLeaderboardRef);
    setViewersResetStatus("Classement viewers remis à zéro.", "success");
  } catch (error) {
    console.error("Impossible de réinitialiser le classement viewers", error);
    setViewersResetStatus("Erreur pendant la remise à zéro du classement viewers.", "error");
    resetViewersLeaderboardButton.disabled = false;
  }
});
