"""Local same-origin bridge between the formation and an optional PPO policy.

No learner responses, names, LLM requests or training occur in this service.
It binds to loopback only and is not a production multi-user backend.
"""
from __future__ import annotations

import json
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit

import numpy as np

from .policies import RLPolicy, RuleBasedPolicy


def validate_payload(payload: object) -> tuple[np.ndarray, np.ndarray]:
    if not isinstance(payload, dict) or set(payload) != {"observation", "mask"}:
        raise ValueError("Expected observation and mask only")
    observation, mask = payload["observation"], payload["mask"]
    if not isinstance(observation, list) or len(observation) != 11:
        raise ValueError("Expected 11 observations")
    if any(type(x) not in (int, float) or not 0 <= x <= 1 or not np.isfinite(x) for x in observation):
        raise ValueError("Observations must be finite numbers between 0 and 1")
    if not isinstance(mask, list) or len(mask) != 12 or any(type(x) is not bool for x in mask) or not any(mask):
        raise ValueError("Expected 12 booleans with at least one allowed action")
    return np.asarray(observation, dtype=np.float32), np.asarray(mask, dtype=bool)


def make_handler(site: Path, policy, policy_name: str):
    class TutorHandler(SimpleHTTPRequestHandler):
        def _allowed(self) -> bool:
            port = self.server.server_port
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            if self.headers.get("Host") not in hosts:
                self.send_error(403, "Loopback host required")
                return False
            origin = self.headers.get("Origin")
            if origin and origin not in {f"http://{host}" for host in hosts}:
                self.send_error(403, "Same-origin requests only")
                return False
            return True

        def _json(self, status: int, data: dict) -> None:
            body = json.dumps(data, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            if not self._allowed():
                return
            path = urlsplit(self.path).path
            if path == "/api/tutor/status":
                self._json(200, {"policy": policy_name, "llm": False, "experimental": True})
            elif any(part.startswith(".") for part in unquote(path).split("/") if part):
                self.send_error(404)
            else:
                super().do_GET()

        def do_POST(self) -> None:
            if not self._allowed():
                return
            if urlsplit(self.path).path != "/api/tutor/recommend":
                self.send_error(404)
                return
            if self.headers.get_content_type() != "application/json":
                self._json(415, {"error": "JSON required"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 8192:
                    raise ValueError("Invalid body size")
                observation, mask = validate_payload(json.loads(self.rfile.read(size)))
            except (ValueError, UnicodeError):
                self._json(400, {"error": "Invalid observation or action mask"})
                return
            action = int(policy.act(observation, mask, np.random.default_rng(0)))
            if not 0 <= action < 12 or not mask[action]:
                self._json(500, {"error": "Policy returned a masked action"})
                return
            self._json(200, {"action": action, "policy": policy_name})

    return partial(TutorHandler, directory=str(site))


def serve(site: str, checkpoint: str | None = None, port: int = 8000) -> None:
    folder = Path(site).resolve()
    if not (folder / "index.html").is_file():
        raise ValueError("--site must contain the generated formation index.html")
    if checkpoint:
        import torch
        torch.set_num_threads(1)
        policy, name = RLPolicy(checkpoint), "rl"
    else:
        policy, name = RuleBasedPolicy(), "rules"
    with HTTPServer(("127.0.0.1", port), make_handler(folder, policy, name)) as server:
        print(f"Formation + GovTutor ({name}): http://127.0.0.1:{server.server_port}/", flush=True)
        print("Local experimental service; no LLM, no online policy updates.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
