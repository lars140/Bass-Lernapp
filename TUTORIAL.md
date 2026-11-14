# Tutorial: Bass-Lern-App starten, benutzen, veröffentlichen

Dieses Tutorial führt dich in vier Teilen durch die App. Du brauchst keine Vorkenntnisse in Webentwicklung, nur Node.js (Version 18 oder neuer).

1. App lokal starten
2. Die App benutzen (Lernen, Werkzeuge, Profil)
3. Auf Cloudflare veröffentlichen
4. Eigene Lektionen und Riffs hinzufügen

---

## 1. App lokal starten

Öffne ein Terminal im Projektordner.

```bash
npm install
npm run dev
```

Vite zeigt eine Adresse an, meist `http://localhost:5173`. Öffne sie im Browser. Die App läuft jetzt im **Gast-Modus**. Dein Fortschritt liegt im Browser (`localStorage`), es ist kein Konto nötig.

Mit `npm run dev` gibt es **keine Konten und keinen Sync**, denn dafür fehlt der Server. Willst du Registrierung und Login lokal testen:

```bash
npm run db:migrate:local   # einmalig: legt die lokale Datenbank an
npm run pages:dev          # baut die App und startet sie mit API auf http://127.0.0.1:8788
```

Vor dem Veröffentlichen führst du die Tests aus:

```bash
npm test
```

Sie prüfen alle Lektionen, Tonhöhen, Merge-Regeln und das Rendern aller Schritte. Am Ende müssen vier Haken (✓) stehen.

---

## 2. Die App benutzen

### Erster Start

- Tippe irgendwo, damit der Browser Ton erlaubt. Auf dem iPhone gilt das immer, und der Stumm-Schalter dämpft die App.
- Nimm Kopfhörer, wenn du das Mikrofon benutzen willst.

### Kurs

Unter **Kurs** siehst du die Level 1 bis 3 mit Modulen und Lektionen. Level 4 ist noch gesperrt.

Jede Lektion besteht aus Schritten:

| Schritt | Was du tust |
|---|---|
| Text, Theorie | Lesen. Die Theorie-Box erklärt, warum etwas so klingt. |
| Griffbrett | Töne und Tonleitern ansehen. „Töne abspielen“ spielt sie vor. |
| Tab | Das Riff abspielen, dann selbst spielen. „Hat geklappt“ oder „Nochmal“. |
| Quiz, Griffbrett-Quiz | Fragen beantworten und Töne auf dem Griffbrett finden. |
| Rhythmus | Im Takt tippen. Das Timing wird bewertet. |
| Tempo-Leiter | Das Riff schrittweise schneller spielen. |
| Gehörbildung | Intervalle, Dur/Moll und Basslines erkennen. |
| Jam-Track | Zu Drums und Akkorden mitspielen. |

Bei Schritten zum Mitmachen wird „Weiter“ erst aktiv, wenn du sie erledigt hast.

### Mit Mikrofon mitspielen

1. Öffne einen Tab-Schritt und tippe **🎤 Mit Mikrofon prüfen**.
2. Erlaube den Mikrofon-Zugriff. Die Erkennung läuft nur in deinem Browser, es wird nichts gesendet.
3. Spiele zum Klick und zu den Drums. Der Bass der App ist dabei stumm.
4. Richtige Töne werden grün, falsche rot. Ab **70 %** gilt der Schritt als geschafft.

Wenn alles zu früh oder zu spät erkannt wird, stelle im **Profil** den Latenz-Ausgleich ein. Das hilft besonders bei Bluetooth-Kopfhörern.

### Werkzeuge

Unter **Werkzeuge** findest du:

- **Stimmgerät**: per Mikrofon, für E-A-D-G
- **Metronom**
- **Drum-Machine**: Rock, Funk, Disco, Reggae, Hip-Hop, Shuffle
- **Jam-Tracks**: Genre, Akkordfolge und Tonart wählen. Du siehst zu jedem Akkord die Nashville-Zahl und den Bund für den Grundton.
- **Gehörbildung**: frei üben

### Motivation

- **XP und Level** für jeden abgeschlossenen Schritt
- **Streak**: Tage in Folge. Pro Woche gibt es einen „Freeze“, der einen verpassten Tag rettet.
- **Tagesziel-Ring** auf der Startseite
- **Abzeichen** zum Beispiel für 100 BPM, 7-Tage-Streak oder „Level 1 geschafft“

### Profil

- Linkshänder-Modus, Einstellungen, Latenz-Ausgleich
- Statistik und Abzeichen
- **Export/Import** des Fortschritts als JSON-Datei, als Sicherung
- **Konto erstellen**: Dein Gast-Fortschritt wird übernommen. Du bekommst **einmalig einen Recovery-Code**. Schreib ihn auf, denn damit setzt du das Passwort zurück (es gibt keine E-Mail-Zurücksetzung).

---

## 3. Auf Cloudflare veröffentlichen

Du brauchst einen kostenlosen Cloudflare-Account.

### Schritt 1: Datenbank anlegen

```bash
npx wrangler login
npx wrangler d1 create bass-db
```

Kopiere die ausgegebene `database_id` in [wrangler.toml](wrangler.toml) bei `database_id`.

### Schritt 2: Tabellen anlegen

```bash
npm run db:migrate:remote
```

### Schritt 3: Projekt anlegen und deployen

Du hast zwei Wege.

**Weg A: per Kommandozeile**

```bash
npx wrangler pages project create bass-lernen --production-branch main
npm run build
npx wrangler pages deploy dist
```

**Weg B: per GitHub**

1. Pushe das Projekt in ein GitHub-Repository.
2. Cloudflare-Dashboard, dann *Workers & Pages*, *Create*, *Pages*, *Connect to Git*.
3. Build-Befehl `npm run build`, Ausgabeordner `dist`.

### Schritt 4: Datenbank-Binding prüfen

Die Datei `wrangler.toml` enthält das Binding schon. Falls die API „DB nicht gefunden“ meldet: Projekt, *Settings*, *Bindings*, *Add*, *D1 database*, Name **`DB`**, Datenbank `bass-db` (für Production und Preview).

### Schritt 5: Testen

1. Öffne `https://<dein-projekt>.pages.dev`.
2. Erstelle ein Konto und notiere den Recovery-Code.
3. Melde dich ab und wieder an.
4. Prüfe das Login-Timing mit `npx wrangler pages deployment tail`. Erscheint „Exceeded CPU limit“, setze die Variable `PBKDF2_ITERATIONS` auf `50000` (Projekt, *Settings*, *Variables and Secrets*).

### Schritt 6: Geteiltes Kontingent schützen

Du teilst die 100.000 Function-Anfragen pro Tag mit einer anderen Website.

- Stelle im Dashboard sicher, dass der Failover-Modus **„Fail open“** ist. Dann bleiben die statischen Dateien auch nach Erreichen des Limits erreichbar, nur `/api/*` fällt aus. Die App behandelt das wie „offline“ und synchronisiert später. Ich konnte die Einstellung von hier aus nicht sehen, prüfe sie bitte selbst.
- Die `_routes.json` leitet nur `/api/*` an Functions. Das ist bereits eingestellt.
- Ein typischer Tag kostet rund 6 bis 10 API-Aufrufe pro aktivem Benutzer. Das ist eine Rechnung und keine Messung. Schau nach dem Start ins Dashboard.

### Optional

- **Datenschutz und Impressum**: Die Platzhalter stehen in [src/ui/views/legal.js](src/ui/views/legal.js). Fülle sie vor dem Start aus.
- **Turnstile (Bot-Schutz)**: Variablen `TURNSTILE_SECRET` und `VITE_TURNSTILE_SITEKEY` setzen. Die CSP in `public/_headers` muss dann um `https://challenges.cloudflare.com` erweitert werden. Details stehen in der [README.md](README.md).

### Als App installieren

Auf dem Handy: Browser-Menü, *Zum Startbildschirm hinzufügen*. Dank Service Worker laufen Lektionen und Werkzeuge danach offline. Der Sync holt sich später nach, was gefehlt hat.

---

## 4. Eigene Lektionen und Riffs hinzufügen

Alle Lektionen liegen als JSON in `public/content/`. Du brauchst dafür keinen Programmcode zu ändern.

### Neue Lektion

Öffne zum Beispiel `public/content/level2.json` und füge unter `modules[].lessons[]` ein:

```json
{
  "id": "l2-meine-lektion",
  "title": "Mein erstes eigenes Riff",
  "minutes": 8,
  "goal": "Ein Riff in E spielen",
  "steps": [
    {
      "type": "text",
      "title": "Worum geht es?",
      "body": ["Heute spielst du ein **einfaches Riff** auf der E-Saite."]
    },
    {
      "type": "tab",
      "text": "Spiele das Riff mit dem Klick mit.",
      "bpm": 80,
      "riff": {
        "id": "r-meine-lektion-1",
        "title": "E-Riff",
        "bpm": 80,
        "beats": 4,
        "sub": 2,
        "drums": "rock8",
        "bars": [
          "E0 ~ E0 G3 ~ A0 ~ G3",
          "E0 ~ E0 G3 ~ A0 ~ -"
        ]
      }
    }
  ]
}
```

Danach:

```bash
npm run check
```

Der Check meldet falsche Taktlängen, unbekannte Typen und doppelte IDs.

**Wichtig:** Die `id` einer Lektion muss eindeutig sein. Der Fortschritt hängt an ihr. Wenn du sie später umbenennst, beginnt die Lektion für alle wieder bei null.

### Riffs schreiben

Ein Takt ist ein String mit genau `beats × sub` Tokens, getrennt durch Leerzeichen.

| Token | Bedeutung |
|---|---|
| `E0`, `A2`, `D5`, `G7` | Saite (E, A, D, G) und Bund |
| `-` | Pause |
| `~` | Ton halten |

`sub` legt die Auflösung fest: 1 Viertel, 2 Achtel, 3 Triolen, 4 Sechzehntel.

Mit Technik-Zeichen hinter dem Bund:

| Zeichen | Technik | Beispiel |
|---|---|---|
| `g` | Ghost Note | `E0g` |
| `h` | Hammer-on | `A2h` |
| `p` | Pull-off | `A0p` |
| `/` `\` | Slide hoch und runter (im JSON `\\`) | `E5/` |
| `v` | Vibrato | `A5v` |

### Andere Schritt-Typen

Alle Typen mit ihren Feldern stehen in der Tabelle „Schritt-Typen“ in der [README.md](README.md). Ein Jam-Track-Schritt sieht zum Beispiel so aus:

```json
{ "type": "jam", "key": "A", "progression": "blues12", "genre": "blues", "bpm": 90,
  "text": "Spiele zu jedem Akkord den Grundton." }
```

### Neues Level veröffentlichen

1. Lege die Datei an, zum Beispiel `public/content/level4.json`.
2. Setze in `public/content/index.json` bei `level4` den Wert `"available": true`.
3. Passe in [src/state/badges.js](src/state/badges.js) die Anzahl der Lektionen und das Abzeichen an.
4. Führe `npm test` aus und deploye.

---

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Kein Ton | Einmal in die Seite tippen. Am iPhone Stumm-Schalter und Lautstärke prüfen. |
| Mikrofon erkennt nichts | Erlaubnis im Browser prüfen. Näher an den Verstärker oder das Mikrofon gehen. Laute Umgebung vermeiden. |
| Töne werden zu früh oder zu spät gewertet | Latenz-Ausgleich im Profil anpassen. |
| Sync-Hinweis „Wird später synchronisiert“ | Du bist offline oder die API ist nicht erreichbar. Dein Fortschritt bleibt lokal und wird nachgeholt. |
| Passwort vergessen | Auf der Login-Seite „Passwort zurücksetzen“ und den Recovery-Code eingeben. Ohne Code gibt es keinen Weg zurück. |
| Alte Version nach einem Update | Seite neu laden. Der Service Worker aktualisiert sich beim nächsten Besuch. |
