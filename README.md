# Bass lernen – Phase 1–3 (Gast-Modus, Konten, Sync, Level 1–3)

Statische Web-App (Vanilla JS, ES-Module, Vite). Alle Sounds werden per Web Audio synthetisiert,
alle Grafiken sind SVG, Lektionen liegen als JSON in `public/content/`. Kein CDN, kein Tracking.

## Entwickeln

```bash
npm install
npm run dev        # Vite-Dev-Server (ohne Service Worker)
npm run check      # prüft alle Lektions-JSONs (Taktlängen, Typen, IDs)
npm test           # check + Merge-/Musik-Tests + Render-Test aller 179 Lektionsschritte (jsdom)
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
  audio/                 engine, synth (Bass/Drums/Klick), sequencer, drums, pitch (Mikrofon), music
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
| `theory` | `body` – die „Warum klingt das so?“-Box |
| `fretboard` | `text`, `frets`, `string` (alle Töne einer Saite) oder `marks: [[saite, bund, label]]` (Saite 0 = E … 3 = G), `labels: "names"/"frets"`; **oder** `scale: {root, type, fromFret, toFret, strings, labels}` (Tonleiter/Arpeggio, `labels: "degrees"` zeigt 1, b3, 5 …; Typen: major, minor, majorPent, minorPent, blues, dorian, mixolydian, arp-maj, arp-min, arp-dom7, arp-min7, arp-maj7) mit „Töne abspielen“ |
| `tab` | `riff`, `bpm`, `text` – Player mit „Hat geklappt / Nochmal“ |
| `quiz` | `question`, `options`, `answer` (Index), `explain`, optional `riff` (statische Tab) |
| `fretquiz` | `mode: "find"/"name"`, `strings`, `maxFret`, `rounds` |
| `rhythm` | `bpm`, `sub` (1 oder 2), `bars: ["x - x x"]` (x = tippen) |
| `tempoLadder` | `riff`, `start`, `target`, `stepBpm` |
| `tuner`, `metronome` | `text` |
| `ear` | Gehörbildung: `mode: "interval"/"quality"/"line"`, `rounds`, `intervals` (Halbtöne, nur bei interval) |
| `jam` | Jam-Track: `key` (E, A, D, G, C, F, H, F#), `progression` (rock-145, blues12, pop-1564, pop-6415, minor-i-VI-III-VII, jazz-251, funk-i-IV), `genre` (rock, funk, blues, reggae, disco, hiphop), `bpm`, `text` |

Jeder `tab`-Schritt bietet automatisch **„🎤 Mit Mikrofon prüfen“** an (abschaltbar mit `"mic": false`).

Bleibt ein Schritt interaktiv (alles außer `text`, `theory`, `fretboard`), muss er erst erledigt werden, bevor „Weiter“ aktiv wird.

## Fortschrittsformat (`localStorage`, Key `bass.progress`)

Versioniert (`v`), migriert über `migrate()` in `src/state/store.js`. Felder: `xp`, `streak`, `done`, `steps`, `pos`, `badges`, `records`, `days`, `stats`, `settings`, `rev`, `updatedAt`.
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
