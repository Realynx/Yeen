import { Navigate } from 'react-router-dom';

type AddonRouteFallbackResolution =
  | { kind: 'pending' }
  | { kind: 'redirect'; to: '/' };

function resolveAddonRouteFallback(
  loading: boolean,
): AddonRouteFallbackResolution {
  return loading
    ? { kind: 'pending' }
    : { kind: 'redirect', to: '/' };
}

export function AddonRouteFallback({ loading }: { loading: boolean }) {
  const resolution = resolveAddonRouteFallback(loading);
  if (resolution.kind === 'redirect') {
    return <Navigate to={resolution.to} replace />;
  }

  return (
    <main role="status" aria-live="polite">
      Loading optional add-ons…
    </main>
  );
}
