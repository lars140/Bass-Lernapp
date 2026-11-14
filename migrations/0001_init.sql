-- Schema v1. Bewusst schlank: Lektionsinhalte liegen NICHT in der Datenbank (statische JSON im Frontend).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,            -- wie eingegeben (Anzeige)
  username_lc   TEXT    NOT NULL,            -- kleingeschrieben (Suche, eindeutig)
  email         TEXT    NOT NULL,            -- kleingeschrieben
  password_hash TEXT    NOT NULL,            -- PBKDF2-SHA256, base64
  salt          TEXT    NOT NULL,            -- 16 Byte zufällig, base64, pro Benutzer
  iterations    INTEGER NOT NULL,            -- pro Hash gespeichert, später erhöhbar
  recovery_hash TEXT    NOT NULL,            -- SHA-256 (hex) des Wiederherstellungscodes
  created_at    INTEGER NOT NULL             -- ms seit 1970
);
CREATE UNIQUE INDEX idx_users_username_lc ON users (username_lc);
CREATE UNIQUE INDEX idx_users_email       ON users (email);

CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,            -- SHA-256 (hex) des Cookie-Tokens
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL                -- ms seit 1970
);
CREATE INDEX idx_sessions_user    ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Der gesamte Fortschritt eines Benutzers als EIN JSON-Datensatz: 1 Lesen / 1 Schreiben pro Sync.
CREATE TABLE progress (
  user_id    INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  version    INTEGER NOT NULL,               -- zählt Server-Schreibvorgänge (optimistische Sperre)
  updated_at INTEGER NOT NULL
);

-- Rate-Limiting: nur FEHLVERSUCHE (und Registrierungen) werden gezählt.
CREATE TABLE login_attempts (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT    NOT NULL,                      -- z. B. login:ip:1.2.3.4 | login:id:max | reg:ip:… | reset:ip:…
  ts  INTEGER NOT NULL
);
CREATE INDEX idx_attempts_key_ts ON login_attempts (key, ts);
CREATE INDEX idx_attempts_ts     ON login_attempts (ts);
