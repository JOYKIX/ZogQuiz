import { db, ref, onValue } from "./firebase.js";

const SOURCE_CONFIGS = {
  participants: {
    path: "rooms/manche1/guestSessions",
    defaultTitle: "Leaderboard participants",
    kicker: "Classement live",
    emptyMessage: "Aucun participant pour le moment.",
    normalize: ([id, session]) => ({
      id,
      name: session?.nickname || "Anonyme",
      score: Number(session?.score || 0),
      tieBreaker: Number(session?.joinedAt || 0),
    }),
    sort: (a, b) => b.score - a.score || a.tieBreaker - b.tieBreaker,
  },
  viewers: {
    path: "rooms/manche1/viewerLeaderboard",
    defaultTitle: "Leaderboard viewers",
    kicker: "Classement Twitch",
    emptyMessage: "Aucun viewer classé pour le moment.",
    normalize: ([id, viewer]) => ({
      id,
      name: viewer?.twitchUser || "viewer",
      score: Number(viewer?.score || 0),
      tieBreaker: Number(viewer?.lastWinAt || 0),
    }),
    sort: (a, b) => b.score - a.score || b.tieBreaker - a.tieBreaker,
  },
};

const params = new URLSearchParams(window.location.search);
const source = document.body.dataset.leaderboardSource === "viewers" ? "viewers" : "participants";
const config = SOURCE_CONFIGS[source];
const requestedLimit = Number(params.get("limit") || 10);
const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(20, requestedLimit)) : 10;

const titleNode = document.getElementById("leaderboard-title");
const kickerNode = document.getElementById("leaderboard-kicker");
const listNode = document.getElementById("leaderboard-list");

function createTextElement(tagName, className, textContent) {
  const node = document.createElement(tagName);
  node.className = className;
  node.textContent = textContent;
  return node;
}

function renderEmpty() {
  listNode.innerHTML = "";
  const item = createTextElement("li", "leaderboard-row leaderboard-empty", config.emptyMessage);
  listNode.appendChild(item);
}

function render(entries) {
  listNode.innerHTML = "";

  if (!entries.length) {
    renderEmpty();
    return;
  }

  for (const [index, entry] of entries.slice(0, limit).entries()) {
    const item = document.createElement("li");
    item.className = "leaderboard-row";

    item.append(
      createTextElement("span", "leaderboard-rank", `#${index + 1}`),
      createTextElement("span", "leaderboard-name", entry.name),
      createTextElement("span", "leaderboard-score", `${entry.score} pts`),
    );

    listNode.appendChild(item);
  }
}

titleNode.textContent = params.get("title") || config.defaultTitle;
kickerNode.textContent = config.kicker;
document.title = `ZogQuiz Overlay - ${titleNode.textContent}`;

onValue(ref(db, config.path), (snap) => {
  const entries = Object.entries(snap.val() || {})
    .map(config.normalize)
    .sort(config.sort);

  render(entries);
});
