"""拉取渔启 / Hydro 题面，写入 题面.md 与 meta.json。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import os

from client import (
    credentials,
    extract_contexts,
    fail,
    fetch_html,
    fetch_problem_page,
    load_dotenv,
    login,
    new_session,
    read_problem_statement,
    resolve_base_url,
    resolve_domain,
    site_path,
    skill_root,
)


def main() -> None:
    load_dotenv(skill_root())
    parser = argparse.ArgumentParser(description="从渔启站点拉取题面 Markdown")
    parser.add_argument("--base-url", default=None, help="站点根地址，默认 FISHOJ_BASE_URL 或线上渔启")
    parser.add_argument("--domain-id", default=None, help="Hydro domainId，默认 system")
    parser.add_argument("--pid", required=True, help="题目 pid，例如 J0004")
    parser.add_argument("--output", required=True, help="题面输出路径，例如 work/J0004/题面.md")
    parser.add_argument("--user", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--login", action="store_true", help="强制登录后再拉（隐藏题 / 要读已有题解时）")
    parser.add_argument("--ca-cert", default=None)
    parser.add_argument("--no-proxy", action="store_true")
    args = parser.parse_args()

    pid = args.pid.strip()
    if not pid:
        fail("pid 为空")

    base_url = resolve_base_url(args.base_url)
    domain = resolve_domain(args.domain_id)
    session = new_session(no_proxy=args.no_proxy, ca_cert=args.ca_cert)

    # 仅 FISHOJ_* 或显式 --login/--user 才登录。不要误用本机里 CodeFun 的 HYDRO_API_*。
    has_fishoj = os.environ.get("FISHOJ_UNAME")
    if args.login or args.user or args.password or has_fishoj:
        uname, password = credentials(args.user, args.password)
        user = login(session, base_url, domain, uname, password)
        print(f"已登录：{user.get('uname')} uid={user.get('_id')}", file=sys.stderr)

    pdoc, ctx, used_path = fetch_problem_page(session, base_url, domain, pid)
    statement = read_problem_statement(pdoc.get("content"))
    if not statement.strip():
        fail(f"题目 {pid} 的题面为空（路径 {used_path}）")

    title = str(pdoc.get("title") or pid)
    doc_id = pdoc.get("docId") or pdoc.get("_id")
    real_pid = str(pdoc.get("pid") or pid)

    sol = ""
    ui = ctx.get("ui") or {}
    if isinstance(ui.get("solContent"), str):
        sol = ui["solContent"]
    if not sol:
        resp = fetch_html(session, base_url, site_path(domain, f"/markdown_edit?pid={real_pid}"))
        if resp.status_code < 400:
            edit_ctx = extract_contexts(resp.text)
            sc = (edit_ctx.get("ui") or {}).get("solContent")
            if isinstance(sc, str):
                sol = sc

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(statement, encoding="utf-8", newline="\n")

    meta = {
        "pid": real_pid,
        "title": title,
        "docId": doc_id,
        "domainId": domain,
        "baseUrl": base_url,
        "fetchedFrom": used_path,
        "hasTextSol": bool(sol.strip()),
        "statementChars": len(statement),
    }
    meta_path = out.parent / "meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if sol.strip():
        (out.parent / "已有题解.md").write_text(sol, encoding="utf-8", newline="\n")

    print(f"获取题面成功：{real_pid} 《{title}》")
    print(f"已写入：{out.resolve()}（{len(statement)} 字符）")
    print(f"元数据：{meta_path.resolve()}")
    if sol.strip():
        print(f"站点已有官方题解，已写入：{(out.parent / '已有题解.md').resolve()}（{len(sol)} 字符）")
    else:
        print("站点尚无官方文字题解（或当前账号看不到）")


if __name__ == "__main__":
    main()
