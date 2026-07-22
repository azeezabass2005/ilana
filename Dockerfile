# ---- Stage 1: build the SvelteKit frontend ----
FROM oven/bun:1-alpine AS frontend
WORKDIR /app
# Cache dependency installation: copy manifests first,
# so source-only changes don't reinstall every package.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . ./
RUN bun run build

# ---- Stage 2: runtime ----
# The app is a pure static SPA for now — IndexedDB is the source of truth,
# so nginx serving the shell is the whole deployment. Phase 3 replaces this
# stage with the Rust sync server serving the same static dir plus /sync
# (see SPEC.md §5, §7), with SQLite on a /data volume.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend /app/build /usr/share/nginx/html

EXPOSE 8080
# 127.0.0.1, not localhost: it skips name resolution entirely, so the check
# can't land on an address nginx isn't bound to.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD wget -q -O /dev/null "http://127.0.0.1:8080/healthz" || exit 1
