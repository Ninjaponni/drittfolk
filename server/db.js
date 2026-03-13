import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'drittfolk.db')

const db = new Database(DB_PATH)

// WAL-modus for bedre concurrent reads
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS avatars (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
    language TEXT NOT NULL DEFAULT 'no' CHECK(language IN ('no', 'en')),
    personality_type TEXT NOT NULL,
    character_model TEXT NOT NULL,
    texture_variant INTEGER NOT NULL DEFAULT 1,
    hair_color TEXT NOT NULL DEFAULT '#2D2D2D',
    top_color TEXT NOT NULL DEFAULT '#2563EB',
    pants_color TEXT NOT NULL DEFAULT '#2D2D2D',
    position_x REAL NOT NULL DEFAULT 0,
    position_y REAL NOT NULL DEFAULT 0,
    position_z REAL NOT NULL DEFAULT 0,
    stats_insults_given INTEGER NOT NULL DEFAULT 0,
    stats_insults_received INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_interaction_at TEXT
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    speaker_id TEXT NOT NULL REFERENCES avatars(id),
    target_id TEXT NOT NULL REFERENCES avatars(id),
    dialogue TEXT NOT NULL,
    response_dialogue TEXT NOT NULL,
    speaker_animation TEXT NOT NULL DEFAULT 'talking',
    target_animation TEXT NOT NULL DEFAULT 'idle',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_interactions_speaker ON interactions(speaker_id);
  CREATE INDEX IF NOT EXISTS idx_interactions_target ON interactions(target_id);

  -- Eksperiment-runder
  CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    winner_id TEXT,
    participant_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT
  );

  CREATE TABLE IF NOT EXISTS round_participants (
    round_id TEXT NOT NULL REFERENCES rounds(id),
    avatar_id TEXT NOT NULL REFERENCES avatars(id),
    final_rank INTEGER,
    final_status INTEGER,
    eliminated_at TEXT,
    eliminated_by TEXT,
    PRIMARY KEY (round_id, avatar_id)
  );

  CREATE TABLE IF NOT EXISTS round_events (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL REFERENCES rounds(id),
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_round_events_round ON round_events(round_id);
`)

// Migration: legg til email-kolonne hvis den mangler
const cols = db.prepare("PRAGMA table_info(avatars)").all()
if (!cols.some(c => c.name === 'email')) {
  db.exec("ALTER TABLE avatars ADD COLUMN email TEXT NOT NULL DEFAULT ''")
}
if (!cols.some(c => c.name === 'texture_variant')) {
  db.exec("ALTER TABLE avatars ADD COLUMN texture_variant INTEGER NOT NULL DEFAULT 1")
}

export default db
