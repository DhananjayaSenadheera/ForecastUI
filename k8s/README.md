# Running the Farmer App on Kubernetes

This is the **frontend half** of the AgriForecast cluster deployment. The backend
(`forecast-api`, the ML service, and the `agriforecast` **namespace** itself) lives in the
[Agri_Forecast](https://github.com/DhananjayaSenadheera/Agri_Forecast) repo and must be applied
first.

| | Frontend (this repo) | Backend (Agri_Forecast) |
|---|---|---|
| Workload | `forecast-ui` — nginx serving the built bundle | `forecast-api` — the .NET API |
| Image | `agriforecast-ui:latest` (built locally) | `agriforecast-api:latest` |
| NodePort | **30080** → <http://localhost:30080> | **30082** → <http://localhost:30082> |
| Owns the namespace? | no | **yes** |

---

## How the browser reaches the API

**The browser calls the API directly on <http://localhost:30082>. nginx does not proxy `/api`.**

The app has exactly one backend address, `VITE_API_BASE_URL`, documented in
`src/vite-env.d.ts` and read once in `src/api/client.ts`. Adding an nginx `/api` proxy would
create a *second* way to reach the API and quietly split that contract in two — same-origin in the
cluster, cross-origin in dev, with two different failure modes to debug. CORS is already handled
backend-side, so the single-base-URL model is kept as-is.

The practical consequence: **`VITE_API_BASE_URL` is baked into the JavaScript at build time.**
It is a property of the *image*, not of the pod. There is no env var to edit on a running
deployment — pointing the app at a different API means rebuilding the image.

---

## Build the image

From the **repository root** (not this directory):

```bash
docker build --build-arg VITE_API_BASE_URL=http://localhost:30082 -t agriforecast-ui:latest .
```

### Build args

| Arg | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:30082` | The API address **as the browser sees it** — i.e. from outside the cluster. Never an in-cluster DNS name like `forecast-api.agriforecast.svc`: that name does not resolve on a farmer's phone. An **empty** value fails the build on purpose (see below). |
| `VITE_API_MODE` | `live` | Anything other than `live` prints a loud build warning — a non-live image serves fixture data, which must never reach a user. |

> **Why an empty value is a hard build failure.** `client.ts` reads
> `import.meta.env.VITE_API_BASE_URL || 'http://localhost:5282'`. An empty string is *falsy*, so
> `--build-arg VITE_API_BASE_URL=` would silently bake the **dev** default into a cluster image:
> a container that starts healthy, passes its probes, and can never load a single price. The
> Dockerfile checks for this and stops the build instead.

The build runs the project's own `npm run build` (`tsc --noEmit && vite build`) so the
`agri-sw-precache` Vite plugin still injects the hashed-asset manifest into `dist/sw.js` —
skipping it would ship a service worker that precaches nothing and an app that dies offline.

---

## Deploy

```bash
# 1. Backend first — it creates the `agriforecast` namespace.
kubectl get ns agriforecast     # must exist before step 2

# 2. Frontend
kubectl apply -f k8s/forecast-ui.yaml

# 3. Watch it come up
kubectl -n agriforecast rollout status deployment/forecast-ui
kubectl -n agriforecast get pods,svc -l app.kubernetes.io/name=forecast-ui
```

## Verify

```bash
# app shell
curl -i http://localhost:30080/                 # 200, text/html, Cache-Control: no-cache...

# SPA history fallback — a deep route with no file on disk
curl -i http://localhost:30080/my-harvest       # 200 (index.html), NOT 404

# hashed asset — immutable long cache
curl -sI http://localhost:30080/assets/$(curl -s http://localhost:30080/ \
  | grep -o 'assets/[^"]*\.js' | head -1 | cut -d/ -f2) | grep -i cache-control
# → Cache-Control: public, max-age=31536000, immutable

# service worker — must never be cached
curl -sI http://localhost:30080/sw.js | grep -i cache-control
# → Cache-Control: no-cache, no-store, must-revalidate
```

Then open <http://localhost:30080> in a browser and check the network tab: API calls should go to
`http://localhost:30082/api/...`. If they go to `:5282`, the image was built without the
build-arg — rebuild.

## Rebuild after a frontend change

The image is built locally and never pushed, so the kubelet cannot pull a new one and
`kubectl apply` alone changes nothing (the manifest is byte-identical). Force the pod to restart
onto the freshly built `latest`:

```bash
docker build --build-arg VITE_API_BASE_URL=http://localhost:30082 -t agriforecast-ui:latest .
kubectl -n agriforecast rollout restart deployment/forecast-ui
kubectl -n agriforecast rollout status deployment/forecast-ui
```

`imagePullPolicy: IfNotPresent` is what makes this work — the default (`Always`, implied by the
`latest` tag) would send the kubelet to Docker Hub looking for an image that was never pushed and
fail with `ErrImagePull`.

> If your cluster is **minikube** or **kind**, the image must exist inside the cluster's own
> Docker daemon: run `eval $(minikube docker-env)` before building, or
> `kind load docker-image agriforecast-ui:latest`. Docker Desktop's built-in Kubernetes shares the
> host daemon, so no extra step is needed there.

## Teardown

```bash
kubectl delete -f k8s/forecast-ui.yaml
```

---

## Local development is unchanged

**Nothing here affects the day-to-day workflow.** Vite still runs on port **4173** against the
host API on **:5282**:

```bash
npm run dev     # http://localhost:4173 → http://localhost:5282
```

The `:5282` default still lives in `client.ts`, `.env.local` is still honoured (and is excluded
from the Docker build context by `.dockerignore`, so a developer's local config can never leak
into an image). The container path is an *additional* target, not a replacement — use it when you
need to test the app as it will actually be served in the cluster.
