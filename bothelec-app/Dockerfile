FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund
COPY server ./server
COPY public ./public
COPY agent ./agent
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
