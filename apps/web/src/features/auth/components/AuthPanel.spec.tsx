import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';

describe('AuthPanel native server connection', () => {
  it('offers server configuration before a native client signs in', () => {
    const markup = renderToStaticMarkup(
      <AuthPanel
        onAuthenticated={vi.fn()}
        showServerConfiguration
      />,
    );

    expect(markup).toContain('aria-label="Yeen server connection"');
    expect(markup).toContain('https://media.example.com/api');
    expect(markup).toContain('Save Server');
  });

  it('keeps the server form out of ordinary browser login', () => {
    const markup = renderToStaticMarkup(
      <AuthPanel onAuthenticated={vi.fn()} />,
    );

    expect(markup).not.toContain('aria-label="Yeen server connection"');
  });
});
