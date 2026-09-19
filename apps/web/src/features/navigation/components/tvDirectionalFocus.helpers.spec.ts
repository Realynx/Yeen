import { describe, expect, it } from 'vitest';
import { isEditableElement, shouldHandleBackKey } from './tvDirectionalFocus.helpers';

describe('tvDirectionalFocus helpers', () => {
  it('treats Escape as Back on player pages too', () => {
    expect(shouldHandleBackKey({ key: 'Escape' } as KeyboardEvent, 'player')).toBe(true);
  });

  it('recognizes common TV remote Back key aliases', () => {
    expect(shouldHandleBackKey({ key: 'BrowserBack' } as KeyboardEvent, 'home')).toBe(true);
    expect(shouldHandleBackKey({ key: 'GoBack' } as KeyboardEvent, 'home')).toBe(true);
    expect(shouldHandleBackKey({ key: 'Back' } as KeyboardEvent, 'home')).toBe(true);
  });

  it('does not trap directional focus on range controls', () => {
    const range = {
      dataset: {},
      isContentEditable: false,
      tagName: 'INPUT',
      type: 'range',
    } as unknown as HTMLElement;

    expect(isEditableElement(range)).toBe(false);
  });

  it('reserves editable handling for explicit TV text-entry controls', () => {
    const textInput = {
      dataset: { tvTextEntry: 'true' },
      isContentEditable: false,
      tagName: 'INPUT',
      type: 'text',
    } as unknown as HTMLElement;

    expect(isEditableElement(textInput)).toBe(true);
  });
});
