import { BroadcastIpLocationService } from './broadcast-ip-location.service';

describe('BroadcastIpLocationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not send private or loopback addresses to the provider', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new BroadcastIpLocationService();

    expect(service.isPrivateAddress('127.0.0.1')).toBe(true);
    expect(service.isPrivateAddress('::ffff:192.168.1.20')).toBe(true);
    expect(service.isPrivateAddress('10.1.2.3')).toBe(true);
    await expect(service.lookup('192.168.1.20')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves and caches approximate public IP information', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          city: 'San Jose',
          region: 'California',
          country: 'United States',
          country_code: 'US',
          latitude: 37.33,
          longitude: -121.89,
          connection: { org: 'Example Network' },
        }),
    } as Response);
    const service = new BroadcastIpLocationService();

    const first = await service.lookup('8.8.8.8');
    const second = await service.lookup('8.8.8.8');

    expect(first).toEqual({
      city: 'San Jose',
      region: 'California',
      country: 'United States',
      countryCode: 'US',
      latitude: 37.33,
      longitude: -121.89,
      organization: 'Example Network',
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(typeof requestUrl).toBe('string');
    if (typeof requestUrl !== 'string') {
      throw new Error('Expected the IP provider request URL to be a string.');
    }
    expect(requestUrl).toContain('https://ipwho.is/8.8.8.8');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });
});
