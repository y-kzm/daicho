import { nextYearUrls, type SiteSearchResult, type Venue, type VenueEdition } from '../../shared/venues';
import { fetchPage } from './fetch-page';

const CANDIDATES_MAX = 6;

/** 自分自身や内部のネットワークを指す宛先は取得しない */
export function isPublicUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  // 末尾のピリオド (localhost. など) は、同じ宛先を指すので取り除いてから調べる
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host || (!host.includes('.') && !host.includes(':'))) return false; // localhost など
  if (/(^|\.)(local|internal|localhost|lan|home|corp|intranet)$/.test(host)) return false;
  if (host.includes(':')) {
    // IPv6 は、グローバルユニキャスト (2000::/3) だけを通す。IPv4 を埋め込んだ形 (::a.b.c.d、::ffff:、64:ff9b::) は通さない
    // 6to4 (2002::/16) と Teredo (2001:0::/32) も、IPv4 を埋め込んでいるので通さない
    return /^[23][0-9a-f]{3}:/.test(host) && !/^2002:|^2001:(0?:|:)/.test(host);
  }
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ip) return true;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224);
}

/** その年のサイトの候補。近い年の開催のサイトから、年を置き換えて作る */
export function siteCandidates(venue: Venue, edition: VenueEdition): string[] {
  const others = venue.editions
    .filter((e) => e.id !== edition.id && e.siteUrl && e.year !== edition.year)
    .sort((a, b) => Math.abs(a.year - edition.year) - Math.abs(b.year - edition.year) || b.year - a.year);
  const out: string[] = [];
  for (const e of others) {
    for (const u of nextYearUrls(e.siteUrl, e.year, edition.year)) {
      if (!out.includes(u) && isPublicUrl(u)) out.push(u);
    }
    if (out.length >= CANDIDATES_MAX) break;
  }
  return out.slice(0, CANDIDATES_MAX);
}

/**
 * 候補を順に取得し、最初に見つかったサイトを返す。
 * 200 が返るだけでは足りない (無いページを入口へ転送するサイトがある) ので、本文にその年が出てくることも確かめる。
 */
export async function findSite(venue: Venue, edition: VenueEdition): Promise<SiteSearchResult> {
  const tried: string[] = [];
  for (const url of siteCandidates(venue, edition)) {
    tried.push(url);
    const res = await fetchPage(url);
    if (res.status === 200 && res.text.includes(String(edition.year))) return { siteUrl: url, tried };
  }
  return { siteUrl: '', tried };
}
