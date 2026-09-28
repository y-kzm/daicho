-- 文献の種類 (paper / rfc / draft / whitepaper / other) と、標準文書などの状態
ALTER TABLE entries ADD COLUMN kind       TEXT NOT NULL DEFAULT 'paper';
ALTER TABLE entries ADD COLUMN doc_status TEXT NOT NULL DEFAULT '';

-- 登録済みの RFC と Internet-Draft を振り分ける。自動入力が入れる形だけを対象にする
-- (「Draft-and-Verify」のような論文のタイトルや、rfc で始まる別の語を拾わないため)。
--   RFC: DOI が 10.17487/rfcN、発行元、タイトルが「RFC N: …」、BibTeX キーが rfcN または rfcN + 1 文字 (N は 5 桁まで)
--   I-D: 発行元、BibTeX キーが draft-xxx-yyy、タイトルが「draft-…-NN: …」
UPDATE entries SET kind = 'rfc'
 WHERE lower(doi) LIKE '10.17487/rfc%' OR publisher = 'RFC Editor (IETF)' OR title GLOB 'RFC [0-9]*:*' OR (substr(lower(bibkey), 1, 3) = 'rfc' AND substr(bibkey, 4, 1) GLOB '[0-9]' AND length(ltrim(substr(lower(bibkey), 4), '0123456789')) <= 1 AND length(substr(bibkey, 4)) - length(ltrim(substr(lower(bibkey), 4), '0123456789')) <= 5);

UPDATE entries SET kind = 'draft'
 WHERE kind = 'paper'
   AND (publisher = 'IETF (Internet-Draft)' OR lower(bibkey) GLOB 'draft-[a-z0-9]*-[a-z0-9]*' OR lower(title) GLOB 'draft-*-[0-9][0-9]:*');
