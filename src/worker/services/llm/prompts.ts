export function buildSummaryPrompt(title: string, abstract: string): string {
  return (
    'あなたは研究文献データベースの「概要」欄を書くアシスタントです。\n' +
    '以下の論文の内容を日本語で要約してください。これ以外の文献を参照しないでください。\n' +
    '要約のフォーマット:\n' +
    '提案手法はどのようなものか？: \n' +
    '先行研究と比べてすごいことは？: \n' +
    '各項目は 1〜2 文で簡潔に。アブストラクトから読み取れない項目は「不明 (要本文確認)」と書くこと。\n' +
    '専門用語の略語 (NDP, DAD, SRv6 など) はそのまま使って構いません。正称を書く必要もありません。\n' +
    '各項目は「見出し？: 回答」の形で、見出しと回答を同じ行に書くこと。見出しの疑問符は全角「？」を使うこと。\n' +
    'Markdown 記法 (**、#、箇条書き記号など) は一切使わず、プレーンテキストで出力すること。\n' +
    '出力は要約のみとし、前置きを付けないでください。\n\n' +
    'タイトル: ' + title + '\n' +
    (abstract
      ? 'アブストラクト: ' + abstract
      : 'アブストラクト: (取得できませんでした)\n' +
        'アブストラクトが無くても、追加情報を求めたり出力を断ったりしないこと。' +
        'タイトルから推定できる範囲で上記フォーマットの要約を必ず出力し、' +
        '推定できない項目は「不明 (要本文確認)」と書くこと。')
  );
}

export function sanitizeSummary(s: string): string {
  let t = String(s || '').trim();
  t = t.replace(/```[a-z]*\n?/gi, '');
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/^#+\s*/gm, '');
  t = t.replace(/^[\-\*・]\s+/gm, '');
  t = t.replace(/(^|\n)([^\n]{1,40}[？?])\s*[:：]?\s*\n+/g, '$1$2: ');
  return t.trim();
}

const TAG_RULES =
  'ルール:\n' +
  '- 一覧に無いタグを作らない・変形しない\n';

export function buildTagPrompt(tags: string[], title: string, context: string): string {
  return (
    'あなたは研究文献データベースのタグ付けアシスタントです。\n' +
    '以下の論文に付けるべきタグを、次の「タグ一覧」の中からだけ選んでください。\n' +
    'タグ一覧: ' + JSON.stringify(tags) + '\n' +
    TAG_RULES +
    '- 該当するものだけを 0〜4 個選ぶ (無理に付けない)\n' +
    '- 出力は JSON 配列のみ。前置きや説明を付けない。例: ["タグ1","タグ2"]\n\n' +
    'タイトル: ' + title + '\n' +
    (context ? '内容: ' + context : '(内容情報なし。タイトルから判断)')
  );
}

export function buildBatchTagPrompt(
  tags: string[],
  items: { id: number; title: string; venue: string; summary: string }[],
): string {
  const lines = items.map(
    (it) => '[' + it.id + '] ' + it.title + (it.venue ? ' (' + it.venue + ')' : '') + (it.summary ? '\n  内容: ' + it.summary : ''),
  );
  return (
    'あなたは研究文献データベースのタグ付けアシスタントです。\n' +
    '以下の各論文に付けるべきタグを、次の「タグ一覧」の中からだけ選んでください。\n' +
    'タグ一覧: ' + JSON.stringify(tags) + '\n' +
    TAG_RULES +
    '- 各論文につき該当するものだけを 0〜4 個選ぶ (無理に付けない)\n' +
    '- 出力は JSON オブジェクトのみ。キーは [] 内の番号、値はタグの配列。\n' +
    '  例: {"5": ["タグ1","タグ2"], "6": []}\n\n' +
    lines.join('\n')
  );
}
