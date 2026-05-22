# i18n-collector

Monorepo für einen kleinen i18n-Stack: eine Konsumenten-Web-UI, eine getrennte
Admin-UI für die Übersetzungs-Tabelle und ein Spring-Boot-API, das die Daten
hält und Bedrock für AI-Übersetzungen anruft.

## Architektur

![Architektur-Diagramm](material/architecture.png?v=fd8291de)

Quelle: [`material/architecture.plantuml`](material/architecture.plantuml) — neu rendern via `make -C material build-pngs` (aktualisiert auch den `?v=<hash>`-Cache-Buster in dieser README).

### Komponenten

| Pfad                   | Zweck                                                                                                                     | Port |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- |
| `projects/web-ui`      | Demo-/Konsumenten-App. Rendert `t(key, defaultValue)`-Strings über `react-i18next` und triggert Missing-Key-Reports.      | 3000 |
| `projects/web-ui-i18n` | Admin-UI auf der `translations`-Tabelle: Liste, Edit, Delete, Auto-Translate (Bedrock).                                   | 3001 |
| `projects/api`         | Spring-Boot-API mit JPA + Flyway-Migrationen. Endpoints für i18next-Backend (`/{lng}/{ns}`) und CRUD (`/translations/*`). | 8080 |
| `projects/e2e-tests`   | Playwright-Tests gegen `:3000` (Sprachumschalter + i18next-Diagnose). Setzt voraus, dass `make dev` läuft.                | —    |

### Datenfluss

1. **Demo-Seite** (`:3000`) lädt Locale-Bundles via `i18next-http-backend` über
   einen Next.js-Proxy: `/api/i18n/{lng}/{ns}` → `:8080/i18n/{lng}/{ns}`.
2. Fehlt ein Key, schickt i18next einen Missing-Key-Report. Die API legt
   sofort für *alle* `supportedLngs` Zeilen an — `source-lng` (en) als
   `MANUAL`, alle Ziel-Locales als `PENDING` mit dem englischen `defaultValue`
   als Platzhalter.
3. **Admin-UI** (`:3001`) listet alle Zeilen. Auf einer `PENDING`-Zeile löst
   der Auto-Translate-Button einen Bedrock-Call aus und setzt die Zeile auf
   `source=AI`.
4. Browser-Requests gehen immer same-origin gegen den jeweiligen Next-Server.
   CORS auf der Spring-API ist deaktiviert, weil der Proxy server-side fetcht.

Architektur-Hintergrund und Iterationsverlauf: siehe `features/` (chronologisch
sortierte Feature-Docs mit `Umsetzungsstand`-Sektion pro Iteration).

## Technologie-Stack

### Sprachen & Runtimes
| Technologie | Version | Wofür                     |
| ----------- | ------- | ------------------------- |
| Java        | 25      | Spring-Boot-API           |
| Node.js     | ≥ 20    | Next.js-Apps + Playwright |
| TypeScript  | 5.x     | Beide Web-UIs             |
| pnpm        | 10.33.2 | Workspace-Manager (Root)  |

### Backend (`projects/api`)
| Technologie         | Version               |
| ------------------- | --------------------- |
| Spring Boot         | 4.0.6                 |
| Spring AI (Bedrock) | 2.0.0-M6              |
| springdoc-openapi   | 2.8.13                |
| Flyway              | (Spring-Boot-managed) |
| Caffeine            | (Spring-Boot-managed) |
| PostgreSQL          | 17-alpine             |

### Frontend
| Technologie          | Version | Eingesetzt in       |
| -------------------- | ------- | ------------------- |
| Next.js              | 16.2.6  | web-ui, web-ui-i18n |
| React / React-DOM    | 19.2.4  | web-ui, web-ui-i18n |
| Tailwind CSS         | 4.x     | web-ui, web-ui-i18n |
| i18next              | 26.2.0  | web-ui              |
| i18next-http-backend | 4.0.0   | web-ui              |
| react-i18next        | 17.0.8  | web-ui              |

### Test
| Technologie      | Version | Wofür                            |
| ---------------- | ------- | -------------------------------- |
| @playwright/test | 1.60.x  | E2E-Tests (`projects/e2e-tests`) |

### Externe Services
- **AWS Bedrock** — `eu.anthropic.claude-haiku-4-5-20251001-v1:0` (EU-Inference-Profile, Region `eu-central-1`). Setup-Details siehe `projects/api/.env.example`.

## Voraussetzungen

- Java 25 (Apple Silicon: `brew install --cask zulu25` oder Temurin; `/usr/libexec/java_home -v 25` muss auflösen)
- Node.js 20+
- pnpm 10+ (`brew install pnpm` oder `corepack enable`)
- Docker (für PostgreSQL via `docker compose`)
- aws-CLI inklusive aktiver Session (`brew install awscli`, dann `aws sso login` o. ä.) — sowohl `make dev-api` als auch `make k8s-secrets` ziehen die AWS-Credentials live von dort. Ohne läuft alles _außer_ Auto-Translate.
- Nur für den K8s-Workflow: `kubectl` (`brew install kubectl`) und `helm` (`brew install helm`)

## Installation

```sh
# 1. Dependencies aller Workspace-Pakete ziehen
make install
# entspricht: pnpm install

# 2. .env aus Template anlegen (für Region + Bedrock-Modell-ID; AWS-Creds
#    selbst werden NICHT hier eingetragen — die kommen live vom aws-CLI).
cp projects/api/.env.example projects/api/.env

cp projects/web-ui/.env.example projects/web-ui/.env           # optional
cp projects/web-ui-i18n/.env.example projects/web-ui-i18n/.env # optional

# 3. PostgreSQL starten
cd projects/api && docker compose up -d
```

> **macOS** — falls kein Docker-Daemon läuft (Colima statt Docker Desktop):
> `colima start --kubernetes` vor dem `docker compose up -d` ausführen.

Flyway zieht die V1–V4-Migrationen beim ersten API-Start automatisch nach
(`translations`-Tabelle + Seed-Daten).

## Dev-Loop

```sh
make dev
```

Startet API, web-ui und web-ui-i18n parallel (`make -j3`):

| Prozess    | URL                                     |
| ---------- | --------------------------------------- |
| Spring API | `http://localhost:8080`                 |
| Demo-UI    | `http://localhost:3000`                 |
| Admin-UI   | `http://localhost:3001`                 |
| Swagger-UI | `http://localhost:8080/swagger-ui.html` |

Einzelne Prozesse:

```sh
make dev-api          # nur Spring (exportiert AWS-Credentials automatisch)
make dev-web          # nur Demo-UI
make dev-web-i18n     # nur Admin-UI
```

## Build, Lint, Test

```sh
make build            # API jar + beide Next-Builds
make lint             # ESLint über beide Web-Projekte
make test-e2e         # Playwright (erwartet, dass `make dev` parallel läuft)
make clean            # mvn clean + .next/tsbuildinfo-Cleanup
```

## Kubernetes (lokal in Colima)

Alternativer Deployment-Pfad neben `make dev`: zwei Namespaces (`prod` und `pre-prod`) mit jeweils eigenem Stack. `prod` ist die schlanke Konsumenten-Umgebung, `pre-prod` ist die Werkbank mit Admin-UI + Bedrock. Siehe `features/2026-05-22-kubernetes-deployment.md`.

![K8s-Setup-Diagramm](material/k8s-setup.png?v=ec389e43)

Quelle: [`material/k8s-setup.plantuml`](material/k8s-setup.plantuml) — neu rendern via `make -C material build-pngs` (aktualisiert auch den `?v=<hash>`-Cache-Buster in dieser README).

### Einmaliges Setup

```sh
# Colima im K8s-Mode mit genug Memory. Default 2 GB reicht nicht für zwei
# Namespaces × kompletter Stack (Pods scheitern sonst mit
# FailedScheduling: Insufficient memory).
colima start --kubernetes --memory 4

# Ingress-Controller (Traefik) nachinstallieren — Colimas k3s kommt
# ohne. Mappt LoadBalancer-IP via klipper-lb auf den Host.
# Voraussetzung: helm (`brew install helm`).
make ingress
```

#### DNS für `*.localtest.me` (falls vom Router gefiltert)

`localtest.me` ist ein öffentlicher DNS-Service, der alle Subdomains auf `127.0.0.1` auflöst. Viele Heim-Router (FritzBox, einige TP-Link, einige UniFi-Setups) haben jedoch einen **DNS-Rebind-Schutz**, der DNS-Antworten mit privaten/Loopback-Adressen herausfiltert. Symptom:

```sh
$ dig localtest.me
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: ...
;; ANSWER: 0           ← leer, obwohl die externe Antwort 127.0.0.1 wäre
;; SERVER: 192.168.x.1#53   ← der Router filtert
```

Zwei Lösungswege:

**Option A — `/etc/hosts` (empfohlen, portabel)**

Funktioniert in jedem Netz (auch Café/Hotspot/VPN), unabhängig vom Router:

```sh
sudo tee -a /etc/hosts <<'EOF'

# i18n-collector — Colima/K8s-Ingress
127.0.0.1 web-ui.prod.localtest.me
127.0.0.1 web-ui.pre-prod.localtest.me
127.0.0.1 admin.pre-prod.localtest.me
127.0.0.1 api.pre-prod.localtest.me
EOF
```

`/etc/hosts` wird vor jeder DNS-Anfrage konsultiert — der Router sieht die Anfragen gar nicht.

**Option B — DNS-Rebind-Schutz am Router für `localtest.me` ausnehmen**

Allgemeines Prinzip: Im Router-Admin-Interface eine Allowlist-/Whitelist-Funktion suchen, die Hostnamen vom Rebind-Schutz ausnimmt, und `localtest.me` eintragen.

Pro Router-Hersteller die übliche Stelle:

| Router       | Pfad im Web-Interface                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FritzBox** | Heimnetz → Netzwerk → Netzwerkeinstellungen → „Hostnamen vom DNS-Rebind-Schutz ausnehmen" (oder unter Internet → Filter → Listen → DNS-Rebind-Schutz, je nach FRITZ!OS-Version) |
| **OpenWrt**  | `/etc/config/dhcp` → `option rebind_localhost '1'` setzen oder Domain via `list rebind_domain 'localtest.me'`                                                                   |
| **UniFi**    | Settings → Networks → Default → Advanced → Domain Name (lokale Domain ergänzen)                                                                                                 |
| **pi-hole**  | Settings → DNS → „Never forward non-FQDNs" deaktivieren oder `localtest.me` als regex-Allowlist                                                                                 |

Nach der Änderung Router-DNS testen:

```sh
dig localtest.me +short    # erwartet: 127.0.0.1
```

Vorteil B vs. A: gilt für alle Geräte im Heimnetz, ein-für-allemal. Nachteil: Router-spezifisch, klappt nur zu Hause — unterwegs brauchst du wieder `/etc/hosts`.

### Deployment-Loop

```sh
# 1. Container-Images in den Colima-Daemon laden
make images

# 2. Bedrock-Credentials nur in den `pre-prod`-Namespace als Secret.
#    `prod` braucht Bedrock nicht (kein Admin-UI, keine Auto-Translate-Calls).
#    Voraussetzung: aws-CLI ist eingeloggt (sonst `aws sso login` vorab).
#    Re-Run nach Token-Ablauf reicht — Pod muss aber neu gestartet werden
#    (siehe Troubleshooting unten).
make k8s-secrets

# 3. Stack pro Namespace deployen
make k8s-prod
make k8s-pre-prod

# 4. Reset (löscht beide Namespaces inkl. PVCs; Traefik bleibt)
make k8s-clean
```

### Promote pre-prod → prod

Übersetzungen werden in `pre-prod` gepflegt (Demo-Seite triggert Missing-Keys, Admin-UI lässt Bedrock-Auto-Translate laufen). `prod` braucht die fertigen Werte für seine Konsumenten — die Brücke ist der **Promote-Button** in der Admin-UI (`admin.pre-prod.localtest.me`):

1. Toolbar oberhalb der Tabelle zeigt `Promote pre-prod → prod (N)` mit Counter der approved Zeilen (`AI` + `MANUAL`).
2. Klick → Confirm-Dialog → `POST /api/i18n/promote` → pre-prod/api orchestriert den Push an `http://api.prod.svc.cluster.local:8080/i18n/translations/import` (cluster-intern, kein Ingress).
3. UPSERT in prod-DB: `ON CONFLICT (message_key, locale) DO UPDATE`. `PENDING`-Zeilen in `pre-prod` werden bewusst nicht promoted — nur „fertige" Übersetzungen.
4. Inline-Banner unter dem Button zeigt Erfolgs-Counter oder Fehler.

Idempotent: Mehrfaches Klicken ist sicher, ein erneuter Promote überschreibt mit denselben Werten. Voraussetzung: `PUBLIC_API_BASE_URL`-Env-Var auf dem pre-prod/api-Deployment (im `k8s/overlays/pre-prod/kustomization.yaml` als Patch verankert; Variablen-Name ist historisch — er bedeutet „Promote-Ziel", nicht „public-Namespace").

### URLs

URLs (Traefik-Ingress, `*.localtest.me` → 127.0.0.1):

| Namespace | URL                                                               |
| --------- |-------------------------------------------------------------------|
| `prod`     | http://web-ui.prod.localtest.me                                            |
| `pre-prod` | http://web-ui.pre-prod.localtest.me, http://admin.pre-prod.localtest.me    |
| `pre-prod` | http://api.pre-prod.localtest.me/swagger-ui (nur Doku-Pfade exponiert)     |

## Troubleshooting

- **`./mvnw spring-boot:run` findet kein Java 25** — sicherstellen, dass
  `/usr/libexec/java_home -v 25` etwas Sinnvolles ausgibt (Apple-spezifisch).
  Das API-Makefile setzt `JAVA_HOME` automatisch.
- **Bedrock `ValidationException: on-demand throughput isn't supported`** —
  direkte Modell-IDs funktionieren in `eu-central-1` nicht, EU-Inference-Profile
  (`eu.…`) verwenden. Default ist bereits gesetzt.
- **`SdkClientException: Unable to load credentials … login_session`** — SSO-
  Profile lassen sich vom Java-SDK nicht direkt lesen. Das API-Makefile löst
  das mit `aws configure export-credentials --format env`. Lokal sicherstellen,
  dass `aws sso login` (oder vergleichbares) frisch ist.
- **K8s: `kubectl get secret bedrock-secret -n dev` zeigt `DATA 0`** — das Secret
  wurde leer angelegt, weil zum Zeitpunkt von `make k8s-secrets` die aws-CLI
  keine Credentials liefern konnte (kein SSO-Login, kein gültiges Profil). Fix:
  `aws sso login` → `make k8s-secrets` → `kubectl rollout restart deploy/api -n dev`.
- **K8s: SSO-Token nach 1h abgelaufen, Auto-Translate antwortet mit HTTP 500**
  obwohl der Pod läuft. Die Secret-Werte sind statisch nach `make k8s-secrets`,
  laufen also nicht automatisch mit. Renewal-Workflow (drei Befehle):
  ```sh
  aws sso login
  make k8s-secrets
  kubectl rollout restart deploy/api -n dev
  ```
  Nur `pre-prod` braucht das — `prod` hat kein bedrock-secret (kein Admin-UI, keine Bedrock-Calls).
