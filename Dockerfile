FROM nginx:1.27-alpine

# 静态页面与站点配置（健康路径 /healthz 由配置直接返回 200）
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY web/ /usr/share/nginx/html/

EXPOSE 80
