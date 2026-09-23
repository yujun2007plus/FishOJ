---
name: fishoj-solvemake
description: 为渔启（FishOJ / Hydro）站点题目拉取题面、撰写标准官方题解并上传。Use when the user asks to 生成题解、写官方题解、拉取题目、上传题解、markdown_edit、OfficialSolution, or to create editorials for FishOJ / 渔启 pids (J0004, Pxxxx).
---

# 渔启官方题解 Skill

本 Skill **只做题解**：登录渔启 → 拉题面 → 按标准模板写 `题解.md` → 经 OfficialSolution `/markdown_edit` 上传。

**不做**：造测试数据、上传 testdata、在线提交标程、改题面、出新题。

`<skill_root>` = 本文件所在目录（仓库内为 `Tool/solvemake`）。

---

## 题解生成流程（默认整条走完）

用户说「给某题写官方题解 / 生成题解并上传」且未收窄范围时，**必须按序做完** 0→6。只拉 / 只写 / 只传见第 2 节。

```text
0 检查脚本与模板
1 登录账号（.env）
2 确定 pid 与工作目录
3 拉取题面
4 撰写 题解.md（含 IDE 页签约定）
5 上传官方题解
6 汇报，并提示在 /ide/<pid>「官方题解」Tab 验收
```

### 0. 依赖

必须存在：

- `<skill_root>/scripts/client.py`
- `<skill_root>/scripts/fetch_problem.py`
- `<skill_root>/scripts/upload_sol.py`
- `<skill_root>/题解模板.md`
- `<skill_root>/题解生成规范.md`

缺任一 → **第 0 节 fatal stop**。先 `pip install -r <skill_root>/scripts/requirements.txt`。

### 1. 登录账号

复制 `<skill_root>/.env.example` 为 `.env`（gitignore，勿提交）：

```text
FISHOJ_BASE_URL=http://8.138.202.167
FISHOJ_DOMAIN=system
FISHOJ_UNAME=
FISHOJ_PASSWORD=
```

| 步骤 | 账号 |
|------|------|
| 拉公开题 | 可不登录 |
| 拉隐藏题 | 能登录该 domain 即可 |
| **上传** | 必须登录，且有 `PRIV_EDIT_SYSTEM` 或 `PERM_EDIT_PROBLEM`；站点须启用 OfficialSolution |

- 默认站点 `http://8.138.202.167`。`--base-url` / `--user` / `--password` 可临时覆盖。
- **不要**用 CodeFun 的 `HYDRO_API_*` 登渔启。上传缺 `FISHOJ_UNAME` / `FISHOJ_PASSWORD` → fatal stop，**禁止**给演示账号提权凑合传。
- 对话里不要打印密码。

### 2. pid 与目录

pid **显式优先**（`J0004`、`P1001` 原样传 `--pid`）。否则从题目文件夹名解析；仍无则 fatal stop。

```text
<skill_root>/work/<pid>/
  题面.md
  题解.md
  meta.json
  已有题解.md      # 仅当站点已有官方题解
```

### 3. 拉取题面

```text
python "<skill_root>/scripts/fetch_problem.py" --pid <pid> --output "<题目目录>/题面.md"
```

解析 `/p/<pid>`、`/ide/<pid>`、`/markdown_edit?pid=` 的 `UiContextNew.pdoc`，中文 `zh`。核对 `题面.md` 非空、`meta.json` 的 pid/title。

有 `已有题解.md`：先说明，**默认不覆盖上传**，除非用户明确要求覆盖。用户粘贴题面则跳过本脚本。

### 4. 撰写题解

读模板、规范、`题面.md`（及用户标程/旧题解），写入 `题解.md`。详见第 4 节。写完至少心算或跑通 Python。

### 5. 上传

```text
python "<skill_root>/scripts/upload_sol.py" --pid <pid> --solution-file "<题目目录>/题解.md"
```

脚本：登录 → `GET /markdown_edit?pid=` → `POST` **只发** `pid` + `solContent`（+ csrf）。成功行含 `上传题解成功`。禁止带 `content`（会改题面）。

不是 CodeFun `/api/problem/upload_sol`。

### 6. 汇报

```text
pid: <pid>
题面来源: <拉取 | 用户提供>
题解来源: <自动生成 | 用户提供 | 覆盖站点已有>
已拉取: 题面.md
已生成: 题解.md
已上传: <是/否> <HTTP 摘要>
验收: /ide/<pid> →「官方题解」Tab（强制刷新）
```

---

## 0. Fatal Stop

fail closed：只列原因并中止。

```text
无法继续执行，缺失以下依赖或前置条件：

- <缺失项>

请手动补充或修复后重新发起任务。
```

触发：脚本/模板缺失；无 pid 且无题面；拉取失败且无粘贴题面；`题面.md` 空；上传缺账号或 `题解.md` 空；上传非 200。

禁止：伪造题面；上传带 `content`；静默覆盖用户 `题解.md`；用 `HYDRO_API_*` 登渔启；给无权限账号临时提权。

---

## 2. 任务范围（收窄时）

| 用户说法 | 执行 |
|---------|------|
| 只拉题 | 流程 0–3 |
| 只写题解 / 已有题面 | 0、2、4（有题面则跳过 3） |
| 只上传 | 0、1、2、5 |
| 默认 | 0→6 全走 |

---

## 4. 题解正文（规范 + IDE）

先读 `<skill_root>/题解模板.md` 与 `题解生成规范.md`。

### 4.1 版式

- `# 题目名称`（`meta.json` title，**不加粗标题**）
- `## 解题思路`：分点，点名算法
- `## 复杂度分析`
- `## 代码实现` → 五语言（见 4.4）
- 正文变量/复杂度用 `$...$`；禁止 `` `n` `` 或 `` `$n$` ``
- 代码块内源码 + 关键步中文注释

### 4.2 ACM / 核心代码

默认 ACM：IO 在 `main`，逻辑在外部函数，Java 类名 `Main`。题面是函数/`Solution` 时按接口写五份，思路写明包装，不要假装要 stdin 模板。五语言同一算法。

### 4.3 正确性

必须能过样例。说不清算法 → fatal stop。有 `algorithm-contest-problemsetter` 可校对，非硬依赖。用户已给完整 `题解.md` 只对照格式，除非要求重写。

### 4.4 IDE 展示（写进 Markdown 的约定）

渔启 IDE「官方题解」Tab 由 OfficialSolution 前端渲染，**不是**五段代码竖着铺满：

1. **页签卡片**：`## 代码实现` 下连续的语言围栏会被收成**一张**卡片（语言 Tab + Copy），与 AI 分析代码块同类。一次只显示一种语言。
2. **围栏必须连续**：`### Python` / `### Java` / `### C++` / `### JavaScript` / `### C` 与对应 \`\`\` 之间**不要**插段落、样例或别的标题，否则会拆成多张卡片。
3. **info string 写死**：\`\`\`python / java / cpp / javascript / c（`cpp` 不要写成 `c++`），否则页签名不对。
4. **仍然要写满五语言**（规范要求）；折叠是前端的事，不要改成只交一种语言。
5. 前端会拆掉 Hydro Prism 行号，避免叠字；三级语言标题在卡片里会隐藏。

错误：每种语言后面跟一大段解释再写下一种。解释放在「解题思路」，不要插在五段代码中间。

---

## 别人怎么用

1. 复制本目录到 `~/.cursor/skills/fishoj-solvemake`（或仓库 `.cursor/skills` 指向 `Tool/solvemake`）。
2. 配置有「编辑题目」权限的 `.env`，安装 `scripts/requirements.txt`。
3. 对 Agent 说：「用 fishoj-solvemake 给 J0004 写官方题解并上传」。
4. Agent 走上面的流程 0→6。
