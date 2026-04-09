import { db, ref, onValue } from "./firebase.js";

const participantsLeaderboard = document.getElementById("participants-leaderboard");
const viewersLeaderboard = document.getElementById("viewers-leaderboard");

function renderLeaderboard(container, entries, emptyMessage, labelBuilder) {
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = `<li>${emptyMessage}</li>`;
    return;
  }

  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "leader-item";
    li.textContent = labelBuilder(entry);
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
    (entry) => `${entry.nickname} — ${entry.score} pt(s)`,
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
    (entry) => `${entry.twitchUser} — ${entry.score} pt(s)`,
  );
});
