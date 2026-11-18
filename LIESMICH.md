# TMC-Ablehnungstool

## Starten
`app\index.html` per Doppelklick in **Microsoft Edge** oder **Google Chrome** öffnen. Es muss nichts installiert werden, und Internet ist nicht nötig.

Beim ersten Start:
1. **„Datenordner verbinden“** klicken und einen gemeinsamen Ordner wählen, z. B. `Ablehnungstool\daten` auf dem Laufwerk oder einen mit OneDrive synchronisierten SharePoint-Ordner. Alle Kolleginnen und Kollegen wählen **denselben** Ordner.
2. Die erste Person legt sich als **Admin** an. Unter *Einstellungen → Benutzer & Rollen* legt sie danach die übrigen Benutzer an und vergibt die Rollen.
3. Bei jedem weiteren Start fragt der Browser einmal nach dem Zugriff auf den Ordner. Ein Klick auf **„Zugriff erlauben“** genügt.

Firefox unterstützt den Ordnerzugriff nicht. Dort speichert das Tool die Daten nur im Browser, was sich höchstens zum Ausprobieren eignet.

## Variante für Vercel (Cloud, in jedem Browser)
Ein Browser auf einer Webseite kann kein Laufwerk auswählen. Deshalb liegen die Daten in der Cloud-Variante in einer gemeinsamen Postgres-Datenbank. Als Speicherort wählt man dann „Cloud-Datenbank“ (beim Start oder unter *Einstellungen → Daten & Import*, dort auch Wechsel zurück zum Ordner oder Übernahme der bisherigen Daten). Das geht auch in Firefox.

Einrichtung einmalig:
1. Projektordner (mit `app`, `api`, `vercel.json`, `package.json`) in ein Git-Repository legen und bei Vercel importieren. Die Seite liefert `app` aus, die Schnittstelle liegt in `api`.
2. In Vercel unter *Storage* eine Postgres-Datenbank (Neon) anlegen und mit dem Projekt verbinden; das setzt `DATABASE_URL`.
3. Unter *Settings → Environment Variables* zwei weitere Werte anlegen: `TEAM_PASSWORD` (das gemeinsame Passwort) und `SESSION_SECRET` (zufälliger Text, mindestens 16 Zeichen).
4. Neu deployen. Beim Öffnen der Adresse erscheint die Anmeldung; die erste Person legt sich danach als Admin an.

Hinweise: Das Team-Passwort schützt den Zugang zu den Daten; die Rollen steuern wie bisher nur die Oberfläche. Die Tabellen legt die Schnittstelle beim ersten Aufruf selbst an. Getestet ist die Schnittstelle bisher nur gegen eine Speicher-Attrappe (52 Prüfungen) und der Browser-Teil gegen eine Attrappe, nicht gegen eine echte Neon-Datenbank bei Vercel. Die Bereitstellung und der erste echte Test stehen noch aus.

## Altdaten übernehmen
*Einstellungen → Daten & Import*: Hierher die Dateien „Ablehnungen NEU 2026.xlsx“ und „2024.10.26 Ablehnungsübersicht.xlsm“ ziehen. Das Tool zeigt eine Vorschau an, und erst mit „übernehmen“ wird gespeichert. Wer dieselbe Datei ein zweites Mal importiert, erzeugt keine Dubletten.

## Ablage im Datenordner
| Ordner/Datei | Inhalt |
|---|---|
| `config.json` | Benutzer, Rollen, Kategorien, Auswahllisten, Regeln |
| `ablehnungen\*.json` | eine Datei je Ablehnung |
| `anhaenge\<id>\` | Original-Mail und Korrektur-PDF |
| `massnahmen\*.json` | dokumentierte Gespräche und Schulungen |
| `sperren\*.json` | wer gerade welche Ablehnung bearbeitet (läuft nach 20 Minuten ohne Aktivität ab) |

Mehrere Personen können gleichzeitig arbeiten. Gesperrt ist immer nur die Ablehnung, die gerade jemand offen hat. Hat jemand anderes inzwischen gespeichert, merkt das Tool das und lädt den neuen Stand, statt ihn zu überschreiben.

## Hinweise
- Die Rollen regeln, was man in der Oberfläche tun kann. Einen echten Zugriffsschutz bieten sie nicht: Wer Zugriff auf das Laufwerk hat, kann die Dateien auch direkt öffnen.
- Fehlerpunkte werden nach festen Regeln aus der Mail getrennt. Kategorie und Fehlerart wählt immer ein Mensch; das Tool schlägt dafür nur die bei euch häufigsten Einträge vor.
- PDF-Bericht und Gesprächsblatt: über „Drucken / PDF“ und im Druckdialog „Als PDF speichern“ wählen.
