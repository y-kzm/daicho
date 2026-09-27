-- 論文に付ける PDF (実体は Google Drive)。1 論文に複数。
CREATE TABLE attachments (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  kind     TEXT    NOT NULL,
  file_id  TEXT    NOT NULL UNIQUE,
  name     TEXT    NOT NULL,
  url      TEXT    NOT NULL,
  size     INTEGER NOT NULL DEFAULT 0,
  added_at TEXT    NOT NULL
);

CREATE INDEX idx_attachments_entry ON attachments(entry_id, id);

-- Google Drive との接続 (1 行だけ)。API の応答とエクスポートには含めない。
CREATE TABLE drive_auth (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT NOT NULL,
  folder_id     TEXT NOT NULL DEFAULT '',
  connected_at  TEXT NOT NULL
);
