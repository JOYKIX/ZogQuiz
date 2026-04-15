import { db, ref, onValue } from "./firebase.js";

const participantsLeaderboard = document.getElementById("participants-leaderboard");
const viewersLeaderboard = document.getElementById("viewers-leaderboard");

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

onValue(ref(db, "rooms/manche1/viewerLeaderboard"), (snap) => {
  const entries = Object.values(snap.val() || {})
    .map((viewer) => ({
      twitchUser: viewer.twitchUser || "viewer",
      score: Number(viewer.score || 0),
      lastWinAt: Number(viewer.lastWinAt || 0),
    }))
    .sort((a, b) => b.score - a.score || b.lastWinAt - a.lastWinAt);

  renderLeaderboard(
    viewersLeaderboard,
    entries,
    "Aucun viewer classé pour le moment.",
    (entry) => ({ name: entry.twitchUser, score: entry.score }),
  );
});
