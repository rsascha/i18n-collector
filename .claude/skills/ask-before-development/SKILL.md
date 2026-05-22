---
name: ask-before-development
description: Before starting implementation work, verify that the task is clearly described. If anything is ambiguous, ask the user one question at a time using AskUserQuestion with concrete solution options. Invoke this skill at the very start of any development task — before writing or editing code.
---

# Ask before development

Ziel: Sicherstellen, dass die Umsetzung vor dem Start der Entwicklung eindeutig beschrieben ist. Offene Punkte werden geklärt — eine Frage nach der anderen, mit konkreten Lösungsvorschlägen.

## Wann ausführen

- Am Anfang jeder Entwicklungsaufgabe, **bevor** Code geschrieben oder geändert wird.
- Auch bei scheinbar einfachen Aufgaben kurz prüfen, ob die Anforderungen wirklich klar sind.
- Nicht ausführen bei reinen Lese-/Recherche-Anfragen, Erklärungen oder trivialen Ein-Zeilen-Änderungen, deren Absicht eindeutig aus dem Kontext folgt.

## Ablauf

1. **Anforderung zusammenfassen**

   Fasse die Aufgabe in 1–3 Sätzen mit eigenen Worten zusammen. Beziehe dich auf konkrete Dateien, Komponenten oder Flows im Repo (z. B. `src/app/...`, `src/components/...`).

2. **Auf Unklarheiten prüfen**

   Gehe die Aufgabe systematisch durch und prüfe insbesondere:

   - **Scope**: Welche Dateien/Bereiche sind betroffen? Gibt es Grenzfälle, die der User vielleicht nicht bedacht hat?
   - **UI/UX**: Welcher Screen, welche Komponente, welcher User-Flow? Wo genau soll das Element platziert werden?
   - **Daten**: Woher kommen die Daten (Query/Store/Prop)? Wohin gehen sie (Mutation/State)?
   - **Verhalten**: Was passiert in Fehler-, Lade-, Empty- und Offline-Zuständen?
   - **Abhängigkeiten**: Werden bestehende Patterns wiederverwendet (TanStack Query Hook, Zustand Store, `SafeAreaScreen > Card > Button` Layout)? Gibt es ähnliche bestehende Implementierungen?
   - **i18n**: Müssen neue Strings in `translations/` ergänzt werden?
   - **Konfiguration**: Sind neue Einträge in `src/config.ts` nötig?

3. **Entscheidung: klar oder unklar?**

   - **Klar** → Kurze Zusammenfassung der geplanten Umsetzung ausgeben und mit der Implementierung beginnen.
   - **Unklar** → Weiter zu Schritt 4.

4. **Eine Frage nach der anderen stellen**

   - Nutze das `AskUserQuestion` Tool — **eine Frage pro Aufruf**.
   - Biete 2–4 konkrete Lösungsvorschläge an, jeder mit kurzer Beschreibung der Konsequenzen/Trade-offs.
   - Empfehle eine Option, wenn aus dem Repo-Kontext (CLAUDE.md, bestehende Patterns) ein klarer Favorit ableitbar ist — markiere sie mit `(Empfohlen)` als erste Option.
   - Die "Other"-Option für freie Eingaben wird automatisch vom Tool ergänzt — füge sie nicht selbst hinzu.
   - Formuliere Fragen präzise und kontextbezogen, nicht allgemein.

5. **Antwort einarbeiten, dann nächste Frage**

   - Nach jeder Antwort: prüfen, ob durch die Antwort neue Fragen entstanden sind oder bestehende sich erübrigt haben.
   - Solange offene Punkte existieren, zurück zu Schritt 4.

6. **Finale Zusammenfassung**

   Wenn alle Fragen geklärt sind:

   - Kurz die finale Umsetzungsstrategie zusammenfassen (welche Dateien, welches Pattern, welcher Flow).
   - Erst dann mit der Implementierung beginnen.

## Frage-Qualität

Gute Fragen sind:

- **Spezifisch**: "Soll die Sortierung clientseitig in `useGetListings` oder serverseitig über einen neuen Query-Param erfolgen?" — nicht "Wie soll sortiert werden?"
- **Mit Konsequenz**: Jede Option beschreibt, was sich dadurch im Code/Verhalten ändert.
- **Mit Empfehlung wenn möglich**: Wenn CLAUDE.md, `.github/instructions/` oder bestehende Patterns eine klare Antwort nahelegen, empfiehl diese.
- **Eine Dimension pro Frage**: Nicht "Wo soll der Button hin und welche Farbe?" — das sind zwei Fragen.

## Was nicht tun

- Keine Liste mit mehreren Fragen auf einmal stellen.
- Keine Implementierung beginnen, solange offene Punkte existieren.
- Keine Fragen stellen, die durch einen kurzen Blick in den Code (Read/Grep) selbst beantwortet werden können — erst recherchieren, dann fragen.
- Keine rhetorischen Fragen oder Bestätigungsfragen ("Soll ich jetzt anfangen?") — nur echte Entscheidungsfragen.

