#!/usr/bin/env python3
"""Bot Twitch -> Firebase robuste pour ZogQuiz.

Architecture:
- TwitchIRCClient: couche réseau IRC/Twitch
- FirebaseClient: couche accès Firebase Realtime DB
- ViewerQuizService: logique métier (sessions, validation, récompenses)
- main(): boucle principale résiliente avec reconnexion
"""

from __future__ import annotations

import json
import logging
import os
import re
import socket
import time
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from json import JSONDecodeError
from pathlib import Path
from typing import Any

LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
DEFAULT_POLL_SECONDS = 1.2
DEFAULT_RECONNECT_SECONDS = 5
MAX_CHAT_MESSAGE_LENGTH = 350
SOCKET_READ_SIZE = 4096
SOCKET_TIMEOUT_SECONDS = 30
FIREBASE_TIMEOUT_SECONDS = 12

FIREBASE_DB_URL = "https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app"
TWITCH_IRC_HOST = "irc.chat.twitch.tv"
TWITCH_IRC_PORT = 6667


def normalize_answer(value: str) -> str:
    """Normalise une réponse pour comparaison robuste."""
    cleaned = unicodedata.normalize("NFKD", value or "")
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = cleaned.lower().strip()
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def to_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


@dataclass
class ChatMessage:
    username: str
    message: str


class FirebaseClient:
    """Client Firebase tolérant aux erreurs réseau/JSON."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(
            url=url,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=FIREBASE_TIMEOUT_SECONDS) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logging.warning("Firebase %s %s échoué (%s)", method, path, exc)
            return None

        if not raw:
            return None

        try:
            return json.loads(raw)
        except JSONDecodeError:
            logging.warning("Firebase %s %s a retourné un JSON invalide", method, path)
            return None

    def get(self, path: str) -> Any:
        return self._request("GET", f"{path}.json")

    def put(self, path: str, payload: dict[str, Any]) -> Any:
        return self._request("PUT", f"{path}.json", payload)

    def write_chat_message(self, username: str, message: str, timestamp_ms: int) -> None:
        key = f"{timestamp_ms}_{username.lower()}"
        self.put(
            f"rooms/viewers/chatFeed/{key}",
            {"username": username, "message": message, "timestamp": timestamp_ms},
        )

    def get_active_viewer_session(self) -> dict[str, Any] | None:
        """Retourne la session viewers active (compat rooms/viewers/liveState + fallback manche1)."""
        live_state = to_dict(self.get("rooms/viewers/liveState"))
        if bool(live_state.get("active")):
            return live_state

        state = to_dict(self.get("rooms/manche1/state"))
        if state.get("currentType") != "viewers":
            return None

        qid_raw = state.get("currentQuestionId")
        if not qid_raw:
            return None
        qid = str(qid_raw)

        question = to_dict(self.get(f"rooms/manche1/questions/viewers/{qid}"))
        return {
            "active": True,
            "round": "manche1",
            "mode": "viewer-question",
            "questionId": qid,
            "settings": to_dict(question.get("settings"))
            or {"firstCorrectOnly": True, "allowMultipleWinners": False},
            "points": to_int(question.get("points"), 1),
        }

    def load_question(self, active: dict[str, Any]) -> dict[str, Any] | None:
        round_name = str(active.get("round") or "")
        qid = str(active.get("questionId") or "")

        if round_name == "manche1" and qid:
            return to_dict(self.get(f"rooms/manche1/questions/viewers/{qid}")) or None
        if round_name in {"manche2", "manche3", "manche5"} and qid:
            return to_dict(self.get(f"rooms/viewers/questions/{round_name}/{qid}")) or None
        if round_name == "manche4":
            return self._load_round4_context(active)
        return None

    def _load_round4_context(self, active: dict[str, Any]) -> dict[str, Any] | None:
        grid_id = str(active.get("gridId") or self.get("rooms/manche4/state/currentGridId") or "")
        if not grid_id:
            return None

        grid = to_dict(self.get(f"rooms/viewers/round4/grids/{grid_id}"))
        if not grid:
            grid = to_dict(self.get(f"rooms/manche4/grids/{grid_id}"))
        if not grid:
            return None

        valid_cells: list[int] = []
        words = to_list(grid.get("words") or grid.get("cells"))
        for idx, word in enumerate(words, start=1):
            item = to_dict(word)
            role = str(item.get("role") or "")
            valid = bool(item.get("valid"))
            if role == "good" or valid:
                valid_cells.append(idx)

        return {"gridId": grid_id, "validCells": valid_cells}

    @staticmethod
    def compute_session_key(active: dict[str, Any]) -> str:
        round_name = str(active.get("round") or "unknown")
        if round_name == "manche4":
            return f"manche4:{active.get('gridId', 'grid')}:{active.get('clueId', 'clue')}"
        return f"{round_name}:{active.get('questionId', 'unknown')}"

    def append_attempt(self, session_key: str, username: str, message: str, correct: bool, timestamp_ms: int) -> None:
        key = f"{timestamp_ms}_{username.lower()}"
        self.put(
            f"rooms/viewers/attempts/{session_key}/{key}",
            {
                "username": username,
                "message": message,
                "correct": correct,
                "timestamp": timestamp_ms,
            },
        )

    def has_winner(self, session_key: str, username: str) -> bool:
        existing = self.get(f"rooms/viewers/winners/{session_key}/{username.lower()}")
        return bool(existing)

    def has_any_winner(self, session_key: str) -> bool:
        return bool(self.get(f"rooms/viewers/winners/{session_key}"))

    def reward_viewer(self, active: dict[str, Any], username: str, raw_message: str, timestamp_ms: int) -> None:
        session_key = self.compute_session_key(active)
        points = to_int(active.get("points"), 1)

        self.put(
            f"rooms/viewers/winners/{session_key}/{username.lower()}",
            {
                "username": username,
                "rawMessage": raw_message,
                "points": points,
                "timestamp": timestamp_ms,
                "round": active.get("round"),
            },
        )

        leaderboard_path = f"rooms/manche1/viewerLeaderboard/{username.lower()}"
        previous = to_dict(self.get(leaderboard_path))
        next_score = to_int(previous.get("score"), 0) + points
        self.put(
            leaderboard_path,
            {"twitchUser": username, "score": next_score, "lastWinAt": timestamp_ms},
        )


class TwitchIRCClient:
    """Client IRC Twitch avec gestion propre des timeouts et reconnexions."""

    def __init__(self, token: str, channel: str, nickname: str = "zogquizbot") -> None:
        self.token = token
        self.channel = channel.lower().lstrip("#")
        self.nickname = nickname
        self.sock: socket.socket | None = None
        self._buffer = ""

    def connect(self) -> None:
        self.close()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(SOCKET_TIMEOUT_SECONDS)
        sock.connect((TWITCH_IRC_HOST, TWITCH_IRC_PORT))
        self._send_raw(sock, f"PASS {self.token}")
        self._send_raw(sock, f"NICK {self.nickname}")
        self._send_raw(sock, f"JOIN #{self.channel}")
        self.sock = sock
        self._buffer = ""
        logging.info("Connecté à Twitch IRC sur #%s", self.channel)

    def close(self) -> None:
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
        self.sock = None
        self._buffer = ""

    @staticmethod
    def _send_raw(sock: socket.socket, line: str) -> None:
        sock.sendall(f"{line}\r\n".encode("utf-8"))

    def _send_pong(self) -> None:
        if not self.sock:
            return
        try:
            self._send_raw(self.sock, "PONG :tmi.twitch.tv")
        except OSError as exc:
            raise ConnectionError(f"Impossible d'envoyer PONG: {exc}") from exc

    def read_lines(self) -> list[str]:
        """Lit les lignes IRC disponibles; timeout = aucune ligne, pas une erreur fatale."""
        if not self.sock:
            raise ConnectionError("Socket IRC non initialisée")

        try:
            chunk = self.sock.recv(SOCKET_READ_SIZE)
        except socket.timeout:
            return []
        except OSError as exc:
            raise ConnectionError(f"Erreur lecture socket: {exc}") from exc

        if not chunk:
            raise ConnectionError("Connexion IRC fermée par le serveur")

        self._buffer += chunk.decode("utf-8", errors="ignore")
        if "\r\n" not in self._buffer:
            return []

        lines: list[str] = []
        parts = self._buffer.split("\r\n")
        self._buffer = parts.pop() if parts else ""

        for raw in parts:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("PING"):
                self._send_pong()
                continue
            lines.append(line)
        return lines


def extract_chat_message(raw_irc_line: str) -> ChatMessage | None:
    if "PRIVMSG" not in raw_irc_line:
        return None

    match = re.match(r"^:([^!]+)!.* PRIVMSG #[^ ]+ :(.*)$", raw_irc_line)
    if not match:
        return None

    username = match.group(1).strip()
    message = match.group(2).strip()
    if not username or not message:
        return None

    return ChatMessage(username=username, message=message)


def load_env() -> tuple[str, str]:
    def clean_env_value(raw: str) -> str:
        value = raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            return value[1:-1].strip()
        return value

    env_path = Path(__file__).with_name(".env")
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), clean_env_value(value))

    token = os.getenv("TWITCH_TOKEN", "").strip()
    channel = os.getenv("TWITCH_CHANNEL", "").strip()

    if token and not token.startswith("oauth:"):
        token = f"oauth:{token}"

    if not token or token == "oauth:" or not channel:
        raise RuntimeError("TWITCH_TOKEN et TWITCH_CHANNEL doivent être configurés dans bot/.env")

    return token, channel


class ViewerQuizService:
    """Logique métier: tentative, validation, règles de gagnants/récompenses."""

    def __init__(self, firebase: FirebaseClient, poll_seconds: float = DEFAULT_POLL_SECONDS) -> None:
        self.firebase = firebase
        self.poll_seconds = max(0.2, poll_seconds)
        self.active: dict[str, Any] | None = None
        self.question: dict[str, Any] | None = None
        self.next_poll_ts: float = 0.0

    def refresh_state_if_due(self, now_ts: float) -> None:
        if now_ts < self.next_poll_ts:
            return
        self.active = self.firebase.get_active_viewer_session()
        self.question = self.firebase.load_question(self.active) if self.active else None
        self.next_poll_ts = now_ts + self.poll_seconds

    def process_message(self, chat: ChatMessage, timestamp_ms: int) -> None:
        if len(chat.message) > MAX_CHAT_MESSAGE_LENGTH:
            return

        self.firebase.write_chat_message(chat.username, chat.message, timestamp_ms)
        self.refresh_state_if_due(time.time())

        if not self.active or not self.question:
            return

        ends_at = to_int(self.active.get("endsAt"), 0)
        if ends_at > 0 and timestamp_ms > ends_at:
            return

        session_key = self.firebase.compute_session_key(self.active)
        is_correct = self._is_correct_answer(self.active, self.question, chat.message)

        self.firebase.append_attempt(session_key, chat.username, chat.message, is_correct, timestamp_ms)
        if not is_correct:
            return

        settings = to_dict(self.active.get("settings"))
        first_only = bool(settings.get("firstCorrectOnly", True))
        allow_multi = bool(settings.get("allowMultipleWinners", False))

        if self.firebase.has_winner(session_key, chat.username):
            return

        any_winner = self.firebase.has_any_winner(session_key)
        if first_only and any_winner:
            return
        if not allow_multi and any_winner:
            return

        self.firebase.reward_viewer(self.active, chat.username, chat.message, timestamp_ms)
        logging.info(
            "Bonne réponse viewers (%s) par %s: %s",
            self.active.get("round"),
            chat.username,
            chat.message,
        )

    @staticmethod
    def _is_correct_answer(active: dict[str, Any], question: dict[str, Any], message: str) -> bool:
        if active.get("round") == "manche4":
            normalized = normalize_answer(message)
            if not normalized.isdigit():
                return False
            choice = to_int(normalized, -1)
            valid_cells = [to_int(v, -1) for v in to_list(question.get("validCells"))]
            return choice in valid_cells

        normalized_message = normalize_answer(message)
        aliases = to_list(question.get("normalizedAnswers"))

        normalized_aliases: set[str] = set()
        if aliases:
            for alias in aliases:
                alias_text = normalize_answer(str(alias))
                if alias_text:
                    normalized_aliases.add(alias_text)
        else:
            accepted = to_list(question.get("acceptedAnswers"))
            if not accepted:
                fallback = question.get("answer")
                if fallback:
                    accepted = [fallback]
            for value in accepted:
                alias_text = normalize_answer(str(value))
                if alias_text:
                    normalized_aliases.add(alias_text)

        return bool(normalized_aliases) and normalized_message in normalized_aliases


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt=LOG_DATE_FORMAT,
    )

    token, channel = load_env()

    twitch = TwitchIRCClient(token=token, channel=channel)
    firebase = FirebaseClient(FIREBASE_DB_URL)
    service = ViewerQuizService(firebase)

    reconnect_delay = DEFAULT_RECONNECT_SECONDS

    while True:
        try:
            if twitch.sock is None:
                twitch.connect()

            lines = twitch.read_lines()
            if not lines:
                continue

            for line in lines:
                chat = extract_chat_message(line)
                if chat is None:
                    continue

                now_ms = int(time.time() * 1000)
                try:
                    service.process_message(chat, now_ms)
                except Exception as exc:  # sécurité métier: une erreur message ne doit pas tuer la boucle
                    logging.exception("Erreur traitement message (%s): %s", chat.username, exc)

        except KeyboardInterrupt:
            logging.info("Arrêt demandé, fermeture du bot.")
            twitch.close()
            break
        except (ConnectionError, OSError, TimeoutError) as exc:
            logging.warning("Connexion IRC perdue (%s). Reconnexion dans %ss...", exc, reconnect_delay)
            twitch.close()
            time.sleep(reconnect_delay)
        except Exception as exc:
            logging.exception("Erreur inattendue en boucle principale (%s). Reconnexion dans %ss...", exc, reconnect_delay)
            twitch.close()
            time.sleep(reconnect_delay)


if __name__ == "__main__":
    main()
