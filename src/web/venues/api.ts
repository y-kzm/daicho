import type { LlmProvider } from '../../shared/types';
import type { EditionInput, ExtractedEdition, SiteSearchResult, VenueData, VenueImport, VenueInput, WikicfpHit } from '../../shared/venues';
import { call } from '../api';

const LONG_MS = 90000;

export interface ImportSummary { venueId: number; created: boolean; added: number; updated: number; kept: number }

export const venuesApi = {
  load: () => call<VenueData>('GET', '/venues'),
  add: (v: VenueInput) => call<VenueData & { id: number }>('POST', '/venues', v),
  update: (id: number, v: VenueInput) => call<VenueData>('PUT', `/venues/${id}`, v),
  setArchived: (id: number, archived: boolean) => call<VenueData>('PATCH', `/venues/${id}/archived`, { archived }),
  remove: (id: number) => call<VenueData>('DELETE', `/venues/${id}`),
  addEdition: (venueId: number, e: EditionInput) => call<VenueData & { id: number }>('POST', `/venues/${venueId}/editions`, e),
  nextEdition: (venueId: number) =>
    call<VenueData & { id: number; site: SiteSearchResult }>('POST', `/venues/${venueId}/editions/next`, {}, LONG_MS),
  updateEdition: (id: number, e: EditionInput) => call<VenueData>('PUT', `/venues/editions/${id}`, e),
  removeEdition: (id: number) => call<VenueData>('DELETE', `/venues/editions/${id}`),
  findSite: (id: number) => call<SiteSearchResult>('POST', `/venues/editions/${id}/find-site`, {}, LONG_MS),
  extract: (id: number, url: string, provider: LlmProvider) =>
    call<ExtractedEdition>('POST', `/venues/editions/${id}/extract`, { url, provider }, LONG_MS),
  importVenue: (data: VenueImport) => call<VenueData & { summary: ImportSummary }>('POST', '/venues/import', data),
  searchWikicfp: (q: string) => call<{ hits: WikicfpHit[] }>('GET', `/venues/wikicfp/search?q=${encodeURIComponent(q)}`, undefined, LONG_MS),
  wikicfpEvent: (eventId: number) => call<VenueImport>('GET', `/venues/wikicfp/events/${eventId}`, undefined, LONG_MS),
  issueToken: () => call<VenueData>('POST', '/venues/calendar/token'),
  revokeToken: () => call<VenueData>('DELETE', '/venues/calendar/token'),
  downloadUrl: '/api/venues/calendar.ics',
};

/** カレンダーの購読用の URL (Google カレンダーの「URL で追加」に貼る) */
export function feedUrl(origin: string, token: string, includeEstimated: boolean): string {
  return `${origin}/cal/${token}.ics${includeEstimated ? '' : '?estimated=0'}`;
}
