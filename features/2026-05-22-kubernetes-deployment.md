# Feature: Lokale Kubernetes-Deployments für `public` und `dev`

## Kontext
Anschluss an [2026-05-22-split-web-ui-i18n.md](2026-05-22-split-web-ui-i18n.md).

Bisher läuft der Stack ausschließlich über `make dev` als drei lokale Prozesse (Spring + zwei Next-Apps) plus Postgres im Docker-Compose. Mit der Trennung von web-ui (`:3000`) und web-ui-i18n (`:3001`) haben wir jetzt zwei Web-Frontends mit unterschiedlichen Anforderungen: web-ui ist Konsumenten-Sicht, web-ui-i18n ist Admin-Sicht.

Diese Iteration verlegt den kompletten Stack in einen lokalen Kubernetes-Cluster (Colima mit `--kubernetes`-Flag — siehe README-Hinweis zur macOS-Installation) und drückt die Konsumenten-/Admin-Trennung in eine **Namespace-Trennung** mit unterschiedlich konfigurierten Ingress-Regeln aus.

## Ziel dieser Iteration

Zwei voll funktionsfähige K8s-Namespaces, beide enthalten den vollständigen Stack — aber nach außen unterschiedlich freigegeben:

| Namespace | Was läuft drin                            | Ingress-Exposure                                                                 |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `public`  | web-ui, web-ui-i18n, Spring-API, Postgres | nur web-ui (Konsumenten-Sicht; Admin und Swagger sind nicht erreichbar)          |
| `dev`     | web-ui, web-ui-i18n, Spring-API, Postgres | web-ui + web-ui-i18n + Spring-API-Swagger (`/swagger-ui.html`, `/v3/api-docs/*`) |

Daraus folgt:

- web-ui-i18n und Swagger laufen technisch auch in `public`, sind aber nur cluster-intern erreichbar (`ClusterIP`-Services, nicht im Ingress). Sicherheits-Default: was nicht im Ingress steht, ist von außen unsichtbar.
- Jeder Namespace ist vollständig selbsterhaltend (eigene API, eigene DB). Namespace-Löschen ist „Reset".

## Entscheidungen aus dem Ask-Before-Development-Lauf

- **Stack-Topologie**: jeder Namespace bringt API + Postgres komplett selbst mit. Isolation > Ressourcen-Sparen. Cross-Namespace-Aufrufe gibt es nicht — `public` ist operationell unabhängig von `dev`. Voraussetzung dafür, dass `public` z. B. weiter rennt, während wir `dev` neu deployen.
- **Image-Build**: lokal in den Colima-Daemon laden. `colima start --kubernetes` nutzt containerd-namespace `k8s.io` direkt — kein Registry-Push nötig. `imagePullPolicy: IfNotPresent` in allen Manifests. Bei Build: `docker build -t web-ui:dev …` und K8s findet das Image automatisch.

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
   - `http://admin.public.localtest.me/` → 404 (nicht im Ingress).
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

## Offene Punkte / vor Implementierung klären

1. **Manifest-Layout**: `k8s/` im Root vs. `projects/*/k8s/` pro App vs. `infra/k8s/`?
   - (a) `k8s/` im Root mit Kustomize-Overlays — Empfehlung, weil die Manifests den ganzen Stack beschreiben, nicht eine einzelne App.
   - (b) Pro Projekt — passt schlecht zu Cross-Cutting-Manifests wie Ingress.
   - (c) `infra/k8s/` — gleiches wie (a), nur tieferer Pfad.

2. **Ingress-Controller**: welcher läuft im Colima-Cluster?
   - (a) Traefik (Colima/k3s-Default) — keine Installation nötig, IngressClass `traefik`.
   - (b) ingress-nginx — populärster Controller, vertrauter für Engineers aus „echten" Clustern. Muss installiert werden (`helm install ingress-nginx …` oder `kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/…`).
   - Empfehlung: (a) als Default, weil sofort verfügbar. Manifests so schreiben, dass IngressClass per Overlay setzbar ist (für späteren Wechsel).

3. **Swagger-Routing in `dev`**: eigener Subdomain (`api.dev.localtest.me`) oder Pfad-basiert (`web-ui.dev.localtest.me/swagger-ui`)?
   - (a) Eigener Host — klarer, aber drei Hostnames zum Merken.
   - (b) Pfad-basiert auf web-ui-Host — weniger Hosts, aber Pfad-Kollision-Gefahr (Next.js routet auch unter `/`).
   - Empfehlung: (a) eigener Host. Klare Separation, Browser-Tab-Titel sind eindeutig.

4. **`spring-boot-starter-actuator`**: aktuell nicht im `pom.xml`. Liveness/Readiness brauchen `/actuator/health`. Alternativen:
   - (a) Actuator ergänzen — minimaler Eingriff, Best Practice.
   - (b) Plain `/i18n/translations` als Liveness benutzen — DB-Last bei jedem Probe-Call, semantisch falsch.
   - Empfehlung: (a). Folge-PR oder Teil dieser Iteration?

5. **Postgres-Image**: gleiches `postgres:17-alpine` wie in `compose.yaml`? Empfehlung: ja, eine SDP („Single Database Provenance") für Dev-Compose und K8s.

6. **AWS-Bedrock-Credentials**: wie kommen die in K8s rein?
   - (a) `kubectl create secret generic bedrock-secret --from-env-file=projects/api/.env` — pragmatisch, manuell. Empfehlung für jetzt.
   - (b) External Secrets Operator + AWS Secrets Manager — Overkill für lokales Cluster.
   - (c) SSO-Token-Mount per CSI-Driver — komplex, lohnt nicht.
   - Frage am Rande: SSO-Tokens laufen nach 1h ab. Akzeptiert für lokale Tests, oder brauchen wir IAM-User-Keys speziell für K8s-Deployments?

7. **DB-Persistenz nach Pod-Restart**: PVC bleibt bestehen, Datenbank-Inhalt überlebt. Soll das Default sein, oder lieber `emptyDir` (jeder Restart frisch)?
   - Empfehlung: PVC, weil das näher an „echtem" Verhalten ist. Reset-Button: `kubectl delete pvc -n <ns> --all`.

8. **`localtest.me` vs. `/etc/hosts`**: localtest.me ist ein public DNS-Service. Falls die Firma/das Setup das blockt, brauchen wir `/etc/hosts`-Einträge (`127.0.0.1 web-ui.public.local web-ui.dev.local admin.dev.local api.dev.local`). Empfehlung: localtest.me als Default, mit `/etc/hosts`-Fallback im README dokumentiert.

9. **Image-Tags**: `:dev` oder `:latest` oder Git-SHA?
   - `:dev` für lokales Cluster reicht. `:latest` ist semantisch leer und triggert `imagePullPolicy: Always`-Defaults bei manchen Cluster-Konfigs.

10. **`pnpm install` im Dockerfile**: workspace-globaler Install im Builder-Stage oder nur die App? Mit pnpm-Workspace gilt: globaler Install ist effizient (shared store), Build-Output liegt aber pro App. Empfehlung: `pnpm fetch` + `pnpm --filter <app> install --offline` pro Image, damit man nicht beide Apps bei jedem Build mitziehst.

## Folgearbeiten (außerhalb dieser Iteration)
- **NetworkPolicies**: für ein echtes Cluster Pflicht. Lokal verzichtbar.
- **TLS via cert-manager + Let's Encrypt** (oder self-signed mit `mkcert`) — sobald nicht-`localhost`-Tests laufen.
- **CI-Pipeline**: Build + `kubectl apply` automatisieren.
- **Helm-Chart**, falls weitere Umgebungen (`stage`, `prod`) dazukommen.
- **Observability**: kube-prometheus-stack, Loki für Logs.
- **Migration der lokalen Dev-Schleife in K8s** (mit Skaffold oder Tilt) — ersetzt `make dev` durch K8s-native Hot-Reload, falls die Trennung „lokal vs. K8s" zu viel Doppelung wird.
- **Backup/Restore-Pfad für Postgres in `public`** — sobald da echte Daten leben.
- **Pod Security Standards (PSS)**: `baseline` als Namespace-Label setzen, `restricted` als Ziel für später.
