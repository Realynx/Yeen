import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  applyRenderingProfile,
  classifyRenderingBackend,
  detectRenderingProfile,
} from './renderingProfile';

describe('rendering profile', () => {
  it.each([
    'Google SwiftShader',
    'ANGLE (Microsoft, Microsoft Basic Render Driver)',
    'llvmpipe (LLVM 18.1.8, 256 bits)',
    'Mesa OffScreen',
    'lavapipe',
  ])('recognizes software renderer %s', (renderer) => {
    expect(classifyRenderingBackend({
      acceleratedContextAvailable: true,
      fallbackContextAvailable: true,
      renderer,
    })).toBe('software');
  });

  it('uses the rich profile only when WebGL accepts the major-performance-caveat guard', () => {
    expect(classifyRenderingBackend({
      acceleratedContextAvailable: true,
      fallbackContextAvailable: true,
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Direct3D11)',
    })).toBe('hardware');
  });

  it('uses the low-paint profile when only a fallback WebGL context is available', () => {
    expect(classifyRenderingBackend({
      acceleratedContextAvailable: false,
      fallbackContextAvailable: true,
      renderer: null,
    })).toBe('software');
  });

  it('defaults an unavailable or blocked probe to the conservative profile', () => {
    expect(classifyRenderingBackend({
      acceleratedContextAvailable: false,
      fallbackContextAvailable: false,
      renderer: null,
    })).toBe('unknown');
  });

  it('probes with failIfMajorPerformanceCaveat before accepting hardware rendering', () => {
    const getContext = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ getExtension: () => null, getParameter: () => null });
    const profile = detectRenderingProfile({
      createCanvas: () => ({ getContext }),
    });

    expect(profile).toBe('software');
    expect(getContext.mock.calls[0]?.[1]).toMatchObject({
      failIfMajorPerformanceCaveat: true,
      powerPreference: 'high-performance',
    });
  });

  it('publishes the detected profile for Core and add-on CSS', () => {
    const root = { dataset: {} as DOMStringMap };

    expect(applyRenderingProfile('software', root)).toBe('software');
    expect(root.dataset.yeenRenderingProfile).toBe('software');
  });

  it('loads the low-paint policy after every visual theme', () => {
    const indexCss = readFileSync(new URL('../styles/index.css', import.meta.url), 'utf8');
    const policyCss = readFileSync(
      new URL('../styles/responsive/rendering-profile.css', import.meta.url),
      'utf8',
    );

    expect(indexCss.trimEnd()).toMatch(/@import '\.\/responsive\/rendering-profile\.css';$/);
    expect(policyCss).toContain(":root[data-yeen-rendering-profile='software'] *");
    expect(policyCss).toContain(":root[data-yeen-rendering-profile='unknown'] *");
    expect(policyCss).toContain('backdrop-filter: none !important;');
    expect(policyCss).toContain('-webkit-backdrop-filter: none !important;');
  });
});
