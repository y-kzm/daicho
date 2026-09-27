export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CONTACT_MAILTO?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}
