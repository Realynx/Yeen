import { cleanTitle, normalizeForKey } from './title-normalizer';

describe('cleanTitle', () => {
  it('keeps meaningful trailing words in real titles', () => {
    expect(cleanTitle('Death.Note.2006.1080p.BluRay.x264-GROUP')).toBe(
      'Death Note',
    );
    expect(cleanTitle('Spice.and.Wolf.720p.WEB-DL.x264')).toBe(
      'Spice and Wolf',
    );
    expect(cleanTitle('Wolf.Children.2012.1080p.BluRay.x264')).toBe(
      'Wolf Children',
    );
    expect(cleanTitle('No.Game.No.Life.S01E01.1080p.WEBRip.x265')).toBe(
      'No Game No Life',
    );
  });

  it('still drops an explicit trailing release group suffix', () => {
    expect(cleanTitle('Movie.Title.2020.1080p.WEB-DL.x264-NTb')).toBe(
      'Movie Title',
    );
    expect(cleanTitle('Movie-GROUP')).toBe('Movie');
    expect(cleanTitle('Some.Movie.2020.1080p.BluRay.x264.GROUP')).toBe(
      'Some Movie',
    );
  });

  it('preserves hyphenated title words (never treats them as release groups)', () => {
    expect(cleanTitle('Spider-Man.2002.1080p.BluRay.x264-GROUP')).toBe(
      'Spider-Man',
    );
    expect(cleanTitle('Ant-Man.2015.1080p.BluRay.x264')).toBe('Ant-Man');
    expect(cleanTitle('X-Men.Days.of.Future.Past.2014.1080p.BluRay.x264')).toBe(
      'X-Men Days of Future Past',
    );
    expect(cleanTitle('Spider-Man-Far-From-Home.2019.1080p.BluRay.x264')).toBe(
      'Spider-Man-Far-From-Home',
    );
  });

  it('preserves titles that are (or contain) years', () => {
    expect(cleanTitle('1917.2019.1080p.BluRay.x264-GROUP')).toBe('1917');
    expect(cleanTitle('1984.1984.1080p.BluRay.x264')).toBe('1984');
    expect(cleanTitle('2001.A.Space.Odyssey.1968.1080p.BluRay.x264')).toBe(
      '2001 A Space Odyssey',
    );
    expect(cleanTitle('Blade.Runner.2049.2017.1080p.BluRay.x264-GROUP')).toBe(
      'Blade Runner 2049',
    );
  });

  it('preserves titles that collide with generic release words', () => {
    expect(cleanTitle('Charlottes.Web.2006.1080p.BluRay.x264')).toBe(
      'Charlottes Web',
    );
    expect(cleanTitle('Cam.2018.1080p.WEBRip.x264-GROUP')).toBe('Cam');
    expect(cleanTitle('Heat.1995.1080p.BluRay.x264')).toBe('Heat');
  });

  it('preserves short numeric titles', () => {
    expect(cleanTitle('300.2006.1080p.BluRay.x264')).toBe('300');
    expect(cleanTitle('12.Monkeys.1995.1080p.BluRay.x264')).toBe('12 Monkeys');
    expect(cleanTitle('21.Jump.Street.2012.1080p.BluRay.x264')).toBe(
      '21 Jump Street',
    );
    expect(cleanTitle('Apollo.13.1995.1080p.BluRay.x264')).toBe('Apollo 13');
  });

  it('strips bracketed release tags and discards content inside them', () => {
    expect(cleanTitle('[Group] Show Name - 01 [1080p][ABCDEF12]')).toBe(
      'Show Name - 01',
    );
    expect(cleanTitle('Movie.Title.(2020).1080p.BluRay.x264')).toBe(
      'Movie Title',
    );
    expect(cleanTitle('Movie Title (Directors Cut) (2020) [1080p]')).toBe(
      'Movie Title',
    );
  });

  it('handles space-separated filenames as well as dot-separated', () => {
    expect(cleanTitle('Some Movie 2020 1080p BluRay x264')).toBe('Some Movie');
    expect(cleanTitle('Show Name S02E05 1080p WEB-DL')).toBe('Show Name');
  });

  it('cuts at season/episode markers in various formats', () => {
    expect(cleanTitle('Breaking.Bad.S05E14.1080p.BluRay.x264')).toBe(
      'Breaking Bad',
    );
    expect(cleanTitle('Breaking.Bad.5x14.1080p.BluRay.x264')).toBe(
      'Breaking Bad',
    );
    expect(cleanTitle('Show.Name.Season.3.1080p.WEB-DL')).toBe('Show Name');
  });

  it('falls back to a cleaned raw name when everything looks like noise', () => {
    // Pure noise with no title content should still return SOMETHING.
    const result = cleanTitle('1080p.x264-GROUP');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns an empty string for empty input', () => {
    expect(cleanTitle('')).toBe('');
  });
});

describe('normalizeForKey', () => {
  it('lower-cases and folds diacritics', () => {
    expect(normalizeForKey('Pokémon')).toBe('pokemon');
    expect(normalizeForKey('Amélie')).toBe('amelie');
  });

  it('collapses articles so near-matches share a key', () => {
    expect(normalizeForKey('The Matrix')).toBe(normalizeForKey('Matrix'));
    expect(normalizeForKey('Matrix, The')).toBe(normalizeForKey('Matrix'));
    expect(normalizeForKey('A Quiet Place')).toBe(
      normalizeForKey('Quiet Place'),
    );
  });

  it('folds ampersands to "and"', () => {
    expect(normalizeForKey('Tom & Jerry')).toBe(
      normalizeForKey('Tom and Jerry'),
    );
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeForKey('Spider-Man: No Way Home')).toBe(
      'spider man no way home',
    );
  });

  it('returns empty string for empty input', () => {
    expect(normalizeForKey('')).toBe('');
  });
});
