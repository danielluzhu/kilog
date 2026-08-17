FROM oven/bun:1.3-slim

WORKDIR /app

# package.json declares no dependencies — the server runs on Bun's stdlib
# (bun:sqlite, Bun.serve) alone — so there is no install step to cache.
COPY . .

ENV PORT=3000
EXPOSE 3000

# The database lives on a mounted volume at /app/data, which is where
# db.ts already looks for it.
CMD ["bun", "run", "server.ts"]
