FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake nlohmann-json3-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY worker/ ./worker/
RUN test -f worker/vendor/include/discordpp.h && test -f worker/vendor/lib/libdiscord_partner_sdk.so
RUN cmake -S worker -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --parallel

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.js app.js index.html styles.css ./
COPY --from=build /src/build/presence-worker /usr/local/bin/presence-worker
COPY worker/vendor/lib/libdiscord_partner_sdk.so /usr/local/lib/libdiscord_partner_sdk.so
RUN ldconfig && mkdir -p /app/data
ENV NODE_ENV=production
ENV PRESENCE_WORKER=/usr/local/bin/presence-worker
EXPOSE 4173
CMD ["node", "server.js"]

