# AgriForecast Farmer App — production container.
#
# Two stages: build the Vite bundle with Node, then serve the static `dist/`
# with nginx. The runtime image contains NO Node, NO source, NO node_modules —
# just nginx + the hashed bundle (~a few MB).
#
# IMPORTANT — the app is a *static* bundle. `VITE_API_BASE_URL` is inlined into
# the JavaScript at BUILD time, so the API base URL is a property of the IMAGE,
# not of the pod. Point it at a different API => rebuild the image.

# ---------------------------------------------------------------------------
# Stage 1 — build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change reuses this layer.
#
# LAYER ORDER: the ARG/ENV for VITE_* deliberately live AFTER this install, just
# above the build step. Declared earlier they would invalidate every layer below
# them, so changing only the API URL would re-run `npm ci` and reinstall all 182
# packages for a rebuild that touches nothing but a string.
COPY package.json package-lock.json ./

# `npm ci` alone is NOT enough here, and the failure is confusing:
#   Cannot find module @rollup/rollup-linux-arm64-musl
# package-lock.json was generated on macOS and npm prunes the optional
# platform-specific binaries of OTHER platforms out of the lockfile
# (npm/cli#4828), so it only carries @rollup/rollup-darwin-arm64 and
# @esbuild/darwin-arm64. On Linux, `npm ci` installs exactly what the lock says
# — which is a rollup with no native binary for this machine.
#
# Fix, in order of what it costs:
#   - `npm install` instead of `npm ci`  -> still honours the pruned lock, same failure.
#   - dropping the lockfile              -> MEASURED 25 packages drifted (babel, postcss,
#                                           browserslist, caniuse-lite...). Not reproducible.
#   - installing the two native leaves   -> MEASURED exactly 2 packages added, zero drift.
# So: `npm ci` for the exact locked tree, then add ONLY the missing native
# binaries, pinned to the versions `npm ci` just installed. `--no-save` keeps
# package.json untouched; the lockfile in the build context is read-only anyway.
# NOTE: `-musl` is correct for the Alpine base above. A glibc base (node:22-slim)
# needs `-gnu` instead.
RUN npm ci --no-audit --no-fund \
 && ARCH="$(node -p 'process.arch')" \
 && npm install --no-save --no-audit --no-fund \
      "@rollup/rollup-linux-${ARCH}-musl@$(node -p "require('rollup/package.json').version")" \
      "@esbuild/linux-${ARCH}@$(node -p "require('esbuild/package.json').version")"

COPY . .

# Base URL of the .NET API as the BROWSER sees it (not as the cluster sees it):
# the bundle runs on the farmer's phone/laptop, so this must be an address that
# is reachable from OUTSIDE the cluster. In the local k8s setup that is the
# forecast-api NodePort. CORS is handled backend-side; nginx does NOT proxy.
ARG VITE_API_BASE_URL=http://localhost:30082
ARG VITE_API_MODE=live

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_MODE=${VITE_API_MODE}

# TRAP GUARD: src/api/client.ts reads
#   `import.meta.env.VITE_API_BASE_URL || 'http://localhost:5282'`
# so an EMPTY build-arg is falsy and would silently bake the *dev* default
# (localhost:5282) into a cluster image — a container that looks fine and can
# never reach the API. Fail loudly at build time instead.
RUN if [ -z "$VITE_API_BASE_URL" ]; then \
      echo "ERROR: --build-arg VITE_API_BASE_URL must be a non-empty URL." >&2; \
      echo "       An empty value falls back to the dev default http://localhost:5282." >&2; \
      exit 1; \
    fi; \
    if [ "$VITE_API_MODE" != "live" ]; then \
      echo "WARNING: VITE_API_MODE=$VITE_API_MODE — this image will NOT call the real API." >&2; \
    fi

# `npm run build` = `tsc --noEmit && vite build`. Use the project script as-is:
# the build also runs the agri-sw-precache Vite plugin, which rewrites the
# hashed-asset manifest into dist/sw.js. Calling `vite build` directly would
# skip the typecheck; skipping the script entirely would ship a service worker
# that precaches nothing.
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — serve
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runtime

# SPA history fallback + cache policy + gzip. Replaces the stock default site.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine already logs to stdout/stderr and runs in the foreground via its
# stock CMD, which is what a k8s probe + `kubectl logs` want.
