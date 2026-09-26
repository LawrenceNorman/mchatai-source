"""Tests for mail-graph that need no Microsoft account.

Pure functions (query translation, message shaping, config precedence) plus
the list and move/undo routes against a FAKE Graph that behaves like the real
one where it matters: message ids change on every move.

Run with the sidecar's Python (it has fastapi/httpx/pydantic):

    ~/Library/Application\\ Support/mChatAIShell/microservice-runtime/venv/bin/python3 \\
        mchatai-source/microservices/mail-graph/tests/test_mail_graph.py

Also collectable by pytest.
"""

import asyncio
import hashlib
import base64
import json
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
import main as mg  # noqa: E402

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)
ME = "me@hotmail.com"


# ── helpers ──

def _reset_state(tmp: Path) -> None:
    mg.ACCOUNTS_DIR = tmp / "accounts"
    mg.BUNDLED_CLIENT_PATH = tmp / "bundled-client.json"
    mg.LOCAL_CLIENT_PATH = tmp / "local-client.json"
    for table in (mg._FOLDERS, mg._MOVES, mg._ORIGINS, mg._SEMAPHORES, mg._REFRESH_LOCKS):
        table.clear()


def _authorize(email: str = ME, scope: str = "offline_access User.Read Mail.ReadWrite") -> None:
    mg._write_tokens(email, {
        "access_token": "AT", "refresh_token": "RT", "scope": scope,
        "expires_at": int(time.time()) + 3600, "client_id": "cid",
    })


class FakeGraph:
    """Just enough of Graph: well-known folders, message lookup, list, move."""

    FOLDERS = {"inbox": "F-INBOX", "archive": "F-ARCH", "deleteditems": "F-DEL",
               "junkemail": "F-JUNK", "sentitems": "F-SENT", "drafts": "F-DRAFTS"}

    def __init__(self):
        self.messages = {}            # id → message dict
        self.requests = []            # (method, path, params)
        self.list_response = {"value": []}
        self.token_requests = []      # form bodies sent to the token endpoint

    def add(self, mid, folder, **extra):
        self.messages[mid] = {"id": mid, "parentFolderId": self.FOLDERS[folder],
                              "conversationId": "C1", **extra}

    def folder_of(self, mid):
        fid = self.messages[mid]["parentFolderId"]
        return next(n for n, f in self.FOLDERS.items() if f == fid)

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.url.host == "login.microsoftonline.com":
            assert path.endswith("/oauth2/v2.0/token")
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            self.token_requests.append(form)
            return httpx.Response(200, json={
                "access_token": "AT", "refresh_token": "RT1", "expires_in": 3600,
                "scope": "Mail.ReadWrite User.Read offline_access openid profile email",
            })
        assert request.headers.get("Authorization") == "Bearer AT"
        if request.method == "GET" and path == "/v1.0/me":
            # Personal accounts often leave `mail` null; the sign-in name is the address.
            return httpx.Response(200, json={"mail": None, "userPrincipalName": "Me@Hotmail.com",
                                             "displayName": "Me"})
        params = {k: v[0] for k, v in parse_qs(request.url.query.decode()).items()}
        self.requests.append((request.method, path, params))

        prefix = "/v1.0/me/mailFolders/"
        if request.method == "GET" and path.startswith(prefix) and path.count("/") == 4:
            name = path[len(prefix):]
            if name in self.FOLDERS:
                return httpx.Response(200, json={"id": self.FOLDERS[name]})
            return httpx.Response(404, json={"error": {"code": "ErrorFolderNotFound", "message": "no"}})
        if request.method == "GET" and (path.endswith("/messages")):
            return httpx.Response(200, json=self.list_response)

        msg_prefix = "/v1.0/me/messages/"
        if path.startswith(msg_prefix):
            rest = path[len(msg_prefix):]
            if request.method == "GET":
                if rest not in self.messages:
                    return httpx.Response(404, json={"error": {"code": "ErrorItemNotFound", "message": "gone"}})
                return httpx.Response(200, json={"parentFolderId": self.messages[rest]["parentFolderId"]})
            if request.method == "POST" and rest.endswith("/move"):
                mid = rest[: -len("/move")]
                if mid not in self.messages:
                    return httpx.Response(404, json={"error": {"code": "ErrorItemNotFound", "message": "gone"}})
                dest = json.loads(request.content)["destinationId"]
                fid = self.FOLDERS.get(dest, dest)
                msg = self.messages.pop(mid)
                new_id = mid + "~"          # Graph gives a moved message a new id
                msg.update(id=new_id, parentFolderId=fid)
                self.messages[new_id] = msg
                return httpx.Response(201, json=msg)
        return httpx.Response(500, json={"error": {"code": "Unexpected", "message": path}})


def _with_fake_graph(fake: FakeGraph):
    """Route every httpx.AsyncClient the module creates through the fake."""
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs.pop("timeout", None)
        return real(transport=httpx.MockTransport(fake.handler))
    mg.httpx.AsyncClient = factory
    return lambda: setattr(mg.httpx, "AsyncClient", real)


# ── query translation ──

def test_default_view_is_unread_inbox():
    plan = mg._plan(None)
    assert plan["folder"] == "inbox" and plan["unread"] is True


def test_saved_searches_translate():
    unread = mg._plan("is:unread in:inbox", now=NOW)
    assert (unread["folder"], unread["unread"], unread["kql"]) == ("inbox", True, [])

    needs_reply = mg._plan("is:unread in:inbox -category:promotions -category:social", now=NOW)
    assert needs_reply["focused"] is True and needs_reply["unread"] is True

    starred = mg._plan("is:starred", now=NOW)
    assert starred["flagged"] is True and starred["folder"] is None and not starred["anywhere"]

    attachments = mg._plan("has:attachment in:anywhere", now=NOW)
    assert attachments["attachments"] is True and attachments["anywhere"] is True

    week = mg._plan("newer_than:7d in:inbox", now=NOW)
    assert week["since"] == NOW - timedelta(days=7) and week["folder"] == "inbox"


def test_free_text_and_properties_become_kql():
    plan = mg._plan('invoice from:bob subject:"quarterly report" -spam', now=NOW)
    assert plan["kql"] == ["invoice", "from:bob", "subject:quarterly", "subject:report", "NOT spam"]
    assert mg._kql(plan) == "invoice from:bob subject:quarterly subject:report NOT spam"


def test_full_address_from_is_an_exact_filter():
    plan = mg._plan("from:alice@example.com", now=NOW)
    assert plan["from"] == "alice@example.com" and plan["kql"] == []
    assert "from/emailAddress/address eq 'alice@example.com'" in mg._odata_clauses(plan)


def test_date_anchor_leads_every_filter():
    for q in (None, "is:starred", "newer_than:7d in:inbox", "before:2026/01/01 is:unread"):
        clauses = mg._odata_clauses(mg._plan(q, now=NOW) if q else mg._plan(None))
        assert clauses[0].startswith("receivedDateTime ge "), clauses


def test_negated_read_state():
    assert mg._plan("-is:unread", now=NOW)["unread"] is False
    assert mg._plan("is:read", now=NOW)["unread"] is False
    assert mg._plan("-is:read", now=NOW)["unread"] is True


def test_odata_string_escaping():
    plan = mg._plan("from:o'brien@example.com", now=NOW)
    assert "eq 'o''brien@example.com'" in " and ".join(mg._odata_clauses(plan))


# ── matching and shaping ──

def test_matches_applies_filters_and_hides_trash():
    plan = mg._plan("is:unread newer_than:7d", now=NOW)
    fresh = {"isRead": False, "receivedDateTime": "2026-09-24T10:00:00Z", "parentFolderId": "F-INBOX"}
    assert mg._matches(fresh, plan, {"F-DEL"})
    assert not mg._matches({**fresh, "isRead": True}, plan, set())
    assert not mg._matches({**fresh, "receivedDateTime": "2026-09-01T10:00:00Z"}, plan, set())
    assert not mg._matches({**fresh, "parentFolderId": "F-DEL"}, plan, {"F-DEL"})


def test_message_shape():
    d = {
        "id": "M1", "conversationId": "C1", "subject": "Lunch",
        "from": {"emailAddress": {"name": "Norman, Lawrence", "address": "l@x.com"}},
        "toRecipients": [{"emailAddress": {"name": "", "address": "me@hotmail.com"}},
                         {"emailAddress": {"name": 'Sam "S" Lee', "address": "s@y.com"}}],
        "receivedDateTime": "2026-09-24T10:00:00Z", "bodyPreview": "see you",
        "isRead": False, "flag": {"flagStatus": "flagged"}, "hasAttachments": True,
        "parentFolderId": "F-INBOX", "inferenceClassification": "focused",
        "importance": "high", "categories": ["Blue"],
        "webLink": "https://outlook.live.com/owa/?ItemID=M1",
    }
    m = mg._message(d, ME, {"F-INBOX": "inbox"})
    assert m.threadId == "C1" and m.accountEmail == ME
    assert m.sender == '"Norman, Lawrence" <l@x.com>'
    assert m.to == "me@hotmail.com, \"Sam 'S' Lee\" <s@y.com>"
    assert m.isFlagged and not m.isRead and m.hasAttachments
    assert m.labels == ["folder:inbox", "inference:focused", "importance:high", "category:Blue"]
    assert m.webLink.startswith("https://outlook.live.com/")


def test_next_link_check():
    assert mg._is_graph_next_link("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=10")
    assert mg._is_graph_next_link("https://graph.microsoft.com/v1.0/users/abc/messages?$skiptoken=x")
    assert not mg._is_graph_next_link("https://evil.example/v1.0/me/messages")
    assert not mg._is_graph_next_link("https://graph.microsoft.com/v1.0/me/drive/root/children")


def test_page_tokens_decode_lowercases_keys():
    assert mg._decode_page_tokens(json.dumps({"Me@Hotmail.com": "t"})) == {"me@hotmail.com": "t"}
    assert mg._decode_page_tokens("not json") == {}


def test_pkce_pair():
    verifier, challenge = mg._pkce_pair()
    assert 43 <= len(verifier) <= 128
    expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == expected


# ── configuration ──

def test_client_config_precedence_and_authority_guard():
    with tempfile.TemporaryDirectory() as t:
        _reset_state(Path(t))
        assert mg._client_config() == {}

        mg.BUNDLED_CLIENT_PATH.write_text(json.dumps({"client_id": "bundled-id", "scopes": ["Mail.ReadWrite"]}))
        config = mg._client_config()
        assert config["client_id"] == "bundled-id" and config["source"] == "bundled"
        assert config["scopes"][:2] == ["offline_access", "User.Read"]

        mg.LOCAL_CLIENT_PATH.write_text(json.dumps({"client_id": "local-id", "authority": "https://evil.example/x"}))
        config = mg._client_config()
        assert config["client_id"] == "local-id" and config["source"] == "local"
        assert config["authority"] == mg.DEFAULT_AUTHORITY


def test_move_memory_follows_chains_and_is_bounded():
    with tempfile.TemporaryDirectory() as t:
        _reset_state(Path(t))
        mg._remember(mg._MOVES, ME, "a", "b")
        mg._remember(mg._MOVES, ME, "b", "c")
        assert mg._current_id(ME, "a") == "c"
        mg._remember(mg._MOVES, ME, "c", "a")          # a cycle must not hang
        assert mg._current_id(ME, "a") in ("a", "b", "c")
        for i in range(mg.MAX_REMEMBERED_MOVES + 10):
            mg._remember(mg._MOVES, ME, f"k{i}", f"v{i}")
        assert len(mg._MOVES[ME]) == mg.MAX_REMEMBERED_MOVES


# ── routes against a fake Graph ──

def test_list_page_uses_filter_path_and_hides_trash():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            _authorize()
            fake = FakeGraph()
            fake.list_response = {
                "value": [
                    {"id": "A", "conversationId": "C1", "isRead": False, "parentFolderId": "F-INBOX",
                     "receivedDateTime": "2026-09-24T10:00:00Z", "flag": {"flagStatus": "flagged"}},
                    {"id": "B", "conversationId": "C2", "isRead": False, "parentFolderId": "F-DEL",
                     "receivedDateTime": "2026-09-23T10:00:00Z", "flag": {"flagStatus": "flagged"}},
                ],
                "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=2",
            }
            async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as client:
                page = await mg._list_page(client, ME, mg._plan("is:starred", now=NOW), 20)
            assert [m.id for m in page.messages] == ["A"]          # Deleted Items hidden
            assert page.next_token.endswith("$skip=2")
            method, path, params = fake.requests[-1]
            assert path == "/v1.0/me/messages"
            assert params["$filter"].startswith("receivedDateTime ge 1900-01-01T00:00:00Z and ")
            assert "flag/flagStatus eq 'flagged'" in params["$filter"]
            assert params["$orderby"] == "receivedDateTime desc"

            async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as client:
                await mg._list_page(client, ME, mg._plan("invoice is:unread", now=NOW), 20)
            _, path, params = fake.requests[-1]
            assert params["$search"] == '"invoice"' and "$filter" not in params and "$orderby" not in params

            async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as client:
                await mg._list_page(client, ME, mg._plan(None), 20)
            _, path, params = fake.requests[-1]
            assert path == "/v1.0/me/mailFolders/inbox/messages"
            assert "isRead eq false" in params["$filter"]
    asyncio.run(run())


def test_archive_moves_only_inbox_messages_and_undo_restores_them():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            _authorize()
            fake = FakeGraph()
            fake.add("IN1", "inbox")
            fake.add("SENT1", "sentitems")
            restore = _with_fake_graph(fake)
            try:
                result = await mg.move_messages(ME, mg.MoveRequest(message_ids=["IN1", "SENT1"], destination="archive"))
                assert sorted(result.modified) == ["IN1", "SENT1"] and not result.failed
                assert result.moved == {"IN1": "IN1~"}
                assert fake.folder_of("IN1~") == "archive"
                assert fake.folder_of("SENT1") == "sentitems"      # your reply stays in Sent

                undo = await mg.restore_messages(ME, mg.IdsRequest(message_ids=["IN1", "SENT1"]))
                assert sorted(undo.modified) == ["IN1", "SENT1"] and not undo.failed
                assert fake.folder_of("IN1~~") == "inbox"
                assert fake.folder_of("SENT1") == "sentitems"
                # The id the Mac still holds keeps resolving after two moves.
                assert mg._current_id(ME, "IN1") == "IN1~~"
            finally:
                restore()
    asyncio.run(run())


def test_trash_then_undo_returns_to_the_original_folder():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            _authorize()
            fake = FakeGraph()
            fake.add("S1", "sentitems")
            restore = _with_fake_graph(fake)
            try:
                result = await mg.move_messages(ME, mg.MoveRequest(message_ids=["S1"], destination="trash"))
                assert result.moved == {"S1": "S1~"} and fake.folder_of("S1~") == "deleteditems"
                await mg.restore_messages(ME, mg.IdsRequest(message_ids=["S1"]))
                assert fake.folder_of("S1~~") == "sentitems"
            finally:
                restore()
    asyncio.run(run())


def test_undo_after_restart_fails_honestly_rather_than_claiming_success():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            _authorize()
            fake = FakeGraph()
            fake.add("IN1", "inbox")
            restore = _with_fake_graph(fake)
            try:
                await mg.move_messages(ME, mg.MoveRequest(message_ids=["IN1"], destination="archive"))
                mg._MOVES.clear()
                mg._ORIGINS.clear()                                 # the sidecar restarted
                undo = await mg.restore_messages(ME, mg.IdsRequest(message_ids=["IN1"]))
                assert undo.modified == [] and "IN1" in undo.failed
                assert fake.folder_of("IN1~") == "archive"
            finally:
                restore()
    asyncio.run(run())


def test_read_only_account_is_refused():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            _authorize(scope="offline_access User.Read Mail.Read")
            try:
                await mg.move_messages(ME, mg.MoveRequest(message_ids=["X"], destination="archive"))
            except mg.HTTPException as e:
                assert e.status_code == 403
            else:
                raise AssertionError("a read-only account must be refused")
    asyncio.run(run())


def test_unknown_destination_is_refused():
    async def run():
        try:
            await mg.move_messages(ME, mg.MoveRequest(message_ids=["X"], destination="junk"))
        except mg.HTTPException as e:
            assert e.status_code == 400
        else:
            raise AssertionError("only archive and trash are moves this service makes")
    asyncio.run(run())


async def _await_browser(opened: dict) -> dict:
    for _ in range(100):
        if "url" in opened:
            return {k: v[0] for k, v in parse_qs(urlparse(opened["url"]).query).items()}
        await asyncio.sleep(0.02)
    raise AssertionError("the sign-in never opened a browser")


def test_sign_in_flow_end_to_end_against_fakes():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            mg._FLOWS.clear()
            mg.BUNDLED_CLIENT_PATH.write_text(json.dumps({"client_id": "cid"}))
            opened: dict = {}

            async def fake_open(url):
                opened["url"] = url
            real_open = mg._open_in_browser
            mg._open_in_browser = fake_open
            fake = FakeGraph()
            restore = _with_fake_graph(fake)
            try:
                flow = await mg.add_account()
                assert flow.state == "waiting"
                assert (await mg.add_account()).flow_id == flow.flow_id   # one consent tab at a time

                q = await _await_browser(opened)
                assert q["code_challenge_method"] == "S256" and q["prompt"] == "select_account"
                assert {"offline_access", "User.Read", "Mail.ReadWrite"} <= set(q["scope"].split())
                assert q["redirect_uri"].startswith("http://localhost:")

                # The browser comes back to the loopback listener with a code.
                url = q["redirect_uri"].replace("localhost", "127.0.0.1") + f"/?code=THECODE&state={q['state']}"
                await asyncio.to_thread(lambda: urllib.request.urlopen(url, timeout=5).read())

                status = await mg.sign_in_status(flow.flow_id)
                for _ in range(100):
                    if status.state != "waiting":
                        break
                    await asyncio.sleep(0.02)
                    status = await mg.sign_in_status(flow.flow_id)
                assert status.state == "done", status
                assert status.email == "me@hotmail.com" and status.can_modify

                sent = fake.token_requests[0]
                assert sent["grant_type"] == "authorization_code" and sent["code"] == "THECODE"
                assert sent["client_id"] == "cid" and "client_secret" not in sent
                verifier = sent["code_verifier"]
                expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
                assert expected == q["code_challenge"]                     # PKCE ties up

                stored = json.loads((mg.ACCOUNTS_DIR / "me@hotmail.com" / "token.json").read_text())
                assert stored["client_id"] == "cid" and stored["refresh_token"] == "RT1"
                listed = await mg.list_accounts()
                assert [a.email for a in listed.accounts] == ["me@hotmail.com"] and listed.accounts[0].can_modify
            finally:
                restore()
                mg._open_in_browser = real_open
    asyncio.run(run())


def test_sign_in_cancel_is_real_and_a_wrong_state_is_refused():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            mg._FLOWS.clear()
            mg.BUNDLED_CLIENT_PATH.write_text(json.dumps({"client_id": "cid"}))
            opened: dict = {}

            async def fake_open(url):
                opened["url"] = url
            real_open = mg._open_in_browser
            mg._open_in_browser = fake_open
            try:
                flow = await mg.add_account()
                q = await _await_browser(opened)
                # A redirect carrying someone else's state is the CSRF case.
                url = q["redirect_uri"].replace("localhost", "127.0.0.1") + "/?code=X&state=forged"
                await asyncio.to_thread(lambda: urllib.request.urlopen(url, timeout=5).read())
                for _ in range(100):
                    status = await mg.sign_in_status(flow.flow_id)
                    if status.state != "waiting":
                        break
                    await asyncio.sleep(0.02)
                assert status.state == "error" and "state_mismatch" in status.detail

                second = await mg.add_account()
                assert second.flow_id != flow.flow_id                     # a finished flow does not block a new one
                opened.clear()
                await _await_browser(opened)
                await mg.cancel_sign_in(second.flow_id)
                for _ in range(100):
                    status = await mg.sign_in_status(second.flow_id)
                    if status.state != "waiting":
                        break
                    await asyncio.sleep(0.05)
                assert status.state == "cancelled"
            finally:
                mg._open_in_browser = real_open
    asyncio.run(run())


def test_add_without_client_id_says_what_to_do():
    async def run():
        with tempfile.TemporaryDirectory() as t:
            _reset_state(Path(t))
            try:
                await mg.add_account()
            except mg.HTTPException as e:
                assert e.status_code == 412 and "client ID" in e.detail
            else:
                raise AssertionError("sign-in must refuse to start with no registration")
    asyncio.run(run())


if __name__ == "__main__":
    tests = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_") and callable(fn)]
    failures = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {name}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
