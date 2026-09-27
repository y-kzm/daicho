// ============================================================
// ★ カスタマイズ用の設定・テーブル (後から編集しやすいようここに集約)
// ============================================================

// ---- 外部 API への連絡先 (推奨) ----
// Crossref / OpenAlex の "polite pool" 対応。メールアドレスを設定すると
// リクエストに mailto= が付与され、優先的なレート枠と障害時の連絡が可能になる。
// 空のままでも動作する (匿名プールになるだけ)。
export const CONTACT_MAILTO_DEFAULT = '';

// ---- 要約生成に使うモデル ----
export const GEMINI_MODEL = 'gemini-flash-latest'; // 動かない場合は 'gemini-2.5-flash' 等に変更
export const GEMINI_FALLBACK_MODEL = 'gemini-flash-lite-latest'; // 混雑 (503) 時の代替
export const CLAUDE_MODEL = 'claude-haiku-4-5'; // Anthropic の軽量モデル (要約用途に十分)

// ---- ハイブリッド会場テーブル ----
// ジャーナル形式で出版されるが実体は会議録のもの (Crossref では
// journal-article 型になる)。左の正規表現がジャーナル名にマッチしたら、
// 右の会議名をカンファレンス欄に自動補完する (CORE 検索しやすい名前にする)。
// 新しい会場が出てきたらここに 1 行追加すればよい。
export const HYBRID_VENUES: readonly [RegExp, string][] = [
  [/privacy enhancing technologies/i,
    'Privacy Enhancing Technologies Symposium (PETS)'],
  [/proceedings of the acm on networking/i, 'ACM CoNEXT'],
  [/vldb endowment/i, 'International Conference on Very Large Data Bases (VLDB)'],
  [/measurement and analysis of computing systems/i, 'ACM SIGMETRICS'],
  [/interactive, mobile, wearable and ubiquitous/i, 'ACM UbiComp (IMWUT)'],
];

// ---- 出版国の手動上書きテーブル ----
// OpenAlex (ISSN 登録国) と JCR (出版オフィス所在地) で国が食い違う
// ジャーナルをここに登録すると、自動判定より優先される。
// 左の正規表現がジャーナル名 (なければカンファレンス名) にマッチしたら右の国を使う。
export const COUNTRY_OVERRIDES: readonly [RegExp, string][] = [
  [/^computer communications$/i, 'オランダ'], // OpenAlex=GB / JCR=NETHERLANDS
  [/^digital communications and networks$/i, '中国'], // KeAi(北京)発行 / JCR=CHINA MAINLAND
];

// ---- 出版国の日本語変換テーブル ----
// (1) COUNTRY_CODE_JA: OpenAlex の ISO 3166 国コード → 日本語
//     (ジャーナル自体の国。JCR の Region と同じ意味)
// (2) COUNTRY_JA: 英語国名 → 日本語 (出版社名や Crossref members の所在地用)
// 未登録の国はコード/英語のまま入力されるので、必要に応じてここに追加する。
export const COUNTRY_CODE_JA: Record<string, string> = {
  US: 'アメリカ', GB: 'イギリス', DE: 'ドイツ', NL: 'オランダ', CH: 'スイス',
  JP: '日本', CN: '中国', FR: 'フランス', IT: 'イタリア', ES: 'スペイン',
  HU: 'ハンガリー', ID: 'インドネシア', SI: 'スロベニア', KR: '韓国',
  SG: 'シンガポール', IN: 'インド', CA: 'カナダ', AU: 'オーストラリア',
  BR: 'ブラジル', PL: 'ポーランド', SE: 'スウェーデン', AT: 'オーストリア',
  BE: 'ベルギー', DK: 'デンマーク', NO: 'ノルウェー', FI: 'フィンランド',
  IE: 'アイルランド', GR: 'ギリシャ', PT: 'ポルトガル', TR: 'トルコ',
  EG: 'エジプト', IR: 'イラン', SA: 'サウジアラビア', MY: 'マレーシア',
  TW: '台湾', HK: '香港', NZ: 'ニュージーランド', RO: 'ルーマニア',
  CZ: 'チェコ', RU: 'ロシア', MX: 'メキシコ', ZA: '南アフリカ',
  AE: 'アラブ首長国連邦', IL: 'イスラエル', TH: 'タイ', VN: 'ベトナム',
  PK: 'パキスタン', UA: 'ウクライナ',
};
export const COUNTRY_JA: Record<string, string> = {
  'united states': 'アメリカ', 'usa': 'アメリカ',
  'united kingdom': 'イギリス', 'uk': 'イギリス', 'england': 'イギリス',
  'germany': 'ドイツ', 'netherlands': 'オランダ', 'switzerland': 'スイス',
  'japan': '日本', 'china': '中国', 'france': 'フランス', 'italy': 'イタリア',
  'spain': 'スペイン', 'hungary': 'ハンガリー', 'indonesia': 'インドネシア',
  'slovenia': 'スロベニア', 'south korea': '韓国', 'korea': '韓国',
  'singapore': 'シンガポール', 'india': 'インド', 'canada': 'カナダ',
  'australia': 'オーストラリア', 'brazil': 'ブラジル', 'poland': 'ポーランド',
  'sweden': 'スウェーデン', 'austria': 'オーストリア', 'belgium': 'ベルギー',
  'denmark': 'デンマーク', 'norway': 'ノルウェー', 'finland': 'フィンランド',
  'ireland': 'アイルランド', 'greece': 'ギリシャ', 'portugal': 'ポルトガル',
  'turkey': 'トルコ', 'egypt': 'エジプト', 'iran': 'イラン',
  'saudi arabia': 'サウジアラビア', 'malaysia': 'マレーシア',
  'taiwan': '台湾', 'hong kong': '香港', 'new zealand': 'ニュージーランド',
  'romania': 'ルーマニア', 'czechia': 'チェコ', 'czech republic': 'チェコ',
};
