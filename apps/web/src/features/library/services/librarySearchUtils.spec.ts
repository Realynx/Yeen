import { describe, expect, it } from 'vitest';
import {
  parseLibraryFilterState,
  toLibraryPath,
} from './librarySearchUtils';

describe('librarySearchUtils', () => {
  it('builds contextual Library paths without overloading q for tags', () => {
    expect(
      toLibraryPath({
        shelf: 'tag',
        filters: {
          typeFilter: 'movie',
          tagFilter: 'Action & Sci-Fi',
          watchStatusFilter: 'unwatched',
          sortOrder: 'updated-desc',
        },
      }),
    ).toBe('/library?type=movie&tag=Action+%26+Sci-Fi&watch=unwatched&sort=updated-desc&shelf=tag');
  });

  it('parses URL-backed Library filters for View All routes', () => {
    const filters = parseLibraryFilterState(
      new URLSearchParams('type=show&tag=Drama&watch=in-progress&quality=hd&sort=title-asc'),
    );

    expect(filters).toMatchObject({
      typeFilter: 'show',
      tagFilter: 'Drama',
      watchStatusFilter: 'in-progress',
      qualityFilter: 'hd',
      sortOrder: 'title-asc',
    });
  });
});
