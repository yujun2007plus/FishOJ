"""FishOJ / Hydro session helper: login, UiContext, statement text."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin

import requests

DEFAULT_BASE_URL = "http://8.138.202.167"
DEFAULT_DOMAIN = "system"
ENV_NAMES = ("FISHOJ_UNAME", "FISHOJ_PASSWORD", "FISHOJ_BASE_URL", "FISHOJ_DOMAIN")


def fail(message: str, code: int = 1) -> None:
    print(f"错误：{message}", file=sys.stderr)
    raise SystemExit(code)


def load_dotenv(skill_root: Path) -> None:
    path = skill_root / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


def skill_root() -> Path:
    return Path(__file__).resolve().parent.parent


def resolve_base_url(cli: Optional[str] = None) -> str:
    raw = (cli or os.environ.get("FISHOJ_BASE_URL") or DEFAULT_BASE_URL).strip()
    if not raw:
        fail("未设置站点地址（--base-url 或 FISHOJ_BASE_URL）")
    if not re.match(r"^https?://", raw, re.I):
        fail("FISHOJ_BASE_URL / --base-url 须以 http:// 或 https:// 开头")
    return raw.rstrip("/")


def resolve_domain(cli: Optional[str] = None) -> str:
    return (cli or os.environ.get("FISHOJ_DOMAIN") or DEFAULT_DOMAIN).strip() or DEFAULT_DOMAIN


def credentials(user: Optional[str] = None, password: Optional[str] = None) -> tuple[str, str]:
    uname = user or os.environ.get("FISHOJ_UNAME") or os.environ.get("HYDRO_API_UNAME")
    pwd = password or os.environ.get("FISHOJ_PASSWORD") or os.environ.get("HYDRO_API_PASSWORD")
    if not uname or not pwd:
        fail(
            "请设置环境变量 FISHOJ_UNAME / FISHOJ_PASSWORD"
            "（兼容 HYDRO_API_UNAME / HYDRO_API_PASSWORD），或传入 --user / --password"
        )
    return uname, pwd


def site_path(domain: str, path: str) -> str:
    path = "/" + path.lstrip("/")
    if domain and domain != "system":
        return f"/d/{domain}{path}"
    return path


def parse_js_json_assign(html: str, name: str) -> Optional[dict[str, Any]]:
    marker = f"window.{name} ="
    i = html.find(marker)
    if i < 0:
        return None
    rest = html[i + len(marker) :].lstrip()
    if not rest:
        return None
    quote = rest[0]
    if quote not in "'\"":
        return None
    out: list[str] = []
    j = 1
    while j < len(rest):
        ch = rest[j]
        if ch == "\\":
            if j + 1 >= len(rest):
                break
            nxt = rest[j + 1]
            if nxt == "u" and j + 5 < len(rest):
                hexpart = rest[j + 2 : j + 6]
                try:
                    out.append(chr(int(hexpart, 16)))
                    j += 6
                    continue
                except ValueError:
                    pass
            out.append({"n": "\n", "r": "\r", "t": "\t", "'": "'", '"': '"', "\\": "\\", "/": "/"}.get(nxt, nxt))
            j += 2
            continue
        if ch == quote:
            break
        out.append(ch)
        j += 1
    raw = "".join(out)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def extract_contexts(html: str) -> dict[str, Any]:
    ui = parse_js_json_assign(html, "UiContext") or {}
    user = parse_js_json_assign(html, "UserContext") or {}
    extra = parse_js_json_assign(html, "UiContextNew") or {}
    merged = {**ui, **extra}
    return {"ui": merged, "user": user}


def read_problem_statement(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, dict):
        zh = content.get("zh", content.get("en"))
        return "" if zh is None else str(zh)
    raw = str(content)
    trimmed = raw.strip()
    if trimmed.startswith("{") and re.search(r'"zh"\s*:', trimmed):
        try:
            parsed = json.loads(trimmed)
            if isinstance(parsed, dict):
                return str(parsed.get("zh") or parsed.get("en") or "")
        except json.JSONDecodeError:
            return raw
    return raw


def new_session(no_proxy: bool = False, ca_cert: Optional[str] = None) -> requests.Session:
    session = requests.Session()
    if no_proxy:
        session.trust_env = False
    session.verify = ca_cert if ca_cert else True
    session.headers.update(
        {
            "User-Agent": "FishOJ-solvemake/1.0",
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        }
    )
    return session


def login(
    session: requests.Session,
    base_url: str,
    domain: str,
    uname: str,
    password: str,
    timeout: tuple[float, float] = (8, 30),
) -> dict[str, Any]:
    login_url = urljoin(base_url + "/", site_path(domain, "/login").lstrip("/"))
    session.get(login_url, timeout=timeout)
    resp = session.post(
        login_url,
        data={
            "uname": uname,
            "password": password,
            "rememberme": "on",
            "tfa": "",
            "authnChallenge": "",
            "login_submit": "Login",
        },
        timeout=timeout,
        allow_redirects=True,
    )
    if resp.status_code >= 400:
        fail(f"登录 HTTP {resp.status_code}：{resp.text[:200]!r}")
    ctx = extract_contexts(resp.text)
    user = ctx.get("user") or {}
    uid = user.get("_id", user.get("uid"))
    if uid in (None, 0, "0"):
        home = session.get(urljoin(base_url + "/", site_path(domain, "/").lstrip("/")), timeout=timeout)
        ctx = extract_contexts(home.text)
        user = ctx.get("user") or {}
        uid = user.get("_id", user.get("uid"))
    if uid in (None, 0, "0"):
        fail("登录失败：仍为 Guest。请检查账号、密码、域名，以及账号是否可登录该 domain")
    return user


def fetch_html(
    session: requests.Session,
    base_url: str,
    path: str,
    timeout: tuple[float, float] = (8, 40),
) -> requests.Response:
    url = urljoin(base_url + "/", path.lstrip("/"))
    resp = session.get(url, timeout=timeout)
    return resp


def find_pdoc(ui: dict[str, Any]) -> Optional[dict[str, Any]]:
    pdoc = ui.get("pdoc")
    if isinstance(pdoc, dict) and (pdoc.get("content") is not None or pdoc.get("pid") or pdoc.get("title")):
        return pdoc
    return None


def fetch_problem_page(
    session: requests.Session,
    base_url: str,
    domain: str,
    pid: str,
) -> tuple[dict[str, Any], dict[str, Any], str]:
    candidates = [
        site_path(domain, f"/p/{pid}"),
        site_path(domain, f"/ide/{pid}"),
        site_path(domain, f"/markdown_edit?pid={pid}"),
    ]
    last_status = None
    last_len = 0
    for path in candidates:
        resp = fetch_html(session, base_url, path)
        last_status = resp.status_code
        last_len = len(resp.text or "")
        if resp.status_code >= 400:
            continue
        ctx = extract_contexts(resp.text)
        pdoc = find_pdoc(ctx["ui"])
        if pdoc:
            return pdoc, ctx, path
    fail(
        f"无法从站点解析题目 {pid}（最后 HTTP {last_status}，正文 {last_len} 字节）。"
        "题目可能不存在、未公开，或需要有权限的账号登录后再拉"
    )
    raise AssertionError


def csrf_from(session: requests.Session, ui: dict[str, Any]) -> Optional[str]:
    for key in ("csrfToken", "csrf_token", "csrf"):
        val = ui.get(key)
        if isinstance(val, str) and val:
            return val
    for cookie_name in ("csrfToken", "csrf", "sid"):
        if cookie_name in session.cookies:
            val = session.cookies.get(cookie_name)
            if cookie_name == "csrfToken" and val:
                return val
    return session.cookies.get("csrfToken")
