import { parseReleaseYear, parseSeasonEpisode } from './filename-metadata';

describe('parseSeasonEpisode', () => {
  it('parses the canonical S##E## form', () => {
    expect(parseSeasonEpisode('Breaking.Bad.S05E14.1080p.BluRay')).toEqual({
      seasonNumber: 5,
      episodeNumber: 14,
      isAbsoluteEpisode: false,
    });
    expect(parseSeasonEpisode('show.s01.e02.mkv')).toEqual({
      seasonNumber: 1,
      episodeNumber: 2,
      isAbsoluteEpisode: false,
    });
    expect(parseSeasonEpisode('Show S2E5')).toEqual({
      seasonNumber: 2,
      episodeNumber: 5,
      isAbsoluteEpisode: false,
    });
  });

  it('parses the ##x## form', () => {
    expect(parseSeasonEpisode('Show.Name.5x14.1080p.BluRay')).toEqual({
      seasonNumber: 5,
      episodeNumber: 14,
      isAbsoluteEpisode: false,
    });
    expect(parseSeasonEpisode('Show.01x002')).toEqual({
      seasonNumber: 1,
      episodeNumber: 2,
      isAbsoluteEpisode: false,
    });
  });

  it('parses verbose "Season X Episode Y"', () => {
    expect(parseSeasonEpisode('Show.Name.Season.2.Episode.5')).toEqual({
      seasonNumber: 2,
      episodeNumber: 5,
      isAbsoluteEpisode: false,
    });
    expect(parseSeasonEpisode('Show Name Season 02 Episode 05')).toEqual({
      seasonNumber: 2,
      episodeNumber: 5,
      isAbsoluteEpisode: false,
    });
  });

  it('combines folder-based season with filename episode markers', () => {
    expect(
      parseSeasonEpisode(
        'Episode.05.1080p',
        'Show Name/Season 02/Episode.05.1080p.mkv',
      ),
    ).toEqual({
      seasonNumber: 2,
      episodeNumber: 5,
      isAbsoluteEpisode: false,
    });
    expect(
      parseSeasonEpisode('05 - Title', 'Show Name/S01/05 - Title.mkv'),
    ).toEqual({
      seasonNumber: 1,
      episodeNumber: 5,
      isAbsoluteEpisode: false,
    });
  });

  it('treats episode-only markers as absolute when no folder season is known', () => {
    expect(parseSeasonEpisode('Show Name E05')).toEqual({
      seasonNumber: null,
      episodeNumber: 5,
      isAbsoluteEpisode: true,
    });
    expect(parseSeasonEpisode('Show Name Ep10')).toEqual({
      seasonNumber: null,
      episodeNumber: 10,
      isAbsoluteEpisode: true,
    });
  });

  it('parses anime-style "Show - 01" as an absolute episode', () => {
    expect(parseSeasonEpisode('Naruto - 245')).toEqual({
      seasonNumber: null,
      episodeNumber: 245,
      isAbsoluteEpisode: true,
    });
    expect(parseSeasonEpisode('My Show - 12v2')).toEqual({
      seasonNumber: null,
      episodeNumber: 12,
      isAbsoluteEpisode: true,
    });
  });

  it('does not treat hyphenated title words as episodes', () => {
    expect(parseSeasonEpisode('Spider-Man-2002')).toEqual({
      seasonNumber: null,
      episodeNumber: null,
      isAbsoluteEpisode: false,
    });
    expect(parseSeasonEpisode('Ant-Man.2015.1080p.BluRay')).toEqual({
      seasonNumber: null,
      episodeNumber: null,
      isAbsoluteEpisode: false,
    });
  });

  it('decodes compact "105" / "1205" numbering inside a season folder', () => {
    expect(
      parseSeasonEpisode('Show.105', 'Show/Season 1/Show.105.mkv'),
    ).toEqual({
      seasonNumber: 1,
      episodeNumber: 5,
      isAbsoluteEpisode: false,
    });
    expect(
      parseSeasonEpisode('Show.1205', 'Show/Season 12/Show.1205.mkv'),
    ).toEqual({
      seasonNumber: 12,
      episodeNumber: 5,
      isAbsoluteEpisode: false,
    });
  });

  it('returns folder-only season when filename has no episode signal', () => {
    expect(
      parseSeasonEpisode(
        'Mystery File',
        'Show Name/Season 03/Mystery File.mkv',
      ),
    ).toEqual({
      seasonNumber: 3,
      episodeNumber: null,
      isAbsoluteEpisode: false,
    });
  });

  it('returns empty result for plain movie filenames', () => {
    expect(parseSeasonEpisode('Inception.2010.1080p.BluRay.x264')).toEqual({
      seasonNumber: null,
      episodeNumber: null,
      isAbsoluteEpisode: false,
    });
  });

  it('recognises localised season folder names', () => {
    expect(
      parseSeasonEpisode('Episode 04', 'Show/Saison 2/Episode 04.mkv'),
    ).toEqual({
      seasonNumber: 2,
      episodeNumber: 4,
      isAbsoluteEpisode: false,
    });
    expect(
      parseSeasonEpisode('Episode 04', 'Show/Staffel 3/Episode 04.mkv'),
    ).toEqual({
      seasonNumber: 3,
      episodeNumber: 4,
      isAbsoluteEpisode: false,
    });
  });
});

describe('parseReleaseYear', () => {
  it('returns the year for a simple "Title YYYY" filename', () => {
    expect(parseReleaseYear('Inception.2010.1080p.BluRay.x264')).toBe(2010);
    expect(parseReleaseYear('Some Movie 1998 720p WEB-DL')).toBe(1998);
  });

  it('prefers the release year over a year embedded in the title', () => {
    expect(
      parseReleaseYear('Blade.Runner.2049.2017.1080p.BluRay.x264-GROUP'),
    ).toBe(2017);
    expect(parseReleaseYear('1984.1984.1080p.BluRay.x264')).toBe(1984);
  });

  it('prefers parenthesised years (renamer convention)', () => {
    expect(parseReleaseYear('Movie Title (2017) [1080p].mkv')).toBe(2017);
    expect(parseReleaseYear('Blade Runner 2049 (2017) 1080p')).toBe(2017);
  });

  it('returns null when the only year IS the title', () => {
    expect(parseReleaseYear('1917.1080p.BluRay.x264')).toBeNull();
    expect(parseReleaseYear('1984.1080p.BluRay.x264')).toBeNull();
  });

  it('returns null for filenames with no year', () => {
    expect(parseReleaseYear('Some Movie 1080p BluRay')).toBeNull();
    expect(parseReleaseYear('')).toBeNull();
  });

  it('ignores years that only appear after release noise', () => {
    // Year embedded inside a release-group tag should not be used.
    expect(parseReleaseYear('Show.1080p.BluRay.x264-GROUP2020')).toBeNull();
  });
});
