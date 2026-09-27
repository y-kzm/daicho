CREATE TABLE entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  added         TEXT NOT NULL,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL DEFAULT '',
  doi           TEXT NOT NULL DEFAULT '',
  year          TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  publisher     TEXT NOT NULL DEFAULT '',
  journal       TEXT NOT NULL DEFAULT '',
  impact_factor TEXT NOT NULL DEFAULT '',
  conference    TEXT NOT NULL DEFAULT '',
  core          TEXT NOT NULL DEFAULT '',
  bibkey        TEXT NOT NULL DEFAULT '',
  read          TEXT NOT NULL DEFAULT '未読',
  note          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL
);

CREATE TABLE entry_tags (
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL
);

CREATE TABLE cites (
  entry_id   INTEGER NOT NULL REFERENCES entries(id)  ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  state      TEXT NOT NULL,
  PRIMARY KEY (entry_id, project_id)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_entries_added  ON entries(added, id);
CREATE INDEX idx_entries_doi    ON entries(doi);
CREATE INDEX idx_entries_bibkey ON entries(bibkey);
