import type { PropsWithChildren } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Blocks,
  ChevronRight,
  Puzzle,
  ServerCog,
  Settings2,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { User } from '../../shared/services/types';
import type { ClientExperience } from '../../navigation/services/clientExperience';
import { roleLabel } from '../../auth/services/roles';
import { useAddonHost } from '../../addons/runtime/AddonHostContext';
import {
  createSettingsNavigation,
  isSettingsNavigationItemActive,
  type SettingsNavigationIcon,
  type SettingsNavigationItem,
} from './settingsNavigation';

const SETTINGS_ICON_BY_ID: Record<SettingsNavigationIcon, LucideIcon> = {
  profile: UserRound,
  system: ServerCog,
  accounts: UsersRound,
  addons: Blocks,
  addon: Puzzle,
};

interface SettingsAppShellProps extends PropsWithChildren {
  user: User;
  experience: ClientExperience;
  title: string;
  description: string;
}

function SettingsNavigationLink({
  item,
  active,
  experience,
}: {
  item: SettingsNavigationItem;
  active: boolean;
  experience: ClientExperience;
}) {
  const Icon = SETTINGS_ICON_BY_ID[item.icon];
  const compact = experience === 'phone';

  return (
    <Button
      asChild
      variant={active ? 'secondary' : 'ghost'}
      className={compact
        ? 'h-auto min-h-11 shrink-0 justify-start gap-2 rounded-xl px-3 py-2'
        : 'h-auto min-h-12 w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left'}
    >
      <NavLink
        to={item.to}
        end={item.end}
        aria-current={active ? 'page' : undefined}
        data-tv-focus-key={`settings-navigation:${item.id}`}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className={compact ? 'text-sm font-medium' : 'min-w-0 flex-1'}>
          <span className={compact ? undefined : 'block text-sm font-medium'}>
            {item.label}
          </span>
          {compact ? null : (
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              {item.description}
            </span>
          )}
        </span>
        {compact ? null : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </NavLink>
    </Button>
  );
}

export function SettingsAppShell({
  user,
  experience,
  title,
  description,
  children,
}: SettingsAppShellProps) {
  const { pathname } = useLocation();
  const { navigation } = useAddonHost();
  const navigationGroups = createSettingsNavigation(user.role, navigation);
  const phone = experience === 'phone';
  const shellClassName = 'grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4';

  const navigationContent = (
    <nav
      aria-label="Settings sections"
      data-tv-focus-lane-id="settings-app-navigation"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {navigationGroups.map((group) => (
        <div
          key={group.id}
          className="contents"
        >
          <div className="contents">
            {group.items.map((item) => (
              <SettingsNavigationLink
                key={item.id}
                item={item}
                active={isSettingsNavigationItemActive(pathname, item)}
                experience={experience}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <section
      className={shellClassName}
      data-settings-shell
      data-settings-experience={experience}
    >
      <div>
        <Card
          className="overflow-hidden border-border/70 bg-card/90 shadow-sm backdrop-blur"
          data-settings-page-header
        >
          <CardHeader className={phone ? 'gap-3 p-4' : 'gap-3 p-5'}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Settings2 className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription className="mt-1">{description}</CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {roleLabel(user.role)}
              </Badge>
            </div>
          </CardHeader>
          {phone ? (
            <CardContent className="px-4 pb-4">
              {navigationContent}
            </CardContent>
          ) : null}
        </Card>
      </div>

      <div className="min-w-0" data-settings-content>
        {children}
      </div>
    </section>
  );
}
