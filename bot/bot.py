#!/usr/bin/env python3
"""Bot Twitch -> Firebase pour le système viewers multi-manches de ZogQuiz."""

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
from json import JSONDecodeError
from pathlib import Path
from typing import Any

LOG_FORMAT = "%Y-%m-%d %H:%M:%S"
DEFAULT_POLL_SECONDS = 1.2
DEFAULT_RECONNECT_SECONDS = 5

FIREBASE_DB_URL = "https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app"
TWITCH_IRC_HOST = "irc.chat.twitch.tv"
TWITCH_IRC_PORT = 6667


def normalize_answer(value: str) -> str:
    cleaned = unicodedata.normalize("NFKD", value or "")
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = cleaned.lower().strip()
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


class FirebaseClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(url=url, data=data, method=method, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return None
            try:
                return json.loads(raw)
            except JSONDecodeError:
                logging.warning("Réponse Firebase invalide sur %s %s", method, path)
                return None

    def get(self, path: str) -> Any:
        return self._request("GET", f"{path}.json")

    def put(self, path: str, payload: dict[str, Any]) -> Any:
        return self._request("PUT", f"{path}.json", payload)

    def patch(self, path: str, payload: dict[str, Any]) -> Any:
        return self._request("PATCH", f"{path}.json", payload)

    def write_chat_message(self, username: str, message: str, timestamp_ms: int) -> None:
        key = f"{timestamp_ms}_{username.lower()}"
        self.put(
            f"rooms/viewers/chatFeed/{key}",
            {"username": username, "message": message, "timestamp": timestamp_ms},
        )

    def get_active_viewer_session(self) -> dict[str, Any] | None:
        live_state = self.get("rooms/viewers/liveState") or {}
        if live_state.get("active"):
            return live_state

        state = self.get("rooms/manche1/state") or {}
        if state.get("currentType") != "viewers" or not state.get("currentQuestionId"):
            return None

        qid = str(state.get("currentQuestionId"))
        question = self.get(f"rooms/manche1/questions/viewers/{qid}") or {}
        return {
            "active": True,
            "round": "manche1",
            "mode": "viewer-question",
            "questionId": qid,
            "settings": question.get("settings") or {"firstCorrectOnly": True, "allowMultipleWinners": False},
            "points": int(question.get("points") or 1),
        }

    def load_question(self, active: dict[str, Any]) -> dict[str, Any] | None:
        round_name = str(active.get("round") or "")
        qid = str(active.get("questionId") or "")
        if not round_name:
            return None

        if round_name == "manche1":
            return self.get(f"rooms/manche1/questions/viewers/{qid}") or None
        if round_name in {"manche2", "manche3", "manche5"}:
            return self.get(f"rooms/viewers/questions/{round_name}/{qid}") or None
        if round_name == "manche4":
            return self.load_round4_context(active)
        return None

    def load_round4_context(self, active: dict[str, Any]) -> dict[str, Any] | None:
        grid_id = str(active.get("gridId") or self.get("rooms/manche4/state/currentGridId") or "")
        if not grid_id:
            return None

        grid = self.get(f"rooms/viewers/round4/grids/{grid_id}")
        if not grid:
            grid = self.get(f"rooms/manche4/grids/{grid_id}")

        if not grid:
            return None

        valid_cells: list[int] = []
        words = grid.get("words") or grid.get("cells") or []
        for idx, word in enumerate(words, start=1):
            role = str((word or {}).get("role") or "")
            valid = bool((word or {}).get("valid"))
            if role == "good" or valid:
                valid_cells.append(idx)

        return {"gridId": grid_id, "validCells": valid_cells}

    @staticmethod
    def compute_session_key(active: dict[str, Any]) -> str:
        if active.get("round") == "manche4":
            return f"manche4:{active.get('gridId', 'grid')}:{active.get('clueId', 'clue')}"
        return f"{active.get('round')}:{active.get('questionId')}"

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
        points = int(active.get("points") or 1)

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
        previous = self.get(leaderboard_path) or {}
        score = int(previous.get("score") or 0) + points
        self.put(
            leaderboard_path,
            {"twitchUser": username, "score": score, "lastWinAt": timestamp_ms},
        )


class TwitchIRC:
    def __init__(self, token: str, channel: str, nickname: str = "zogquizbot") -> None:
        self.token = token
        self.channel = channel.lower().lstrip("#")
        self.nickname = nickname
        self.sock: socket.socket | None = None

    def connect(self) -> None:
        sock = socket.socket()
        sock.connect((TWITCH_IRC_HOST, TWITCH_IRC_PORT))
        sock.send(f"PASS {self.token}\r\n".encode("utf-8"))
        sock.send(f"NICK {self.nickname}\r\n".encode("utf-8"))
        sock.send(f"JOIN #{self.channel}\r\n".encode("utf-8"))
        self.sock = sock
        logging.info("Connecté au chat Twitch #%s", self.channel)

    def read_lines(self) -> list[str]:
        if not self.sock:
            raise RuntimeError("Socket IRC non initialisée")
        raw = self.sock.recv(4096)
        if not raw:
            raise ConnectionError("Connexion IRC fermée par le serveur")
        data = raw.decode("utf-8", errors="ignore")
        lines = [line.strip() for line in data.split("\r\n") if line.strip()]
        for line in lines:
            if line.startswith("PING"):
                self.sock.send("PONG :tmi.twitch.tv\r\n".encode("utf-8"))
        return lines


def extract_chat_message(raw_irc_line: str) -> tuple[str, str] | None:
    if "PRIVMSG" not in raw_irc_line:
        return None
    match = re.match(r"^:([^!]+)!.* PRIVMSG #[^ ]+ :(.*)$", raw_irc_line)
    if not match:
        return None
    return match.group(1), match.group(2).strip()


def load_env() -> tuple[str, str]:
    env_path = Path(__file__).with_name(".env")
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())

    token = os.getenv("TWITCH_TOKEN", "").strip()
    channel = os.getenv("TWITCH_CHANNEL", "").strip()
    if not token or token == "oauth:" or not channel:
        raise RuntimeError("TWITCH_TOKEN et TWITCH_CHANNEL doivent être configurés dans bot/.env")
    return token, channel


def is_correct(active: dict[str, Any], question: dict[str, Any], message: str) -> bool:
    if active.get("round") == "manche4":
        normalized = normalize_answer(message)
        if not normalized.isdigit():
            return False
        choice = int(normalized)
        return choice in list(question.get("validCells") or [])

    aliases = question.get("normalizedAnswers") or []
    if not aliases:
        accepted = question.get("acceptedAnswers") or [question.get("answer") or ""]
        aliases = [normalize_answer(value) for value in accepted if value]

    normalized = normalize_answer(message)
    return normalized in set(aliases)


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    token, channel = load_env()
    twitch = TwitchIRC(token=token, channel=channel)
    firebase = FirebaseClient(FIREBASE_DB_URL)

    active: dict[str, Any] | None = None
    question: dict[str, Any] | None = None
    next_poll = 0.0

    while True:
        try:
            if twitch.sock is None:
                twitch.connect()

            for line in twitch.read_lines():
                parsed = extract_chat_message(line)
                if not parsed:
                    continue

                user, message = parsed
                now = int(time.time() * 1000)
                firebase.write_chat_message(user, message, now)

                ts = time.time()
                if ts >= next_poll:
                    active = firebase.get_active_viewer_session()
                    question = firebase.load_question(active) if active else None
                    next_poll = ts + DEFAULT_POLL_SECONDS

                if not active or not question:
                    continue

                ends_at = active.get("endsAt")
                try:
                    ends_at_int = int(ends_at) if ends_at else 0
                except (TypeError, ValueError):
                    ends_at_int = 0
                if ends_at_int and now > ends_at_int:
                    continue

                session_key = firebase.compute_session_key(active)
                correct = is_correct(active, question, message)
                firebase.append_attempt(session_key, user, message, correct, now)
                if not correct:
                    continue

                settings = active.get("settings") or {}
                first_only = bool(settings.get("firstCorrectOnly", True))
                allow_multi = bool(settings.get("allowMultipleWinners", False))

                if firebase.has_winner(session_key, user):
                    continue
                if first_only and firebase.has_any_winner(session_key):
                    continue
                if not allow_multi and firebase.has_any_winner(session_key):
                    continue

                firebase.reward_viewer(active, user, message, now)
                logging.info("Bonne réponse viewers (%s) %s: %s", active.get("round"), user, message)

        except (ConnectionError, OSError, urllib.error.URLError, TimeoutError) as err:
            logging.warning("Connexion perdue (%s). Reconnexion dans %ss...", err, DEFAULT_RECONNECT_SECONDS)
            try:
                if twitch.sock:
                    twitch.sock.close()
            except OSError:
                pass
            twitch.sock = None
            time.sleep(DEFAULT_RECONNECT_SECONDS)
        except KeyboardInterrupt:
            logging.info("Arrêt demandé, fermeture du bot.")
            break
        except Exception as err:  # filet de sécurité pour éviter un crash complet
            logging.exception("Erreur inattendue (%s). Redémarrage de la boucle…", err)
            try:
                if twitch.sock:
                    twitch.sock.close()
            except OSError:
                pass
            twitch.sock = None
            time.sleep(DEFAULT_RECONNECT_SECONDS)


if __name__ == "__main__":
    run()
