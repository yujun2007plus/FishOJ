# 渔启官方题解（solvemake）

为 [渔启 / FishOJ](http://8.138.202.167/) 已有题目撰写并上传 **OfficialSolution 官方文字题解**。Cursor Skill 正文见 [SKILL.md](SKILL.md)。

本目录从 `problem_build` 的「题解创建 + 上传」中抽出，站点通道改为 Hydro 会话 + `/markdown_edit`（不是 CodeFun 的 `/api/problem/*`）。

## 安装 Skill

把本目录复制或目录联接到：

- 个人：`~/.cursor/skills/fishoj-solvemake`
- 仓库：`<repo>/.cursor/skills/fishoj-solvemake`

## 环境

```text
pip install -r scripts/requirements.txt
copy .env.example .env
```

编辑 `.env`：账号须能登录，**上传**需要编辑题目权限（管理员或题目编辑）。

```text
FISHOJ_BASE_URL=http://8.138.202.167
FISHOJ_DOMAIN=system
FISHOJ_UNAME=你的用户名
FISHOJ_PASSWORD=你的密码
```

## 命令

```text
python scripts/fetch_problem.py --pid J0004 --output work/J0004/题面.md
python scripts/upload_sol.py --pid J0004 --solution-file work/J0004/题解.md
```

工作文件建议放在 `work/<pid>/`（已 gitignore）。

对 Agent 说：「用 fishoj-solvemake 给 &lt;pid&gt; 写官方题解并上传」。Agent 会走：配账号 → 拉题 → 写题解 → 上传。

IDE「官方题解」Tab 会把连续五语言收成一张页签卡片（与 AI 分析同类）。Markdown 仍须写满五语言，且围栏连续、info string 为 `python` / `java` / `cpp` / `javascript` / `c`。
