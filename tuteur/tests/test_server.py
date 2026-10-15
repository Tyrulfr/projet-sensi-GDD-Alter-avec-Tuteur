import json
from http.client import HTTPConnection
from http.server import HTTPServer
from threading import Thread

import numpy as np
import pytest
from govtutor_rl.policies import RuleBasedPolicy
from govtutor_rl.server import make_handler, validate_payload


def payload():
    return {"observation": [.5] * 11, "mask": [True] * 12}


@pytest.mark.parametrize("invalid", [None, {}, {"observation": [True]*11, "mask": [True]*12},
    {"observation": [float('nan')]*11, "mask": [True]*12},
    {"observation": [1.1]*11, "mask": [True]*12},
    {"observation": [.5]*11, "mask": [False]*12},
    {"observation": [.5]*11, "mask": [1]*12},
    {"observation": [.5]*11, "mask": [True]*12, "student_name": "not accepted"}])
def test_rejects_invalid_payload(invalid):
    with pytest.raises(ValueError):
        validate_payload(invalid)


def test_contract_matches_the_browser():
    obs, mask = validate_payload(payload())
    assert obs.dtype == np.float32 and mask.dtype == bool


def test_http_contract_static_page_and_origin_checks(tmp_path):
    (tmp_path / "index.html").write_text("Formation")
    server = HTTPServer(("127.0.0.1", 0), make_handler(tmp_path, RuleBasedPolicy(), "rules"))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
        connection.request("GET", "/")
        response = connection.getresponse()
        assert response.status == 200 and response.read() == b"Formation"
        connection.request("GET", "/api/tutor/status")
        response = connection.getresponse()
        assert json.loads(response.read())["policy"] == "rules"
        connection.request("POST", "/api/tutor/recommend", json.dumps(payload()), {"Content-Type": "application/json"})
        response = connection.getresponse()
        result = json.loads(response.read())
        assert response.status == 200 and payload()["mask"][result["action"]]
        connection.request("POST", "/api/tutor/recommend", json.dumps(payload()), {"Content-Type": "application/json", "Origin": "https://other.example"})
        response = connection.getresponse()
        assert response.status == 403
        response.read()
        connection.request("GET", "/.git/config")
        response = connection.getresponse()
        assert response.status == 404
        response.read()
        connection.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
