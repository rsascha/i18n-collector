# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vor jeder Änderung

- **Feature-Iterationen werden in `features/YYYY-MM-DD-*.md` dokumentiert** — chronologisch, mit einer „Umsetzungsstand"-Sektion am Ende jeder Iteration. Vor dem Start einer neuen Iteration die jüngste Feature-Datei lesen, damit du den Kontext der letzten Entscheidungen mitbringst.
- **`ask-before-development`-Skill am Anfang jedes Features ausführen**. Die offenen Punkte landen im Doc als „Offene Punkte / vor Implementierung klären", die Entscheidungen unter „Entscheidungen aus dem Ask-Before-Development-Lauf". Das ist nicht optional — das ist das Verhandlungs-Tool des Projekts.
- **`projects/web-ui` ist Next.js 16 mit Breaking Changes**. Vor jeder Änderung in `projects/web-ui/src/app/` oder am i18n-Setup die relevanten Guides unter `projects/web-ui/node_modules/next/dist/docs/` lesen. Gilt analog für `projects/web-ui-i18n`.

## Architektur in Stichworten

Stack besteht aus vier Projekten in einem pnpm-Workspace (plus Maven für die API):

- **`projects/web-ui`** (Next.js 16, :3000) — Demo-/Konsumenten-Seite mit `react-i18next`. Triggert Missing-Key-Reports beim Rendering.
- **`projects/web-ui-i18n`** (Next.js 16, :3001) — Admin-UI für die Translations-Tabelle. **Bewusst ohne** `react-i18next` (alle Strings hartkodiert auf Englisch).
- **`projects/api`** (Spring Boot 4.0.6, Java 25, :8080) — JPA + Flyway, Bedrock-AI via Spring AI Converse.
- **`projects/e2e-tests`** (Playwright) — End-to-End-Tests, setzt laufendes `make dev` voraus.

Datenfluss-Eigenheiten, die man wissen muss:

1. **Missing-Key-Fan-out**: Wenn der `t(key, defaultValue)`-Aufruf in web-ui einen neuen Key entdeckt, legt die API **gleichzeitig Zeilen für alle `supportedLngs`** an (Source-Locale `MANUAL`, Ziel-Locales `PENDING`). Nicht nur für die gerade aktive Sprache.
2. **`supportedLngs` muss synchron sein** zwischen `projects/web-ui/src/i18n/i18n.ts` (`SUPPORTED_LNGS`) und `projects/api/src/main/resources/application.yml#app.i18n`. Ein Cross-Reference-Kommentar steht in beiden Files.
3. **`t(key, defaultValue)`-Konvention** (verbindlich): jeder `t()`-Call hat ein zweites Argument, den englischen Source-Text. Der `defaultValue` ist Flicker-frei-Render UND Bedrock-Input für die Übersetzung.
4. **Server-side vs. Client-side Fetch in web-ui-i18n**: Server Components in `src/app/page.tsx` fetchen **direkt** gegen `API_BASE_URL` (cluster-intern in K8s). Client Components (`TranslateButton`, `EditableValueCell`, `DeleteKeyButton`) gehen über die same-origin Next-Route-Handler in `src/app/api/i18n/translations/`. Die Server-Component nimmt absichtlich nicht den eigenen Proxy — würde in K8s den eigenen Ingress-Hostname auflösen wollen.

## Kommandos (alles via Make)

| Workflow              | Befehl                  | Notizen                                                                 |
| --------------------- | ----------------------- | ----------------------------------------------------------------------- |
| Setup                 | `make install`          | pnpm install im Workspace                                               |
| Dev-Loop (alles)      | `make dev`              | API + web-ui + web-ui-i18n parallel (`make -j3`)                        |
| Einzelner Dev         | `make dev-api` etc.     | API zieht AWS-Creds automatisch via `aws configure export-credentials`  |
| Build                 | `make build`            | API-jar + beide Next-Builds                                             |
| Lint                  | `make lint`             | ESLint über beide Web-Projekte                                          |
| E2E                   | `make test-e2e`         | Erwartet, dass `make dev` parallel läuft                                |
| K8s (lokal in Colima) | `make ingress` (einmal) | Traefik via Helm, weil Colima-k3s ohne Default-Ingress kommt            |
|                       | `make images`           | Baut alle drei Container-Images direkt in den Colima-Daemon (`:dev`)    |
|                       | `make k8s-secrets`      | Zieht AWS-Creds via aws-CLI live, schreibt sie als Secret in beide NS   |
|                       | `make k8s-public/dev`   | Deployt Stack pro Namespace (Kustomize-Overlays)                        |

**Einzelner E2E-Test** (in `projects/e2e-tests/`):

```sh
pnpm --filter e2e-tests exec playwright test tests/language-switcher.spec.ts
pnpm --filter e2e-tests exec playwright test -g "Klick DE"
```

## Was nicht im Code steht, aber wichtig ist

- **AWS-Credentials werden NIE in `.env` gepflegt** — sowohl `make dev-api` als auch `make k8s-secrets` ziehen sie live via `aws configure export-credentials`. `projects/api/.env` enthält nur `AWS_REGION` und `BEDROCK_MODEL_ID` (beide haben Defaults in `application.yml`).
- **Bedrock-Modell muss ein EU-Inference-Profile sein** (Präfix `eu.`, z. B. `eu.anthropic.claude-haiku-4-5-20251001-v1:0`). Direkte Modell-IDs scheitern in `eu-central-1` mit `ValidationException`. Die `model-access` muss in der AWS-Console für das Modell separat aktiviert sein.
- **Dev-only Bridge `window.__i18n`** in `projects/web-ui/src/i18n/i18n.ts` ist absichtlich da — sie treibt die Playwright-Diagnose-Spec (`projects/e2e-tests/tests/diagnose-i18n-events.spec.ts`). `process.env.NODE_ENV !== "production"`-Guard tree-shaket sie im Prod-Build raus.
- **i18next-Snapshot liest `i18n.language`, nicht `i18n.resolvedLanguage`**. Das war ein Bug-Hunt — `resolvedLanguage` reflektiert den Fallback, nicht die gewählte Sprache, und blieb damit konstant.
- **Selektoren mit `getByRole("button", { name: "EN" })` brauchen `exact: true`**, weil Next-Dev-Tools-Buttons („Op**en**...") sonst matchen.
- **Postgres-StatefulSet hat _kein_ `storageClassName` mehr** — Cluster-Default greift (Colima: `local-path`, GKE: `standard`). Explizites `storageClassName: standard` brach Colima.
- **K8s-Probes der Next-Apps sind TCP, nicht HTTP** — die Admin-Seite ist Server Component und macht einen API-Fetch beim Render. HTTP-Probe auf `/` hätte den UI-Pod an den API-Status gekoppelt.

## Weiterführende Doku

- `README.md` — Setup, Dev-Loop, K8s-Workflow, Troubleshooting (Bedrock-Setup, FritzBox-DNS-Rebind, etc.).
- `features/` — chronologische Feature-Docs mit Designentscheidungen und „Umsetzungsstand"-Sektion pro Iteration. Das ist die Quelle für „warum haben wir das so gebaut".
- `material/architecture.plantuml` — Architektur-Diagramm-Quelle (PNG ist im README eingebunden).
- `projects/web-ui/AGENTS.md` — verbindlicher Hinweis zum Next.js-16-Breaking-Change-Stand.
