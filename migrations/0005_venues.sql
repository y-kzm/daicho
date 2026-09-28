-- 会議・論文誌の管理。論文の台帳 (entries) とは独立したテーブル群。
-- venue = 会議・論文誌そのもの、edition = 年ごとの開催 (サイト・開催日・締切を持つ)。

CREATE TABLE venues (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT    NOT NULL DEFAULT 'conference',   -- conference / journal
  acronym       TEXT    NOT NULL DEFAULT '',
  name          TEXT    NOT NULL,
  org           TEXT    NOT NULL DEFAULT '',             -- ACM / IEEE / USENIX など
  field         TEXT    NOT NULL DEFAULT '',
  core          TEXT    NOT NULL DEFAULT '',
  impact_factor TEXT    NOT NULL DEFAULT '',
  site_url      TEXT    NOT NULL DEFAULT '',             -- 年によらない入口のサイト
  note          TEXT    NOT NULL DEFAULT '',
  source        TEXT    NOT NULL DEFAULT 'manual',       -- manual / ccfddl
  source_key    TEXT    NOT NULL DEFAULT '',             -- 公開データ側の識別子
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);

CREATE UNIQUE INDEX idx_venues_source ON venues(source, source_key) WHERE source_key != '';

CREATE TABLE venue_editions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id   INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  label      TEXT    NOT NULL DEFAULT '',                -- 特集号の名前など。通常は空
  site_url   TEXT    NOT NULL DEFAULT '',                -- その年のサイト
  place      TEXT    NOT NULL DEFAULT '',
  date_text  TEXT    NOT NULL DEFAULT '',                -- 開催日の表記 (例: Oct 12-16, 2026)
  start_date TEXT    NOT NULL DEFAULT '',                -- YYYY-MM-DD
  end_date   TEXT    NOT NULL DEFAULT '',
  estimated  INTEGER NOT NULL DEFAULT 0,                 -- 前年からの予想
  source     TEXT    NOT NULL DEFAULT 'manual',
  note       TEXT    NOT NULL DEFAULT '',
  UNIQUE (venue_id, year, label)
);

CREATE INDEX idx_venue_editions_venue ON venue_editions(venue_id, year);

CREATE TABLE venue_deadlines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  edition_id INTEGER NOT NULL REFERENCES venue_editions(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL,                           -- abstract / paper / notification / camera / other
  label      TEXT    NOT NULL DEFAULT '',                -- 複数回ある場合の名前 (例: Cycle 1)
  due_local  TEXT    NOT NULL,                           -- YYYY-MM-DD または YYYY-MM-DD HH:MM (timezone での時刻)
  timezone   TEXT    NOT NULL DEFAULT 'AoE',
  estimated  INTEGER NOT NULL DEFAULT 0,
  source     TEXT    NOT NULL DEFAULT 'manual',          -- manual / ccfddl / ai
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_venue_deadlines_edition ON venue_deadlines(edition_id, position);
