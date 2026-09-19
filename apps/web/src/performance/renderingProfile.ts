export type RenderingProfile = 'hardware' | 'software' | 'unknown';

interface RenderingProbeResult {
  acceleratedContextAvailable: boolean;
  fallbackContextAvailable: boolean;
  renderer: string | null;
}

interface RendererContext {
  getExtension(name: string): unknown;
  getParameter(parameter: number): unknown;
}

interface CanvasProbe {
  getContext(
    contextId: 'webgl2' | 'webgl',
    options?: WebGLContextAttributes,
  ): RendererContext | null;
}

interface RenderingDetectionOptions {
  createCanvas?: () => CanvasProbe;
}

interface RenderingProfileRoot {
  dataset: DOMStringMap;
}

const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|basic render driver|mesa offscreen|lavapipe/i;

export function classifyRenderingBackend({
  acceleratedContextAvailable,
  fallbackContextAvailable,
  renderer,
}: RenderingProbeResult): RenderingProfile {
  if (renderer && SOFTWARE_RENDERER_PATTERN.test(renderer)) return 'software';
  if (acceleratedContextAvailable) return 'hardware';
  if (fallbackContextAvailable) return 'software';
  return 'unknown';
}

function createWebGlContext(
  createCanvas: () => CanvasProbe,
  options: WebGLContextAttributes,
): RendererContext | null {
  for (const contextId of ['webgl2', 'webgl'] as const) {
    try {
      const context = createCanvas().getContext(contextId, options);
      if (context) return context;
    } catch {
      // Browser privacy settings and hardened WebViews may block canvas probing.
    }
  }
  return null;
}

function readRenderer(context: RendererContext | null): string | null {
  if (!context) return null;
  try {
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL?: number;
    } | null;
    const parameter = debugInfo?.UNMASKED_RENDERER_WEBGL;
    if (typeof parameter !== 'number') return null;
    const value = context.getParameter(parameter);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function detectRenderingProfile(
  options: RenderingDetectionOptions = {},
): RenderingProfile {
  const createCanvas = options.createCanvas ?? (() => {
    if (typeof document === 'undefined') {
      throw new Error('Rendering profile detection requires a document.');
    }
    return document.createElement('canvas');
  });
  const acceleratedContext = createWebGlContext(createCanvas, {
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'high-performance',
  });
  if (acceleratedContext) {
    return classifyRenderingBackend({
      acceleratedContextAvailable: true,
      fallbackContextAvailable: true,
      renderer: readRenderer(acceleratedContext),
    });
  }

  const fallbackContext = createWebGlContext(createCanvas, {
    failIfMajorPerformanceCaveat: false,
  });
  return classifyRenderingBackend({
    acceleratedContextAvailable: false,
    fallbackContextAvailable: Boolean(fallbackContext),
    renderer: readRenderer(fallbackContext),
  });
}

export function applyRenderingProfile(
  profile: RenderingProfile,
  root: RenderingProfileRoot = document.documentElement,
): RenderingProfile {
  root.dataset.yeenRenderingProfile = profile;
  return profile;
}

export function initializeRenderingProfile(): RenderingProfile {
  return applyRenderingProfile(detectRenderingProfile());
}
