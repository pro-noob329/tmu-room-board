CREATE TABLE IF NOT EXISTS reports (
  place_id TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  free_reports INTEGER NOT NULL DEFAULT 0,
  shared_reports INTEGER NOT NULL DEFAULT 0,
  busy_reports INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (place_id, day)
);

CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT NOT NULL,
  day TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS memos_day_place ON memos(day, place_id, created_at);

CREATE TABLE IF NOT EXISTS presence (
  client_id TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS presence_seen ON presence(seen_at);

CREATE TABLE IF NOT EXISTS stays (
  place_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (place_id, client_id)
);

CREATE INDEX IF NOT EXISTS stays_seen ON stays(seen_at);
