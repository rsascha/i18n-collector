# Feature: Admin-UI `/i18n` in eigenes Workspace-Projekt auf Port 3001 trennen

## Kontext
Anschluss an [2026-05-21-i18n-e2e.md](2026-05-21-i18n-e2e.md), letzte Folge-Iteration „`/i18n`-Adminseite + AI-Provider via Bedrock", sowie an [2026-05-22-pending-for-target-locales.md](2026-05-22-pending-for-target-locales.md).

Heute sind in `projects/web-ui` zwei semantisch sehr unterschiedliche Bereiche unter einer Next.js-App vereint:

- **`http://localhost:3000/`** — die i18n-Konsumenten-Seite (Demo): nutzt `react-i18next` + i18next-http-backend, rendert per `t(key, defaultValue)` übersetzte Strings und triggert dadurch den missing-key-Fan-out im API.
- **`http://localhost:3000/i18n`** — die Admin-Übersicht aller `translations`: Server Component mit Tabelle, Edit-/Delete-/Auto-Translate-Buttons. Nutzt selbst kein i18n.

Beides teilt sich heute:
- denselben Next-Server (`pnpm --filter web-ui dev`),
- denselben React-Provider-Baum (`I18nProvider` in `layout.tsx`),
- dasselbe Bundle (alle Admin-Client-Components fliegen mit, auch wenn der User nur die Demo lädt).

## Ziel dieser Iteration
Die beiden Konzerne sauber trennen:

- `http://localhost:3000/` bleibt unverändert in `projects/web-ui` (Demo-/Consumer-App).
- `http://localhost:3000/i18n` wandert nach **`projects/web-ui-i18n`** und wird zu **`http://localhost:3001/`** (eigene Root-Route).

Damit ist die Admin-UI eine eigenständige Anwendung mit eigenem Lifecycle, eigenem Bundle, und ohne `react-i18next`-Abhängigkeit. Die Demo-App wird schlanker (keine Admin-Routen mehr im Bundle).

## Scope dieser Iteration

### Neu: `projects/web-ui-i18n`
1. **Eigenständige Next.js-App** im pnpm-Workspace, Port `3001` (`next dev -p 3001`).
2. **Übernommen aus `projects/web-ui`**:
   - `src/app/i18n/page.tsx` → wird zur neuen Root-Route `src/app/page.tsx`.
   - `src/app/i18n/{DeleteKeyButton,EditableValueCell,TranslateButton}.tsx` → ohne Pfadänderung auf `src/app/`.
   - `src/app/api/i18n/translations/route.ts` (GET-Liste).
   - `src/app/api/i18n/translations/[id]/route.ts` (PATCH/DELETE).
   - `src/app/api/i18n/translations/[id]/translate/route.ts` (POST Bedrock-Translate).
3. **Schlankes Setup** ohne i18n-Stack: kein `I18nProvider`, kein `react-i18next`, kein `i18next-http-backend`. Die Admin-Seite enthält keine `t()`-Aufrufe.
4. **Infrastruktur-Files** aus `projects/web-ui` 1:1 übernommen, soweit semantisch identisch: `next.config.ts` (mit `reactCompiler: true`), `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `globals.css`, `.gitignore`, `.env.example` (`API_BASE_URL=http://localhost:8080`).

### Geändert: `projects/web-ui`
- `src/app/i18n/`-Verzeichnis vollständig löschen.
- `src/app/api/i18n/translations/`-Verzeichnis vollständig löschen.
- **Bleibt drin**: `src/app/api/i18n/[lng]/[ns]/route.ts` — das ist der Proxy, den `i18next-http-backend` aus dem Client für `loadPath`/`addPath` aufruft. Gehört zur Demo-Seite.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/i18n/i18n.ts`, `src/i18n/I18nProvider.tsx` bleiben unverändert.

### Geändert: Root-Setup
- `pnpm-workspace.yaml` — `projects/web-ui-i18n` ergänzen.
- `package.json` (root) — neues Script `dev:web-i18n`, optional `build:web-i18n` und `lint:web-i18n`.
- `Makefile` — `dev`-Target nutzt `$(MAKE) -j3 dev-api dev-web dev-web-i18n`, neues Target `dev-web-i18n`, `build` zieht den neuen Build mit, `clean` entfernt `projects/web-ui-i18n/.next` + `tsbuildinfo`.

### Unverändert: `projects/api`
- Spring-API muss nicht angefasst werden. Der Admin-Proxy in der neuen App fetcht aus den Route-Handlern server-side gegen `${API_BASE_URL}/i18n/...` — gleiche Strategie wie heute. CORS bleibt aus, weil der Browser immer nur same-origin gegen die jeweilige Next-App spricht.

### Unverändert: `projects/e2e-tests`
- Bestehende Tests (`language-switcher.spec.ts`, `diagnose-i18n-events.spec.ts`) zielen ausschließlich auf `http://localhost:3000/` — die Demo-Seite — und sind nicht betroffen.
- Folge-Tests für die Admin-UI (jetzt `http://localhost:3001/`) sind weiterhin offen (siehe „Offene Folgepunkte").

## Abnahme
1. `make dev` startet API + web-ui (`:3000`) + web-ui-i18n (`:3001`) parallel ohne Fehler.
2. `http://localhost:3000/` rendert die Demo-Seite mit dem Sprachumschalter wie bisher; Browser-Network-Tab zeigt weiterhin `GET /api/i18n/en/common` (in web-ui :3000).
3. `http://localhost:3000/i18n` liefert 404 (Route existiert nicht mehr).
4. `http://localhost:3001/` zeigt die Admin-Tabelle aller `translations` (Source-Badges, Auto-Translate-, Edit-, Delete-Buttons).
5. Auf `:3001`:
   - Edit-Save schreibt durch (PATCH).
   - Delete-Button entfernt die Zeile (DELETE).
   - Auto-Translate auf einer PENDING-Zeile setzt sie auf AI (POST `/translate`).
6. `pnpm exec tsc --noEmit` und `pnpm lint` für beide Web-Projekte grün.

## Entscheidungen aus dem Ask-Before-Development-Lauf
- **API-Anbindung**: Proxy-Routen klonen. Die drei `translations[/*]`-Route-Handler ziehen mit in `web-ui-i18n` um. Same-origin im Browser, kein CORS nötig, kein API-Base-URL im Client-Bundle. Code-Duplikat zum `web-ui` ist auf eine einzige Route (`[lng]/[ns]`) beschränkt — vertretbar.
- **Dev-Workflow**: `make dev` startet alle drei Prozesse (`-j3`). Konsistent zum heutigen Pattern (API + UI in einem Kommando), e2e-Tests sehen beide Apps gleichzeitig.
- **i18n-Stack in der Admin-UI**: nein, schlankes Setup. `react-i18next`/`i18next`/`i18next-http-backend` werden nicht mitkopiert. Provider entfällt, `layout.tsx` bleibt ein minimaler RootLayout. Falls die Admin-UI später selbst lokalisiert werden soll, lässt sich der Stack pro forma in der getrennten App nachrüsten — vorerst gilt: Englisch reicht.

## Designentscheidungen
- **Eigene Workspace-App statt Multi-Zone / `basePath`**: Next.js böte Multi-Zones, um zwei Apps unter einem Host zu mischen. Für unser Setup wäre das Overhead (Zone-Config, Routing-Conflicts). Zwei voneinander unabhängige Apps auf zwei Ports sind transparenter und passen besser zur „Konsument vs. Admin"-Aufteilung.
- **Root-Route `/` statt erneut `/i18n/`**: die User-Intention ist `:3001/` als alleiniges Tor zur Admin-UI. Eine Doppel-Verschachtelung `:3001/i18n/` wäre redundant — der Port macht den Kontext klar.
- **`API_BASE_URL` per `.env`** auch im neuen Projekt, identische Konvention wie in `web-ui`. Nicht hartcoden, damit Prod-/Stage-Deploys ohne Code-Änderung möglich bleiben.
- **`reactCompiler: true` mit übernommen** für Konsistenz und die kleinen Memoization-Wins (auch wenn der React-Compiler bei der ersten Iteration für den UI-State-Bug verdächtigt wurde, hat er sich als unschuldig erwiesen, siehe [2026-05-21-i18n-e2e.md](2026-05-21-i18n-e2e.md), Z. 252).
- **Globalen `src/i18n/`-Ordner in `web-ui-i18n` nicht anlegen**: die Admin-Seite braucht weder Provider noch `i18n.ts`. Bei späterem Bedarf nachrüstbar.

## Was NICHT in dieser Iteration
- Keine API-Änderung — Spring bleibt unangefasst.
- Kein neuer e2e-Test für die Admin-UI (steht aus Z. 518 der vorigen Feature-Datei ohnehin als offener Punkt).
- Kein gemeinsamer Type-/UI-Komponenten-Share zwischen `web-ui` und `web-ui-i18n`. Wenn das später nötig wird, kommt ein drittes Workspace-Package `shared-ui` o. ä.
- Kein neuer Auth-/Login-Flow für die Admin-UI. Beide Apps bleiben in Dev unauthentifiziert (wie heute).
- Kein Multi-Zone-Setup unter `:3000` — explizit anders entschieden (siehe Designentscheidungen).
- Kein gemeinsames Tailwind-Theme-Sharing. Beide Projekte halten ihr `globals.css` lokal — Drift ist akzeptiert (zwei Files mit denselben paar Zeilen).

## Offene Folgepunkte (außerhalb dieser Iteration)
1. **e2e-Test für die Admin-UI** (`:3001`) — Edit, Delete, Auto-Translate-Flow abdecken. Wahrscheinlich braucht es Mocking der Spring-API für den Bedrock-Translate-Schritt, sonst sind Test-Runs ohne AWS-Creds nicht reproduzierbar.
2. **Shared `TranslationDto`-Typ** — heute lokal definiert in `page.tsx` der Admin-UI; falls in der Demo-Seite mal jemand das DTO konsumieren will, lohnt ein dritter Workspace-Eintrag.
3. **Admin-UI absichern** — bislang offen für jeden, der auf `:3001` zugreifen kann. Bei Deploys kein Thema, bei lokalen Dev-Setups irrelevant; bei einem öffentlichen Stage-Deployment muss Auth davor.
4. **Bundle-Größen-Vergleich** — Demo-Seite sollte messbar schlanker sein als heute, weil der Admin-Tree-Code rausfällt. Sinnvoller Nebenschritt, falls die Bundle-Sizes mal in einen CI-Check fließen.

---

## Umsetzungsstand (Stand 2026-05-22)

### Neu / Geändert

#### Neu: `projects/web-ui-i18n/`
- `package.json` — name `web-ui-i18n`, `next dev -p 3001`, `next start -p 3001`. Dependencies: nur `next`, `react`, `react-dom` (kein `i18next`/`react-i18next`/`i18next-http-backend`).
- `next.config.ts` — `reactCompiler: true`, sonst nichts.
- `tsconfig.json` / `eslint.config.mjs` / `postcss.config.mjs` / `.gitignore` / `.env.example` — wortgleich aus `projects/web-ui` übernommen.
- `src/app/layout.tsx` — minimal: Geist-Fonts, `globals.css`, kein `I18nProvider`. Title `"i18n Admin"`.
- `src/app/globals.css` — Tailwind v4 + Theme-Variablen wie in `web-ui`.
- `src/app/page.tsx` — verschoben aus `projects/web-ui/src/app/i18n/page.tsx` (Server Component, Tabelle).
- `src/app/{DeleteKeyButton,EditableValueCell,TranslateButton}.tsx` — verschoben aus `projects/web-ui/src/app/i18n/`. Import-Pfade bleiben relativ zur selben Directory, kein Pfad-Refactor nötig.
- `src/app/api/i18n/translations/route.ts` (GET-Liste), `[id]/route.ts` (PATCH/DELETE), `[id]/translate/route.ts` (POST) — verschoben aus `projects/web-ui/src/app/api/i18n/translations/`. `RouteContext<"/api/i18n/translations/[id]">`-Strings unverändert korrekt, weil der API-Pfad gleich blieb.
- `public/` — SVGs aus `web-ui` kopiert (file/globe/next/vercel/window).
- `src/app/favicon.ico` — kopiert aus `web-ui`.

#### `projects/web-ui/`
- `src/app/i18n/` — gelöscht (war nach den `git mv`s leer).
- `src/app/api/i18n/translations/` — gelöscht (komplett umgezogen).
- **Bleibt drin**: `src/app/api/i18n/[lng]/[ns]/route.ts` (i18next-http-backend-Proxy), `src/i18n/{i18n.ts,I18nProvider.tsx}`, `src/app/{layout,page,globals.css}.tsx`.

#### Root
- `pnpm-workspace.yaml` — `projects/web-ui-i18n` ergänzt.
- `package.json` — neue Scripts `dev:web-i18n`, `build:web-i18n`, `lint:web-i18n`.
- `Makefile`:
  - `dev` → `$(MAKE) -j3 dev-api dev-web dev-web-i18n` (vorher `-j2`).
  - neues Target `dev-web-i18n` → `pnpm --filter web-ui-i18n dev`.
  - neues Target `build-web-i18n`; `build` zieht es mit.
  - `lint` läuft jetzt über beide Web-Projekte.
  - `clean` räumt zusätzlich `projects/web-ui-i18n/.next` + `tsbuildinfo` weg.

### Umsetzungs-Stolpersteine (zur späteren Referenz)

1. **`git mv`-Verschachtelung beim Verzeichnis-Umzug**: weil das Ziel-Directory `projects/web-ui-i18n/src/app/api/i18n/translations/` vor dem Move bereits angelegt war (durch `mkdir -p` für das gesamte API-Tree), packte `git mv` die Quelle als Unter-Directory hinein (`translations/translations/`, dann `[id]/[id]/`, dann `translate/translate/`). Lösung: drei Folge-`git mv`s, um die Schachtelung wieder aufzulösen, plus `rmdir` der Zwischen-Ordner. Lehre: vor `git mv <dir> <dir>` darf das Ziel _nicht_ existieren, sonst landet die Quelle eine Ebene tiefer.
2. **`RouteContext`-Typ fehlte initial im neuen Projekt**: `tsc --noEmit` warf `Cannot find name 'RouteContext'`, weil Next-16-Routen-Typen erst beim `next dev`/`next build`/`next typegen` in `.next/types/` generiert werden. Lösung: einmalig `pnpm exec next typegen` im neuen Projekt — danach grün. Hätte sonst beim ersten `make dev` automatisch funktioniert; nur das pre-dev-Build-Check brauchte den Schritt.

### Build-Status
- `pnpm install` → grün (2 neue Packages für `web-ui-i18n` aus dem geteilten Store).
- `pnpm exec next typegen` in `web-ui-i18n` → grün.
- `pnpm exec tsc --noEmit` in beiden Web-Projekten → grün.
- `pnpm lint` in beiden Web-Projekten → grün.

### Designentscheidungen (Nachtrag)
- **Identische `next start -p 3001`-Konfig**: Prod-Start im neuen Projekt erbt den Port aus dem Dev-Script, damit kein „funktioniert in Dev, aber Prod hört auf 3000"-Drift entsteht.
- **Kein `pnpm-lock.yaml`-Eintrag pro Projekt**: nur die Root-Lockfile wird gepflegt — pnpm-Workspace-Standard, mit minimalem Diff (2 hinzugefügte Workspace-Pakete im Lockfile-Manifest).
- **Favicon mitkopiert statt symlinken**: minimaler Speicherbedarf, und beide Apps können später eigene Favicons haben (Admin vs. Demo).

### Abnahme — bestätigt ✅

Live durchgespielt am 2026-05-22 nach `make dev`:
- `http://localhost:3000/` zeigt unverändert die Demo-Seite mit Sprachumschalter EN/DE — i18next-Backend-Proxy auf `/api/i18n/{lng}/{ns}` arbeitet wie zuvor.
- `http://localhost:3000/i18n` liefert 404 — Route existiert nicht mehr in `web-ui`.
- `http://localhost:3001/` zeigt die Translations-Tabelle mit Edit-/Delete-/Auto-Translate-Buttons und korrekten Source-Badges.
- Edit (PATCH), Delete (DELETE) und Auto-Translate (POST `/translate`) auf `:3001` schreiben durch und triggern `router.refresh()` korrekt — Tabelle aktualisiert sich.

### Aus dem Original-Scope jetzt erledigt
- ✅ Admin-UI als eigenständiges Workspace-Projekt auf Port 3001.
- ✅ Demo-Seite (`:3000/`) bleibt unverändert funktionsfähig.
- ✅ `/i18n`-Route aus `web-ui` vollständig entfernt.
- ✅ Translations-Proxy-Routen vollständig in `web-ui-i18n` migriert.
- ✅ Schlanker Admin-Stack ohne `react-i18next`/`I18nProvider`.
- ✅ `make dev` startet alle drei Prozesse parallel (`-j3`).
- ✅ Beide Build-Checks (tsc + lint) grün.

### Offene Folgepunkte (übernommen aus oben, jetzt mit Stand)
1. **e2e-Test für `:3001`** — weiterhin offen, kein Test in dieser Iteration geschrieben. Bedrock-Mocking nach wie vor der Knackpunkt.
2. **Shared `TranslationDto`-Typ** — weiterhin lokal in `web-ui-i18n/src/app/page.tsx` definiert; in der Demo-Seite (`web-ui`) wird das DTO nicht konsumiert.
3. **Auth vor `:3001`** — bleibt offen für die Stage-/Prod-Iteration.
4. **Bundle-Größen-Vergleich** — nicht durchgeführt; Demo-Seite ist subjektiv schneller geladen, aber kein gemessener Baseline-Wert. Nachholbar via `next build`-Output beider Projekte, sobald CI das ohnehin misst.