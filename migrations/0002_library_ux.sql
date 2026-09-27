ALTER TABLE entries  ADD COLUMN starred        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries  ADD COLUMN priority       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries  ADD COLUMN last_opened_at TEXT    NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN note           TEXT    NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN archived       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cites    ADD COLUMN position       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cites    ADD COLUMN memo           TEXT    NOT NULL DEFAULT '';

CREATE TABLE saved_filters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  query      TEXT NOT NULL
);

CREATE INDEX idx_entries_last_opened ON entries(last_opened_at);
