FROM node:22

COPY ./entrypoint.sh /root/entrypoint.sh

# 国内镜像：Debian 源换清华（deb.debian.org 在国内很慢/不稳定）
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
    sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list 2>/dev/null || true

RUN apt-get -qq update && \
  apt-get install -y \
    gcc \
    python3 \
    g++ \
    fp-compiler \
    openjdk-17-jdk-headless \
    php-cli \
    rustc \
    ghc \
    libjavascriptcoregtk-4.0-bin \
    golang \
    ruby \
    mono-runtime \
    mono-mcs && \
  chmod +x /root/entrypoint.sh && \
  # node is at /usr/local/bin but hydrojudge will find it at /usr/bin
  ln -s /usr/local/bin/node /usr/bin/node

# go-judge 沙箱：GitHub 直连 + 国内 ghproxy 兜底
RUN yarn global add pm2 @hydrooj/hydrojudge && \
  ( wget -q https://github.com/criyle/go-judge/releases/download/v1.9.4/go-judge_1.9.4_linux_amd64v3 -O /usr/bin/sandbox || \
    wget -q https://ghfast.top/https://github.com/criyle/go-judge/releases/download/v1.9.4/go-judge_1.9.4_linux_amd64v3 -O /usr/bin/sandbox || \
    wget -q https://gh-proxy.com/https://github.com/criyle/go-judge/releases/download/v1.9.4/go-judge_1.9.4_linux_amd64v3 -O /usr/bin/sandbox ) && \
  chmod +x /usr/bin/sandbox && \
  [ -s /usr/bin/sandbox ] || (echo "sandbox 下载失败" && exit 1)

ENTRYPOINT ["/root/entrypoint.sh"]
