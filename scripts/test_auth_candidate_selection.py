import base64
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


selector = load("selector", "select-auth-candidate.py")
leveldb = load("leveldb", "extract-auth-leveldb.py")


def jwt(exp):
    enc = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    return enc({"alg": "none"}) + "." + enc({"exp": exp}) + ".x"


class AuthCandidateSelectionTests(unittest.TestCase):
    def test_furthest_expiry_wins_and_siblings_survive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            short = root / "cdp-9222.env"
            long = root / "safari.env"
            target = root / ".env"
            short.write_text("ROBINHOOD_BROKERAGE_TOKEN=" + jwt(100) + "\n")
            long.write_text("ROBINHOOD_BROKERAGE_TOKEN=" + jwt(300) + "\n")
            target.write_text("ROBINHOOD_BROKERAGE_TOKEN=old\nROBINHOOD_WEB_APP_VERSION=keep\n")
            exp, _mtime, _length, path, token = selector.select_freshest([short, long])
            self.assertEqual(exp, 300)
            self.assertEqual(path, long)
            selector.write_target(target, token, path.stem, exp)
            text = target.read_text()
            self.assertIn("ROBINHOOD_WEB_APP_VERSION=keep", text)
            self.assertIn("ROBINHOOD_BROKERAGE_TOKEN=" + jwt(300), text)
            self.assertNotIn(jwt(100), text)

    def test_leveldb_scanner_ranks_jwt_exp_not_file_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = root / "Default" / "Local Storage" / "leveldb"
            db.mkdir(parents=True)
            older = {"access_token": jwt(900), "refresh_token": "r1"}
            newer = {"access_token": jwt(400), "refresh_token": "r2"}
            (db / "001.ldb").write_bytes(b"x" + json.dumps(older).encode() + b"x")
            (db / "002.ldb").write_bytes(b"x" + json.dumps(newer).encode() + b"x")
            exp, _mtime, _length, _source, token = leveldb.scan([root])
            self.assertEqual(exp, 900)
            self.assertEqual(token, jwt(900))

    def test_no_candidate_fails_closed(self):
        with self.assertRaises(RuntimeError):
            selector.select_freshest([])


if __name__ == "__main__":
    unittest.main()
