import {
  buildNvidiaNvencProbeArgsValue,
  HlsTranscodeCapabilityService,
} from './hls-transcode-capability.service';

class TestCapabilityService extends HlsTranscodeCapabilityService {
  readonly probe = jest.fn<Promise<boolean>, [string]>();

  protected override probeNvidiaNvenc(ffmpegPath: string): Promise<boolean> {
    return this.probe(ffmpegPath);
  }
}

describe('HlsTranscodeCapabilityService', () => {
  it('probes with dimensions supported by NVENC', () => {
    expect(buildNvidiaNvencProbeArgsValue()).toContain(
      'color=size=256x256:rate=1',
    );
    expect(buildNvidiaNvencProbeArgsValue()).not.toContain(
      'color=size=64x64:rate=1',
    );
  });

  it('uses and caches NVIDIA when automatic probing succeeds', async () => {
    const service = new TestCapabilityService();
    service.probe.mockResolvedValue(true);

    await expect(service.resolveVideoEncoder('auto', 'ffmpeg')).resolves.toBe(
      'nvidia',
    );
    await expect(service.resolveVideoEncoder('auto', 'ffmpeg')).resolves.toBe(
      'nvidia',
    );
    expect(service.probe).toHaveBeenCalledTimes(1);
  });

  it('falls back to CPU when NVIDIA is unavailable', async () => {
    const service = new TestCapabilityService();
    service.probe.mockResolvedValue(false);

    await expect(service.resolveVideoEncoder('nvidia', 'ffmpeg')).resolves.toBe(
      'cpu',
    );
  });

  it('does not probe NVIDIA when CPU mode is explicit', async () => {
    const service = new TestCapabilityService();

    await expect(service.resolveVideoEncoder('cpu', 'ffmpeg')).resolves.toBe(
      'cpu',
    );
    expect(service.probe).not.toHaveBeenCalled();
  });
});
