# FishOJ 本机 Docker 部署

> 这是**本机（Windows + Docker Desktop）**的 Docker 部署方案，用于本地联调与「Docker 部署」能力验证。
> **服务器（阿里云 8.163.87.247 / 京东云）继续走 PM2 + Nix 部署**，见 [`docs/系统部署.md`](../../docs/系统部署.md)。
> 本目录**不需要**部署到服务器；服务器 `git pull` 拉到本目录也仅作参考，不影响线上运行。

## 架构

```
浏览器 → caddy (:8080) ──> backend (:8888)
                            ├─ mongo (mongo:7，不暴露端口)
                            └─ judge (hydrojudge + go-judge 沙箱，privileged)
```

| 服务 | 镜像 | 说明 |
|------|------|------|
| `caddy` | caddy:2 | 反代 + SSE 30min 超时 + gzip + `/discuss/create` 302 |
| `backend` | 本仓库构建 | Hydro 核心（npm 装 `hydrooj`+`ui-default`）+ 本仓库 9 个 addon |
| `mongo` | mongo:7-jammy | 数据挂载 `data/mongo`，无密码，**不暴露端口** |
| `judge` | 本仓库构建 | 13 种编译器 + go-judge 沙箱 |

## 首次启动

```powershell
cd server-config/docker
docker compose up -d --build
```

- 访问 `http://localhost:8080/`（本机 80/443 常被 Steam++ 等占用，默认用 8080）。
- 首次构建需从 `deb.debian.org` 装编译器，**已改用清华镜像**加速（见 `judge/Dockerfile`）。
- 默认注册评测账号 `judge / examplepassword`（改密码需同步 `judge/judge.yaml`）。

## 注册超管

```powershell
cd server-config/docker
docker compose exec backend hydrooj cli user setSuperAdmin 2
```

## AI 密钥（可选）

复制 `.env.example` 为 `.env`，填入 Key 后 `docker compose up -d` 重启 backend 生效。
`data/` 与 `.env` 均已 gitignore，不会提交。

## 更新 Docker 部署

改完 `addons/` 后，后端镜像里 COPY 的是构建时的插件快照，需**重建镜像**：

```powershell
cd server-config/docker
docker compose up -d --build backend   # 只重建后端
docker compose up -d --build           # 或全部重建
```

改了 `judge/Dockerfile` / `caddy/Caddyfile` / `docker-compose.yml` 同理重建对应服务。

## 目录

```
server-config/docker/
  docker-compose.yml        编排（4 服务）
  .env.example              环境变量模板（端口 + AI Key）
  .gitignore                忽略 data/ 与 .env
  backend/Dockerfile        装 hydrooj + 打包 addons
  backend/entrypoint.sh     首次建库/建 judge 账号/写 addon.json
  judge/Dockerfile          编译器 + go-judge（清华源 + ghproxy 兜底）
  judge/judge.yaml          指向 backend 的评测账号
  judge/mount.yaml          go-judge 沙箱挂载
  caddy/Caddyfile           反代 + SSE 超时
```
