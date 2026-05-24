import { load } from 'cheerio';
import type { IptorrentsSearchItem } from './iptorrents-search.service';

export function parseIptSearchResults(
  html: string,
  baseUrl: string,
): IptorrentsSearchItem[] {
  const $ = load(html);
  const rows = $('#torrents tbody tr');
  const parsed: IptorrentsSearchItem[] = [];

  rows.each((index, row) => {
    const cells = $(row).children('td');
    if (cells.length < 9) {
      return;
    }

    const category = cleanText(cells.eq(0).find('img').first().attr('alt') ?? 'Unknown');
    const nameCell = cells.eq(1);
    const titleLink = nameCell.find('a.hv').first();
    const title = cleanText(titleLink.text());
    if (!title) {
      return;
    }

    const detailsUrl = toAbsoluteUrl(titleLink.attr('href') ?? null, baseUrl);
    if (!detailsUrl) {
      return;
    }

    const torrentId = extractTorrentId(detailsUrl, index + 1);
    const downloadUrl = toAbsoluteUrl(
      cells.eq(3).find('a[href*="download.php"]').first().attr('href') ?? null,
      baseUrl,
    );
    const subtitleText = cleanText(nameCell.find('.sub').first().text());
    const badgeTexts = nameCell
      .find('span')
      .toArray()
      .map((element) => cleanText($(element).text()).toLowerCase());

    parsed.push({
      id: torrentId,
      title,
      category,
      subtitle: subtitleText || null,
      size: cleanText(cells.eq(5).text()) || 'Unknown',
      snatches: toInteger(cells.eq(6).text()),
      seeders: toInteger(cells.eq(7).text()),
      leechers: toInteger(cells.eq(8).text()),
      comments: toInteger(cells.eq(4).text()),
      isFreeleech: badgeTexts.some((value) => value.includes('free')),
      isNew: badgeTexts.some((value) => value === 'new'),
      detailsUrl,
      downloadUrl,
    });
  });

  return parsed;
}

function toAbsoluteUrl(input: string | null, baseUrl: string): string | null {
  if (!input) {
    return null;
  }

  try {
    return new URL(input, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractTorrentId(detailsUrl: string, fallbackIndex: number): string {
  const match = detailsUrl.match(/\/t\/(\d+)/i);
  return match?.[1] ?? `ipt-${fallbackIndex}`;
}

function cleanText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function toInteger(input: string): number {
  const digits = input.replace(/[^0-9]/g, '');
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
