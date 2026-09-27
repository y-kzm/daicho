# BUILD — Cloudflare への構築手順 (Web 操作中心)

Daicho を Cloudflare Workers + D1 に構築し、GitHub への push で自動デプロイされる状態にする手順です。
ほとんどの操作は **Cloudflare Dashboard と GitHub の Web 画面** で完結します。ターミナルが必要なのは次の 2 つだけです。

- 最初に GitHub へ push するとき (`git push`)
- 旧 Google スプレッドシート版のデータを移行するとき (任意、[7. データ移行](#7-データ移行-任意))

> Dashboard のメニュー名やボタン名は Cloudflare 側の更新で変わることがあります。見つからない場合は近い名前の項目を探してください。

## 全体の流れ

| 順 | 作業 | 場所 |
|---|---|---|
| 1 | GitHub にリポジトリを作って push | GitHub / ターミナル |
| 2 | D1 データベースを作り、ID を `wrangler.toml` に書く | Cloudflare / GitHub |
| 3 | Worker を作り、GitHub と接続する (Workers Builds) | Cloudflare |
| 4 | 初回ビルドとデプロイを確認する | Cloudflare |
| 5 | **Cloudflare Access で自分だけに制限する** | Cloudflare |
| 6 | LLM の API キーを登録する (任意) | Cloudflare |
| 7 | データ移行 (任意) | Cloudflare または ターミナル |

**順番を守る理由:** 手順 4 の直後は、アプリが誰でも開ける状態です。この時点では DB が空で API キーも未登録なので、露出するものはありません。API キーとデータは、手順 5 で Access を有効にしてから入れます。

## 必要なもの

- Cloudflare アカウント (Free プランで可)
- GitHub アカウント
- このリポジトリ

## 構成の前提

| 項目 | 値 | 定義場所 |
|---|---|---|
| Worker 名 | `daicho` | `wrangler.toml` の `name` |
| D1 データベース名 | `daicho` | `wrangler.toml` の `database_name` |
| D1 バインディング | `DB` | `wrangler.toml` の `binding` |
| 本番ブランチ | `main` | Workers Builds の設定 |
| ビルド出力 | `dist/` (gitignore 済み) | `vite.config.ts` |

`wrangler.toml` の `database_id` には、作成済みの D1 の ID が入っています。別の Cloudflare アカウントで構築する場合や D1 を作り直す場合は、手順 2 で置き換えてください。`database_id` は秘密情報ではないので、コミットして構いません。

---

## 1. GitHub にリポジトリを作って push

1. GitHub で **New repository** を開き、空のリポジトリを作る (README や .gitignore は追加しない)。個人の文献管理なら **Private** を推奨します。
2. ターミナルで push する。

```bash
git remote add origin git@github.com:<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

push の前に、API キーや個人データが入っていないことを確認します。

```bash
git grep -nIE 'sk-ant-|AIza[0-9A-Za-z_-]{30,}|ghp_|PRIVATE KEY' -- . ':!BUILD.md' || echo "OK: 見つかりません"
git status --short --ignored | grep -E 'csv|import.sql|\.dev\.vars|\.env' || echo "OK: 追跡対象外です"
```

## 2. D1 データベースを作る

> 既に `wrangler.toml` の ID の D1 を使う場合は、この手順を飛ばせます。

1. Cloudflare Dashboard → **Storage & Databases** → **D1 SQL database** → **Create Database**
2. 名前に `daicho` を入力して **Create**
3. 作成後の画面に表示される **Database ID** をコピーする
4. GitHub の Web 画面で `wrangler.toml` を開き、鉛筆アイコン (Edit) から `database_id` を書き換えて **Commit changes** する

```toml
[[d1_databases]]
binding = "DB"
database_name = "daicho"
database_id = "ここにコピーした ID"
migrations_dir = "migrations"
```

テーブルは手動で作りません。手順 3 のデプロイコマンドが `migrations/` の SQL を順に適用します。

## 3. Worker を作り、GitHub と接続する

### 新しく作る場合

1. Dashboard → **Workers & Pages** → **Create** → **Import a repository** (Git からの作成)
2. GitHub の認可画面で、GitHub App **Cloudflare Workers and Pages** をインストールする。アクセス範囲は **Only select repositories** を選び、このリポジトリだけを許可する
3. リポジトリを選び、次のとおり設定する

| 項目 | 値 |
|---|---|
| Project name | `daicho` (`wrangler.toml` の `name` と同じにする。違うとビルドが失敗します) |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler d1 migrations apply daicho --remote && npx wrangler deploy` |
| Root directory | 空のまま |

4. **Save and Deploy** (または Create and deploy) を押す

### 既にある Worker に接続する場合

1. Dashboard → **Workers & Pages** → `daicho` → **Settings** → **Builds**
2. Git Repository の **Connect** (接続済みなら **Manage**) を押し、リポジトリと本番ブランチを選ぶ
3. Build command と Deploy command を上の表のとおりにする

### 設定の意味

- **Build command** `npm run build`: Vite がフロントエンドを `dist/` に出力します。
- **Deploy command**: 先に未適用のマイグレーションだけを D1 に適用し、その後 Worker と `dist/` をデプロイします。適用済みのものは飛ばすので、毎回実行して問題ありません。
- テストを通過条件にしたい場合は、Build command を `npm run check && npm run build` にします。ビルド時間は延びます。

## 4. 初回ビルドとデプロイを確認する

1. **Workers & Pages** → `daicho` → **Deployments** (または Builds) でビルドログを開く
2. ログの最後に `https://daicho.<サブドメイン>.workers.dev` が表示されれば成功
3. ブラウザで `<URL>/api/health` を開き、`{"ok":true}` が表示されることを確認する

## 5. Cloudflare Access で自分だけに制限する

**この手順を終えるまで、アプリは誰でも開けます。**

1. 初めての場合は Dashboard → **Zero Trust** を開き、チーム名を決めて **Free** プランを選ぶ (50 ユーザーまで無料)
2. **Workers & Pages** → `daicho` → **Access** タブ → **Protect this Worker behind Access**
3. 範囲は **All traffic** を選ぶ (本番とプレビューの両方を保護)
4. ポリシーは **Cloudflare account** を選ぶ (このアカウントのメンバーだけがログインできる)。特定のメールアドレスだけにしたい場合は **Manage Cloudflare Access** からポリシーを編集する
5. **確認:** シークレットウィンドウでアプリの URL を開き、Access のログイン画面が出ることを確かめる

ログイン画面が出ずにアプリが表示された場合は、保護されていません。手順 2 からやり直してください。

## 6. LLM の API キーを登録する (任意)

概要生成とタグ提案を使う場合だけ必要です。**API キーはリポジトリに書きません。** Dashboard に直接登録します。

1. **Workers & Pages** → `daicho` → **Settings** → **Variables and Secrets** → **Add**
2. Type は **Secret** を選ぶ (Text ではなく)
3. 次の名前で登録し、**Deploy** を押す

| Variable name | 用途 |
|---|---|
| `GEMINI_API_KEY` | Google Gemini |
| `ANTHROPIC_API_KEY` | Anthropic Claude |

片方だけでも動きます。Secret は以後のデプロイでも保持されます。

`CONTACT_MAILTO` (Crossref などに伝える連絡先) は Secret ではありません。Dashboard で Text として設定すると次のデプロイで上書きされるので、`wrangler.toml` の `[vars]` に書いてコミットします。

## 7. データ移行 (任意)

旧 Google スプレッドシート版から移す場合の手順です。**必ず手順 5 の後に行います。** 移行は冪等ではないので、空の DB に 1 回だけ実行します。

### 7-1. SQL を作る (ターミナル)

各シートを CSV で書き出し、リポジトリの外か `temp/` (gitignore 済み) に置きます。

```bash
npm ci
npm run import-sheet --silent -- \
  --main  "path/to/シート1.csv" \
  --tags  "path/to/_タグ一覧.csv" \
  > temp/import.sql
```

`--projects` (プロジェクトのシート) は任意です。`--layout` は受け付けますが使いません。件数の要約は標準エラーに出ます。

### 7-2. D1 に流す

**方法 A: Web (Dashboard)**

1. **Storage & Databases** → **D1 SQL database** → `daicho` → **Console**
2. `temp/import.sql` の内容を貼り付けて **Execute**
3. 件数が多くて貼り付けに失敗する場合は、数百行ずつに分けて実行する (上から順に。`entries` → `tags` → `entry_tags` の順序を崩さない)
4. **Tables** で `entries` の件数を確認する

**方法 B: ターミナル**

```bash
npx wrangler login
npx wrangler d1 execute daicho --remote --file=temp/import.sql
```

### 7-3. やり直す場合

Console で次を実行してから、もう一度流します。

```sql
DELETE FROM cites; DELETE FROM entry_tags; DELETE FROM entries;
DELETE FROM tags;  DELETE FROM projects;   DELETE FROM saved_filters;
```

---

## 日常の運用

| やりたいこと | 操作 |
|---|---|
| コードを更新して公開する | `main` に push する。自動でビルドとデプロイが走る |
| 公開前に試す | 別ブランチに push する。プレビュー URL が作られ、Pull Request にコメントされる (Access で保護される) |
| ビルドの結果を見る | **Workers & Pages** → `daicho` → **Deployments** / **Builds** のログ |
| 前の版に戻す | **Deployments** で戻したい版を選び **Rollback** |
| スキーマを変える | `migrations/` に `000N_*.sql` を追加して push する。デプロイコマンドが適用する |
| 実行時のエラーを見る | **Workers & Pages** → `daicho` → **Logs** (Real-time logs) |
| 自動デプロイを止める | **Settings** → **Builds** でビルドを無効化する |

GitHub の Web 画面でファイルを編集してコミットした場合も、`main` への push と同じく自動デプロイされます。

## 無料プランの制限

| 制限 | アプリ側の対応 |
|---|---|
| Worker の CPU 時間 10 ms/リクエスト | 重い処理はしない設計 |
| 外部リクエスト 50 件/リクエスト | BibTeX 出力は 1 回 45 件まで |
| 同上 | 出版国の再判定は 1 回 15 件ずつ |
| D1 の呼び出し回数 | 一括操作は 1 回 200 件まで |
| Zero Trust Free | 50 ユーザーまで、ログ保持 24 時間 |

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| ビルドが「Worker name が一致しない」で失敗 | Dashboard の Worker 名と `wrangler.toml` の `name` を同じにする |
| デプロイが D1 のエラーで失敗 | `database_id` が正しいか確認する (手順 2) |
| 画面は出るが一覧が読み込めない | マイグレーションが未適用。Deploy command が表のとおりか確認し、再デプロイする |
| 「ログインセッションが切れました」と表示される | Access のセッション切れ。ページを再読み込みしてログインし直す |
| 概要生成がエラーになる | API キーの名前と Type (Secret) を確認する (手順 6) |
| シークレットウィンドウでログイン画面が出ない | Access が無効。手順 5 をやり直す |

## セキュリティの確認項目

- [ ] Access が **All traffic** で有効になっている (シークレットウィンドウで確認済み)
- [ ] API キーは Dashboard の **Secret** にだけ登録し、リポジトリに書いていない
- [ ] CSV と `import.sql` をコミットしていない (`temp/` とルート直下の `*.csv` は gitignore 済み)
- [ ] GitHub App の権限は、このリポジトリだけに限定している
- [ ] リポジトリを Public にする場合、`wrangler.toml` の `CONTACT_MAILTO` に公開したくないアドレスを書いていない

## ローカルで開発する場合 (参考)

```bash
npm ci
npm run db:migrate:local   # ローカル D1 にスキーマを適用
npm run build              # dist/ を生成
npm run dev                # http://localhost:8787
npm run dev:web            # フロントだけを Vite で開発 (/api は 8787 へ中継)
npm run check              # 型検査とテスト
```
