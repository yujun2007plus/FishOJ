"""将本地 题解.md 上传为渔启 OfficialSolution 官方文字题解。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from client import (
    csrf_from,
    credentials,
    extract_contexts,
    fail,
    fetch_html,
    load_dotenv,
    login,
    new_session,
    resolve_base_url,
    resolve_domain,
    site_path,
    skill_root,
)


def main() -> None:
    load_dotenv(skill_root())
    parser = argparse.ArgumentParser(description="上传官方题解到 /markdown_edit（只写 solContent，不改题面）")
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--domain-id", default=None)
    parser.add_argument("--pid", required=True)
    parser.add_argument("--solution-file", default=None, help="题解 Markdown 路径")
    parser.add_argument("file", nargs="?", default=None, help="题解文件（与 --solution-file 等价）")
    parser.add_argument("--user", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--ca-cert", default=None)
    parser.add_argument("--no-proxy", action="store_true")
    args = parser.parse_args()

    pid = args.pid.strip()
    if not pid:
        fail("pid 为空")

    path = args.solution_file or args.file
    if not path:
        fail("请指定题解文件：--solution-file 或位置参数")
    sol_path = Path(path)
    if not sol_path.is_file():
        fail(f"题解文件不存在：{sol_path}")
    solution = sol_path.read_text(encoding="utf-8")
    if not solution.strip():
        fail("题解内容为空，拒绝上传")

    base_url = resolve_base_url(args.base_url)
    domain = resolve_domain(args.domain_id)
    uname, password = credentials(args.user, args.password)
    session = new_session(no_proxy=args.no_proxy, ca_cert=args.ca_cert)
    user = login(session, base_url, domain, uname, password)
    print(f"已登录：{user.get('uname')} uid={user.get('_id')}", file=sys.stderr)

    edit_path = site_path(domain, f"/markdown_edit?pid={pid}")
    page = fetch_html(session, base_url, edit_path)
    if page.status_code >= 400:
        fail(
            f"打不开题解编辑页 HTTP {page.status_code}。账号需要 PRIV_EDIT_SYSTEM 或 PERM_EDIT_PROBLEM，"
            "且站点须启用 OfficialSolution 插件"
        )
    ctx = extract_contexts(page.text)
    ui = ctx.get("ui") or {}
    if "not found" in (page.text or "")[:800].lower() and "solContent" not in ui:
        fail(f"题目不存在或编辑页无法打开：{pid}")

    csrf = csrf_from(session, ui)
    post_path = site_path(domain, "/markdown_edit")
    from urllib.parse import urljoin

    url = urljoin(base_url + "/", post_path.lstrip("/"))
    data = {"pid": pid, "solContent": solution}
    if csrf:
        data["csrfToken"] = csrf

    headers = {
        "Accept": "application/json, text/html;q=0.8",
        "Referer": urljoin(base_url + "/", edit_path.lstrip("/")),
        "X-Requested-With": "XMLHttpRequest",
    }
    if csrf:
        headers["x-csrf-token"] = csrf
    resp = session.post(url, data=data, headers=headers, timeout=(10, 60), allow_redirects=True)
    print("HTTP", resp.status_code)
    body_ok = False
    try:
        body = resp.json()
        print(json.dumps(body, ensure_ascii=False, indent=2))
        if isinstance(body, dict) and (body.get("ok") is True or body.get("error") in (None, "")):
            if body.get("error"):
                fail(f"接口返回错误：{body.get('error')}")
            body_ok = body.get("ok") is True or resp.ok
    except ValueError:
        print(resp.text[:500])
        body_ok = resp.ok and "题目不存在" not in resp.text

    if not resp.ok or not body_ok:
        fail(
            f"上传失败 HTTP {resp.status_code}。确认 OfficialSolution 已启用，"
            "且未误传 content 字段覆盖题面（本脚本只发送 solContent）"
        )
    print(f"上传题解成功：{pid} ← {sol_path.resolve()}（{len(solution)} 字符）")


if __name__ == "__main__":
    main()
