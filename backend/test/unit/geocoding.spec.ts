import { AppConfigService } from '../../src/config/app-config.service';
import { formatNominatimAddress, GeocodingService } from '../../src/modules/geocoding/geocoding.service';

describe('formatNominatimAddress (real Tashkent responses)', () => {
  it('locality + house, skips a neighbourhood that repeats it', () => {
    expect(
      formatNominatimAddress({
        house_number: '13/1',
        locality: 'Chilonzor 9 kvartal',
        neighbourhood: 'Chilonzor-9',
        suburb: 'Чиланзар',
        district: 'Чиланзарский район',
        city: 'Toshkent',
      }),
    ).toBe('Chilonzor 9 kvartal 13/1, Чиланзарский район, Toshkent');
  });

  it('road + house, mahalla, district, city', () => {
    expect(
      formatNominatimAddress({
        house_number: '9',
        road: 'Зиёлилар улица',
        neighbourhood: 'Сайрам махалля',
        suburb: 'Карасу',
        district: 'Mirzo Ulug‘bek Tumani',
        city: 'Toshkent',
      }),
    ).toBe('Зиёлилар улица 9, Сайрам махалля, Mirzo Ulug‘bek Tumani, Toshkent');
  });

  it('district only', () => {
    expect(formatNominatimAddress({ district: 'Юнусабадский район', city: 'Кашгар махалля' })).toBe('Юнусабадский район, Кашгар махалля');
    expect(formatNominatimAddress({})).toBeNull();
  });
});

describe('GeocodingService', () => {
  const config = (provider: string) =>
    ({ values: { geocoder: { provider, nominatimUrl: 'https://nominatim.test' } } }) as unknown as AppConfigService;
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => (fetchSpy = jest.spyOn(global, 'fetch')));
  afterEach(() => fetchSpy.mockRestore());

  it('is a no-op when disabled', async () => {
    expect(await new GeocodingService(config('none')).reverse(41.3, 69.2)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks Nominatim in Uzbek/Russian, formats and caches the result', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ address: { road: 'Bunyodkor', house_number: '12', city: 'Toshkent' } })));
    const geo = new GeocodingService(config('nominatim'));
    expect(await geo.reverse(41.28561, 69.20341)).toBe('Bunyodkor 12, Toshkent');
    expect(await geo.reverse(41.28562, 69.20342)).toBe('Bunyodkor 12, Toshkent'); // same ~10 m cell → cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('https://nominatim.test/reverse?format=jsonv2&lat=41.28561&lon=69.20341');
    expect(init.headers['Accept-Language']).toBe('uz,ru');
  });

  it('never throws: network errors and bad responses give null', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await new GeocodingService(config('nominatim')).reverse(1, 1)).toBeNull();
    fetchSpy.mockResolvedValueOnce(new Response('busy', { status: 503 }));
    expect(await new GeocodingService(config('nominatim')).reverse(2, 2)).toBeNull();
  });
});
