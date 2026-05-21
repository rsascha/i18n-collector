# Projekt: i18n Auto-Translation API

## Stack
- Spring Boot 4.0.6, Java (aktuelle LTS), Maven
- PostgreSQL (lokal via Docker Compose)
- AWS Bedrock (Anthropic Claude) für KI-Übersetzungen via Spring AI

## Ziel der API
REST API, die:
1. Übersetzungen für i18n-Keys aus einer DB-Tabelle ausliefert (`GET /api/translations/{locale}/{key}`)
2. Fehlt ein Key in einer Locale, wird er automatisch via AWS Bedrock übersetzt und gespeichert
3. Eine eigene `MessageSource`-Implementierung liefert (DB-basiert, mit Caffeine-Cache), damit Spring-`@RequestMapping`-Code wie gewohnt `MessageSource` injecten kann

## Vorhandene Dependencies in pom.xml (bitte prüfen)
- spring-boot-starter-web, -data-jpa, -validation
- spring-boot-devtools, lombok
- postgresql, flyway-core
- spring-ai-starter-model-bedrock-converse (Amazon Bedrock Converse)

## Bitte ergänzen in pom.xml
- `springdoc-openapi-starter-webmvc-ui` (Swagger UI)
- `spring-boot-starter-cache`
- `com.github.ben-manes.caffeine:caffeine`
- `org.testcontainers:postgresql` (scope test)
- `org.testcontainers:junit-jupiter` (scope test)

## Erste Aufgabe (NUR diese, danach Stopp & Rückfrage)

1. **`compose.yaml`** im Projekt-Root anlegen mit einem PostgreSQL-Service (Port 5432, DB-Name `translations`, User/Pass per ENV-Var, Volume für Daten).
2. **`application.properties` → `application.yml` umbenennen** und konfigurieren:
    - Datasource (PostgreSQL, URL/User/Pass aus ENV, mit `.env`-Hinweis)
    - JPA: `ddl-auto: validate` (Schema wird von Flyway gemanagt), `show-sql: true` in dev
    - Logging-Level der eigenen Package auf `DEBUG`
    - Platzhalter für AWS Bedrock: Region (`eu-central-1`) und Model-ID (`anthropic.claude-3-5-sonnet-20241022-v2:0`)
3. **Erste Flyway-Migration** unter `src/main/resources/db/migration/V1__create_translations_table.sql`:
    - `id BIGSERIAL PK`
    - `message_key VARCHAR(255) NOT NULL`
    - `locale VARCHAR(10) NOT NULL`
    - `value TEXT NOT NULL`
    - `source VARCHAR(20) NOT NULL` (Werte: `MANUAL` oder `AI`)
    - `created_at TIMESTAMP NOT NULL DEFAULT now()`
    - `updated_at TIMESTAMP NOT NULL DEFAULT now()`
    - `UNIQUE(message_key, locale)`
    - Index auf `(locale, message_key)`
4. **JPA-Entity `Translation`** für diese Tabelle anlegen (mit Lombok `@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder`, `@PrePersist`/`@PreUpdate` für Timestamps, Enum `TranslationSource`).

## Was du NICHT machen sollst
- Keine Controller, keine Services, keine MessageSource-Implementierung, keine Bedrock-Calls – das kommt im nächsten Schritt.
- Keine eigenen Tests schreiben.
- Keinen Code „auf Vorrat" anlegen.

Erkläre am Ende kurz auf Deutsch, was du gemacht hast, und liste die geänderten/erstellten Dateien.

---

## Umsetzungsstand (Stand 2026-05-21)

### Projektpfade
- Maven-Projekt-Root: `projects/api/`
- Java-Package-Wurzel: `de.actyvyst.api`
- Feature-Package für i18n: `de.actyvyst.api.translation`

### Stack / Versionen (festgenagelt)
- Spring Boot **4.0.6**, Spring AI **2.0.0-M6**
- Java **25** (aktuelle LTS) — Build-Tool ist Java-25-empfindlich, siehe „Offene Punkte"
- Maven Wrapper (`./mvnw`)
- springdoc-openapi **2.8.13** — siehe „Offene Punkte"
- Testcontainers **1.20.4** (per eigenem BOM in `dependencyManagement`)

### Schritt 1 — Erledigt ✅

#### pom.xml ergänzt

- `spring-boot-starter-cache` (compile) — Version aus Spring Boot BOM
- `com.github.ben-manes.caffeine:caffeine` (compile) — Version aus Spring Boot BOM
- `org.springdoc:springdoc-openapi-starter-webmvc-ui` (compile) — explizit `${springdoc.version}` = `2.8.13`
- `org.testcontainers:postgresql` (test) — Version aus Testcontainers BOM
- `org.testcontainers:junit-jupiter` (test) — Version aus Testcontainers BOM

Zusätzlich: `java.version` 17 → 25, Testcontainers-BOM in `dependencyManagement` ergänzt.

#### Neu / Geändert
- `projects/api/compose.yaml` — Postgres 17-alpine, Port 5432, DB/User/Pass via `${DB_*}` mit Default `translations`, Volume `translations_data`, Healthcheck mit `pg_isready`.
- `projects/api/.env.example` — Vorlage für `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `AWS_REGION`, `BEDROCK_MODEL_ID` (+ auskommentierte AWS-Credentials).
- `projects/api/.gitignore` — `.env`, `.env.local` ergänzt.
- `projects/api/src/main/resources/application.yml` — ersetzt `application.properties`. Enthält: Datasource aus ENV, `jpa.hibernate.ddl-auto=validate`, `show-sql=true` + `format_sql=true`, `logging.level.de.actyvyst.api=DEBUG`, Spring-AI-Bedrock-Region/-Model, `springdoc.swagger-ui.path=/swagger-ui.html`.
- `projects/api/src/main/resources/db/migration/V1__create_translations_table.sql` — Tabelle gemäß Spec inkl. `UNIQUE(message_key, locale)`, Index `idx_translations_locale_key` auf `(locale, message_key)` und `CHECK (source IN ('MANUAL','AI'))`.
- `projects/api/src/main/java/de/actyvyst/api/translation/TranslationSource.java` — Enum `MANUAL`, `AI`.
- `projects/api/src/main/java/de/actyvyst/api/translation/Translation.java` — JPA-Entity (`jakarta.persistence`), Lombok-Annotationen wie spezifiziert, `Instant`-Timestamps via `@PrePersist`/`@PreUpdate`.

#### Gelöscht
- `projects/api/src/main/resources/application.properties`

#### Build-Status
- `JAVA_HOME=$(/usr/libexec/java_home -v 25) ./mvnw compile` → erfolgreich (nur Lombok-`Unsafe`-Deprecation-Warnings, unkritisch).

### Designentscheidungen (zur späteren Referenz)
- **Package-Layout**: Feature-first (`de.actyvyst.api.translation`) statt schichten-first (`…domain.entity` etc.).
- **DB-Default-Credentials**: `translations` / `translations` / `translations` für reibungslosen lokalen Dev-Start. Über `.env` überschreibbar.
- **`.env`-Strategie**: `.env.example` im Repo, `.env` ignored. Wird von `docker compose` automatisch geladen; für `./mvnw spring-boot:run` muss der Dev die Datei sourcen (Hinweis im Kopf der `application.yml`).
- **Bedrock-Credentials**: Nicht in `application.yml`. AWS-Default-Credential-Provider-Chain (Profil / ENV / Instance-Role).
- **`show-sql=true`** ist global gesetzt (Dev-Default). Für Prod ggf. später per Profile überschreiben.
- **`source`-Spalte**: zusätzlich zu `VARCHAR(20)` ein `CHECK`-Constraint — defensiv, weil die Werte zum Enum spiegeln müssen.

### Offene Punkte / Rückfragen an den User
1. **Shell-Java**: `java -version` im User-Shell ist 17 (`/opt/homebrew/Cellar/openjdk@17/...`). Java 25 liegt unter `/opt/homebrew/Cellar/openjdk/25.0.2`. Für Build/Run aktuell nötig: `export JAVA_HOME=$(/usr/libexec/java_home -v 25)`. Soll ich `.tool-versions` / `mise.toml` / IntelliJ-SDK setzen, oder lässt der User das selbst?
2. **springdoc-Kompatibilität**: 2.8.x ist offiziell für Spring Boot 3.x. Mit Spring Boot 4.0.6 läuft die Compile-Phase; Laufzeitverhalten beim ersten Swagger-Aufruf noch nicht verifiziert. Falls Probleme: auf einen neueren Release ziehen.
3. **Package-Layout** bestätigt? `de.actyvyst.api.translation` ist gewählt — alternativ ginge `…domain.translation` oder `…model.translation`.

### Nächster Schritt (laut Spec: erst nach Rückfrage)
Voraussichtlich (zur Erinnerung — nicht ausführen, bis User freigibt):
- `TranslationRepository` (Spring Data JPA) mit Lookup nach `(messageKey, locale)`.
- Service-Layer mit Bedrock-Übersetzung bei fehlendem Key.
- REST-Controller `GET /api/translations/{locale}/{key}`.
- DB-basierte `MessageSource`-Implementierung mit Caffeine-Cache.

### Wichtige Verhaltensregeln aus der Spec (für Folge-Iterationen)
- **„NUR diese Aufgabe, danach Stopp & Rückfrage"** — nach jedem Block stoppen und auf User-Freigabe warten.
- **Keine Tests** schreiben (bis explizit verlangt).
- **Kein Code „auf Vorrat"** — nur was die aktuelle Teilaufgabe verlangt.
- **Keine Controller/Services/MessageSource/Bedrock-Calls** in Schritt 1.