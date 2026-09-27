# BUILD — Cloudflare への構築手順 (Web 操作中心)

Daicho を Cloudflare Workers + D1 に構築し、GitHub への push で自動デプロイされる状態にする手順です。
ほとんどの操作は **Cloudflare Dashboard と GitHub の Web 画面** で完結します。ターミナルが必要なのは次の 2 つだけです。

- 最初に GitHub へ push するとき (`git push`)
- 旧 Google スプレッドシート版のデータを移行するとき (任意、[7. データ移行](#7-データ移行-任意))

PDF を Google Drive に保存する設定 (任意、[手順 8](#8-pdf-を-google-drive-に保存する-任意)) も、Web 画面だけで完結します。

> Dashboard のメニュー名やボタン名は Cloudflare 側の更新で変わることがあります。見つからない場合は近い名前の項目を探してください。

## 全体の流れ

| 順 | 作業 | 場所 |
|---|---|---|
| 1 | GitHub にリポジトリを作って push | GitHub / ターミナル |
| 2 | D1 データベースを作り、ID を控える | Cloudflare |
| 3 | Worker を作り、GitHub と接続する (Workers Builds) | Cloudflare |
| 4 | 初回ビルドとデプロイを確認する | Cloudflare |
| 5 | **Cloudflare Access で自分だけに制限する** | Cloudflare |
| 6 | LLM の API キーを登録する (任意) | Cloudflare |
| 7 | データ移行 (任意) | Cloudflare または ターミナル |
| 8 | PDF を Google Drive に保存する (任意) | Google Cloud / Cloudflare |

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

`wrangler.toml` の `database_id` はプレースホルダ (`00000000-0000-0000-0000-000000000000`) です。実際の ID はリポジトリに書きません。Workers Builds の変数 `D1_DATABASE_ID` に登録し、デプロイ時に `wrangler.deploy.toml` を生成して使います。

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

1. Cloudflare Dashboard → **Storage & Databases** → **D1 SQL database** → **Create Database**
2. 名前に `daicho` を入力して **Create**
3. 作成後の画面に表示される **Database ID** を控える。手順 3 で Workers Builds の変数に登録する

**ID は `wrangler.toml` に書きません。** リポジトリにはプレースホルダだけを置きます。デプロイコマンドが `D1_DATABASE_ID` を読み、ID を差し込んだ `wrangler.deploy.toml` をビルド環境の中に生成します。

```toml
[[d1_databases]]
binding = "DB"
database_name = "daicho"
database_id = "00000000-0000-0000-0000-000000000000"   # このまま変更しない
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
| Deploy command | `npm run deploy:ci` |
| Root directory | 空のまま |

4. **Build variables and secrets** (ビルド用の変数) に次を追加する

| Variable name | 値 |
|---|---|
| `D1_DATABASE_ID` | 手順 2 で控えた Database ID |

5. **Save and Deploy** (または Create and deploy) を押す

### 既にある Worker に接続する場合

1. Dashboard → **Workers & Pages** → `daicho` → **Settings** → **Builds**
2. Git Repository の **Connect** (接続済みなら **Manage**) を押し、リポジトリと本番ブランチを選ぶ
3. Build command と Deploy command を上の表のとおりにし、ビルド用の変数 `D1_DATABASE_ID` を登録する

### 設定の意味

- **Build command** `npm run build`: Vite がフロントエンドを `dist/` に出力します。
- **Deploy command** `npm run deploy:ci`: 次の 3 つを順に実行します。`D1_DATABASE_ID` から `wrangler.deploy.toml` を生成する。未適用のマイグレーションだけを D1 に適用する。Worker と `dist/` をデプロイする。適用済みのマイグレーションは飛ばすので、毎回実行して問題ありません。
- **`D1_DATABASE_ID`**: ビルド用の変数です。Worker の実行時の変数 (Variables and Secrets) とは別の欄なので、Settings → Builds の側に登録します。
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
cp .env.example .env          # D1_DATABASE_ID に Database ID を記入 (初回だけ)
npm run config:render         # wrangler.deploy.toml を生成
npx wrangler d1 execute daicho --remote --config wrangler.deploy.toml --file=temp/import.sql
```

### 7-3. やり直す場合

Console で次を実行してから、もう一度流します。

```sql
DELETE FROM cites; DELETE FROM entry_tags; DELETE FROM entries;
DELETE FROM tags;  DELETE FROM projects;   DELETE FROM saved_filters;
```

## 8. PDF を Google Drive に保存する (任意)

論文の詳細パネルから PDF を選ぶと、あなたの Google Drive の「Daicho」フォルダに保存し、その URL を論文に付けます。**必ず手順 5 (Access) の後に行います。**

### 仕組みと安全性

| 項目 | 内容 |
|---|---|
| 保存先 | 接続した Google アカウントの Drive。フォルダ「Daicho」を自動で作ります |
| ファイル名 | `{BibTeX キー} - {タイトル}.pdf`。本文以外は ` (補足資料)` などを付けます |
| 共有 | 変更しません。保存した PDF を開けるのは、あなたの Google アカウントだけです |
| 権限 | `drive.file`。Daicho が保存したファイルだけを扱えます。Drive の他のファイルは読めません |
| 送信の経路 | ブラウザから Google へ直接送ります。Worker は送信先の発行だけを行います |
| 接続情報 | Google が発行する更新用トークンを D1 に保存します。API の応答とエクスポートには含めません |

### 8-1. Google Cloud でプロジェクトと API を用意する

1. [Google Cloud Console](https://console.cloud.google.com/) を開き、新しいプロジェクトを作る (名前は `daicho` など)
2. **API とサービス** → **ライブラリ** で **Google Drive API** を検索し、**有効にする**

### 8-2. 同意画面を設定する

1. **API とサービス** → **OAuth 同意画面** (Google Auth Platform) を開く
2. アプリ名 (`Daicho` など) とサポート用のメールアドレスを入力する
3. 対象は **外部** を選ぶ
4. **データアクセス** (スコープ) で、次のスコープを追加する

```
https://www.googleapis.com/auth/drive.file
```

5. **対象** (公開ステータス) で **アプリを公開** を押し、**本番環境** にする

> **手順 5 を省かないでください。** 「テスト中」のままだと、接続が 7 日で切れます。`drive.file` は機密性の高いスコープではないので、公開に Google の審査は必要ありません。

### 8-3. OAuth クライアントを作る

1. **API とサービス** → **認証情報** → **認証情報を作成** → **OAuth クライアント ID**
2. アプリケーションの種類は **ウェブ アプリケーション** を選ぶ
3. **承認済みのリダイレクト URI** に、次を追加する (サブドメインは自分のものに置き換える)

```
https://daicho.<サブドメイン>.workers.dev/api/drive/callback
```

4. 作成後に表示される **クライアント ID** と **クライアント シークレット** を控える

「承認済みの JavaScript 生成元」は空のままで構いません。

### 8-4. Cloudflare に登録する

クライアント シークレットは**リポジトリに書きません。** Dashboard に直接登録します。

1. **Workers & Pages** → `daicho` → **Settings** → **Variables and Secrets** → **Add**
2. Type は **Secret** を選び、次の 2 つを登録して **Deploy** を押す

| Variable name | 値 |
|---|---|
| `GOOGLE_CLIENT_ID` | 8-3 のクライアント ID |
| `GOOGLE_CLIENT_SECRET` | 8-3 のクライアント シークレット |

これは Worker の実行時の変数です。手順 3 のビルド用の変数 (`D1_DATABASE_ID`) とは別の欄です。

### 8-5. Daicho から接続する

1. Daicho で論文を開き、詳細パネルの **PDF** にある **Google Drive に接続** を押す
2. Google の画面でアカウントを選び、許可する
3. Daicho に戻り、「Google Drive に接続しました」と表示されれば完了

以後は **PDF を選ぶ** か、PDF をドロップすると保存されます。

### 知っておくこと

- PDF は 1 ファイル 100 MB まで、1 つの論文に 10 件までです。
- PDF を削除すると、Drive のゴミ箱へ移します。30 日以内なら Drive から戻せます。
- 論文を削除すると、付けていた PDF も Drive のゴミ箱へ移します。一括削除では 1 回 40 件までで、それを超えた分は Drive に残ります。
- 接続を外すには、サイドバーの **設定とリンク** → **Google Drive** → **接続を外す** を押します。Drive のファイルと、論文に付けた URL は残ります。
- 別の Google アカウントに接続し直すと、新しいアカウントの Drive に「Daicho」フォルダを作ります。以前の PDF は元のアカウントに残り、Daicho からは削除できなくなります。
- CSV のエクスポートには PDF の URL を含めません (従来の 17 列のままです)。JSON のエクスポートには含めます。

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
| 外部リクエスト 50 件/リクエスト | 論文の一括削除で Drive のゴミ箱へ移すのは 1 回 40 件まで |

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| ビルドが「Worker name が一致しない」で失敗 | Dashboard の Worker 名と `wrangler.toml` の `name` を同じにする |
| 依存関係のインストールが `npm ci can only install packages when ... are in sync` で失敗 | ビルド環境は npm 10 を使う。`npx npm@10 install --package-lock-only` でロックファイルを作り直して push する |
| wrangler が Node のバージョンで失敗 | `.nvmrc` が `22` であることを確認する。wrangler 4 は Node 22 以上が必要 |
| デプロイが `D1_DATABASE_ID がありません` で失敗 | Settings → Builds のビルド用の変数に `D1_DATABASE_ID` を登録する (手順 3) |
| デプロイが D1 のエラーで失敗 | `D1_DATABASE_ID` の値が Dashboard の Database ID と同じか確認する |
| 画面は出るが一覧が読み込めない | マイグレーションが未適用。Deploy command が表のとおりか確認し、再デプロイする |
| 「ログインセッションが切れました」と表示される | Access のセッション切れ。ページを再読み込みしてログインし直す |
| 概要生成がエラーになる | API キーの名前と Type (Secret) を確認する (手順 6) |
| PDF 欄に「Google Drive の設定が必要です」と出る | `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を Secret として登録し、Deploy する (手順 8-4) |
| Google の画面で `redirect_uri_mismatch` と出る | 承認済みのリダイレクト URI が、アプリの URL + `/api/drive/callback` と完全に一致しているか確認する (手順 8-3) |
| 数日で「接続が切れています」と出る | 同意画面が「テスト中」のまま。本番環境に公開してから接続し直す (手順 8-2) |
| PDF の送信が途中で失敗する | 通信を確認してやり直す。送信先の URL は 1 回ごとに発行するので、やり直しで問題ありません |
| シークレットウィンドウでログイン画面が出ない | Access が無効。手順 5 をやり直す |

## セキュリティの確認項目

- [ ] Access が **All traffic** で有効になっている (シークレットウィンドウで確認済み)
- [ ] API キーと Google のクライアント シークレットは Dashboard の **Secret** にだけ登録し、リポジトリに書いていない
- [ ] `wrangler.toml` の `database_id` がプレースホルダのままで、`.env` と `wrangler.deploy.toml` をコミットしていない
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

ローカルの開発とテストは、プレースホルダの ID のまま動きます。本番の D1 を手元から操作するとき (`npm run deploy`、`npm run db:migrate`) だけ、`.env` の `D1_DATABASE_ID` が必要です。
