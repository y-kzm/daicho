-- 論文が誰でも読めるか (Open Access) の判定結果。判定は OpenAlex による。
-- oa_status: '' = 未判定、gold / diamond / hybrid / green / bronze / closed、unknown = OpenAlex に無い

ALTER TABLE entries ADD COLUMN oa_status     TEXT NOT NULL DEFAULT '';
ALTER TABLE entries ADD COLUMN oa_url        TEXT NOT NULL DEFAULT '';   -- 読める場所
ALTER TABLE entries ADD COLUMN oa_license    TEXT NOT NULL DEFAULT '';   -- 例: cc-by
ALTER TABLE entries ADD COLUMN oa_checked_at TEXT NOT NULL DEFAULT '';   -- 判定した日 (YYYY-MM-DD)
