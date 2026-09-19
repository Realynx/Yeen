/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { User } from '../../shared/services/types';
import type { ClientExperience } from '../../navigation/services/clientExperience';
import {
  getRuntimeWebAddons,
  toApiErrorMessage,
} from '../../shared/services/api';
import { loadAddonWebModule } from './addonRuntimeLoader';
import {
  createAddonRegistrationContext,
  emptyAddonHostRegistry,
  mergeAddonRegistrations,
  type LoadedAddonRegistration,
} from './addonRuntimeRegistry';
import type {
  AddonHostRegistry,
  RegisteredAddonStyle,
} from './addonRuntime.types';

interface AddonHostContextValue extends AddonHostRegistry {
  accessToken: string;
  user: User;
  clientExperience: ClientExperience;
  onLogout: () => void;
}

const AddonHostContext = createContext<AddonHostContextValue | null>(null);

interface AddonHostProviderProps extends PropsWithChildren {
  token: string;
  user: User;
  clientExperience: ClientExperience;
  onLogout: () => void;
}

export function AddonHostProvider({
  token,
  user,
  clientExperience,
  onLogout,
  children,
}: AddonHostProviderProps) {
  const [registry, setRegistry] = useState<AddonHostRegistry>(() =>
    emptyAddonHostRegistry(true),
  );

  useEffect(() => {
    let cancelled = false;
    const styleElements: HTMLElement[] = [];

    async function loadRuntimeAddons() {
      setRegistry(emptyAddonHostRegistry(true));

      try {
        const manifest = await getRuntimeWebAddons(token);
        const registrations: LoadedAddonRegistration[] = [];
        const errors: AddonHostRegistry['errors'] = [];

        for (const addon of manifest.items) {
          if (cancelled) {
            return;
          }

          const { context, registration } =
            createAddonRegistrationContext(addon);
          try {
            await loadAddonWebModule(addon, token, context);
            registrations.push(registration);
          } catch (failure) {
            errors.push({
              addonId: addon.id,
              message: failure instanceof Error
                ? failure.message
                : `Unable to load ${addon.name}.`,
            });
          }
        }

        if (cancelled) {
          return;
        }

        const nextRegistry = mergeAddonRegistrations(registrations);
        nextRegistry.errors = errors;
        for (const style of nextRegistry.styles) {
          const element = installAddonStyle(style, token);
          if (element) {
            styleElements.push(element);
          }
        }
        setRegistry(nextRegistry);
      } catch (failure) {
        if (!cancelled) {
          const nextRegistry = emptyAddonHostRegistry(false);
          nextRegistry.errors = [{
            addonId: 'runtime',
            message: toApiErrorMessage(
              failure,
              'Unable to load optional add-ons.',
            ),
          }];
          setRegistry(nextRegistry);
        }
      }
    }

    void loadRuntimeAddons();

    return () => {
      cancelled = true;
      styleElements.forEach((element) => element.remove());
    };
  }, [token]);

  const value = useMemo<AddonHostContextValue>(
    () => ({
      ...registry,
      accessToken: token,
      user,
      clientExperience,
      onLogout,
    }),
    [clientExperience, onLogout, registry, token, user],
  );

  return (
    <AddonHostContext.Provider value={value}>
      {children}
    </AddonHostContext.Provider>
  );
}

export function useAddonHost(): AddonHostContextValue {
  const context = useContext(AddonHostContext);
  if (!context) {
    throw new Error('useAddonHost must be used inside AddonHostProvider.');
  }
  return context;
}

function installAddonStyle(
  style: RegisteredAddonStyle,
  accessToken: string,
): HTMLElement | null {
  const key = `${style.addon.id}:${style.id}`;
  const existing = document.head.querySelector<HTMLElement>(
    `[data-yeen-addon-style="${CSS.escape(key)}"]`,
  );
  if (existing) {
    return null;
  }

  if (style.cssText) {
    const element = document.createElement('style');
    element.dataset.yeenAddonStyle = key;
    element.textContent = style.cssText;
    document.head.append(element);
    return element;
  }

  if (!style.href) {
    return null;
  }

  const page = new URL(window.location.href);
  const href = new URL(style.href, page.origin);
  if (
    href.origin !== page.origin
    || (href.protocol !== 'http:' && href.protocol !== 'https:')
  ) {
    throw new Error(`Add-on style must use the Yeen origin: ${style.id}`);
  }

  href.searchParams.set('access_token', accessToken);
  const element = document.createElement('link');
  element.dataset.yeenAddonStyle = key;
  element.rel = 'stylesheet';
  element.href = href.toString();
  document.head.append(element);
  return element;
}
