export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CONTACT_MAILTO?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Google Drive への保存に使う OAuth クライアント (Secret として登録する) */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
