# Features: Naming and Organization

This folder uses a feature-first structure. Keep names predictable so imports are easy to scan.

## Folder Conventions

- Top-level feature folders use kebab-case.
	- Examples: auth, media-details, media-management
- Layer folders use lowercase.
	- components, pages, services
- Group folders under a layer use kebab-case.
	- Examples: assign-to-show, system-settings-categories

## File Conventions

- React component and page files use PascalCase.
	- Examples: MediaDetailsPage.tsx, SystemSettingsTab.tsx
- Hooks and non-component modules use camelCase.
	- Examples: useMediaDetailsData.ts, filenameParse.ts, detectRules.ts
- Do not use hyphenated filenames for TypeScript modules.
	- Prefer useAssignmentPreview.ts over use-assignment-preview.ts
- Utility and data logic belongs in services, not components.
	- Example: scanProgressUtils.ts is in settings/services

## Import Rules

- Import directly from the feature path where the implementation lives.
- Avoid compatibility shim paths.
- Keep imports explicit instead of wide barrel exports across features.

## Current Primary Feature Paths

- features/auth
- features/home
- features/library
- features/media-details
- features/media-explore
- features/media-management
- features/navigation
- features/player
- features/settings
- features/shared