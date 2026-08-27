# FishOJ

基于 [Hydro](https://hydro.js.org/) 的在线评测系统，面向少儿编程培训班的教学与练习场景。

本仓库**不是**完整的 Hydro 安装包，而是 **FishOJ 自研插件层**、文档与服务器配置样例。Hydro 核心、MongoDB 数据、题库大文件均不在仓库内。

---

## 在线实例

| 服务 | 地址 |
|------|------|
| 主站 | http://8.163.87.247 |
| 编程题 IDE | `/ide/:pid`（编程题默认入口，由 ProblemIde 提供） |

> 阿里云试用机公网 IP 可能在停机/重启后变更，无法访问时请核对控制台最新 IP。

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 评测核心 | Hydro 5.0.4（Node.js + TypeScript） |
| 前端 UI | @hydrooj/ui-default（React + Mantine） |
| 数据库 | MongoDB 7.0 |
| 判题 | hydro-sandbox + Nix 编译器工具链 |
| 反向代理 | Caddy（`:80` → `127.0.0.1:8888`） |
| 进程管理 | PM2（`hydrooj` / `mongodb` / `hydro-sandbox` / `caddy`） |
| 当前部署 | 阿里云 ECS · Ubuntu 22.04 · PM2 + Nix（非 Docker） |

---

## 自研插件一览

所有业务功能通过 `addons/` 下的 Hydro 插件实现，**不修改 Hydro 官方核心**。

| 插件 | 路由 / 入口 | 职责 |
|------|-------------|------|
| **ProblemIde** | `/ide/:pid` | LeetCode 式做题 IDE：Monaco 编辑器、自测/提交、题面 TOC、计时器、练习/考试模式；**教学与 AI 功能的宿主页面** |
| **LearningScaffold** | 控制面板「辅助编码管理」 | 按题目配置学习方式脚手架（Scaffold）开关 |
| **AiTutor** | IDE 内「编程小助手」 | 启发式提示（`/ai-tutor/hint`），根据代码/运行结果给出引导，不直接给答案 |
| **AiAssistant** | IDE 内「AI 助教」 | 多轮 LLM 对话（`/ai-assistant/stream`），支持历史、引用代码、深度思考 |
| **AiAnalysis** | IDE 左侧「AI 分析」Tab | 对提交记录做 SSE 流式错因分析（`/ai-analysis/stream`） |
| **VipIntroPage** | `/vip` | 会员介绍页与 `vip` 域角色；支付流程尚未接通 |

### AI 功能关系（做题页）

```
ProblemIde（宿主）
├── AiAssistant  AI 助教（右侧浮层，多轮对话）
│   └── 头部灯泡按钮 → 打开 AiTutor（编程小助手）
├── AiTutor      编程小助手（启发式提示；AI 助教开启时隐藏右下角 🤖）
├── AiAnalysis   提交记录 AI 分析（左侧 Tab）
└── LearningScaffold / AiTutor 开关由控制面板按题配置
```

**IDE 右上角 ⚙ 设置** 提供「AI 助教」显示开关（关闭后不再显示右下角恢复圆点，统一从此处重新开启）。

跨插件协作协议见 [`docs/problem-ide-learning-contract.md`](docs/problem-ide-learning-contract.md)（CustomEvent + `UiContext`，禁止跨插件 `import`）。

---

## 仓库结构

```
FishOJ/
├── README.md                          # 本文件
├── docs/
│   ├── 项目定位.md                    # 【总纲】产品定位、插件边界、新功能决策清单
│   ├── 系统介绍.md                    # 各插件实现细节与历史计划书
│   ├── problem-ide-learning-contract.md  # ProblemIde 与 AI 插件的公开协议
│   ├── problem-restyle.md             # 题面改写约定
│   └── 题面模板.md
├── addons/
│   ├── ProblemIde/                    # 做题 IDE（宿主）
│   ├── LearningScaffold/              # 学习方式脚手架
│   ├── AiTutor/                       # 编程小助手
│   ├── AiAssistant/                   # AI 助教
│   ├── AiAnalysis/                    # AI 分析
│   └── VipIntroPage/                  # 会员介绍
├── server-config/
│   ├── Caddyfile                      # 反向代理样例（含 SSE 长连接超时）
│   └── config.example.json            # Mongo URI 占位，勿提交真实密码
└── 题库/                              # Hydro 题包（gitignore，本地/服务器另存）
```

### 推荐插件目录结构

```
addons/<FeatureName>/
  index.ts              # 仅 apply()：注册路由、钩子、组装
  handler/              # HTTP Handler
  hooks/                # ctx.on('handler/after') 等
  lib/                  # 纯函数、配置键
  frontend/
    *.page.ts           # NamedPage 入口（Hydro 按此打包 UI）
    *.ts / *.css
  templates/            # Nunjucks 模板
  package.json          # main 指向 index.js
```

---

## 本地开发

FishOJ 插件不能单独运行，需要本机或远程有一套 Hydro 实例。

### 方式一：WSL 安装 Hydro（推荐联调 UI）

Windows 请使用 **WSL2 + Ubuntu**（Hydro 仅支持 Linux）：

```bash
# WSL 内，首次安装
sudo su
LANG=zh . <(curl https://hydro.ac/setup.sh) --no-caddy

# 注册账号后设管理员
hydrooj cli user setSuperAdmin <uid>

# 挂载本仓库插件（Windows 盘符在 WSL 为 /mnt/d/...）
hydrooj addon add /mnt/d/FishOJ/addons/ProblemIde
hydrooj addon add /mnt/d/FishOJ/addons/LearningScaffold
hydrooj addon add /mnt/d/FishOJ/addons/AiTutor
hydrooj addon add /mnt/d/FishOJ/addons/AiAssistant
hydrooj addon add /mnt/d/FishOJ/addons/AiAnalysis
pm2 restart hydrooj
```

浏览器访问 `http://localhost:8888/ide/<题号>`。改 `frontend/*.page.ts` 或 CSS 后执行 `pm2 restart hydrooj` 重建 UI，再硬刷新。

AI 功能需配置 LLM API Key（如 `DEEPSEEK_API_KEY` / `BUILTIN_API_KEY`，或 AiTutor 控制面板中的 key）。

### 方式二：同步到线上机预览

见下文「部署到服务器」。

### 插件内单元测试

部分插件提供本地测试脚本，无需启动 Hydro：

```bash
cd addons/AiAssistant
npm test
```

---

## 部署到服务器

当前线上插件目录：`/root/.hydro/addons/`，清单：`/root/.hydro/addon.json`。

**典型发布流程**（改插件代码后）：

```bash
# 1. 提交并推送（本机）
git add ...
git commit -m "..."
git push origin main

# 2. 同步改动到服务器（示例：scp 整个插件目录）
scp -r addons/ProblemIde addons/AiAssistant addons/AiTutor root@<host>:/root/.hydro/addons/

# 3. 重启 Hydro（需登录 shell 以加载 pm2）
ssh root@<host> "bash -lc 'pm2 restart hydrooj'"
```

首次安装某插件：

```bash
hydrooj addon add /root/.hydro/addons/<PluginName>
pm2 restart hydrooj
```

改 `frontend/*.page.ts` / CSS 必须重启 `hydrooj` 触发 UI 重建；只改 Nunjucks 模板有时刷新即可。

线上已注册插件（参考）：`ui-default`、`hydrojudge`、`fps-importer`、`a11y`、`hydroac-client`，以及本仓库的 ProblemIde、LearningScaffold、AiTutor、AiAssistant、AiAnalysis。

---

## 常用运维命令

在服务器上（需 `bash -lc` 或已加载 nix/pm2 环境）：

```bash
pm2 list
pm2 restart hydrooj
pm2 logs hydrooj --lines 50
hydrooj cli user setSuperAdmin <uid>
hydrooj addon add <绝对路径>
```

---

## 插件开发约定

用 AI 或人工编写代码时请遵守：

1. **高内聚、低耦合。** 一个插件只做一件事。跨插件协作只用 Hydro 钩子、`UiContext` 字段、`document` CustomEvent 或 URL，**禁止** `import` 其他插件内部文件。
2. **按功能拆文件。** `index.ts` 与 `*.page.ts` 只做注册与组装；handler、hook、lib、前端模块、模板 partial 分文件存放。
3. **不实现评测核心。** 提交/自测走 Hydro 官方接口（`problem_submit`、`record-conn` 等）。
4. **AI 失败不影响做题。** 判题、提交不等待 AI 响应。

详细架构与各插件职责见 [`docs/项目定位.md`](docs/项目定位.md)（**新功能请先读**）与 [`docs/系统介绍.md`](docs/系统介绍.md)。

---

## 路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| 一、部署上线 | 服务器、Hydro、题库、公网访问 | ✅ 已完成 |
| 二、原理深挖 | Docker、网络、MongoDB、Hydro 架构 | ⏳ 进行中 |
| 三、二次开发 | 做题 IDE、教学脚手架、AI 助教/小助手/分析 | ⏳ 进行中（核心插件已上线） |
| 四、运营落地 | 域名备案、会员支付、监控备份、Docker 正式环境 | 📅 规划中 |

---

## 关键决策

- **不 fork Hydro**，跟随官方 [hydro-dev/Hydro](https://github.com/hydro-dev/Hydro) 升级。
- **试用机**：阿里云 PM2 部署；**正式环境**规划京东云 + Docker。
- **商业参考**：[`docs/codefun2000.addons分析.md`](docs/codefun2000.addons分析.md) 仅借鉴产品形态，不复制代码或密钥。
- **合规**：大陆服务器绑域名需 ICP 备案；正式运营建议使用弹性 IP 或固定域名。

---

## 安全红线

以下内容**严禁**提交进 Git（已通过 `.gitignore` 排除）：

- SSH 私钥、API Key、数据库密码
- 含真实凭据的 `config.json` / `.env`
- `.workbuddy/` 等本地工作目录

`server-config/` 中仅为占位样例，部署时使用服务器本地配置。

---

## 文档索引

| 文档 | 用途 |
|------|------|
| [`docs/项目定位.md`](docs/项目定位.md) | **总纲**：产品定位、插件边界、新功能决策、与 CodeFun 关系 |
| [`docs/系统介绍.md`](docs/系统介绍.md) | 各插件实现细节、文件级说明 |
| [`docs/problem-ide-learning-contract.md`](docs/problem-ide-learning-contract.md) | ProblemIde 与 AI 插件的事件与 UiContext 协议 |
| [`docs/problem-restyle.md`](docs/problem-restyle.md) | 题面改写工作流 |
| [`docs/题面模板.md`](docs/题面模板.md) | 题面 Markdown 模板 |

---

## License

插件代码 MIT（见各 `package.json`）。Hydro 本身遵循其官方许可证。
