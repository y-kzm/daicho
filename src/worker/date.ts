/** Asia/Tokyo の今日を YYYY-MM-DD で返す */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
}
