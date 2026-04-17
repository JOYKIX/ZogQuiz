#!/usr/bin/env python3
"""Bot Twitch viewers pour ZogQuiz.

Lit le chat Twitch, détecte les bonnes réponses viewers sur la manche 1,
et met à jour le classement Firebase Realtime Database.
"""

from __future__ import annotations

import json
import os
import random
import re
import socket
import ssl
import string
import time
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from urllib import error, request

ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
DEFAULT_DB_URL = "https://zogquiz-default-rtdb.europe-west1.firebasedatabase.app"

PING_RE = re.compile(r"^PING\\s+:(.+)$")
PRIVMSG_RE = re.compile(r"^(?:@(?P<tags>[^ ]+) )?:(?P<prefix>[^ ]+) PRIVMSG #[^ ]+ :(?P<message>.*)$")
NOTICE_RE = re.compile(r"^(?:@(?P<tags>[^ ]+) )?:[^ ]+ NOTICE [^ ]+ :(?P<message>.*)$")
MAX_CHAT_MESSAGE_LEN = 250


@dataclass
class Config:
    twitch_token: str
    twitch_channel: str
    twitch_nick: str
    firebase_db_url: str
    twitch_host: str = "irc.chat.twitch.tv"
    twitch_port: int = 6697


class FirebaseClient:
    def __init__(self, database_url: str):
        self.database_url = database_url.rstrip("/")

    def _url(self, path: str) -> str:
        clean = path.strip("/")
        return f"{self.database_url}/{clean}.json"

    def get(self, path: str, with_etag: bool = False) -> Tuple[Any, Optional[str]]:
        headers = {}
        if with_etag:
            headers["X-Firebase-ETag"] = "true"
        req = request.Request(self._url(path), headers=headers, method="GET")
        with request.urlopen(req, timeout=10) as res:
            payload = res.read().decode("utf-8")
            etag = res.headers.get("ETag") if with_etag else None
            return json.loads(payload) if payload else None, etag

    def put(self, path: str, data: Any, if_match: Optional[str] = None) -> bool:
        headers = {"Content-Type": "application/json"}
        if if_match is not None:
            headers["If-Match"] = if_match
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        req = request.Request(self._url(path), data=body, headers=headers, method="PUT")
        try:
            with request.urlopen(req, timeout=10):
                return True
        except error.HTTPError as exc:
            if exc.code == 412:
                return False
            raise


def load_env_file(path: str) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not os.path.exists(path):
        return values

    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[7:].strip()

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            # Supporte KEY=value # commentaire
            if " #" in value:
                value = value.split(" #", 1)[0].strip()
            values[key] = value.strip('"').strip("'")

    return values


def load_config() -> Config:
    file_values = load_env_file(ENV_PATH)

    def env(name: str, default: str = "") -> str:
        return os.getenv(name, file_values.get(name, default)).strip()

    token = env("TWITCH_TOKEN")
    channel = env("TWITCH_CHANNEL").lstrip("#").lower()
    nick = env("TWITCH_NICK", channel)
    db_url = env("FIREBASE_DB_URL", DEFAULT_DB_URL)

    if token and not token.startswith("oauth:"):
        token = f"oauth:{token}"

    if not token or not channel:
        raise SystemExit(
            "Configuration incomplète. Renseigne TWITCH_TOKEN et TWITCH_CHANNEL dans bot/.env."
        )

    if not nick:
        raise SystemExit("TWITCH_NICK est vide. Renseigne un pseudo Twitch valide.")

    if not re.fullmatch(r"[A-Za-z0-9_]{3,25}", nick):
        raise SystemExit(
            "TWITCH_NICK invalide. Autorisé: lettres/chiffres/_ (3 à 25 caractères)."
        )

    return Config(
        twitch_token=token,
        twitch_channel=channel,
        twitch_nick=nick,
        firebase_db_url=db_url,
    )


def normalize_answer(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower()
    text = re.sub(r"[’']", " ", text)
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"_", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_tags(raw_tags: str) -> Dict[str, str]:
    if not raw_tags:
        return {}
    out: Dict[str, str] = {}
    for chunk in raw_tags.split(";"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            out[k] = v
    return out


class ZogQuizViewerBot:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.firebase = FirebaseClient(cfg.firebase_db_url)

    def run_forever(self) -> None:
        backoff = 2
        while True:
            try:
                self._run_once()
                backoff = 2
            except KeyboardInterrupt:
                print("\nArrêt du bot.")
                return
            except Exception as exc:  # noqa: BLE001
                print(f"[ERREUR] {exc}")
                print(f"Reconnexion dans {backoff}s...")
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)

    def _run_once(self) -> None:
        self._ensure_firebase_online()

        print(
            f"Connexion Twitch IRC: #{self.cfg.twitch_channel} "
            f"(nick={self.cfg.twitch_nick}, host={self.cfg.twitch_host}:{self.cfg.twitch_port})"
        )
        sock = socket.create_connection((self.cfg.twitch_host, self.cfg.twitch_port), timeout=20)
        tls_sock = ssl.create_default_context().wrap_socket(sock, server_hostname=self.cfg.twitch_host)
        file = tls_sock.makefile("r", encoding="utf-8", newline="\r\n")

        self._send_line(tls_sock, f"PASS {self.cfg.twitch_token}")
        self._send_line(tls_sock, f"NICK {self.cfg.twitch_nick}")
        self._send_line(tls_sock, "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership")
        self._send_line(tls_sock, f"JOIN #{self.cfg.twitch_channel}")
        print("Bot connecté. En écoute du chat...")

        while True:
            line = file.readline()
            if line == "":
                raise ConnectionError("Connexion Twitch fermée")
            line = line.rstrip("\r\n")

            ping = PING_RE.match(line)
            if ping:
                self._send_line(tls_sock, f"PONG :{ping.group(1)}")
                continue

            notice = NOTICE_RE.match(line)
            if notice:
                message = notice.group("message") or ""
                lower = message.lower()
                if "improperly formatted auth" in lower or "login authentication failed" in lower:
                    raise RuntimeError(f"Authentification Twitch refusée: {message}")
                continue

            parsed = PRIVMSG_RE.match(line)
            if not parsed:
                continue

            tags = parse_tags(parsed.group("tags") or "")
            message = (parsed.group("message") or "").strip()
            raw_prefix = parsed.group("prefix") or ""
            username = tags.get("display-name") or raw_prefix.split("!", 1)[0] or "viewer"
            user_id = tags.get("user-id") or ""

            self._process_message(username=username, user_id=user_id, message=message)

    @staticmethod
    def _send_line(sock: ssl.SSLSocket, line: str) -> None:
        sock.sendall((line + "\r\n").encode("utf-8"))

    def _ensure_firebase_online(self) -> None:
        try:
            self.firebase.get("rooms/manche1/state")
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Connexion Firebase impossible ({self.cfg.firebase_db_url}): {exc}") from exc

    def _process_message(self, username: str, user_id: str, message: str) -> None:
        if not message:
            return

        username_clean = username.strip() or "viewer"
        username_key = username_clean.lower()
        now = int(time.time() * 1000)

        self._append_chat_feed(username=username_clean, user_id=user_id, message=message, now=now)

        try:
            state, _ = self.firebase.get("rooms/manche1/state")
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] Impossible de lire rooms/manche1/state: {exc}")
            return

        if not isinstance(state, dict):
            return
        if state.get("currentType") != "viewers":
            return

        question_id = str(state.get("currentQuestionId") or "").strip()
        if not question_id:
            return

        question_path = f"rooms/manche1/questions/viewers/{question_id}"
        try:
            question, _ = self.firebase.get(question_path)
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] Impossible de lire {question_path}: {exc}")
            return

        if not isinstance(question, dict):
            return

        normalized = normalize_answer(message)
        accepted = self._get_normalized_answers(question)
        if not normalized or normalized not in accepted:
            return

        winner_payload = {
            "twitchUser": username_clean,
            "twitchUserLower": username_key,
            "twitchUserId": user_id,
            "message": message,
            "normalizedMessage": normalized,
            "awardedAt": now,
            "questionId": question_id,
        }

        if not self._register_first_winner(question_id, winner_payload):
            return

        self._increment_viewer_score(username_clean, username_key, user_id, now)
        print(f"[OK] +1 point pour {username_clean} (question {question_id})")

    def _get_normalized_answers(self, question: Dict[str, Any]) -> set[str]:
        answers: list[str] = []

        if isinstance(question.get("normalizedAnswers"), list):
            answers.extend(str(a) for a in question.get("normalizedAnswers") if str(a).strip())

        if isinstance(question.get("acceptedAnswers"), list):
            answers.extend(normalize_answer(str(a)) for a in question.get("acceptedAnswers") if str(a).strip())

        answer_raw = question.get("answer")
        if isinstance(answer_raw, str) and answer_raw.strip():
            answer_text = answer_raw.strip()
            answers.append(normalize_answer(answer_text))

            # Compat: accepte des réponses séparées par | / ;
            if any(sep in answer_text for sep in ("|", ";", "/")):
                parts = re.split(r"[|;/]", answer_text)
                answers.extend(normalize_answer(part) for part in parts if part.strip())

        return {a.strip() for a in answers if a and a.strip()}

    def _register_first_winner(self, question_id: str, payload: Dict[str, Any]) -> bool:
        path = f"rooms/manche1/viewerWinners/{question_id}"
        for _ in range(5):
            current, etag = self.firebase.get(path, with_etag=True)
            if current not in (None, {}):
                return False
            if etag is None:
                return False
            if self.firebase.put(path, payload, if_match=etag):
                return True
        return False

    def _increment_viewer_score(self, username: str, username_key: str, user_id: str, now: int) -> None:
        path = f"rooms/manche1/viewerLeaderboard/{username_key}"
        for _ in range(8):
            current, etag = self.firebase.get(path, with_etag=True)
            if etag is None:
                raise RuntimeError("ETag manquant sur viewerLeaderboard")
            data = current if isinstance(current, dict) else {}
            next_payload = {
                "twitchUser": username,
                "twitchUserLower": username_key,
                "twitchUserId": user_id,
                "score": int(data.get("score", 0)) + 1,
                "lastWinAt": now,
            }
            if self.firebase.put(path, next_payload, if_match=etag):
                return
        raise RuntimeError(f"Impossible d'incrémenter le score pour {username}")

    def _append_chat_feed(self, username: str, user_id: str, message: str, now: int) -> None:
        # Flux best-effort pour panneau admin viewers.
        safe_user = "".join(ch for ch in username.lower() if ch in string.ascii_lowercase + string.digits + "_-")
        suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(4))
        key = f"{now}_{safe_user or 'viewer'}_{suffix}"
        path = f"rooms/viewers/chatFeed/{key}"
        payload = {
            "username": username,
            "userId": user_id,
            "message": message[:MAX_CHAT_MESSAGE_LEN],
            "timestamp": now,
        }
        try:
            self.firebase.put(path, payload)
        except Exception:
            # Ne doit jamais bloquer la logique de scoring.
            return


def main() -> None:
    cfg = load_config()
    bot = ZogQuizViewerBot(cfg)
    bot.run_forever()


if __name__ == "__main__":
    main()
