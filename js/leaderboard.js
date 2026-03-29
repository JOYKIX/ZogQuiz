import { db, ref, onValue } from "./firebase.js";

const roomInput = document.getElementById("room-id");
const list = document.getElementById("leaderboard");
let roomId = "room-main";

function bind() {
  onValue(ref(db, `rooms/${roomId}/scoreboard`), (snap) => {
    const rows = Object.values(snap.val() || {}).sort((a, b) => (b.score || 0) - (a.score || 0));
    list.innerHTML = "";
    rows.forEach((r) => {
      const li = document.createElement("li");
      li.textContent = `${r.id} — ${r.score || 0} pts`;
      list.appendChild(li);
    });
  });
}

document.getElementById("watch-room").onclick = () => {
  roomId = roomInput.value.trim() || "room-main";
  bind();
};

bind();
