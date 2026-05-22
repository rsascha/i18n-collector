# Feature: PENDING-Einträge für Ziel-Locales automatisch beim missing-key-Report erzeugen

## Kontext
Anschluss an [2026-05-21-i18n-e2e.md](2026-05-21-i18n-e2e.md), insbesondere die letzte Iteration „`/i18n`-Adminseite + AI-Provider via Bedrock".

## Problem (heute live beobachtet)
Beim Hinzufügen von `<p>{t("anotherTest", "This is just another test!")}</p>` in `projects/web-ui/src/app/page.tsx` (Browser-Sprache `en`) ist nur **eine** Zeile in der DB angekommen:

```
 id | message_key | locale | value                      | source
----+-------------+--------+----------------------------+--------
  8 | anotherTest | en     | This is just another test! | MANUAL
```

Eine `de/anotherTest`-Zeile existiert nicht. Auf `http://localhost:3000/i18n` taucht der Key also nur einmal auf (EN/MANUAL), es gibt **nichts zu übersetzen** — obwohl wir genau das gerne hätten.

Ursache liegt im aktuellen `TranslationService.recordMissingKeys`-Flow:
- i18next-http-backend POSTet missing-keys nur an die Locale, die gerade aktiv ist (`/api/i18n/en/common`).
- Der Service legt für `lng=en` eine MANUAL-Zeile an, für `lng != en` eine PENDING-Zeile.
- Andere `supportedLngs` werden **gar nicht** berührt, weil i18next sie nicht abfragt, solange niemand zu ihnen wechselt.

Ergebnis: PENDING-Zeilen entstehen nur, wenn ein User die Sprache aktiv umschaltet und dadurch dort einen Miss produziert. In einem EN-only-Workflow (Entwickler tippt englische Strings, deployt, Übersetzungen kommen später nach) wäre das die falsche Reihenfolge.

## Ziel dieser Iteration
Bei einem missing-key-Report für die **Source-Locale** (`en`) sollen **gleichzeitig PENDING-Einträge für alle anderen `supportedLngs`** angelegt werden. So ist jeder neue Key sofort in `/i18n` als „bereit zum Auto-Übersetzen" sichtbar.

Konkret: nach `POST /i18n/en/common` mit `{"anotherTest":"This is just another test!"}` soll die DB zwei Zeilen enthalten:
```
 id | message_key | locale | value                      | source
----+-------------+--------+----------------------------+---------
  8 | anotherTest | en     | This is just another test! | MANUAL
  9 | anotherTest | de     | This is just another test! | PENDING
```

`de/anotherTest` hat als initial-`value` den englischen `defaultValue` — passend zum bestehenden `ON CONFLICT DO NOTHING`-Insert-Verhalten und konsistent zur missing-key-Body-Konvention aus der vorigen Iteration (siehe [2026-05-21-i18n-e2e.md](2026-05-21-i18n-e2e.md), Z. 105–118).

## Scope dieser Iteration

### `projects/api`
1. **Liste der `supportedLngs` zentral verfügbar machen** — heute hartkodiert im Web-UI (`["en", "de"]`). Die API muss diese Liste kennen, um zu wissen wofür sie PENDING-Zeilen anlegt.
2. **`TranslationService.recordMissingKeys` erweitern** — wenn `locale == SOURCE_LOCALE` (also `en`), zusätzlich für jede andere `supportedLng` einen `insertIfAbsent(..., PENDING)` triggern.
3. **Keine Schema-Änderung** — V1-V4-Migrationen bleiben unangefasst.
4. **Idempotenz bleibt erhalten** — `ON CONFLICT DO NOTHING` greift weiterhin, mehrfache missing-key-Reports erzeugen keine Duplikate.

### `projects/web-ui`
- Keine UI-Änderung nötig. Die `/i18n`-Tabelle zeigt die zusätzlichen Zeilen automatisch beim nächsten Page-Load (Server Component fetcht `no-store`).
- Optional aufzuräumen: die hartkodierte `supportedLngs`-Liste in `src/i18n/i18n.ts` und die API-Liste sollten zur Single-Source-of-Truth zusammengeführt werden. Mehr dazu unter „Offene Punkte".

### `projects/e2e-tests`
- Kein Pflicht-Test in dieser Iteration. Optional: erweitern um ein Szenario „neuer EN-Key triggert PENDING-Zeilen für alle target-locales".

## Abnahme
1. Web-UI mit Browser-Sprache `en` öffnen, ein **neues** `t("freshKey", "Fresh Value")` einfügen.
2. DB-Check: `SELECT * FROM translations WHERE message_key='freshKey'` zeigt **zwei** Zeilen (`en/MANUAL`, `de/PENDING`).
3. `http://localhost:3000/i18n` → `freshKey/de`-Zeile hat aktiven Auto-Translate-Button.
4. Button klicken → DE-Zeile wird zu `source=AI` mit deutscher Übersetzung.

## Was NICHT in dieser Iteration
- Kein Sprachumschalter-Flow (klappt schon).
- Keine Bedrock-Code-Änderung — die Übersetzung selbst läuft unverändert über den `/translations/{id}/translate`-Endpoint.
- Keine Re-Translate-Funktion für AI-Zeilen (siehe „Offene Punkte" der vorigen Iteration).
- Keine UI-Sortierung/Gruppierung — Tabelle bleibt wie sie ist.
- Kein Batch-Translate.

## Offene Punkte / vor Implementierung klären

1. **Wo lebt die `supportedLngs`-Liste in der API?** Optionen:
   - (a) `application.yml` als `app.i18n.supported-lngs: [en, de]` + `@ConfigurationProperties`-Bean.
   - (b) Eigene DB-Tabelle `locales` (overkill für 2 Werte, aber wachsen-fest).
   - (c) Ableitung aus `DISTINCT locale FROM translations` (fragil — solange noch keine Zeile existiert, weiß die API nichts).

   **Empfehlung: (a)** — kleiner Schritt, in `application.yml` versionierbar, Env-Var-overridable. (b) kann kommen, wenn wir Lokalen-Metadaten brauchen (Display-Namen, RTL-Flag etc.).

2. **Single-Source-of-Truth für `supportedLngs` zwischen Web-UI und API?** Aktuell stehen sie zweimal: in `src/i18n/i18n.ts` (i18next-Config) und müssten neu in `application.yml`. Optionen:
   - (a) Verdrahtet lassen, mit Kommentar „muss in beiden Files synchron sein" — pragmatisch für jetzt.
   - (b) API liefert die Liste über einen neuen Endpoint `GET /i18n/locales`, UI fetcht beim Init — Single-Source, aber Init-Boot wird länger.
   - (c) Build-Time-Generation: ein Script generiert `i18n.ts` aus `application.yml`. Overkill.

   **Empfehlung: (a) plus expliziter Cross-Reference-Kommentar** an beiden Stellen. Wenn die Liste wächst (>5 Locales), (b) nachziehen.

3. **Sollen PENDING-Zeilen für alle Locales oder nur für Nicht-Source-Locales angelegt werden?** Klar nur für Nicht-Source — die EN-Zeile entsteht ja sowieso als MANUAL aus dem Original-Report. Trotzdem als Frage im Doc, damit's später explizit ist.

4. **Was wenn der missing-key-Report direkt für eine Ziel-Locale kommt** (z. B. User schaltet auf DE, neuer Key → POST `/api/i18n/de/common`)? Aktuelles Verhalten:
   - `de/<key>/PENDING` wird angelegt (korrekt).
   - `en/<key>` wird **nicht** angelegt — der englische Source-Text fehlt dann.

   Soll dieser Pfad ebenfalls die EN-Source-Zeile mit anlegen (MANUAL, `value = defaultValue`)? Konsequent wäre das, weil der `defaultValue` aus dem UI immer der englische Source-Text ist (siehe Doc-Konvention Z. 165 der vorigen Feature-Datei). Aber riskant: wenn jemand mal mit deutschem `defaultValue` reportet, würde der als EN gespeichert.

   **Empfehlung: ja, EN-Zeile auch nachziehen — die Konvention sagt klar „defaultValue ist englisch".** Andernfalls hätten wir asymmetrische Fälle, je nachdem in welcher Sprache der erste Render geschah.

5. **Wann ist das `value`-Feld einer PENDING-Zeile leer vs. defaultValue?** Aktuelle Konvention: defaultValue als Platzhalter (siehe vorige Iteration). Bleibt unverändert. Erwähnt im Doc, damit's nicht in Frage gestellt wird.

6. **Race-Condition bei mehreren parallelen missing-key-Reports?** i18next-http-backend kann mehrere Misses bundeln, aber zwei verschiedene Browser-Tabs könnten parallel reporten. `ON CONFLICT DO NOTHING` + `@Transactional` decken das ab — keine Sonderbehandlung nötig.

7. **Edge Case: `recordMissingKeys` wird mit `locale = "fr"` (nicht in supportedLngs) aufgerufen.** Aktuell würde der Service blind eine `fr/PENDING`-Zeile anlegen. Soll das blockiert werden? Pragmatisch: belassen, das ist nicht im Pfad eines normalen UI-Flows. Eine 400-Response wäre defensives Tooling, das wir aktuell nicht brauchen.

## Folgearbeiten (außerhalb dieser Iteration)
- Batch-Translate-Button in `/i18n` (alle PENDING auf einmal).
- Re-Translate-Flow für AI-Zeilen.
- E2E-Test, der den kompletten Flow abdeckt (neuer Key → DB-State → Auto-Translate via UI).
- Timezone-Inkonsistenz `created_at`/`updated_at` fixen (siehe vorige Feature-Datei, „Offene Punkte" Punkt 1).

---

## Umsetzungsstand (Stand 2026-05-22)

### Entscheidungen aus dem Ask-Before-Development-Lauf
- **`supportedLngs`-Quelle**: `application.yml` + `@ConfigurationProperties` (`app.i18n.source-lng` + `app.i18n.supported-lngs`). Eine DB-Tabelle wäre overkill für 2 Werte, eine Ableitung aus `DISTINCT locale FROM translations` wäre zirkulär (kein DE in der DB → Service ignoriert DE).
- **Reverse-Symmetrie**: ja, EN-MANUAL-Zeile wird auch nachgezogen, wenn ein Report für eine Ziel-Locale kommt. Konsistent zur Konvention „`defaultValue` ist der englische Source-Text".
- **UI↔API-Sync**: beide Stellen pflegen + Cross-Reference-Kommentar. Single-Source-Endpoint (`GET /i18n/locales`) lohnt sich erst bei deutlich mehr Sprachen.

### Neu / Geändert

#### `projects/api`
- `src/main/java/de/actyvyst/api/translation/I18nProperties.java` (neu) — Record mit `sourceLng` + `supportedLngs` + Helper `targetLngs()` (filtert Source raus). Header-Doc verweist auf den Sync mit der Web-UI.
- `src/main/java/de/actyvyst/api/ApiApplication.java` — `@EnableConfigurationProperties(I18nProperties.class)` ergänzt.
- `src/main/resources/application.yml` — neuer `app.i18n`-Block mit `source-lng: en`, `supported-lngs: [en, de]` und Synchronisierungs-Kommentar.
- `src/main/java/de/actyvyst/api/translation/TranslationService.java`:
  - `SOURCE_LOCALE`-Konstante raus, `I18nProperties` per Konstruktor injiziert.
  - `recordMissingKeys(reportLocale, keysWithDefaults)` macht jetzt einen **Fan-out über alle `supportedLngs`** pro Key: Source-Locale → `MANUAL`, alle anderen → `PENDING`. Das `reportLocale`-Argument bleibt erhalten (kommt von der URL `/i18n/{lng}/{ns}`), wird aber für das Fan-out nicht mehr ausgewertet — symmetrisches Verhalten, egal welcher Browser den Report ausgelöst hat.
  - `translatePending` nutzt `i18nProperties.sourceLng()` für die Log-Zeile (statt der entfernten Konstante).

#### `projects/web-ui`
- `src/i18n/i18n.ts` — Cross-Reference-Kommentar an `supportedLngs: ["en", "de"]`, zeigt auf `projects/api/src/main/resources/application.yml#app.i18n`.

### Designentscheidungen
- **Fan-out im Service, nicht im Controller** — der Controller bleibt dünn, die Symmetrie-Logik ist im Service kapselbar und einfacher testbar (falls Tests folgen).
- **Record statt Class für `I18nProperties`** — Spring Boot 4 unterstützt Records für `@ConfigurationProperties` nativ. Immutable, kein Boilerplate, kein Lombok.
- **`targetLngs()`-Helper im Record** — wird aktuell nicht benutzt, ist aber bereit für künftige Use-Cases (z. B. „liste nur Ziel-Locales für eine Sprachauswahl-UI").
- **Fan-out auch bei wiederholten Reports** — `ON CONFLICT DO NOTHING` macht das idempotent. Eine Vorab-Existenz-Prüfung wäre redundant.

### Build-Status
- `./mvnw compile` → grün.

### Abnahme — bestätigt ✅

Live durchgespielt am 2026-05-22 nach API-Restart. Frische Keys:

| Schritt | Aktion | Ergebnis |
| --- | --- | --- |
| 1 | `POST /api/i18n/en/common {"new.symmetric.key":"New Symmetric Key"}` | HTTP 200; id=9 `en/MANUAL/"New Symmetric Key"` + id=10 `de/PENDING/"New Symmetric Key"` ✅ |
| 2 | Reverse: `POST /api/i18n/de/common {"reverse.test":"Reverse Test Value"}` | HTTP 200; id=11 `en/MANUAL/"Reverse Test Value"` + id=12 `de/PENDING/"Reverse Test Value"` ✅ |
| 3 | `POST /api/i18n/translations/10/translate` (Bedrock) | HTTP 200; `value="Neuer symmetrischer Schlüssel"`, `source=AI` ✅ |
| 4 | Idempotenz: Repeat von Schritt 1 (id=10 jetzt AI) | HTTP 200; keine Duplikate, id=10 unverändert (ON CONFLICT DO NOTHING greift) ✅ |

Daraus ablesbar:
- Fan-out funktioniert sowohl forward (EN-Report) als auch reverse (DE-Report).
- Der `defaultValue` aus dem Report-Body wird konsistent als `value` für **alle** Locale-Zeilen verwendet — bei der Source-Locale ist das der finale englische Text, bei den Target-Locales ein Platzhalter bis Bedrock übernimmt.
- AI-Zeilen werden durch Re-Reports nicht überschrieben.

### Aus dem Original-Scope jetzt erledigt
- ✅ Punkt 1 (`supportedLngs`-Quelle) → `application.yml` + `@ConfigurationProperties`.
- ✅ Punkt 2 (UI↔API-Sync) → Cross-Reference-Kommentar in beide Richtungen.
- ✅ Punkt 3 (PENDING nur für Nicht-Source) → durch die `if (lng.equals(sourceLng)) MANUAL else PENDING`-Verzweigung.
- ✅ Punkt 4 (Reverse-Symmetrie) → das `reportLocale`-Argument wird beim Fan-out ignoriert; alle Locales werden immer bedient.
- ✅ Punkt 5 (PENDING-`value` = `defaultValue`) → unverändert.
- ✅ Punkt 6 (Race-Condition) → unverändert durch `ON CONFLICT` + `@Transactional` abgedeckt.
- ✅ Punkt 7 (Edge Case unbekannte Locale) → pragmatisch durchgelassen; nur die in `supportedLngs` aufgeführten Locales bekommen Zeilen, der `reportLocale`-Wert wird nicht validiert.

### Offene Folgepunkte (außerhalb dieser Iteration)
1. **Validation der `supportedLngs`-Property** — wenn jemand `sourceLng` setzt, das nicht in `supportedLngs` enthalten ist, würde der Service stillschweigend keine MANUAL-Zeile anlegen. Eine `@PostConstruct`-Konsistenzprüfung auf der `I18nProperties` wäre eine kleine Folgemaßnahme.
2. **UI-Liste `/i18n` sortiert nach Key + Locale** — heutige Server-Component-Sortierung. Bei wachsender Anzahl könnte ein Filter (nur PENDING) hilfreich sein.
3. **Bestehende `anotherTest`-Zeile** (id=8) hat keinen `de/PENDING`-Partner — sie wurde vor dem Fan-out angelegt. Optional: ein einmaliges Backfill-Script, das für jeden Key die fehlenden Locale-Zeilen ergänzt. Alternativ: einfach mit `t("anotherTest", "...")` einen neuen Render triggern; aber das passiert nur, wenn der Key auch wirklich erneut „missed" wird (was bei vorhandener EN-Zeile nicht der Fall ist). Pragmatisch: per `curl` einen erneuten Report posten, dann zieht das Fan-out die fehlende DE-Zeile nach.
