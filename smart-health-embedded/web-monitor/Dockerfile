FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY API.md ./
COPY public ./public
COPY db ./db
COPY scripts ./scripts
COPY src ./src

RUN npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
ENV AUDIO_UDP_PORT=3001
ENV DATA_DIR=/data

RUN mkdir -p /data/audio /data/tmp

EXPOSE 3000 3001/udp

CMD ["node", "server.js"]
