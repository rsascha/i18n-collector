# Feature: Lokale Kubernetes-Deployments für `public` und `dev`

## Kontext
Anschluss an [2026-05-22-split-web-ui-i18n.md](2026-05-22-split-web-ui-i18n.md).

Bisher läuft der Stack ausschließlich über `make dev` als drei lokale Prozesse (Spring + zwei Next-Apps) plus Postgres im Docker-Compose. Mit der Trennung von web-ui (`:3000`) und web-ui-i18n (`:3001`) haben wir jetzt zwei Web-Frontends mit unterschiedlichen Anforderungen: web-ui ist Konsumenten-Sicht, web-ui-i18n ist Admin-Sicht.

Diese Iteration verlegt den kompletten Stack in einen lokalen Kubernetes-Cluster (Colima mit `--kubernetes`-Flag — siehe README-Hinweis zur macOS-Installation) und drückt die Konsumenten-/Admin-Trennung in eine **Namespace-Trennung** mit unterschiedlich konfigurierten Ingress-Regeln aus.

## Ziel dieser Iteration

Zwei K8s-Namespaces mit unterschiedlichem Scope:

| Namespace | Was läuft drin                            | Ingress-Exposure                                                                 |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `public`  | web-ui, Spring-API, Postgres              | nur web-ui (schlanker Konsumenten-Stack, kein Admin-UI deployed)                 |
| `dev`     | web-ui, web-ui-i18n, Spring-API, Postgres | web-ui + web-ui-i18n + Spring-API-Swagger (`/swagger-ui.html`, `/v3/api-docs/*`) |

Daraus folgt:

- **web-ui-i18n läuft ausschließlich in `dev`** — in `public` gibt es keinen Admin-Use-Case, also wird der Pod dort gar nicht erst deployed. Spart Ressourcen, vermeidet falsche Sicherheits-Annahmen („läuft, aber nicht im Ingress").
- Swagger ist nur in `dev` exponiert; in `public` ist der Pfad im Ingress nicht gemappt.
- Jeder Namespace ist vollständig selbsterhaltend (eigene API, eigene DB). Namespace-Löschen ist „Reset".

## Entscheidungen aus dem Ask-Before-Development-Lauf

- **Stack-Topologie**: jeder Namespace bringt API + Postgres komplett selbst mit. Isolation > Ressourcen-Sparen. Cross-Namespace-Aufrufe gibt es nicht — `public` ist operationell unabhängig von `dev`. Voraussetzung dafür, dass `public` z. B. weiter rennt, während wir `dev` neu deployen.
- **Image-Build**: lokal in den Colima-Daemon laden. `colima start --kubernetes` nutzt containerd-namespace `k8s.io` direkt — kein Registry-Push nötig. `imagePullPolicy: IfNotPresent` in allen Manifests. Bei Build: `docker build -t web-ui:dev …` und K8s findet das Image automatisch.
- **Ingress-Controller**: Traefik (Colima/k3s-Default). Keine Zusatz-Installation, IngressClass `traefik`. Falls später Wechsel zu ingress-nginx nötig, ist die IngressClass über das Overlay umstellbar.
- **Manifest-Layout**: `k8s/` im Repo-Root mit Kustomize-base + overlays. Cross-Cutting-Resources (Ingress, Namespace, Postgres) gehören zu keinem einzelnen `projects/*` und werden zentral verwaltet.
- **Swagger-Routing**: eigener Host `api.dev.localtest.me` mit `path: /swagger-ui` und `path: /v3/api-docs`. Klare Browser-Tab-Trennung, kein Pfad-Kollisions-Risiko mit Next.js. Drei Hostnames für `dev`: `web-ui`, `admin`, `api`.
- **Actuator**: `spring-boot-starter-actuator` in `pom.xml` ergänzen + `management.endpoints.web.exposure.include: health,info` in `application.yml`. Liveness/Readiness-Probes ziehen auf `/actuator/health`. Standalone-Schritt vor den K8s-Manifests.
- **Bedrock-Creds**: Makefile-Target `k8s-secrets`, das `projects/api/.env` via `kubectl create secret generic bedrock-secret --from-env-file=...` in beide Namespaces packt. SSO-Tokens müssen nach Ablauf manuell re-applied werden — Befehl im README dokumentieren.
- **Postgres-Persistenz**: `StatefulSet` mit `volumeClaimTemplate` 1Gi, `storageClassName: standard`. Daten überleben Pod-Restarts. Reset per `kubectl delete pvc -n <ns> --all`.
- **Hostnames**: `*.localtest.me` (public DNS → 127.0.0.1). Kein `/etc/hosts`-Edit. Falls Firmen-DNS das filtert, `nip.io` als Fallback im README.
- **Image-Tags**: statisches `:dev` (z. B. `api:dev`, `web-ui:dev`, `web-ui-i18n:dev`). `imagePullPolicy: IfNotPresent`. Manifests bleiben deploy-stabil ohne Tag-Bumps.
- **pnpm-Install im Image**: pro App ein eigener Workspace-Slim-Install (`pnpm fetch` + `pnpm --filter <app> install --frozen-lockfile --prod=false`). Builder bleibt schlank, beide Image-Builds sind unabhängig.

## Scope dieser Iteration

### Neu: `Dockerfile`s

1. **`projects/web-ui/Dockerfile`** — Multi-Stage Next.js 16 Build:
   - Stage 1 (`deps`): pnpm install via Workspace.
   - Stage 2 (`builder`): `pnpm --filter web-ui build`.
   - Stage 3 (`runner`): `node:20-alpine`, `next start`, Port 3000.
   - `output: 'standalone'` in `next.config.ts` ergänzen, damit das Runner-Image schlank wird.
2. **`projects/web-ui-i18n/Dockerfile`** — analog, Port 3001 → CMD `next start -p 3001`.
3. **`projects/api/Dockerfile`** — Multi-Stage Java 25 Build:
   - Stage 1: Maven-Build via `./mvnw -DskipTests package` (Eclipse Temurin 25 JDK).
   - Stage 2: Eclipse Temurin 25 JRE, JAR copy, Port 8080. Alternativ: `spring-boot:build-image` (Paketo) statt eigenem Dockerfile.

### Neu: K8s-Manifeste in `k8s/`

Vorschlag für die Verzeichnisstruktur (siehe Offene Punkte 1 für Alternative):

```
k8s/
├── base/                           # gemeinsame Manifest-Bausteine (Kustomize)
│   ├── kustomization.yaml
│   ├── api-deployment.yaml         # Spring API
│   ├── api-service.yaml
│   ├── postgres-statefulset.yaml   # Postgres mit PVC
│   ├── postgres-service.yaml
│   ├── postgres-secret.yaml        # DB-Credentials (placeholder)
│   ├── bedrock-secret.yaml         # AWS-Credentials (placeholder)
│   ├── web-ui-deployment.yaml
│   ├── web-ui-service.yaml
│   ├── web-ui-i18n-deployment.yaml
│   └── web-ui-i18n-service.yaml
└── overlays/
    ├── public/
    │   ├── kustomization.yaml      # namespace: public, Ingress nur web-ui
    │   └── ingress.yaml
    └── dev/
        ├── kustomization.yaml      # namespace: dev, Ingress web-ui + web-ui-i18n + swagger
        └── ingress.yaml
```

### Manifest-Inhalte im Detail

#### Spring-API
- `Deployment`: 1 Replica, Image `api:dev`, `imagePullPolicy: IfNotPresent`.
- Env-Vars aus `postgres-secret` (DB-Creds, Host = `postgres.<namespace>.svc.cluster.local`) und `bedrock-secret` (AWS-Creds, Region, Modell-ID).
- Liveness/Readiness auf `GET /actuator/health` (setzt voraus, dass `spring-boot-starter-actuator` ergänzt wird — siehe Offene Punkte).
- Resources: requests 512Mi/250m, limits 1Gi/1000m (vorsichtige Defaults für Dev-Cluster).
- `Service` Typ `ClusterIP`, Port 8080.

#### Postgres
- `StatefulSet` mit `volumeClaimTemplate` (`storageClassName: standard`, 1Gi). Pro Namespace eine eigene PVC.
- `Service` Typ `ClusterIP`, Headless, Port 5432.
- `postgres-secret` mit `POSTGRES_USER`/`PASSWORD`/`DB` — pro Namespace eigene Werte; in `public` darf der Default des `compose.yaml` (`translations/translations/translations`) verwendet werden, in `dev` ein anderer, damit man Versehen mit kreuz-konfiguriertem `kubectl port-forward` schneller bemerkt.

#### Web-UIs
- `Deployment`: 1 Replica je App, `API_BASE_URL=http://api.<namespace>.svc.cluster.local:8080`.
- `Service` Typ `ClusterIP`, Port 3000 / 3001.

#### Ingress

`overlays/public/ingress.yaml`:
- Host `web-ui.public.localtest.me` (oder `/etc/hosts`-Eintrag — siehe Offene Punkte) → `web-ui:3000`.
- **Keine** Routen auf web-ui-i18n oder API.

`overlays/dev/ingress.yaml`:
- Host `web-ui.dev.localtest.me` → `web-ui:3000`.
- Host `admin.dev.localtest.me` → `web-ui-i18n:3001`.
- Host `api.dev.localtest.me` → `api:8080` mit `path: /swagger-ui` und `path: /v3/api-docs` (nur die Doku-Endpoints, nicht der ganze API-Surface). Alternativ: gleicher Host wie web-ui, Pfad-basiert (`web-ui.dev.localtest.me/swagger-ui`) — Trade-off in Offene Punkte 3.

### Makefile-Targets (neu)

```makefile
# Images in Colima-Daemon bauen
images:
    docker build -t api:dev          projects/api
    docker build -t web-ui:dev       -f projects/web-ui/Dockerfile .
    docker build -t web-ui-i18n:dev  -f projects/web-ui-i18n/Dockerfile .

# Manifests deployen
k8s-public:
    kubectl apply -k k8s/overlays/public

k8s-dev:
    kubectl apply -k k8s/overlays/dev

# Komplett-Teardown (Namespace löschen reicht für sauberen Reset)
k8s-clean:
    kubectl delete namespace public --ignore-not-found
    kubectl delete namespace dev --ignore-not-found
```

`make dev` (lokale Prozesse) bleibt für die enge Schleife (Hot-Reload), `make k8s-dev` ist für „in K8s testen".

## Abnahme

1. `colima start --kubernetes` läuft.
2. `make images` — alle drei Dockerfiles bauen erfolgreich, Images sind via `docker image ls` sichtbar.
3. `make k8s-public && make k8s-dev` — beide Namespaces deployen ohne `CrashLoopBackOff`. `kubectl get pods -n public` und `-n dev` zeigen alle Pods `Running`.
4. **`public`**:
   - `http://web-ui.public.localtest.me/` zeigt die Demo-Seite mit Sprachumschalter.
   - `kubectl get pods -n public` zeigt nur api + postgres + web-ui (kein web-ui-i18n).
   - `http://admin.public.localtest.me/` → 404 (Hostname existiert nicht).
   - `http://api.public.localtest.me/swagger-ui.html` → 404 (nicht im Ingress).
5. **`dev`**:
   - `http://web-ui.dev.localtest.me/` zeigt die Demo-Seite.
   - `http://admin.dev.localtest.me/` zeigt die Admin-Tabelle.
   - `http://api.dev.localtest.me/swagger-ui.html` zeigt Swagger UI.
6. Datentrennung: in `public` einen neuen Missing-Key auslösen — in `dev` darf die Zeile **nicht** auftauchen (separate Postgres-Instanzen).
7. Namespace-Reset: `kubectl delete namespace dev && make k8s-dev` — alles kommt sauber wieder, Postgres-PVC neu, Migrations laufen frisch.

## Designentscheidungen

- **Namespace == Environment, nicht == Komponente**: Alternative wäre, die Komponenten auf Namespaces zu verteilen (z. B. `frontend` / `backend` / `data`). Wir machen das bewusst nicht — `public` und `dev` sollen jeweils komplette Umgebungen sein, damit man sie unabhängig hoch-/runterfahren kann.
- **Ingress als einziger Trust-Boundary**: Sicherheit kommt _nicht_ über NetworkPolicies in dieser Iteration. Wir verlassen uns darauf, dass nur das, was im Ingress steht, von außen erreichbar ist. Für ein lokales Dev-Cluster ist das ausreichend; für ein echtes Cluster muss NetworkPolicy folgen (siehe Offene Folgepunkte).
- **`localtest.me`-Trick**: `*.localtest.me` löst per DNS auf `127.0.0.1` auf — kein `/etc/hosts`-Geschnipsel nötig. Funktioniert mit Colima out-of-the-box.
- **Postgres als StatefulSet, nicht Deployment**: stabile Pod-Identität + PVC-Bindung. Auch wenn wir bei `replicas: 1` bleiben, ist das die kanonische Form für stateful Workloads.
- **Kustomize statt Helm**: weniger Templating-Magie, deklarativ-näher am rohen YAML. Bei 12 Manifests und 2 Overlays ist Helm Overkill. Wenn die Topologie wächst (mehrere Umgebungen, Secret-Management), kommt der Wechsel.
- **Spring-Build via Dockerfile statt `spring-boot:build-image`**: explizit, reproduzierbar, kein Buildpack-Magie-Layer. Trade-off: wir managen das Base-Image selbst.
- **Next.js `output: 'standalone'`**: schlankes Runner-Image (~150 MB statt ~500 MB) durch Server-Bundle ohne `node_modules`-Vollkopie.

## Was NICHT in dieser Iteration

- **Kein TLS / cert-manager** — alles über HTTP im lokalen Cluster.
- **Keine NetworkPolicies** — Trust-Boundary ist ausschließlich der Ingress.
- **Kein Helm** — siehe Designentscheidung.
- **Kein Horizontal-Pod-Autoscaling** — 1 Replica überall.
- **Kein Observability-Stack** (Prometheus/Grafana/Loki). Logs via `kubectl logs`.
- **Kein Init-Container für Postgres-Wait** — Spring-Datasource-Reconnect-Logik reicht für Dev.
- **Keine CI-Pipeline** — Builds und Deploys manuell via Makefile.
- **Keine Multi-Architektur-Builds** — wir bauen für die Host-Arch (Apple Silicon). Wenn x86-Targets dazukommen, `docker buildx` nachziehen.
- **Keine Migration der lokalen Dev-Loop** — `make dev` und Docker-Compose-Postgres bleiben für die Hot-Reload-Schleife. K8s ist die „Deployment-nahe Testumgebung".

## Offene Punkte — alle im Ask-Before-Development-Lauf entschieden ✅

Die zehn ursprünglichen offenen Punkte sind in „Entscheidungen aus dem Ask-Before-Development-Lauf" (oben) eingearbeitet. Zusammenfassung:

1. **Manifest-Layout** → `k8s/` im Root mit Kustomize-base + overlays
2. **Ingress-Controller** → Traefik (Colima-Default)
3. **Swagger-Routing** → eigener Host `api.dev.localtest.me`
4. **Actuator** → `spring-boot-starter-actuator` in dieser Iteration
5. **Postgres-Image** → `postgres:17-alpine` (gleich wie `compose.yaml`)
6. **Bedrock-Creds** → `kubectl create secret` aus `.env`, Makefile-Target
7. **DB-Persistenz** → PVC `standard` 1Gi, persistent
8. **Hostnames** → `*.localtest.me` (public DNS)
9. **Image-Tags** → statisches `:dev`
10. **pnpm-Install** → pro App Slim-Install (`pnpm fetch` + `--filter`)

---

## Umsetzungsstand (Stand 2026-05-22)

### Neu / Geändert

#### `projects/api`
- `pom.xml` — `spring-boot-starter-actuator` ergänzt.
- `src/main/resources/application.yml` — `management.endpoints.web.exposure.include: health,info` und `management.endpoint.health.probes.enabled: true` (aktiviert `/actuator/health/liveness` + `/actuator/health/readiness`).
- `Dockerfile` (neu) — Multi-Stage: `eclipse-temurin:25-jdk` als Builder mit `./mvnw -DskipTests package`, `eclipse-temurin:25-jre` als Runner. `JAVA_OPTS="-XX:MaxRAMPercentage=75.0"` als Default, damit der JVM-Heap zur K8s-Memory-Limit-Konfig passt.

#### `projects/web-ui` & `projects/web-ui-i18n`
- `next.config.ts` — `output: "standalone"` + `outputFileTracingRoot: path.join(__dirname, "../..")`. Das `outputFileTracingRoot` ist wichtig für pnpm-Workspaces: Next muss den Repo-Root kennen, damit der Standalone-Build die richtigen `node_modules`-Symlinks (Workspace-Hoisted) findet.
- `Dockerfile` (neu) — drei Stages (`deps`, `builder`, `runner`):
  - `deps`: `pnpm fetch` cached den Store anhand der Lockfile, dann `pnpm install --filter <app> --frozen-lockfile --prefer-offline`.
  - `builder`: kopiert deps-Stage-`node_modules` + App-Sources und ruft `pnpm --filter <app> exec next build`.
  - `runner`: minimaler `node:20-alpine` mit nicht-privilegiertem `nextjs:1001`-User. Übernimmt nur `.next/standalone`, `.next/static` und `public/` — kein `node_modules`-Vollkopie nötig.
- Build-Context der Next-Images ist das **Repo-Root**, nicht das Projekt-Verzeichnis, weil Workspace-Lockfile und -Config dort liegen.

#### Repo-Root
- `.dockerignore` (neu) — schließt `node_modules`, `.next`, `target`, IDE-State, Features-Docs und Material aus dem Build-Context aus. Hält das Pre-Build-Tar klein.
- `k8s/base/` (neu):
  - `postgres.yaml` — `StatefulSet` mit 1Gi-PVC (`storageClassName: standard`), Headless-Service. `pg_isready`-basierte Liveness/Readiness.
  - `postgres-secret.yaml` — Default-Credentials `translations/translations/translations` (in `dev`-Overlay gepatched).
  - `api.yaml` — `Deployment` (1 Replica), `DB_HOST=postgres`, Bedrock-Secret per `envFrom` mit `optional: true` (damit der Pod auch ohne Bedrock startet). Probes auf `/actuator/health/{liveness,readiness}`.
  - `web-ui.yaml`, `web-ui-i18n.yaml` — Deployments + ClusterIP-Services auf 3000 bzw. 3001. `API_BASE_URL=http://api:8080`. Probes auf `/`.
  - `kustomization.yaml` — sammelt alle Resources, setzt `app.kubernetes.io/part-of: i18n-collector` per `labels`-Block (Kustomize ≥5 Stil, nicht das deprecierte `commonLabels`).
- `k8s/overlays/public/`:
  - `namespace.yaml`, `ingress.yaml` (nur web-ui auf `web-ui.public.localtest.me`), `kustomization.yaml` mit `namespace: public`.
- `k8s/overlays/dev/`:
  - `namespace.yaml`, `ingress.yaml` (web-ui + admin + api-Swagger-Pfade), `kustomization.yaml` mit `namespace: dev` und JSON-Patch auf `postgres-secret` (`POSTGRES_PASSWORD=translations-dev`).
- `Makefile` — neue Targets:
  - `images` / `image-{api,web,web-i18n}`: `docker build` mit korrektem Context (Repo-Root für die Next-Images).
  - `k8s-secrets`: legt beide Namespaces an + lädt `bedrock-secret` aus `projects/api/.env` in beide. Idempotent via `delete --ignore-not-found` + `create`.
  - `k8s-public`, `k8s-dev`: `kubectl apply -k …`.
  - `k8s-clean`: löscht beide Namespaces inkl. PVCs.
- `README.md` — neue Sektion „Kubernetes (lokal in Colima)" mit Workflow-Snippet und URL-Tabelle.

### Designentscheidungen
- **`outputFileTracingRoot` auf `../..` statt automatischer Detektion**: Next.js sucht standardmäßig den nächsten `package.json`-Ahnen; in einem pnpm-Workspace will man aber den Workspace-Root, sonst landen Symlinks ins Leere. Expliziter Pfad ist hier robuster als jede Heuristik.
- **`envFrom: bedrock-secret` mit `optional: true`**: erlaubt es, die Apps ohne AWS-Creds laufen zu lassen (z. B. wenn man nur die UI testet). Auto-Translate gibt dann zur Laufzeit einen 500er — sauberer Failure-Mode als Pod-Crash beim Start.
- **`pg_isready` als Postgres-Probe**: leichter als ein DB-Query, kein Permission-Setup nötig, exit-code-basiert. Standard-Postgres-Image bringt das Binary mit.
- **Postgres-Service `clusterIP: None` (Headless)**: passend zum StatefulSet — Pod-Identitäten via DNS (`postgres-0.postgres.<ns>.svc.cluster.local`). Bei `replicas: 1` praktisch egal, aber kanonisch.
- **`api`-Service ohne `clusterIP: None`**: normaler ClusterIP, da der Spring-Pod stateless ist und Load-Balancing über den Service-VIP-Mechanismus läuft.
- **`pnpm fetch` + `--prefer-offline` in der deps-Stage**: zweistufiger Cache. `fetch` zieht alles in den pnpm-Store anhand der Lockfile (cached per Layer, solange Lockfile gleich bleibt); `install --prefer-offline` löst Workspace-Linking ohne weitere Network-Calls auf.
- **Static Image-Tag `:dev` + `imagePullPolicy: IfNotPresent`**: K8s zieht nur, wenn das Image lokal fehlt — und in Colima-Mode ist das nach `make images` nie der Fall. Re-Deploy ohne neue Tags: `make images && kubectl rollout restart deployment/<name> -n <ns>`.
- **Bedrock-Secret separat per Makefile, nicht in `k8s/base/`**: Secrets gehören nicht in Git, auch nicht als Placeholder. Das macht den Workflow zwei-stufig (`make k8s-secrets` einmal, dann beliebig oft `make k8s-{public,dev}`), ist aber ehrlicher.

### Build-Status
- `./mvnw compile` (mit Java 25) → grün.
- `pnpm exec tsc --noEmit` in beiden Web-Projekten → grün.
- `pnpm lint` in beiden Web-Projekten → grün.
- `kubectl kustomize k8s/overlays/public` → 11 Resources, keine Warnings.
- `kubectl kustomize k8s/overlays/dev` → 11 Resources, keine Warnings.

### Manuelle Abnahme (zu fahren, sobald Colima läuft)
1. `colima start --kubernetes` und warten, bis der Cluster oben ist.
2. `make images` — drei `docker build`s. Erwartet: ein `api:dev` und zwei Next-Images mit ~150 MB.
3. `cp projects/api/.env.example projects/api/.env` + AWS-Creds nachpflegen (oder leer lassen, dann fällt nur Auto-Translate aus).
4. `make k8s-secrets && make k8s-public && make k8s-dev`.
5. `kubectl get pods -n public` und `-n dev` — alle Pods `Running`. Erwartete Pods pro Namespace: 1 × api, 1 × postgres, 1 × web-ui, 1 × web-ui-i18n.
6. Browser:
   - `http://web-ui.public.localtest.me` → Demo-Seite.
   - `http://web-ui.dev.localtest.me`, `http://admin.dev.localtest.me`, `http://api.dev.localtest.me/swagger-ui` → alle drei laden.
   - `http://admin.public.localtest.me` → 404 (nicht im Ingress).
7. In `public` einen Missing-Key auslösen — `kubectl exec -n public statefulset/postgres -- psql -U translations -c 'select * from translations'` zeigt den Key. In `dev` muss derselbe Query **leer** sein (Datentrennung).
8. `make k8s-clean && make k8s-public` — frischer State, Flyway läuft neu.

### Offene Folgepunkte (übernommen aus dem Original-Scope)
- **NetworkPolicies** — weiterhin nicht implementiert. Trust-Boundary ist ausschließlich der Ingress. Für ein echtes Cluster Pflicht.
- **TLS** — weiterhin HTTP-only. cert-manager + Let's Encrypt oder mkcert als Folge-Iteration.
- **CI** — Build + Deploy bleibt manuell.
- **Helm-Migration** — sobald weitere Environments (z. B. `stage`) dazukommen.
- **Observability** — `kubectl logs` reicht für jetzt.
- **AWS-Credential-Expiry** — bei SSO-Tokens nach 1h: `make k8s-secrets` erneut aufrufen, dann `kubectl rollout restart deployment/api -n <ns>`. Im README dokumentieren.
- **Multi-Arch-Builds** — nur Apple Silicon. `docker buildx`, sobald x86-Hosts dazukommen.

---

## Nachtrag: Erkenntnisse aus dem ersten Cluster-Lauf (Stand 2026-05-22 Abend)

Bei der manuellen Abnahme im echten Colima-Cluster sind drei Stolpersteine aufgetaucht, die in der initialen Planung nicht antizipiert waren. Alle drei sind jetzt im Setup verankert (Manifests, Makefile, README) — Dokumentation hier zur späteren Referenz.

### 1. Colima/k3s liefert KEINEN Ingress-Controller mit

**Ausgangs-Annahme**: k3s shipsa Traefik per Default, also reicht `ingressClassName: traefik` in den Manifests. **Realität in Colima**: Traefik ist deaktiviert (vermutlich um den VM-Footprint klein zu halten), `kubectl get pods -n kube-system | grep traefik` ist leer. Symptom: Ingress-Objekte haben kein `ADDRESS`, `curl http://web-ui.public.localtest.me` → `Failed to connect`.

**Fix**: neuer Makefile-Target `k8s-traefik`:

```makefile
k8s-traefik:
    helm repo add traefik https://traefik.github.io/charts 2>/dev/null || true
    helm repo update traefik
    helm upgrade --install traefik traefik/traefik \
      -n kube-system \
      --set service.type=LoadBalancer \
      --set ports.web.port=80 \
      --set ports.web.exposedPort=80
```

`helm upgrade --install` macht das Target idempotent (re-run-safe). LoadBalancer-IP wird von Colimas `klipper-lb`-Komponente auf `127.0.0.1` gemappt. Im README jetzt als „Einmaliges Setup" vor dem Deployment-Loop dokumentiert.

### 2. Default-StorageClass heißt nicht überall `standard`

**Ausgangs-Annahme**: `storageClassName: standard` in `postgres.yaml`. **Realität in Colima**: Die Default-StorageClass ist `local-path` (rancher.io/local-path-provisioner). Symptom: PVC `data-postgres-0` bleibt unbound, StatefulSet-Pod bleibt `Pending` mit Event „pod has unbound immediate PersistentVolumeClaims".

**Fix**: `storageClassName` aus dem `volumeClaimTemplate` entfernt → Cluster-Default greift. Portabel zwischen Colima (`local-path`), GKE (`standard`), EKS (`gp2`), etc.

### 3. Colima-Default-Memory von 2 GB reicht nicht für beide Namespaces

**Ausgangs-Annahme**: 1 GB API-Limit + 256 Mi Postgres-Request usw. summiert sich schon, aber sollte passen. **Realität**: pro Namespace ~1 GB Request-Sum, plus kube-system → 2.3 Gi. Bei 2 GB Colima-Default scheitern Pods im _zweiten_ Namespace mit `FailedScheduling: 0/1 nodes are available: 1 Insufficient memory`.

**Fix**: README-Schritt 0 ist jetzt `colima start --kubernetes --memory 4`, mit erklärendem Kommentar. Bei knappen Setups auch 5–6 GB sinnvoll.

### 4. Bonus: Probes dürfen nicht vom Backend abhängen

Beobachtung beim Debugging des `dev`-Namespace: `web-ui-i18n` ging in CrashLoopBackOff, weil die HTTP-Liveness-Probe auf `/` die Server-Component triggert, die ihrerseits `fetch /api/i18n/translations` macht. Solange die API down war → 500-Response → Probe scheitert → Pod-Kill → CrashLoop. **Anti-Pattern**: Probes hängen am Backend-State.

**Fix**: Probes für beide Next-Apps auf TCP-Check umgestellt (`tcpSocket: { port: http }`). Bedeutung: „Port offen, Node-Prozess lebt". UI ist damit unabhängig vom API-Pod ready.

Für eine spätere Iteration: dedizierter `/healthz`-Route in beiden Next-Apps, der nur Status zurückgibt ohne Backend-Fetch. Dann kann man wieder zu HTTP-Probes wechseln.

### 5. Bonus: `localtest.me` wird von FritzBox-DNS-Rebind-Schutz gefiltert

Erstmalig beobachtet bei `dig localtest.me` → `status: NOERROR, ANSWER: 0` (auf FritzBox-DNS `192.168.178.1`). Die FritzBox holt die externe Antwort `127.0.0.1` und filtert sie raus, weil sie auf Loopback zeigt — DNS-Rebind-Schutz.

**Lösung**: README dokumentiert zwei Optionen:
- `/etc/hosts`-Einträge für alle vier Hostnames (portabel, jedes Netz).
- Router-seitig: `localtest.me` von DNS-Rebind-Schutz ausnehmen. Cheat-Sheet für FritzBox, OpenWrt, UniFi, pi-hole.

Empfohlen wird `/etc/hosts` als Default.

### 6. SSR-Fetch über den eigenen Ingress-Hostnamen klappt im Pod nicht

Symptom nach Setup: `http://admin.dev.localtest.me/` antwortet mit **HTTP 500**. API ist gesund (`/actuator/health` → `UP`), Pods sind `Running`, Postgres ist da. Im `kubectl logs` der `web-ui-i18n`-Pods:

```
TypeError: fetch failed
  cause: Error: connect ECONNREFUSED 127.0.0.1:80
    address: '127.0.0.1', port: 80
```

**Ursache**: `projects/web-ui-i18n/src/app/page.tsx` ist eine Server Component, die für den SSR-Render die Übersetzungs-Liste fetcht. Bisheriger Code:

```ts
const h = await headers();
const host = h.get("host") ?? "localhost:3000";   // → "admin.dev.localtest.me"
const proto = h.get("x-forwarded-proto") ?? "http";
const res = await fetch(`${proto}://${host}/api/i18n/translations`, …);
```

In `make dev` funktioniert das: `host=localhost:3000`, Node fetcht gegen den eigenen Next-Server, der den Request durch den Route-Handler an die Spring-API proxyt. **In K8s** ist `host=admin.dev.localtest.me` der externe Ingress-Hostname. Der Pod resolved `localtest.me` zu `127.0.0.1` (via öffentlichem DNS oder `/etc/hosts` der Host-Maschine — _nicht_ der Container-`/etc/hosts`), versucht da Port 80 zu erreichen, im Pod lauscht aber nichts. → `ECONNREFUSED`.

Der same-origin-Proxy-Workaround macht in K8s keinen Sinn: der Pod ist nicht über den externen Hostnamen erreichbar, und braucht ihn auch nicht — er hat in-cluster DNS und kann die API direkt unter `http://api:8080` ansprechen.

**Fix**: Server-Component nutzt direkt `API_BASE_URL`:

```ts
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

async function fetchTranslations(): Promise<TranslationDto[]> {
  const res = await fetch(`${API_BASE_URL}/i18n/translations`, { cache: "no-store" });
  …
}
```

Konsistent zum Route-Handler-Pattern (`projects/web-ui-i18n/src/app/api/i18n/translations/route.ts`), das `API_BASE_URL` bereits server-side liest. Funktioniert sowohl in `make dev` (`API_BASE_URL=http://localhost:8080`) als auch in K8s (`http://api:8080`, gesetzt im Deployment-Env-Block).

**Architektur-Lehre**: Server-side Code in einer Multi-Tier-App redet direkt mit dem Backend — er hat dafür intern-DNS oder Service-Discovery. Der Proxy-Route-Handler bleibt für Client-Components (Browser-Requests, die same-origin gehen müssen wegen Auth/Cookies/CORS). Der Proxy ist kein universeller Indirektions-Pfad, sondern nur für Browser-Traffic.

Die Proxy-Routes für die Client-Components (`TranslateButton`, `EditableValueCell`, `DeleteKeyButton`) bleiben unverändert — die rufen weiterhin `/api/i18n/translations/...` per same-origin-Fetch aus dem Browser auf.

### 7. `bedrock-secret` aus leerer `.env` führt zu lautlos kaputtem Secret

Nach dem Fix von #6 lädt die Admin-Seite, aber Auto-Translate antwortet mit HTTP 500. API-Logs zeigen:

```
software.amazon.awssdk.core.exception.SdkClientException:
  Unable to load credentials from any of the providers in the chain
```

Der Pod-Start hatte das nicht aufgedeckt, weil `envFrom: bedrock-secret` im Deployment auf `optional: true` steht — der Pod startet auch ohne Secret-Daten. Erst der erste Bedrock-Call fällt um, weil die AWS-Credential-Chain leer ist.

**Ursache**: `projects/api/.env` existierte als 20-Byte-Datei mit Kommentaren, aber ohne echte Keys. Der ursprüngliche `make k8s-secrets`-Target zog blind `kubectl create secret generic ... --from-env-file=projects/api/.env`. Resultat: ein Secret mit `DATA 0` — leer, aber existent. Diagnose-Befehl:

```sh
kubectl get secret bedrock-secret -n dev
# NAME             TYPE     DATA   AGE
# bedrock-secret   Opaque   0      ...     ← „0" ist das Warnsignal
```

Der eigentliche Grund, warum `.env` leer war: das lokale `make dev`-Setup zieht die AWS-Creds dynamisch via `aws configure export-credentials` im API-Makefile (siehe Folge-Iteration „`/i18n`-Adminseite + AI-Provider via Bedrock" in [2026-05-21-i18n-e2e.md](2026-05-21-i18n-e2e.md), Z. 474–483). Der Workflow setzt also gar keine AWS-Creds in `.env`. Die K8s-Variante hatte das nicht übernommen.

**Fix**: `make k8s-secrets` zieht AWS-Creds jetzt selbst live vom aws-CLI:

```makefile
k8s-secrets:
    @command -v aws >/dev/null 2>&1 || { echo "aws-CLI fehlt — brew install awscli"; exit 1; }
    @set -e; \
    TMP=$$(mktemp); \
    trap "rm -f $$TMP" EXIT; \
    aws configure export-credentials --format env 2>/dev/null \
      | sed 's/^export //' > $$TMP || { \
        echo "aws configure export-credentials fehlgeschlagen — SSO-Session abgelaufen? aws sso login"; \
        exit 1; \
      }; \
    if [ ! -s $$TMP ]; then \
      echo "aws-CLI hat keine Credentials geliefert — aws sso login ausführen"; exit 1; \
    fi; \
    if [ -f projects/api/.env ]; then \
      grep -Ev '^(#|$$|AWS_ACCESS|AWS_SECRET|AWS_SESSION|AWS_CREDENTIAL)' projects/api/.env >> $$TMP || true; \
    fi; \
    for ns in public dev; do \
      kubectl create namespace $$ns --dry-run=client -o yaml | kubectl apply -f -; \
      kubectl -n $$ns delete secret bedrock-secret --ignore-not-found; \
      kubectl -n $$ns create secret generic bedrock-secret --from-env-file=$$TMP; \
    done
```

Mechanik:
- `aws configure export-credentials --format env` liefert `export KEY=VALUE`-Zeilen — `sed 's/^export //'` macht daraus `KEY=VALUE` (was `--from-env-file` erwartet).
- Funktioniert sowohl mit SSO (temporäre Tokens inkl. `AWS_SESSION_TOKEN`) als auch mit statischen Keys.
- `projects/api/.env` wird zusätzlich gemerged, aber **ohne** die AWS-Cred-Keys (die kommen aus dem Live-Aufruf, nicht aus statisch hinterlegten Werten). Nicht-AWS-Werte (`AWS_REGION`, `BEDROCK_MODEL_ID`) werden mitgenommen, falls jemand sie dort pflegt — andernfalls greifen die Defaults aus `application.yml`.
- `trap "rm -f $$TMP" EXIT` cleant das temporäre File, das die Cleartext-Creds enthält. Tradeoff: kurzer Existenzzeitraum auf der Disk akzeptiert, dafür kein Pipe-Tooling-Komplikation.
- `set -e` plus Validierung über `[ ! -s $$TMP ]` fangen den Fall ab, dass der aws-CLI zwar existiert, aber 0 Zeilen ausgibt (z. B. SSO-Token abgelaufen ohne klaren Fehler).

**Architektur-Lehre**: K8s-Secrets, die als `envFrom` mit `optional: true` referenziert werden, sind ein Doppelschwert. Sie sind hilfreich für Setups, die das Secret optional brauchen (z. B. UI ohne Backend testen), maskieren aber auch leere/falsche Secrets bis zum ersten echten Use-Case. Ohne `optional: true` würden Pods sofort beim Start in `CreateContainerConfigError` gehen, was deutlich schneller diagnostizierbar wäre. **Wir behalten `optional: true`**, weil das den Architektur-Trade-off im Doc explizit dokumentiert hat (siehe weiter oben: „erlaubt es, die Apps ohne AWS-Creds laufen zu lassen") — aber der Diagnose-Hinweis im Troubleshooting (siehe nächster Punkt) macht den blinden Spot wett.

**SSO-Renewal-Workflow** ist jetzt drei Befehle:

```sh
aws sso login
make k8s-secrets
kubectl rollout restart deploy/api -n public -n dev
```

Im README dokumentiert.

### 8. `web-ui-i18n` in `public` ist totes Gewicht

Beim Review des Setups fiel auf: `web-ui-i18n` läuft zwar in `public` (analog zu `dev`), ist aber nicht im Ingress. Der Pod konsumiert Ressourcen für einen Zweck, der dort nie eintreten kann. Die ursprüngliche „beide Namespaces enthalten den vollständigen Stack, nur das Ingress unterscheidet sich"-Symmetrie war konzeptionell schön, praktisch aber Verschwendung.

**Fix**: `web-ui-i18n.yaml` aus `k8s/base/` entfernt und nach `k8s/overlays/dev/web-ui-i18n.yaml` verschoben. Nur das dev-Overlay zieht das Manifest mit ein.

Kustomize-Detail dabei gelernt: ein Overlay darf aus Sicherheitsgründen nicht direkt auf einzelne Files in fremden Verzeichnissen verweisen (`accumulation err: ... is not in or below ...`). Entweder muss das File im eigenen Overlay-Tree liegen oder in einem Sub-Kustomization-Ordner. Wir haben uns für „File ins Overlay verschieben" entschieden — minimale Ceremony.

**Architektur-Lehre**: Ingress als alleinige Trust-Boundary klingt theoretisch konsistent, läuft aber leicht in das Anti-Pattern „läuft im Cluster, ist aber nicht erreichbar". Klarer: Ressourcen, die in einem Environment keinen Use-Case haben, werden dort auch nicht deployed. Reduziert Cognitive Overhead beim Lesen von `kubectl get pods -n <ns>`.

### 9. Bedrock-Secret und Bedrock-Verbindung gehören nicht in `public`

Direkte Folge aus #8: wenn `web-ui-i18n` nur in `dev` läuft, gibt es in `public` keinen Aufrufer für `/translations/{id}/translate`. Der Spring-API-Pod in `public` läuft also dauerhaft mit einer Bedrock-Verbindung, die nie genutzt wird, und einem AWS-Secret, das nur SSO-Token-Renewal-Aufwand verursacht.

**Fix**: `make k8s-secrets` legt das Secret nur noch im `dev`-Namespace an. Der API-Pod in `public` startet weiter sauber, weil `envFrom: bedrock-secret` auf `optional: true` steht — ohne Secret wird die Env-Var-Referenz einfach übersprungen. Solange `/translations/{id}/translate` aus `public` nicht aufgerufen wird (und das kann auch nicht: kein Admin-UI deployed, Endpoint nicht im Ingress), gibt es nie einen Bedrock-Call.

```diff
- for ns in public dev; do
-   kubectl -n $ns create secret generic bedrock-secret --from-env-file=$TMP
- done
+ kubectl -n dev create secret generic bedrock-secret --from-env-file=$TMP
```

**SSO-Renewal-Workflow** entsprechend nur noch ein Rollout:

```sh
aws sso login
make k8s-secrets
kubectl rollout restart deploy/api -n dev   # public bleibt unangetastet
```

**Architektur-Lehre (Fortsetzung von #8)**: Das Prinzip „Was im Environment keinen Use-Case hat, wird dort nicht deployed/konfiguriert" lässt sich nicht nur auf Pods, sondern auch auf Secrets, External-Dependencies und Env-Vars anwenden. Jede Komponente, die in einem Environment nicht gebraucht wird, erzeugt operationellen Overhead (Secret-Rotation, Monitoring-Noise, IAM-Berechtigungen) ohne Wertbeitrag.

### 10. Promote-Flow von dev nach public

Die harte Namespace-Trennung (#8 + #9) hat den Trade-off mit sich gebracht, dass es keine automatische Brücke zwischen den DBs gibt: Developer pflegt Übersetzungen in `dev` (per `make dev` oder direkt in der Admin-UI), aber `public` braucht die fertigen Werte für seine Konsumenten. Ohne Brücke endet jeder neue Key in `public` als PENDING — und bleibt es, weil dort kein Admin-UI und kein Bedrock existieren.

**Lösung**: API-mediated Sync mit Button in `web-ui-i18n`. Nicht Push-on-Save, sondern explizit getriggert — ein bewusster Promote-Schritt analog zu „Release". Damit ist klar: `dev` ist die Werkbank, der Push nach `public` ist ein deliberate Akt.

#### Entscheidungen aus dem Ask-Before-Development-Lauf
- **Orchestration in dev/api**: web-ui-i18n ruft nur einen Endpoint (`POST /i18n/translations/promote`) seiner eigenen API. Die API orchestriert intern den Export + Cross-Namespace-Push. Saubere Layer-Trennung — UI kennt keinen Cross-Namespace-Concern.
- **Conflict-Behavior**: `ON CONFLICT (message_key, locale) DO UPDATE`. public/PENDING wird durch dev/AI ersetzt — genau der Promote-Zweck. Idempotent: Re-runs überschreiben mit denselben Werten.
- **Source-Filter**: nur `AI` + `MANUAL` werden exportiert. `PENDING` ist „halbe Arbeit" und gehört nicht zum Release.
- **UX**: Button in der Toolbar oberhalb der Tabelle (`flex justify-between` mit `<h1>`). Vor dem POST `window.confirm()` mit Counter („6 approved Zeile(n) nach public promoten?"). Erfolgs-/Fehler-Banner inline unter dem Button.

#### Neu / Geändert

##### `projects/api`
- `SyncProperties.java` (neu) — `@ConfigurationProperties("app.sync")` mit `publicApiBaseUrl`. Bewusst leerstring-tolerant: in `public` selbst nicht gesetzt → `/promote` ist dort `HTTP 503`.
- `ApiApplication.java` — `@EnableConfigurationProperties` um `SyncProperties` erweitert.
- `application.yml` — neuer Block `app.sync.public-api-base-url: ${PUBLIC_API_BASE_URL:}`.
- `TranslationRepository.java` — neue `findAllBySourceIn(List<TranslationSource>)`-Derived-Query, neue native `upsert(...)`-Query mit `ON CONFLICT DO UPDATE SET value, source, updated_at`.
- `TranslationService.java`:
  - Neuer Konstruktor-Parameter `SyncProperties syncProperties`; `RestClient` per `RestClient.create()` direkt instanziiert (siehe Bug #10a).
  - `exportApproved()`: liefert `List<TranslationDto>` für `source IN (AI, MANUAL)`.
  - `importTranslations(List<TranslationDto>)`: ruft `repository.upsert(...)` pro Eintrag, returnt Count.
  - `promote()`: ruft `exportApproved()`, prüft `publicApiBaseUrl != blank`, postet via `RestClient` an `${baseUrl}/i18n/translations/import`, parst `Integer` als Antwort, returnt Count. `RestClientException` → `HTTP 502` mit Ursache. Leere Quelle → `0` ohne HTTP-Call.
- `TranslationController.java`:
  - `POST /i18n/translations/import` — nimmt `List<TranslationDto>`, ruft Service, returnt `int`.
  - `POST /i18n/translations/promote` — ruft Service, returnt `record PromoteResult(int promoted)`.

##### `projects/web-ui-i18n`
- `src/app/api/i18n/promote/route.ts` (neu) — schmaler POST-Proxy zu `${API_BASE_URL}/i18n/translations/promote`. Reicht Status + Body durch.
- `src/app/PromoteButton.tsx` (neu) — Client Component. `useState`-Result mit Discriminated Union `{kind:"ok"|"err"}`, `useTransition` für `router.refresh()` nach Erfolg. `window.confirm()` mit Live-Counter aus Props. Inline-Banner grün/rot.
- `src/app/page.tsx`:
  - Importiert `PromoteButton`.
  - Berechnet `approvedCount = rows.filter(r => r.source === "AI" || r.source === "MANUAL").length`.
  - Header von `<h1>` zu `<div class="flex justify-between">` mit Heading + `<PromoteButton approvedCount={…} />`.

##### `k8s/`
- `k8s/overlays/dev/kustomization.yaml` — JSON-Patch ergänzt, der dem `api`-Deployment in `dev` die Env-Var `PUBLIC_API_BASE_URL=http://api.public.svc.cluster.local:8080` anhängt. In `public` _nicht_ gesetzt → `promote` dort `503`.
- `k8s/base/api.yaml` — Env-Var `AWS_REGION=eu-central-1` als Default für alle Namespaces (siehe Bug #10b).

##### `material/k8s-setup.plantuml`
- Cross-Namespace-Pfeil `apiDev → apiPub` ergänzt mit Label „POST /i18n/translations/import (UPSERT, nur AI+MANUAL)". PNG neu gerendert.

#### Bugs, die nebenher rauskamen

**#10a — `RestClient.Builder` in Spring Boot 4 + `webmvc` ist nicht auto-konfiguriert.** Bei meinem ersten Wurf hatte ich `RestClient.Builder restClientBuilder` als Konstruktor-Parameter erwartet (Spring-Boot-3-Pattern). Spring schmiss `UnsatisfiedDependencyException: No qualifying bean of type 'RestClient.Builder'`. Fix: `this.restClient = RestClient.create();` direkt im Konstruktor.

**#10b — Bedrock-Auto-Config bypasst `application.yml`-Property bei der Region-Auflösung.** Beim API-Restart nach #10a crashte der Pod mit `SdkClientException: Unable to load region from any of the providers in the chain`. Das Bedrock-Property `spring.ai.bedrock.aws.region: ${AWS_REGION:eu-central-1}` reicht nicht — die `BedrockProxyChatModel.Builder.<init>(...)` ruft direkt den AWS-SDK-`DefaultAwsRegionProviderChain` auf, der die Property-Auflösung umgeht. Lösung: `AWS_REGION` als echte Env-Var auf dem Container setzen. Im `k8s/base/api.yaml`-Manifest verankert, damit es für beide Namespaces gilt (auch `public` braucht's, weil sonst der Pod nach SDK-Region-Suche scheitert — selbst wenn Bedrock dort nie genutzt wird, ist die Auto-Config-Bean-Creation am Startup zwingend).

#### Designentscheidungen
- **`PromoteResult` als Record** — kleines DTO, kein Boilerplate, JSON-Serialization durch Jackson automatisch.
- **`window.confirm()` statt eigener Modal-Komponente** — die einzige Bestätigungs-Action in der App; eigener Modal wäre Overkill, drei UI-Patterns für drei verschiedene Buttons (`Translate`, `Delete`, `Promote`) brauchen wir nicht.
- **Counter im Button-Text statt separatem Label** — Information-Density-Trick: `Promote dev → public (6)` zeigt sofort, wie viele Zeilen betroffen sind. User sieht ohne zweiten Blick, ob's was zu tun gibt (`(0)` → Button disabled).
- **`router.refresh()` nach Erfolg** — die Tabelle aktualisiert sich, falls in der Zwischenzeit `updated_at` gewandert ist. Konsistent zum Pattern bei `TranslateButton`/`EditableValueCell`/`DeleteKeyButton`.
- **Promote-Endpoint NICHT im Ingress exponiert** — der Translate-Endpoint und Promote sind cluster-interne Operationen, der Ingress in `dev` exponiert nur `web-ui-i18n` (das ruft sie weiter) plus die Doku-Pfade. Damit ist die Trust-Boundary „Wer auf `:3001` zugreifen darf, kann auch Promote auslösen" — was im Dev-Cluster gewollt ist, in Prod aber Auth braucht.

#### Abnahme — bestätigt ✅

End-to-end durchgespielt:

| Schritt | Aktion | Ergebnis |
| --- | --- | --- |
| 1 | Admin-Seite öffnen | Button zeigt `Promote dev → public (6)` (Counter = approved Zeilen) ✅ |
| 2 | Neuen Missing-Key triggern: `POST /api/i18n/en/common` mit `{"sync.demo":"Sync demonstration"}` | Fan-out: `sync.demo/en/MANUAL` + `sync.demo/de/PENDING` in `dev` ✅ |
| 3 | Promote-Button klicken | Confirm-Dialog → `POST /api/i18n/promote` → `{"promoted":7}` ✅ |
| 4 | public-DB checken: `SELECT … WHERE message_key='sync.demo'` | Nur `sync.demo/en/MANUAL` mit dev-Value vorhanden — `sync.demo/de` (PENDING in dev) wurde bewusst nicht übertragen ✅ |
| 5 | `unknown.key/de` war in `public` PENDING, in `dev` AI mit „Unbekannter Schlüssel Test" | Nach Promote in `public` jetzt `AI` mit deutschem Wert ✅ |
| 6 | Re-Run Promote | Idempotent: `{"promoted":7}` erneut, keine Duplikate, `updated_at` aktualisiert ✅ |

Verifizierungs-Befehle:

```sh
# Source-DB
kubectl exec -n dev statefulset/postgres -- psql -U translations -c \
  "SELECT message_key, locale, source FROM translations WHERE source IN ('AI','MANUAL')"

# Promote (cluster-intern, weil promote nicht im Ingress)
kubectl exec -n dev deploy/web-ui-i18n -- wget -q -O- -X POST \
  http://api:8080/i18n/translations/promote

# Ziel-DB
kubectl exec -n public statefulset/postgres -- psql -U translations -c \
  "SELECT message_key, locale, value, source FROM translations"
```

#### Offene Folgepunkte für die Promote-Mechanik
1. **Auto-Promote bei `translatePending`**: Naheliegend — sobald eine PENDING-Zeile in `dev` zu AI wird, könnte der Service direkt einen Promote-Call für diese eine Zeile machen. Spart den manuellen Button-Klick. Trade-off: weniger Kontrolle, mehr Cross-Namespace-Traffic. Erst wenn der manuelle Flow lästig wird.
2. **Promote-Diff-Preview**: Modal mit „diese 6 Zeilen werden überschrieben" vor dem POST. Aktuell nur Counter, kein Inhalts-Preview. Für eine echte Production-UX hilfreich.
3. **Promote-Audit-Log**: Spring-API könnte jeden Promote-Call protokollieren (wer, wann, was). Heute nur `log.info("Promoted N Zeilen ...")` — flüchtig.
4. **Promote-Rollback**: kein Mechanismus, eine versehentliche Überschreibung in `public` rückgängig zu machen. PVC-Snapshot oder Backup wäre der saubere Weg.
5. **Cross-Namespace-NetworkPolicy**: Heute kann jeder Pod im Cluster `api.public.svc.cluster.local:8080` aufrufen. Für ein echtes Production-Setup muss eine NetworkPolicy festlegen, dass nur `api.dev` das darf — und nur auf `/i18n/translations/import`.

### 11. Namespace-Umbenennung: `public` → `prod`, `dev` → `pre-prod`

Reviewing nach #10: die ursprüngliche Namespace-Wahl `public`/`dev` aus der allerersten Iteration war zu sehr „from the engineer's seat" — `public` klang nach „öffentlich erreichbar", aber tatsächlich gemeint war „Produktions-Konsumenten-Sicht". `dev` suggerierte „Developer-Spielwiese", war aber eigentlich „Pre-Production mit Admin-Werkzeugen". Klarere Mental Models sind:

- `prod` = die Konsumenten-Umgebung (so wie es ein Endkunde sehen würde)
- `pre-prod` = die Werkbank zum Vorbereiten von Übersetzungen, mit Admin-UI + Bedrock

**Refactoring:**
- Verzeichnisse umbenannt: `k8s/overlays/public/` → `k8s/overlays/prod/`, `k8s/overlays/dev/` → `k8s/overlays/pre-prod/` (via `git mv`).
- Inhalte angepasst: `namespace: …`, Ingress-Hostnames (`*.prod.localtest.me`, `*.pre-prod.localtest.me`), Cross-NS-DNS (`api.prod.svc.cluster.local`), Ingress-Resource-Namen (`prod-ingress`, `pre-prod-ingress`), Postgres-DB-Passwort-Patch (`translations-pre-prod`), Kustomize-Labels.
- Makefile-Targets: `k8s-public` → `k8s-prod`, `k8s-dev` → `k8s-pre-prod`. `k8s-secrets` lädt jetzt in `pre-prod`, `k8s-clean` löscht beide. `.PHONY`-Liste angepasst.
- `material/k8s-setup.plantuml`: PlantUML-Stereotypes `<<public>>`/`<<dev>>` → `<<prod>>`/`<<preprod>>` (Bindestrich in Stereotype-Namen sind in PlantUML problematisch → CamelCase). Interne Identifier (`nsPub`/`nsDev`/`apiPub`/…) entsprechend zu `nsProd`/`nsPre`/`apiProd`/`apiPre`. Notes + Labels aktualisiert. PNG neu gerendert.
- `projects/web-ui-i18n/src/app/PromoteButton.tsx`: Button-Text `Promote dev → public (N)` → `Promote pre-prod → prod (N)`. Confirm-Dialog und Erfolgs-Banner ebenfalls.
- `README.md` und `CLAUDE.md`: alle live referenzierten Namen aktualisiert (URL-Tabelle, `/etc/hosts`-Block, Troubleshooting-Bullets, Architektur-Stichworte, Promote-Workflow-Beschreibung).

**Was bewusst NICHT umbenannt wurde:**
- Die Env-Var `PUBLIC_API_BASE_URL` behält ihren Namen — sie bedeutet semantisch „das Promote-Ziel", nicht „der public-Namespace". Eine Umbenennung in z. B. `PROMOTE_TARGET_API_BASE_URL` wäre einen extra Refactor wert; für jetzt steht ein Kommentar im Code, der den historischen Namen erklärt.
- Die historischen Sektionen 1–10 dieses Nachtrags reden weiter von `public`/`dev` — sie dokumentieren den Stand zum Zeitpunkt der jeweiligen Entscheidung. Wer den Doc liest, soll die Sektion #11 als Lese-Pivot kennen: ab hier sind die Namen `prod`/`pre-prod`, davor `public`/`dev`. Refactoring von Historie wäre unsauber.
- Bestehende Container-Image-Tags (`api:dev`, `web-ui:dev`, `web-ui-i18n:dev`) — das `:dev` ist ein Tag-Convention, kein Namespace-Bezug. Bleibt.

**Cluster-Switch**: alte Namespaces `public`/`dev` werden gelöscht, neue `prod`/`pre-prod` per `make k8s-prod && make k8s-pre-prod` neu erstellt. PVCs werden mit gelöscht — alle Übersetzungs-Daten gehen verloren. Im Dev-Setup ist das OK; in Production müsste ein DB-Dump als Migration zwischen den Namespaces laufen.

### 12. Promote-Button auch im `make dev`-Workflow klickbar machen

Beobachtung nach #11: wer `http://localhost:3001/` lokal über `make dev` öffnet, sieht den Promote-Button — aber Klick → `HTTP 503: "PUBLIC_API_BASE_URL ist nicht konfiguriert"`. Grund: lokal gibt es keine zweite API auf der „prod-Seite", also keinen Wert für `PUBLIC_API_BASE_URL`.

Optionen:
1. Button im lokalen Workflow disablen / wegrendern.
2. Spring-API lokal so konfigurieren, dass `/promote` gegen sich selbst läuft.

**Entscheidung: Variante 2** — der Self-Loop ist semantisch ein UPSERT mit identischen Werten (`message_key`+`locale` gleich, `value`+`source` gleich), also ein No-Op außer dass `updated_at` wandert. Damit ist der Button identisch funktional zum K8s-Verhalten — Counter, Confirm-Dialog, Banner — nur dass die „andere Seite" zufällig dieselbe DB ist.

**Fix**: in `projects/api/Makefile` ein `export PUBLIC_API_BASE_URL := http://localhost:8080` ergänzt. Spring-Prozess liest die env-var beim Start, das `${PUBLIC_API_BASE_URL:}` in `application.yml` greift auf den Wert zu, und `TranslationService.promote()` POSTet an `localhost:8080/i18n/translations/import` — also an sich selbst. Loopback ist sub-Millisekunden-fast.

**Was bewusst NICHT geändert wurde**:
- `application.yml` behält den Default leer (`${PUBLIC_API_BASE_URL:}`). In K8s `prod` ist die Variable bewusst _nicht_ gesetzt → `/promote` antwortet weiter mit `HTTP 503`. Diese Loud-Failure-Safety bleibt: wenn jemand in prod versehentlich `curl …/promote` macht, bekommt er einen klaren Fehler, keinen stillen Self-Loop-No-Op.
- `web-ui-i18n` rendert den Button weiter mit `Promote pre-prod → prod (N)`. Im lokalen Kontext ist „prod" konzeptionell dasselbe System; der Text ist im K8s-Modell korrekt, im Dev-Modell harmlos.

Diff-Bild der Lokalen Layer-Konfig:

| Workflow         | `PUBLIC_API_BASE_URL`                         | Promote-Verhalten          |
| ---------------- | --------------------------------------------- | -------------------------- |
| `make dev`       | `http://localhost:8080` (aus api-Makefile)   | Self-UPSERT (No-Op)        |
| K8s `pre-prod`   | `http://api.prod.svc.cluster.local:8080`     | Cross-NS-Promote zu `prod` |
| K8s `prod`       | _(leer)_                                      | HTTP 503                   |

**Aktivierung**: einmaliger Restart von `make dev-api` (Spring liest env-vars nur beim Start). Danach klappt der Button auf `http://localhost:3001/` wie erwartet.

### Geänderte Files in diesem Nachtrag

- `k8s/base/postgres.yaml` — `storageClassName: standard` entfernt.
- `k8s/base/web-ui.yaml` + `web-ui-i18n.yaml` — Probes auf `tcpSocket` umgestellt mit Kommentar.
- `Makefile`:
  - neuer Target `ingress` (Helm-Install für Traefik) + `.PHONY`-Liste ergänzt. Anmerkung: zwischenzeitlich `k8s-traefik` getauft, dann auf das kürzere `ingress` umbenannt (konsistent zum Stil von `dev`/`images`).
  - `k8s-secrets` komplett umgebaut: zieht AWS-Creds live via `aws configure export-credentials` statt aus statischer `.env`. Funktioniert mit SSO und statischen Keys.
- `projects/web-ui-i18n/src/app/page.tsx` — `fetchTranslations()` direkt gegen `API_BASE_URL` statt über `headers().host`-Indirektion.
- `k8s/base/kustomization.yaml` + `k8s/base/web-ui-i18n.yaml` → `k8s/overlays/dev/web-ui-i18n.yaml`. `web-ui-i18n` ist jetzt dev-exklusiv.
- `material/k8s-setup.plantuml` — `adminPub` (web-ui-i18n in public) entfernt; `apiPub → bedrock`-Verbindung entfernt; Bedrock-Label klargestellt „nur dev — Auto-Translate sitzt in web-ui-i18n"; Note auf „Schlanker Stack: kein Admin-UI deployed" aktualisiert. PNG neu gerendert.
- `Makefile` (`k8s-secrets`) — Loop entfernt; Secret wird nur noch in `dev` angelegt. Kommentar erklärt warum.
- `README.md` — SSO-Renewal-Workflow auf `-n dev` reduziert; Troubleshooting-Bullet und Deployment-Step-Kommentar an die neue Topologie angepasst.
- `README.md` — K8s-Sektion in „Einmaliges Setup" + „Deployment-Loop" geteilt; `--memory 4`-Erklärung; neuer Block „DNS für `*.localtest.me`" mit `/etc/hosts`-Variante und Router-Whitelisting-Cheat-Sheet (FritzBox/OpenWrt/UniFi/pi-hole).

#### Promote-Flow (#10):

- `projects/api/src/main/java/de/actyvyst/api/translation/SyncProperties.java` (neu).
- `projects/api/src/main/java/de/actyvyst/api/ApiApplication.java` — `@EnableConfigurationProperties` um `SyncProperties` erweitert.
- `projects/api/src/main/java/de/actyvyst/api/translation/TranslationRepository.java` — `findAllBySourceIn` + `upsert` ergänzt.
- `projects/api/src/main/java/de/actyvyst/api/translation/TranslationService.java` — `exportApproved`/`importTranslations`/`promote` + `RestClient.create()` + `SyncProperties`-Injection.
- `projects/api/src/main/java/de/actyvyst/api/translation/TranslationController.java` — `POST /translations/import` + `POST /translations/promote` + `record PromoteResult`.
- `projects/api/src/main/resources/application.yml` — `app.sync.public-api-base-url` Block.
- `k8s/base/api.yaml` — `AWS_REGION=eu-central-1` als Env-Var (Bedrock-Auto-Config bypasst application.yml).
- `k8s/overlays/dev/kustomization.yaml` — JSON-Patch für `PUBLIC_API_BASE_URL` auf dem api-Deployment in dev.
- `projects/web-ui-i18n/src/app/api/i18n/promote/route.ts` (neu) — POST-Proxy.
- `projects/web-ui-i18n/src/app/PromoteButton.tsx` (neu) — Client Component mit Confirm + Inline-Banner.
- `projects/web-ui-i18n/src/app/page.tsx` — Toolbar-Layout + `approvedCount`-Berechnung.
- `material/k8s-setup.plantuml` — `apiDev → apiPub`-Promote-Pfeil (siehe nächster Diagramm-Update).

## Folgearbeiten (außerhalb dieser Iteration)
- **NetworkPolicies**: für ein echtes Cluster Pflicht. Lokal verzichtbar.
- **TLS via cert-manager + Let's Encrypt** (oder self-signed mit `mkcert`) — sobald nicht-`localhost`-Tests laufen.
- **CI-Pipeline**: Build + `kubectl apply` automatisieren.
- **Helm-Chart**, falls weitere Umgebungen (`stage`, `prod`) dazukommen.
- **Observability**: kube-prometheus-stack, Loki für Logs.
- **Migration der lokalen Dev-Schleife in K8s** (mit Skaffold oder Tilt) — ersetzt `make dev` durch K8s-native Hot-Reload, falls die Trennung „lokal vs. K8s" zu viel Doppelung wird.
- **Backup/Restore-Pfad für Postgres in `public`** — sobald da echte Daten leben.
- **Pod Security Standards (PSS)**: `baseline` als Namespace-Label setzen, `restricted` als Ziel für später.
