import { describe, expect, it } from 'vitest';
import { resolveClientExperience } from './clientExperience';

describe('resolveClientExperience', () => {
  it('keeps a native Android phone in the phone experience', () => {
    expect(resolveClientExperience({
      width: 412,
      height: 915,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A) AppleWebKit/537.36',
      coarsePointer: true,
      hoverNone: true,
      isNativeAndroid: true,
      forceNativeAndroidTv: false,
    })).toBe('phone');
  });

  it('recognizes Android TV without relying on viewport dimensions', () => {
    expect(resolveClientExperience({
      width: 1920,
      height: 1080,
      userAgent: 'Mozilla/5.0 (Linux; Android 12; Android TV Build/STT2)',
      coarsePointer: false,
      hoverNone: true,
      isNativeAndroid: true,
      forceNativeAndroidTv: false,
    })).toBe('tv');
  });

  it('recognizes the native television marker on a clean AOSP TV install', () => {
    expect(resolveClientExperience({
      width: 960,
      height: 540,
      userAgent: 'Mozilla/5.0 (Linux; Android 12; sdk_gphone64_x86_64) YeenTV/1.0 Android TV',
      coarsePointer: false,
      hoverNone: true,
      isNativeAndroid: true,
      forceNativeAndroidTv: false,
    })).toBe('tv');
  });

  it('allows the dedicated TV package to explicitly force TV controls', () => {
    expect(resolveClientExperience({
      width: 412,
      height: 915,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; generic Build/AP4A)',
      coarsePointer: true,
      hoverNone: true,
      isNativeAndroid: true,
      forceNativeAndroidTv: true,
    })).toBe('tv');
  });
});
