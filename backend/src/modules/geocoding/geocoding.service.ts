import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { safeErrorMessage } from '../../common/utils/redact';

const TIMEOUT_MS = 5_000;
const NOMINATIM_MIN_INTERVAL_MS = 1_100; // OSM usage policy: max 1 request per second
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
const MAX_LABEL = 150;

/** Subset of a Nominatim `addressdetails` object. */
export interface NominatimAddress {
  house_number?: string;
  road?: string;
  locality?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  district?: string;
  city_district?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
}

/**
 * Turns coordinates from a shared Telegram location into a human address ("street 9,
 * district, city") so customers, admins and amoCRM operators see a place, not numbers.
 * Best effort: any failure returns null and the caller falls back to coordinates.
 *
 * Providers: OpenStreetMap Nominatim (default, free, no key, 1 req/s) or Yandex Geocoder
 * (YANDEX_GEOCODER_API_KEY; better house-level data and Uzbek names).
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, { at: number; label: string | null }>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastNominatimCall = 0;

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return this.config.values.geocoder.provider !== 'none';
  }

  async reverse(latitude: number, longitude: number): Promise<string | null> {
    if (!this.enabled) return null;
    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.label;

    let label: string | null = null;
    try {
      label =
        this.config.values.geocoder.provider === 'yandex'
          ? await this.yandex(latitude, longitude)
          : await this.throttled(() => this.nominatim(latitude, longitude));
    } catch (err) {
      this.logger.warn({ msg: 'Reverse geocoding failed', err: safeErrorMessage(err) });
    }
    label = label ? truncateLabel(label) : null;

    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { at: Date.now(), label });
    return label;
  }

  /** Serializes Nominatim calls and keeps them ≥1.1 s apart, as its usage policy requires. */
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastNominatimCall + NOMINATIM_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastNominatimCall = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async nominatim(latitude: number, longitude: number): Promise<string | null> {
    const { nominatimUrl, email } = this.config.values.geocoder;
    const url = new URL(`${nominatimUrl}/reverse`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    if (email) url.searchParams.set('email', email);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'water-order-bot/1.0', 'Accept-Language': 'uz,ru' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = (await res.json()) as { address?: NominatimAddress; error?: string };
    return data.address ? formatNominatimAddress(data.address) : null;
  }

  private async yandex(latitude: number, longitude: number): Promise<string | null> {
    const url = new URL('https://geocode-maps.yandex.ru/1.x/');
    url.searchParams.set('apikey', this.config.values.geocoder.yandexApiKey!);
    url.searchParams.set('geocode', `${longitude},${latitude}`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('lang', 'uz_UZ');
    url.searchParams.set('results', '1');

    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Yandex geocoder HTTP ${res.status}`);
    const data = (await res.json()) as {
      response?: {
        GeoObjectCollection?: {
          featureMember?: Array<{ GeoObject?: { metaDataProperty?: { GeocoderMetaData?: { text?: string } } } }>;
        };
      };
    };
    const text = data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.text;
    // "Oʻzbekiston, Toshkent, …" → drop the country, it is always the same.
    return text ? text.split(',').map((p) => p.trim()).filter((p, i) => !(i === 0 && /^o[‘'ʻ`]?zbekiston$/i.test(p))).join(', ') : null;
  }
}

/**
 * "Street 9, neighbourhood, district, city" from OSM components. Skips a neighbourhood that
 * merely repeats the street name (common in Tashkent: "Chilonzor 9 kvartal" / "Chilonzor-9").
 */
export function formatNominatimAddress(a: NominatimAddress): string | null {
  const base = a.road ?? a.locality ?? null;
  const street = base ? [base, a.house_number].filter(Boolean).join(' ') : null;
  const area = a.neighbourhood ?? a.quarter ?? a.suburb ?? null;
  const district = a.district ?? a.city_district ?? a.county ?? null;
  const city = a.city ?? a.town ?? a.village ?? null;

  const parts: string[] = [];
  const add = (part: string | null) => {
    if (!part) return;
    const norm = part.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (parts.some((p) => p.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5) === norm.slice(0, 5))) return;
    parts.push(part);
  };
  add(street);
  add(area);
  add(district);
  add(city);
  return parts.length ? parts.join(', ') : null;
}

function truncateLabel(label: string): string {
  return label.length <= MAX_LABEL ? label : `${label.slice(0, MAX_LABEL - 1)}…`;
}
