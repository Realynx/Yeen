import type { Dispatch, SetStateAction } from 'react';
import {
  USER_SETTINGS_SECTION_IDS,
  type UserSettingsCategoryId,
} from './userSettings.types';

type ExpandedCategories = Record<UserSettingsCategoryId, boolean>;

export function toggleUserSettingsCategory(
  setExpandedCategories: Dispatch<SetStateAction<ExpandedCategories>>,
  category: UserSettingsCategoryId,
) {
  setExpandedCategories((current) => ({
    ...current,
    [category]: !current[category],
  }));
}

export function openAndScrollToUserSettingsCategory(
  setExpandedCategories: Dispatch<SetStateAction<ExpandedCategories>>,
  category: UserSettingsCategoryId,
) {
  const sectionId = USER_SETTINGS_SECTION_IDS[category];

  setExpandedCategories((current) => ({
    ...current,
    [category]: true,
  }));

  const section = document.getElementById(sectionId);
  if (!section) {
    return;
  }

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const nextHash = `#${sectionId}`;
  if (window.location.hash !== nextHash) {
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, '', nextUrl);
  }
}
