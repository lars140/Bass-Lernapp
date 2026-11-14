# Bass lernen – Phase 1–4 (Gast-Modus, Konten, Sync, Level 1–4, Einstufung, Wiederholung, Statistik, Songs)

Statische Web-App (Vanilla JS, ES-Module, Vite). Der Bass klingt aus freien Aufnahmen (CC0, siehe „Bass-Samples“), alles andere
(Drums, Klick, Akkorde, Slap/Pop/Flageolett) wird per Web Audio synthetisiert. Alle Grafiken sind SVG, Lektionen liegen als JSON in `public/content/`. Kein CDN, kein Tracking.

## Entwickeln

```bash
npm install
npm run dev        # Vite-Dev-Server (ohne Service Worker)
npm run check      # prüft alle Lektions-JSONs (Taktlängen, Typen, IDs)
npm test           # check + Merge-/Musik-/SRS-Tests + Render-Test aller 253 Lektionsschritte + Ansichten-Test (jsdom)
npm run build      # erzeugt dist/ inkl. sw.js (Offline-Cache)
npm run pages:dev  # Build + wrangler pages dev (ab Phase 2 mit lokaler D1)
```

## Ordnerstruktur

```
index.html               Einstieg
vite.config.js           Build + Service-Worker-Generator
sw-template.js           Vorlage für den Service Worker
wrangler.toml            Cloudflare-Konfiguration (D1-Binding ab Phase 2)
public/
  _headers               Cache-Zeiten + Sicherheits-Header (/api/*: no-store)
  _routes.json           NUR /api/* löst Functions aus
  manifest.webmanifest, icon.svg
  content/index.json     Level-Übersicht
  content/level1.json    Level 1 (Module → Lektionen → Schritte)
src/
  main.js                Shell, Navigation, Belohnungen, SW-Registrierung
  audio/                 engine, synth (Rückfall-Bass/Drums/Klick), samples (echter Bass), sequencer, drums, pitch (Mikrofon), music
  state/                 store (local-first, versioniert), gamify (XP/Streak/Ziel), badges, dates, events
  lessons/               loader (JSON laden), riff (Tab-Format parsen)
  exercises/             tabPlayer, quiz, fretQuiz, rhythmTrainer, tempoLadder, tuner, metronome, drumMachine
  ui/                    dom, router, fretboard, tabview, views/*, toast, confetti
  styles/app.css
scripts/validate-content.mjs
```

## Cloudflare einrichten (Phase 1 + 2)

**1. Projekt anlegen**
- *Per GitHub:* Repository pushen → Dashboard → Workers & Pages → Create → Pages → Connect to Git. Build-Befehl `npm run build`, Ausgabeordner `dist`.
- *Per Wrangler:* `npx wrangler login`, dann `npx wrangler pages project create bass-lernen --production-branch main` und später `npm run build && npx wrangler pages deploy dist`.

**2. D1-Datenbank erstellen**
```bash
npx wrangler d1 create bass-db
```
Die ausgegebene `database_id` in [wrangler.toml](wrangler.toml) bei `database_id` eintragen (der Platzhalter reicht nur lokal).

**3. Binding**
Da `wrangler.toml` das Binding `DB` bereits enthält, wird es beim Deploy übernommen. Falls du lieber im Dashboard arbeitest: Pages-Projekt → Settings → Bindings → *Add* → D1 database → Variable name **`DB`** → `bass-db` (für Production und Preview).

**4. Migrationen ausführen**
```bash
npm run db:migrate:remote      # = wrangler d1 migrations apply bass-db --remote
```
Neue Schemaänderungen kommen als `migrations/0002_….sql` und werden mit demselben Befehl eingespielt.

**5. Umgebungsvariablen** (Pages → Settings → Variables and Secrets)

| Name | Pflicht | Bedeutung |
|---|---|---|
| `PBKDF2_ITERATIONS` | nein | Standard und Maximum: 100000 (Workers-Limit). Siehe „PBKDF2 messen“ |
| `TURNSTILE_SECRET` | nein | Secret-Key von Cloudflare Turnstile. Nicht gesetzt = Bot-Prüfung aus |
| `VITE_TURNSTILE_SITEKEY` | nein | **Build-Variable** (Site-Key). Zusätzlich in `public/_headers` die CSP um `https://challenges.cloudflare.com` bei `script-src`, `connect-src` und `frame-src` erweitern |

**6. Deployen** (Git-Push oder `wrangler pages deploy dist`). Danach `https://<projekt>.pages.dev` öffnen, Konto erstellen, Recovery-Code notieren.

**7. „Fail open“ prüfen** (wichtig bei geteiltem Kontingent): Dashboard → Workers & Pages → *Plans* bzw. beim Projekt Settings → *Functions* → **Failover mode / Fail open** sicherstellen (nicht „Fail closed“). Dann liefert Cloudflare nach Erreichen der 100.000 Anfragen die statischen Dateien weiter aus, nur `/api/*` fällt aus. Die App behandelt fehlende JSON-Antworten wie „offline“: Fortschritt bleibt lokal, Hinweis „Wird später synchronisiert“, später automatischer neuer Versuch.
(Die Bezeichnung der Einstellung kann sich im Dashboard ändern. Prüfe sie dort selbst, ich konnte sie von hier aus nicht einsehen.)

**Lokal entwickeln**
```bash
npm run db:migrate:local   # einmalig: lokale D1 anlegen
npm run pages:dev          # Build + wrangler pages dev auf http://127.0.0.1:8788
```
Alternativ `wrangler pages dev dist` in einem Terminal und `npm run dev` im zweiten: Vite leitet `/api` an Port 8788 weiter.

## Konten und Sync (Phase 2)

### API
Einheitlich: Erfolg `{ "ok": true, … }`, Fehler `{ "ok": false, "error": { "code", "message" } }`.

| Endpunkt | Zweck |
|---|---|
| `POST /api/register` | `{username,email,password,progress?}` → Konto, Session, **einmaliger Recovery-Code**; Gast-Fortschritt wird übernommen |
| `POST /api/login` | `{identifier,password}` → Benutzer **und** Fortschritt in einer Antwort |
| `POST /api/logout` | Session löschen |
| `POST /api/reset-password` | `{identifier,recoveryCode,newPassword}` → neues Passwort + neuer Code, alte Sessions beendet |
| `GET /api/me` | Benutzer + Fortschritt in einer Antwort |
| `PUT /api/progress` (auch `POST` für `sendBeacon`) | `{version,data}` mit Versionsprüfung, bei Konflikt `409` + aktueller Serverstand |
| `GET /api/export` | alle Daten des Kontos als JSON |
| `DELETE /api/account` | `{password}` → Konto, Sessions, Fortschritt löschen |

### Sicherheit
- Passwort: PBKDF2-SHA256, 16 Byte Salt pro Benutzer, **Iterationszahl pro Hash gespeichert**. Wird `PBKDF2_ITERATIONS` später erhöht, erneuert sich der Hash beim nächsten Login automatisch.
- Recovery-Code: ~80 Bit, nur als SHA-256 gespeichert, nach Benutzung ersetzt.
- Session: 256-Bit-Zufallstoken im Cookie (`HttpOnly`, `Secure` unter https, `SameSite=Lax`), in D1 nur als Hash; 30 Tage, rollierend (Verlängerung höchstens 1 Schreibvorgang pro Tag).
- CSRF: `SameSite=Lax` plus Origin-Prüfung (`Origin` muss gleich sein, sonst `Sec-Fetch-Site: same-origin`).
- SQL: ausschließlich Prepared Statements. Eingaben serverseitig validiert (`functions/_lib/validate.js`), Fortschritt auf 60 KB begrenzt.
- Rate-Limit (nur Fehlversuche): Login 8 pro Konto / 20 pro IP in 15 Min., Reset 5 / 10, Registrierung 5 pro IP und Stunde, Konto-Löschen 5.
- Login-Meldungen sind generisch; bei unbekanntem Benutzer wird trotzdem gehasht (gleiche Antwortzeit).
- Aufräumen abgelaufener Sessions/Versuche geschieht nebenbei bei erfolgreichen Logins.

### PBKDF2 messen
Lokal in Node: ca. **12 ms bei 100.000 Iterationen** (`node scripts/bench-pbkdf2.mjs`). Das ist nur ein Anhaltspunkt, die Cloudflare-Hardware kann abweichen. Hash-Berechnung läuft in der Web-Crypto-Implementierung (nativ). Ob 100.000 im Free Plan sicher unter dem CPU-Limit bleiben, solltest du nach dem ersten Deploy mit `npx wrangler pages deployment tail` und einem Test-Login prüfen. Erscheinen Fehler wie „Exceeded CPU limit“, setze `PBKDF2_ITERATIONS=50000`. Bestehende Konten behalten ihren gespeicherten Wert.

### Sync-Ablauf
Local-first: jede Änderung landet sofort in `localStorage`, `dirty`-Flag markiert Unsynchronisiertes. Serveranfragen nur bei: App-Start (`GET /api/me`), Lektion beendet/verlassen, Seite versteckt (`keepalive`), höchstens alle 3 Min. bei langen Sessions, jeweils nur bei Änderungen. Bei Fehlern: stiller Retry (30 s, verdoppelt bis max. 10 Min., sofort bei `online`).
Konflikte (`409`) werden **im Browser** zusammengeführt (`src/sync/merge.js`, getestet mit `node scripts/test-merge.mjs`): abgeschlossene Lektionen/Abzeichen vereinigen, höchste XP/Schritte/Rekorde/Übungszeit, neueste Position und Einstellungen, neuere Streak. Ein späterer „Zurücksetzen“-Zeitpunkt (`resetAt`) gewinnt komplett. Das spart Server-CPU.

## Anfragen-Schätzung pro aktivem Benutzer und Tag

| Szenario | API-Aufrufe | D1 gelesen / geschrieben |
|---|---|---|
| Gast | 0 | 0 |
| Eine Übungssession (Start + 1–2 Lektionen + Verlassen) | ca. 3–4 (1× `me`, 1–2× `progress`, 1× beim Verlassen) | je `me`/`progress`: 1 Join-Lesen bzw. Join + 1 Schreiben ≈ 3–6 Zeilen gelesen, 1–2 geschrieben |
| Lange Session (60 Min., Sync alle 3 Min.) | max. ca. 20 | max. ca. 20 Schreibvorgänge |
| Typischer Tag (2 Sessions) | **ca. 6–10** | **ca. 30 gelesen, 4–6 geschrieben** |
| Login (selten) | 1 | ca. 10 gelesen, 4–6 geschrieben (Session + Aufräumen) |

Beispiel: 1.000 aktive Benutzer pro Tag ≈ 6.000–10.000 Anfragen, also ca. 6–10 % des Tageskontingents von 100.000 (das du dir mit deiner anderen Website teilst). Zeilen: weit unter 5 Mio. gelesen / 100.000 geschrieben. Das ist eine Rechnung, keine Messung: Bitte nach dem Start im Dashboard prüfen.

## Neue Lektionen und Riffs hinzufügen

Öffne `public/content/level1.json` und füge in `modules[].lessons[]` ein Objekt ein, dann `npm run check`.

```json
{ "id": "l1-meine-lektion", "title": "Titel", "minutes": 8, "goal": "Lernziel",
  "steps": [ { "type": "text", "title": "…", "body": ["Absatz mit **fett**"] } ] }
```

Lektions-IDs müssen eindeutig sein. Der Fortschritt hängt an `id`. Eine ID später umzubenennen setzt den Fortschritt dieser Lektion zurück.

### Riff-Format

```json
{ "id": "r-mein-riff", "title": "Name", "bpm": 90, "beats": 4, "sub": 2, "drums": "rock8",
  "bars": ["E0 ~ E0 G3 ~ A0 ~ G3", "E0 ~ E0 G3 ~ A0 ~ -"] }
```

| Feld | Bedeutung |
|---|---|
| `beats` | Schläge pro Takt (Standard 4) |
| `sub` | Schritte pro Schlag: 1 = Viertel, 2 = Achtel, 3 = Triolen, 4 = Sechzehntel |
| `bars` | Ein String pro Takt, genau `beats × sub` Tokens, durch Leerzeichen getrennt |
| `drums` | optional: `rock8`, `rock4`, `funk`, `disco`, `reggae`, `hiphop`, `shuffle` |

Tokens: `E0`–`G24` = Saite (E A D G) + Bund, `-` = Pause, `~` = Ton halten.

Technik-Suffixe hinter dem Bund (kombinierbar), sie beziehen sich auf den Ton, **zu dem** gespielt wird:

| Suffix | Technik | Beispiel |
|---|---|---|
| `t` | Slap (Daumen), im Tab **S** | `E0t` |
| `o` | Pop (Zupfen nach oben), im Tab **↑** | `D2o` |
| `*` | Flageolett im 5., 7. oder 12. Bund (klingt 24 / 19 / 12 Halbtöne über der leeren Saite), im Tab **◇** | `G12*` |
| `g` | Ghost Note (gedämpft, wird als **x** angezeigt) | `E0g` |
| `h` | Hammer-on | `A2h` |
| `p` | Pull-off | `A0p` |
| `/` bzw. `\` | Slide hoch bzw. runter (Start = vorheriger Ton). In JSON muss der Backslash doppelt stehen (`E3\\`) | `E5/` |
| `v` | Vibrato | `A5v` |

Triolen/Shuffle: `sub: 3` (12 Tokens pro 4/4-Takt), Drums `shuffle`. Sechzehntel: `sub: 4`.

### Schritt-Typen

| `type` | Felder |
|---|---|
| `text` | `title`, `body` (Array von Absätzen), `diagram: "bass"` (optional) |
| `staff` | Notensystem im Bassschlüssel: `notes` (klingende MIDI-Töne, z. B. `[28, 33, 38, 43]` = leere Saiten), `names` (Notennamen darunter), `text`. Der Bass wird eine Oktave höher notiert, das rechnet die App selbst um |
| `theory` | `body` – die „Warum klingt das so?“-Box |
| `fretboard` | `text`, `frets`, `string` (alle Töne einer Saite) oder `marks: [[saite, bund, label]]` (Saite 0 = E … 3 = G), `labels: "names"/"frets"`; **oder** `scale: {root, type, fromFret, toFret, strings, labels}` (Tonleiter/Arpeggio, `labels: "degrees"` zeigt 1, b3, 5 …; Typen: major, minor, majorPent, minorPent, blues, dorian, mixolydian, lydian, phrygian, locrian, arp-maj, arp-min, arp-dom7, arp-min7, arp-maj7) mit „Töne abspielen“ |
| `tab` | `riff`, `bpm`, `text` – Player mit „Hat geklappt / Nochmal“ |
| `quiz` | `question`, `options`, `answer` (Index), `explain`, optional `riff` (statische Tab) oder `staff: { notes: [...] }` (Notensystem) |
| `fretquiz` | `mode: "find"/"name"`, `strings`, `maxFret`, `rounds` |
| `rhythm` | `bpm`, `sub` (1 oder 2), `bars: ["x - x x"]` (x = tippen) |
| `tempoLadder` | `riff`, `start`, `target`, `stepBpm` |
| `tuner`, `metronome` | `text` |
| `ear` | Gehörbildung: `mode: "interval"/"quality"/"line"`, `rounds`, `intervals` (Halbtöne, nur bei interval) |
| `jam` | Jam-Track: `key` (E, A, D, G, C, F, H, F#), `progression` (rock-145, blues12, pop-1564, pop-6415, minor-i-VI-III-VII, jazz-251, funk-i-IV), `genre` (rock, funk, blues, reggae, disco, hiphop), `bpm`, `text` |

Jeder `tab`-Schritt bietet automatisch **„🎤 Mit Mikrofon prüfen“** an (abschaltbar mit `"mic": false`).

Bleibt ein Schritt interaktiv (alles außer `text`, `theory`, `fretboard`), muss er erst erledigt werden, bevor „Weiter“ aktiv wird.

## Fortschrittsformat (`localStorage`, Key `bass.progress`)

Versioniert (`v`, aktuell **2**), migriert über `migrate()` in `src/state/store.js`. Felder: `xp`, `streak`, `done`, `steps`, `pos`, `badges`, `records`, `days`, `stats`, `settings`, `rev`, `updatedAt`, `resetAt` sowie ab Version 2 `srs` (Wiederholungs-Karten), `skipped` (per Test übersprungene Lektionen) und `placement` (Einstufung). Die Server-Validierung (`functions/_lib/validate.js`) akzeptiert v1 und v2.
Der Dirty-Flag liegt getrennt unter `bass.meta`. Phase 2 nutzt `rev`/`updatedAt` für den Sync.

## Hinweise

- **iOS:** Audio startet erst nach Antippen. Der Stumm-Schalter des iPhones dämpft Web Audio.
- **Mikrofon:** im Stimmgerät und im Mitspiel-Modus der Tab-Übungen, immer nur nach Einverständnis, lokale Auswertung. Es wird nichts gesendet.
- **Rhythmus-Trainer:** Bei Bluetooth-Kopfhörern den Latenz-Ausgleich im Profil anpassen.
- **Datenschutz/Impressum:** Platzhalter unter `src/ui/views/legal.js`, selbst ausfüllen.
- **Teststand:** Automatisch geprüft sind Build, Inhalte, Tonhöhen aller Riffs, Merge-Regeln, das Backend (lokales D1) und das Rendern/Bedienen aller Lektionsschritte (`npm test`, jsdom mit Audio-Stub). **Nicht** geprüft werden können dort der echte Klang, das Timing des Rhythmus-Trainers und die Mikrofon-Erkennung: Das braucht einen Test mit echtem Bass auf deinen Geräten (Chrome, Firefox, Safari/iOS, Edge).

## Phase 3: Level 2 und 3, Mikrofon, Gehörbildung, Jam-Tracks

**Inhalte:** Level 2 (8 Lektionen) und Level 3 (13 Lektionen) liegen in `public/content/level2.json` und `level3.json` und werden erst beim Öffnen geladen. Sie decken Muting, Raking, Noten, Grundton–Quinte–Oktave, Dur/Moll, Sechzehntel, Synkopen, Hammer-on/Pull-off, Slides, Vibrato, Ghost Notes, Plektrum, Lagenwechsel, Pentatonik, Tonleitern, Arpeggios, Stufen/Nashville sowie Funk, Blues-Shuffle, Reggae und Disco ab. Alle Riffs sind eigene Kompositionen, die Melodie der „Ode an die Freude“ ist gemeinfrei.

**Mitspiel-Modus mit Mikrofon** (`src/audio/mic.js`, `src/audio/pitch.js`): Opt-in pro Übung. Der Bass-Ton der App wird dabei stumm geschaltet (sonst würde das Mikrofon die App hören), Klick und Drums laufen weiter, Kopfhörer sind ideal. Nach dem Durchlauf wird jeder Ton geprüft (Tonhöhe per Autokorrelation, Oktavfehler werden toleriert). Richtige Töne färben sich grün, falsche rot, ab 70 % ist der Schritt geschafft. Das Audio verlässt nie den Browser, der Mikrofon-Stream wird beim Verlassen beendet. Ohne Mikrofon (oder bei Ablehnung) bleibt „Hat geklappt / Nochmal“. Bei Zeitversatz hilft der **Latenz-Ausgleich** im Profil.

**Gehörbildung** (`src/exercises/earTraining.js`): Intervalle, Dur/Moll, Basslines (Tab-Auswahl). Auch frei im Werkzeug-Menü.

**Jam-Tracks** (`src/exercises/jamTrack.js`): Drums + Akkorde (+ optional Bass) für 7 Akkordfolgen × 6 Genres in 8 Tonarten, jeweils mit Akkordname, Nashville-Zahl und Bund-Hilfe für den Grundton. Auch frei im Werkzeug-Menü.

**API/Datenbank:** unverändert. Phase 3 verursacht **keine** zusätzlichen Server-Anfragen: Mehr Lektionen sind nur mehr statische Dateien, der Fortschritt bleibt ein JSON-Datensatz (nur ein paar Zähler mehr).

**Tests:** `npm test` rendert alle 179 Schritte in jsdom mit Audio-Stub und klickt alle Buttons, prüft die Tonhöhen aller Riffs gegen die gemeinten Tonleitern und Akkorde und die Merge-Regeln.

## Phase 4: Level 4, Einstufung, Wiederholung, Statistik, Songs

**Level 4** (`public/content/level4.json`, 13 Lektionen): Slap und Pop, Slap-Groove und Double Thumbing, Flageolett und Tapping, Walking Bass (Grundlagen und 12-Takt-Blues), Dorisch/Mixolydisch, Lydisch/Phrygisch, Swing und Shuffle, Laid-back/Ahead, ungerade Taktarten (5/4, 7/8), eigene Basslines erfinden, Noten im Bassschlüssel lesen, Basslines nach Gehör herausfinden. Alle Riffs sind eigene Kompositionen.

**Einstufungstest** (`#/placement`, `src/ui/views/placement.js`, Fragen in `public/content/placement.json`): Level 1, 2 und 3 nacheinander, je 6 Fragen, bestanden ab 80 % beim ersten Versuch. Nach dem Test schlägt die App den Einstieg vor. Die Lektionen davor werden nur auf Wunsch übersprungen. Im Kurs lässt sich Level 2 oder 3 auch einzeln per Kurztest überspringen (`#/placement/level2`). Übersprungene Lektionen geben **keine XP** und zählen **nicht** für Level-Abzeichen (`state.skipped`).

**Wiederholung / Spaced Repetition** (`src/state/srs.js`, `#/warmup`): Beim Abschließen eines Quiz-, Riff- oder Griffbrett-Quiz-Schritts entsteht eine Karte. Bewertung „Noch unsicher / Hat geklappt / Locker“ (Quiz: erster Versuch richtig = geschafft). Intervalle: 1 Tag, 3 Tage, dann ×Ease (Start 2,5), bei „unsicher“ zurück auf 1 Tag. Pro Aufwärm-Runde höchstens 6 Karten. Das Format ist `srs[kartenId] = [fälligTag, Intervall, Ease×100, Wiederholungen]` (maximal 500 Karten, ca. 40 Byte pro Karte). Karten zu Lektionen, die es nicht mehr gibt, werden automatisch entfernt. Es gibt **keine zusätzlichen API-Aufrufe**: Die Karten reisen mit dem normalen Fortschritt.

**Statistik** (`#/stats`): Übungszeit pro Tag (14 Tage) und pro Woche (8 Wochen), Skill-Übersicht in 6 Bereichen (Zuordnung in `public/content/skills.json`), Tempo-Rekorde pro Riff, Wiederholungs-Stand.

**Songs** (`#/songs`, `public/content/songs.json`): 11 originale Kurzstücke mit Schwierigkeit, Genre, Tempo und benötigten Lektionen. Sie werden frei, sobald die Lektionen aus `requires` abgeschlossen sind. Zum Song gehört „Sauber gespielt“, das den Tempo-Rekord speichert. Der **Song-Editor** (`#/songs/editor`) prüft eigenes JSON mit denselben Regeln wie `npm run check` und zeigt eine Vorschau. Eigene Songs bleiben in `localStorage` (`bass.songs`) und werden **nicht** mit dem Konto synchronisiert (sonst wüchse der Datensatz und jede Änderung würde einen Schreibvorgang kosten).

### Wie ich einen Song hinzufüge

Entweder im Editor (nur für dich) oder dauerhaft in `public/content/songs.json`:

```json
{ "id": "s-mein-song", "title": "Mein Song", "genre": "Rock", "difficulty": 2, "bpm": 90, "key": "E",
  "requires": ["l1-groove"], "skills": ["Achtelnoten"], "description": "Kurzer Text.",
  "riff": { "id": "s-mein-song", "title": "Mein Song", "bpm": 90, "beats": 4, "sub": 2, "drums": "rock8",
            "bars": ["E0 ~ E0 ~ E0 ~ G3 ~", "A0 ~ A0 ~ A0 ~ E0 -"] } }
```

`difficulty` 1–5, `requires` sind Lektions-IDs (leer = sofort frei), `skills` sind freie Texte. Danach `npm run check`.

### Wie ich eine neue Lektion einordne

Jede Lektion braucht einen Eintrag in `public/content/skills.json` (Bereich `technik`, `rhythmus`, `griffbrett`, `theorie`, `groove` oder `gehoer`). `npm run check` meldet fehlende Einträge. Neue Level: Datei `levelN.json` mit Lektions-IDs `lN-…` anlegen, in `index.json` eintragen (`"available": true`), Lektionszahl in `src/state/badges.js` anpassen. Lektionen vom Typ `quiz`, `tab` (mit Riff-`id`) und `fretquiz` werden automatisch zu Wiederholungs-Karten.

### Neue Abzeichen

Level 4, Slap-Meister, Ganzes Griffbrett (Noten, Lagenwechsel und Bassschlüssel), Eingestuft, Aufgewärmt, Routine (10 Runden).

### Datenbank und Anfragen

**Keine neue Tabelle, keine neue Migration, keine neuen Endpunkte.** `progress.data` wächst um `srs`, `skipped` und `placement`. Die Beispielrechnung oben bleibt gültig: Wiederholungen, Statistik, Songs und Tests laufen komplett im Browser. Im Datensatz belegen 500 Karten ca. 20 KB (Grenze: 60 KB). Zusätzliche Schreibvorgänge entstehen nur dadurch, dass eine Aufwärm-Runde den Fortschritt ändert und beim nächsten gebündelten Sync (Lektion verlassen, Seite verstecken, alle 3 Minuten) mitgesendet wird. Die Server-Validierung prüft die Karten (Länge, Zahlenwerte, höchstens 600).

### Test-Stand

`npm test` prüft zusätzlich: Level-4-Inhalte (alle 45 Lektionen, 11 Songs, Skill-Zuordnung, Einstufungsfragen), Tonhöhen der neuen Riffs (Modi, Walking-Blues, Flageolett-Töne, Slap/Pop-Oktaven, Notenpositionen im Bassschlüssel), Intervall-Berechnung, Merge v2, Migration v1 → v2, Server-Validierung und alle neuen Ansichten (Aufwärmen, Einstufung inklusive Durchfallen und Überspringen, Statistik, Songs, Editor). Gegen den lokalen Server (wrangler + D1) habe ich den Ablauf Registrierung → Abruf → Update → ungültige Karte → alter v1-Client einmalig von Hand geprüft.

**Nicht prüfbar ohne echtes Gerät:** Klang von Slap, Pop und Flageolett (synthetisch, also nur eine Annäherung), Gefühl und Timing der Übungen, die Mikrofon-Erkennung bei Slap/Flageolett (sehr kurze oder sehr hohe Töne werden unzuverlässiger erkannt), Darstellung auf iOS/Safari und die Größe des Cloudflare-CPU-Budgets beim Login.

## Bass-Samples (echter Klang)

**Quelle und Lizenz:** [FreePats „Finger Bass YR“](https://freepats.zenvoid.org/ElectricGuitar/clean-electric-bass.html), aufgenommen von Andrea Biasior an einem Yamaha RBX, veröffentlicht unter **CC0 1.0** (Public Domain). Lizenztext und Quelle liegen bei den Dateien (`public/samples/bass/LICENSE-CC0.txt`, `SOURCE.txt`). Eine Namensnennung ist bei CC0 nicht Pflicht, steht aber im Profil-Footer.

**Aufbau:** 12 Aufnahmen, eine pro Halbton von E1 bis D#2 (MIDI 28–39), als FLAC (22,05 kHz, 16 Bit, ca. 3,6 s), zusammen **ca. 0,4 MB**. Höhere Töne entstehen durch Tonhöhenverschiebung des D#2-Samples (bis zum MIDI-Ton 57, also bis ca. G-Saite 14. Bund). Darüber und bei Slap, Pop und Flageolett spielt die Synthese. Die Sample-Stimmung ist gemessen (`manifest.json`, Feld `cents`) und wird beim Abspielen ausgeglichen. Im Test in Edge landeten verschobene Töne auf ±1,5 Cent genau.

**Ablauf (`src/audio/samples.js`):** Beim ersten Klick, der Audio freigibt, werden die Dateien geladen (höchstens 2 Sekunden Wartezeit, dann läuft die Synthese als Rückfall). Der Service Worker speichert sie für den Offline-Betrieb. Fehlt das Netz beim ersten Besuch, spielt die Synthese weiter und das Laden wird später erneut versucht. Es entstehen **keine Function-Anfragen** (statische Dateien). Im Profil lässt sich **Synthese** statt **Echter Bass** wählen (`settings.sound`).

**Eigene Aufnahmen verwenden:** Nimm die Töne E1 bis D#2 (MIDI 28–39) einzeln als FLAC auf (24 Bit, mono, 44,1 kHz) und lege sie in einen Ordner `E.flac`, `F.flac`, `F#.flac` … `D#.flac`. Dann: `npm install --no-save libflacjs`, `node scripts/build-samples.cjs <Ordner> public/samples/bass`. Das Skript gleicht den Pegel an, misst die Stimmung, verkleinert die Dateien und schreibt `manifest.json` neu. Passe danach `SOURCE.txt` an.

**Tests:** `node scripts/test-samples.mjs` prüft Manifest, Dateien, Lizenzdateien, Zuordnung Ton → Sample und die Abspielgeschwindigkeit. Dass die Dateien im echten Browser dekodiert werden und die Tonhöhen stimmen, habe ich einmalig in Edge geprüft. **Wie es klingt, kann ich nicht hören:** Bitte hör dir Zupfklang, Ghost Notes, Hammer-on und besonders die höheren Töne (ab etwa der D-Saite, 5. Bund) selbst an. Dort ist das Sample um mehr als eine Quarte hochgeschoben und klingt dünner als ein echter Bass an dieser Stelle.
