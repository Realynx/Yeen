import type { ConfigService } from '@nestjs/config';
import type { SystemSettingsStore } from '../../infrastructure/stores/system-settings.store';
import { SystemSettingsService } from './system-settings.service';

describe('SystemSettingsService TheAudioDB settings', () => {
  it('reports custom key presence without exposing its value', async () => {
    const service = createService({
      theAudioDbCustomApiKey: 'premium-secret',
      theAudioDbChartCountry: 'ca',
    });

    const settings = await service.getPublicSettings();

    expect(settings.theAudioDbHasCustomApiKey).toBe(true);
    expect(settings.theAudioDbChartCountry).toBe('CA');
    expect(settings).not.toHaveProperty('theAudioDbCustomApiKey');
  });

  it('uses the enabled free-key defaults when no settings are stored', async () => {
    const service = createService({});

    await expect(service.getPublicSettings()).resolves.toMatchObject({
      theAudioDbEnabled: true,
      theAudioDbHasCustomApiKey: false,
      theAudioDbChartCountry: 'US',
    });
  });
});

function createService(persisted: Record<string, unknown>) {
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  const store = {
    get: jest.fn().mockResolvedValue(persisted),
    replace: jest.fn().mockResolvedValue(undefined),
  } as unknown as SystemSettingsStore;
  return new SystemSettingsService(config, store);
}
