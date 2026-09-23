#!/bin/sh
set -e

ROOT=/root/.hydro

if [ ! -f "$ROOT/config.json" ]; then
  echo '{"host":"mongo","port":"27017","name":"hydro","username":"","password":""}' > "$ROOT/config.json"
fi

# 首次/空目录时：把内置插件放进 addons
if [ ! -d "$ROOT/addons" ] || [ -z "$(ls -A "$ROOT/addons" 2>/dev/null)" ]; then
  mkdir -p "$ROOT/addons"
  cp -a /opt/fishoj-addons/. "$ROOT/addons/"
fi

if [ ! -f "$ROOT/addon.json" ]; then
  cat > "$ROOT/addon.json" <<'EOF'
[
  "@hydrooj/ui-default",
  "/root/.hydro/addons/ProblemIde",
  "/root/.hydro/addons/LearningScaffold",
  "/root/.hydro/addons/AiTutor",
  "/root/.hydro/addons/AiAssistant",
  "/root/.hydro/addons/AiAnalysis",
  "/root/.hydro/addons/OfficialSolution",
  "/root/.hydro/addons/HomePage",
  "/root/.hydro/addons/VipIntroPage",
  "/root/.hydro/addons/FishOjTheme"
]
EOF
fi

if [ ! -f "$ROOT/first" ]; then
  echo fishoj > "$ROOT/first"
  hydrooj cli user create systemjudge@systemjudge.local judge examplepassword 2
  hydrooj cli user setJudge 2
  hydrooj cli system set server.host 0.0.0.0
fi

exec pm2-runtime start hydrooj
