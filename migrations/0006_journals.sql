-- 論文誌を国際会議と分けて管理するための項目。表は共有し、kind で区別する。

ALTER TABLE venues ADD COLUMN issn        TEXT NOT NULL DEFAULT '';
ALTER TABLE venues ADD COLUMN review_time TEXT NOT NULL DEFAULT '';   -- 査読期間の目安 (例: 3 か月)
ALTER TABLE venues ADD COLUMN submit_url  TEXT NOT NULL DEFAULT '';   -- 投稿先の URL
