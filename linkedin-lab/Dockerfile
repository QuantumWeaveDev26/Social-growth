FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.mjs"]
