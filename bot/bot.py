#!/usr/bin/env python3
"""Bot Twitch -> Firebase pour les questions viewers de ZogQuiz."""

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
from pathlib import Path
from typing import Any

LOG_FORMAT = "%(asctime)s | %(levelname)s | %(message)s"
DEFAULT_POLL_SECONDS = 2
DEFAULT_RECONNECT_SECONDS = 5

FIREBASE_DB_URL = "https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app"
TWITCH_IRC_HOST = "irc.chat.twitch.tv"
TWITCH_IRC_PORT = 6667


@dataclass
class ActiveViewerQuestion:
    question_id: str
    answer: str


class FirebaseClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        data = None
        headers = {"Content-Type": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(url=url, data=data, method=method, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None

    def get(self, path: str) -> Any:
        return self._request("GET", f"{path}.json")

    def put(self, path: str, payload: dict[str, Any]) -> Any:
        return self._request("PUT", f"{path}.json", payload)

    def get_active_viewer_question(self) -> ActiveViewerQuestion | None:
        state = self.get("rooms/manche1/state") or {}
        if state.get("currentType") != "viewers":
            return None

        question_id = state.get("currentQuestionId")
        if not question_id:
            return None

        question = self.get(f"rooms/manche1/questions/viewers/{question_id}") or {}
        answer = str(question.get("answer") or "").strip()
        if not answer:
            return None

        winner = self.get(f"rooms/manche1/viewerWinners/{question_id}")
        if winner:
            return None

        return ActiveViewerQuestion(question_id=question_id, answer=answer)

    def reward_viewer(self, question_id: str, twitch_user: str, raw_message: str) -> bool:
        existing = self.get(f"rooms/manche1/viewerWinners/{question_id}")
        if existing:
            return False

        winner_payload = {
            "twitchUser": twitch_user,
            "rawMessage": raw_message,
            "awardedAt": int(time.time() * 1000),
        }
        self.put(f"rooms/manche1/viewerWinners/{question_id}", winner_payload)

        leaderboard_path = f"rooms/manche1/viewerLeaderboard/{twitch_user.lower()}"
        previous = self.get(leaderboard_path) or {}
        score = int(previous.get("score") or 0) + 1

        self.put(
            leaderboard_path,
            {
                "twitchUser": twitch_user,
                "score": score,
                "lastWinAt": int(time.time() * 1000),
            },
        )
        return True


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

        data = self.sock.recv(4096).decode("utf-8", errors="ignore")
        lines = [line.strip() for line in data.split("\r\n") if line.strip()]

        for line in lines:
            if line.startswith("PING"):
                self.sock.send("PONG :tmi.twitch.tv\r\n".encode("utf-8"))

        return lines


def normalize_answer(value: str) -> str:
    cleaned = unicodedata.normalize("NFKD", value)
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = cleaned.lower().strip()
    cleaned = re.sub(r"[^a-z0-9]+", "", cleaned)
    return cleaned


def extract_chat_message(raw_irc_line: str) -> tuple[str, str] | None:
    if "PRIVMSG" not in raw_irc_line:
        return None

    match = re.match(r"^:([^!]+)!.* PRIVMSG #[^ ]+ :(.*)$", raw_irc_line)
    if not match:
        return None

    user = match.group(1)
    message = match.group(2).strip()
    return user, message


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


def run() -> None:
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
    token, channel = load_env()
    twitch = TwitchIRC(token=token, channel=channel)
    firebase = FirebaseClient(FIREBASE_DB_URL)

    active: ActiveViewerQuestion | None = None
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
                now = time.time()
                if now >= next_poll:
                    active = firebase.get_active_viewer_question()
                    next_poll = now + DEFAULT_POLL_SECONDS

                if not active:
                    continue

                if normalize_answer(message) != normalize_answer(active.answer):
                    continue

                awarded = firebase.reward_viewer(
                    question_id=active.question_id,
                    twitch_user=user,
                    raw_message=message,
                )
                if awarded:
                    logging.info("Point viewers attribué à %s pour la question %s", user, active.question_id)
                    active = None
                else:
                    logging.info("Bonne réponse ignorée pour %s (déjà attribuée).", user)

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


if __name__ == "__main__":
    run()
