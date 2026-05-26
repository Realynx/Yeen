import { describe, expect, it } from 'vitest';
import { shouldHandleBackKey } from './tvDirectionalFocus.helpers';

describe('tvDirectionalFocus helpers', () => {
  it('treats Escape as Back on player pages too', () => {
    expect(shouldHandleBackKey({ key: 'Escape' } as KeyboardEvent, 'player')).toBe(true);
  });

  it('recognizes common TV remote Back key aliases', () => {
    expect(shouldHandleBackKey({ key: 'BrowserBack' } as KeyboardEvent, 'home')).toBe(true);
    expect(shouldHandleBackKey({ key: 'GoBack' } as KeyboardEvent, 'home')).toBe(true);
    expect(shouldHandleBackKey({ key: 'Back' } as KeyboardEvent, 'home')).toBe(true);
  });
});
