FROM node:22.23.2-alpine3.24

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --chown=node:node server.js LICENSE NOTICE.md ./
COPY --chown=node:node src ./src
COPY --chown=node:node utils/fetchANN.js utils/fetchAnimeCorner.js \
  utils/fetchAnimeTrending.js utils/fetchCrunchyroll.js ./utils/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["node", "server.js"]
