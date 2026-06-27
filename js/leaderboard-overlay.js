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
const pageSource = document.body.dataset.leaderboardSource;
const source = pageSource === "viewers" ? "viewers" : "participants";
const isCombinedOverlay = pageSource === "combined";
const config = SOURCE_CONFIGS[source];
const requestedLimit = Number(params.get("limit") || 5);
const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(20, requestedLimit)) : 5;

const overlayNode = document.querySelector(".leaderboard-overlay");
const panelNodes = Array.from(document.querySelectorAll(".leaderboard-panel"));
const panelNode = document.querySelector(".leaderboard-panel");
const titleNode = document.getElementById("leaderboard-title");
const kickerNode = document.getElementById("leaderboard-kicker");
const listNode = document.getElementById("leaderboard-list");

let scaleFrame = 0;

function fitLeaderboardToViewport() {
  if (!overlayNode || !panelNode) return;

  for (const panel of panelNodes) panel.style.setProperty("--leaderboard-scale", "1");

  const overlayBox = overlayNode.getBoundingClientRect();
  const styles = window.getComputedStyle(overlayNode);
  const availableWidth = overlayBox.width - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  const availableHeight = overlayBox.height - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);

  if (availableWidth <= 0 || availableHeight <= 0) return;

  for (const panel of panelNodes) {
    if (panel.scrollWidth <= 0 || panel.scrollHeight <= 0) continue;

    const scale = Math.min(1, availableWidth / panel.scrollWidth, availableHeight / panel.scrollHeight);
    panel.style.setProperty("--leaderboard-scale", String(Math.max(0.1, scale)));
  }
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

function renderEmpty(targetListNode, targetConfig) {
  targetListNode.innerHTML = "";
  const item = createTextElement("li", "leaderboard-row leaderboard-empty", targetConfig.emptyMessage);
  targetListNode.appendChild(item);
  scheduleLeaderboardFit();
}

function render(entries, targetListNode = listNode, targetConfig = config) {
  targetListNode.innerHTML = "";

  if (!entries.length) {
    if (isCombinedOverlay) {
      scheduleLeaderboardFit();
      return;
    }

    renderEmpty(targetListNode, targetConfig);
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

    targetListNode.appendChild(item);
  }

  scheduleLeaderboardFit();
}

if (!isCombinedOverlay) {
  titleNode.textContent = params.get("title") || config.defaultTitle;
  kickerNode.textContent = config.kicker;
  document.title = `ZogQuiz Overlay - ${titleNode.textContent}`;
}

scheduleLeaderboardFit();
window.addEventListener("resize", scheduleLeaderboardFit);
const resizeObserver = new ResizeObserver(scheduleLeaderboardFit);
for (const panel of panelNodes) resizeObserver.observe(panel);

function subscribeLeaderboard(sourceName, targetListNode) {
  const targetConfig = SOURCE_CONFIGS[sourceName];

  onValue(ref(db, targetConfig.path), (snap) => {
    const entries = Object.entries(snap.val() || {})
      .map(targetConfig.normalize)
      .sort(targetConfig.sort);

    render(entries, targetListNode, targetConfig);
  });
}

if (isCombinedOverlay) {
  for (const sourceName of Object.keys(SOURCE_CONFIGS)) {
    const targetListNode = document.querySelector(`[data-leaderboard-list="${sourceName}"]`);
    if (targetListNode) subscribeLeaderboard(sourceName, targetListNode);
  }
} else {
  subscribeLeaderboard(source, listNode);
}
