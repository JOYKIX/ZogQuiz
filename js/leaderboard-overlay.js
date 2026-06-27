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

const overlayNode = document.querySelector(".leaderboard-overlay");
const panelNode = document.querySelector(".leaderboard-panel");
const titleNode = document.getElementById("leaderboard-title");
const kickerNode = document.getElementById("leaderboard-kicker");
const listNode = document.getElementById("leaderboard-list");

let scaleFrame = 0;

function fitLeaderboardToViewport() {
  if (!overlayNode || !panelNode) return;

  panelNode.style.setProperty("--leaderboard-scale", "1");

  const overlayBox = overlayNode.getBoundingClientRect();
  const styles = window.getComputedStyle(overlayNode);
  const availableWidth = overlayBox.width - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  const availableHeight = overlayBox.height - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);

  if (availableWidth <= 0 || availableHeight <= 0 || panelNode.scrollWidth <= 0 || panelNode.scrollHeight <= 0) return;

  const scale = Math.min(1, availableWidth / panelNode.scrollWidth, availableHeight / panelNode.scrollHeight);

  panelNode.style.setProperty("--leaderboard-scale", String(Math.max(0.1, scale)));
}

function scheduleLeaderboardFit() {
  window.cancelAnimationFrame(scaleFrame);
  scaleFrame = window.requestAnimationFrame(fitLeaderboardToViewport);
}

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
  scheduleLeaderboardFit();
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

  scheduleLeaderboardFit();
}

titleNode.textContent = params.get("title") || config.defaultTitle;
kickerNode.textContent = config.kicker;
document.title = `ZogQuiz Overlay - ${titleNode.textContent}`;
scheduleLeaderboardFit();
window.addEventListener("resize", scheduleLeaderboardFit);
new ResizeObserver(scheduleLeaderboardFit).observe(panelNode);

onValue(ref(db, config.path), (snap) => {
  const entries = Object.entries(snap.val() || {})
    .map(config.normalize)
    .sort(config.sort);

  render(entries);
});
