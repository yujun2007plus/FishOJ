FROM node:22

COPY server-config/docker/backend/entrypoint.sh /root/entrypoint.sh

RUN yarn global add pm2 hydrooj @hydrooj/ui-default && \
  chmod +x /root/entrypoint.sh

# 把本仓库插件打进镜像（首次运行时由 entrypoint 拷入 /root/.hydro/addons）
COPY addons /opt/fishoj-addons

ENTRYPOINT ["/root/entrypoint.sh"]
