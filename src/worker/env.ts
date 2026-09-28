export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CONTACT_MAILTO?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Google Drive への保存に使う OAuth クライアント (Secret として登録する) */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Cloudflare Access の認証を Worker でも検証するための設定 (例: myteam.cloudflareaccess.com) */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access のアプリケーションの AUD。複数ある場合はカンマで区切る */
  ACCESS_AUD?: string;
}
