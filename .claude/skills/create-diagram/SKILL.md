---
name: create-diagram
description: Erstellt PlantUML-Diagramme im `material/`-Ordner mit projekteigenem Style (handwritten + Blau-Theme), rendert sie per Makefile-Target zu PNG und fragt den User explizit, ob das PNG in die README eingebaut werden soll. Invoke this skill, wenn ein Architektur-, Sequenz- oder Setup-Diagramm gewünscht ist.
---

# Create diagram

Ziel: Diagramme reproduzierbar in `material/` ablegen, konsistent stylen, automatisch rendern und nur dann in die README einbinden, wenn der User das aktiv bestätigt.

## Wann ausführen

- Wenn der User um ein Diagramm bittet (Architektur, Sequenz, Setup, Datenfluss, etc.).
- Wenn ein bestehendes Diagramm in `material/` aktualisiert werden soll.
- **Nicht ausführen**, wenn der User explizit ASCII-Art im Markdown will oder das Diagramm nur als temporäre Skizze in einer Antwort gemeint ist.

## Ablauf

### 1. PlantUML-Quelle in `material/` anlegen

- Dateiname: `material/<kebab-name>.plantuml` (z. B. `architecture.plantuml`, `k8s-setup.plantuml`, `auth-flow.plantuml`).
- **Verbindlicher Config-Block** am Anfang jeder Datei (siehe „Pflicht-Konfiguration" unten).
- Sprechende Titelzeile, deutsche Beschriftungen passend zum Projekt-Stil.

### 2. PNG rendern

```sh
make -C material build-pngs
```

Das Target macht zwei Dinge:
1. Rendert _alle_ `.plantuml`-Dateien in `material/` zu `.png` (Pattern-Rule, nur Änderungen werden neu gerendert).
2. Berechnet pro PNG einen Content-Hash (SHA-256, erste 8 Zeichen) und stempelt ihn als `?v=<hash>`-Query an die Image-Referenzen im Root-README. **Wichtig für GitHub**: ohne diesen Cache-Buster cached der Camo-Proxy alte Bilder, und Reader sehen nicht den aktuellen Stand. Mit Hash-Query ändert sich die URL bei jeder Bild-Änderung → frischer Fetch.

Es lebt in `material/Makefile`, damit nicht das Root-Makefile mit Diagramm-Targets aufgebläht wird.

Voraussetzung: `plantuml` ist installiert (`brew install plantuml`).

Nach dem Render `Read`-Tool nutzen, um das PNG anzuschauen und visuell zu verifizieren, dass das Diagramm korrekt aussieht (Pfeile, Labels, Cluster-Boundaries lesbar).

### 3. README-Einbau — IMMER vorher fragen

**Bevor du das PNG in die README einfügst, frag den User**. Nutze `AskUserQuestion` mit einer Ja/Nein-Entscheidung. Default: nicht einbauen — der User soll aktiv „ja" sagen.

Frageformat:

> Soll ich `material/<name>.png` in die README einbauen?

Optionen:

- **Ja, in Abschnitt X** — Diagramm landet unter der passenden README-Sektion (z. B. `## Architektur`, `## Kubernetes`).
- **Nein, nur in `material/` lassen** — User behält die Datei zur freien Verwendung.

### 4. README-Einbau (nur wenn User „Ja" sagt)

Pattern, das bereits im Repo etabliert ist:

```markdown
![Beschreibung](material/<name>.png)

Quelle: [`material/<name>.plantuml`](material/<name>.plantuml) — neu rendern via `make -C material build-pngs` (aktualisiert auch den `?v=<hash>`-Cache-Buster in dieser README).
```

Den `?v=<hash>`-Cache-Buster NICHT manuell setzen — das macht `build-pngs` automatisch beim nächsten Render. Beim Einbau eines neuen Bildes reicht die schmucklose `material/<name>.png`-Referenz; der nächste `make build-pngs`-Lauf injiziert den Hash.

Direkt unter die passende Section-Überschrift packen, _bevor_ Erklärungstext und Code-Blöcke folgen — das Diagramm dient als visueller Anker.

## Pflicht-Konfiguration

Jede neue `.plantuml`-Datei beginnt mit diesem Header (vor Inhaltsdefinitionen, nach `@startuml`):

```plantuml
@startuml <name>
title <Titel>

!option handwritten true

skinparam NoteBackgroundColor   #266196
skinparam NoteBorderColor       #4196f6
skinparam NoteFontColor         white
skinparam NoteFontName          Courier
skinparam Shadowing             false
skinparam TitleFontColor        #266196

skinparam sequence {
    ActorBackgroundColor        #266196
    ActorBorderColor            #266196
    ActorFontColor              #266196
    ArrowColor                  #266196
    ArrowFontColor              black
    LifeLineBorderColor         #266196
    ParticipantBackgroundColor  #266196
    ParticipantBorderColor      #4196f6
    ParticipantFontColor        white
}
```

- `!option handwritten true` aktiviert den Hand-Skizzen-Look. Charakteristisches Merkmal des Projekt-Stils.
- Blau-Theme (`#266196` Dunkelblau, `#4196f6` Hellblau) für Notes, Titel und Sequence-Diagramme.
- Andere Diagramm-Typen (Component, Use Case, etc.) brauchen ggf. eigene Farb-skinparams — der Header oben legt nur Notes/Title/Sequence fest, weitere Anpassungen pro Diagramm sind erlaubt.

## Bestehende Diagramme als Referenz

- `material/architecture.plantuml` — Gesamtstack-Diagramm (Browser → Web-UIs → API → DB + Bedrock).
- `material/k8s-setup.plantuml` — Kubernetes-Topologie mit Namespaces und Ingress-Routing.

Beide sind im README eingebunden und zeigen das Stil-Pattern.

## Was nicht tun

- **Nicht** `plantuml -tpng <file>` direkt aufrufen — immer über `make -C material build-pngs`, damit der Workflow reproduzierbar bleibt.
- **Nicht** PNGs ohne PlantUML-Quelle ablegen — die Quelle ist Single-Source-of-Truth.
- **Nicht** den Config-Block weglassen oder verändern, ohne Rücksprache — der Stil ist projektweit konsistent.
- **Nicht** das PNG eigenmächtig in die README einbauen — immer erst die Bestätigungsfrage stellen.
- **Nicht** das Root-Makefile mit Diagramm-Targets erweitern — bleibt in `material/Makefile`.
