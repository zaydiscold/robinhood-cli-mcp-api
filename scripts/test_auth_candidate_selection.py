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
            exp, _mtime, _length, path, token = selector.select_freshest(
                [short, long], now=0, min_remaining_seconds=0
            )
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

    def test_expired_candidates_never_win(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            expired = root / "expired.env"
            expired.write_text("ROBINHOOD_BROKERAGE_TOKEN=" + jwt(999) + "\n")
            with self.assertRaisesRegex(RuntimeError, "no acceptable Robinhood auth candidates"):
                selector.select_freshest(
                    [expired], now=1000, min_remaining_seconds=0
                )

    def test_candidate_must_outlive_the_guard_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            too_short = root / "seven-hours.env"
            too_short.write_text("ROBINHOOD_BROKERAGE_TOKEN=" + jwt(1000 + 7 * 3600) + "\n")
            with self.assertRaisesRegex(RuntimeError, "best_remaining_seconds=25200"):
                selector.select_freshest(
                    [too_short], now=1000, min_remaining_seconds=4 * 86400
                )

    def test_installed_token_is_preserved_when_browser_candidate_is_shorter(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            installed = root / ".env"
            browser = root / "cdp-9222.env"
            installed.write_text("ROBINHOOD_BROKERAGE_TOKEN=" + jwt(1000 + 20 * 86400) + "\n")
            browser.write_text("ROBINHOOD_BROKERAGE_TOKEN=" + jwt(1000 + 10 * 86400) + "\n")
            exp, _mtime, _length, path, _token = selector.select_freshest(
                [installed, browser], now=1000, min_remaining_seconds=4 * 86400
            )
            self.assertEqual(exp, 1000 + 20 * 86400)
            self.assertEqual(path, installed)


if __name__ == "__main__":
    unittest.main()
