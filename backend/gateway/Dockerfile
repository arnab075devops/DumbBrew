FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY proxy_params.conf /etc/nginx/proxy_params.conf
COPY public /usr/share/nginx/html
EXPOSE 80
