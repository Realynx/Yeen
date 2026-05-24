import { type CheerioAPI, load } from 'cheerio';
import type { IptorrentsSearchItem } from './iptorrents-search.service';

export function parseNyaaSearchPage(
  html: string,
  currentPage: number,
  baseUrl: string,
): { results: IptorrentsSearchItem[]; total: number; hasMore: boolean } {
  const $ = load(html);
  const results = parseSearchResults($, baseUrl);

  const pageInfoText = cleanText($('body').text());
  const pageInfoMatch = pageInfoText.match(
    /Displaying\s+results\s+\d+\s*-\s*(\d+)\s+out\s+of\s+([\d,]+)\s+results/i,
  );

  let total = results.length;
  let hasMore = false;

  if (pageInfoMatch?.[1] && pageInfoMatch[2]) {
    const shownEnd = toInteger(pageInfoMatch[1]);
    const parsedTotal = toInteger(pageInfoMatch[2]);
    if (parsedTotal > 0) {
      total = Math.max(parsedTotal, results.length);
    }
    hasMore = shownEnd > 0 && shownEnd < total;
  }

  if (!hasMore) {
    hasMore = hasNextPageLink($, currentPage, baseUrl);
  }

  return {
    results,
    total: Math.max(total, results.length),
    hasMore,
  };
}

function parseSearchResults(
  $: CheerioAPI,
  baseUrl: string,
): IptorrentsSearchItem[] {
  const rows = $('table.torrent-list tbody tr');
  const parsed: IptorrentsSearchItem[] = [];

  rows.each((index, row) => {
    const cells = $(row).children('td');
    if (cells.length < 8) {
      return;
    }

    const category = cleanText(
      cells.eq(0).find('img').first().attr('alt') ?? 'Unknown',
    );
    const nameCell = cells.eq(1);
    const titleLink = nameCell
      .find('a[href^="/view/"]')
      .not('.comments')
      .first();
    const title = cleanText(titleLink.text());
    if (!title) {
      return;
    }

    const detailsUrl = toAbsoluteUrl(titleLink.attr('href') ?? null, baseUrl);
    if (!detailsUrl) {
      return;
    }

    const downloadUrl = toAbsoluteUrl(
      cells.eq(2).find('a[href^="/download/"]').first().attr('href') ?? null,
      baseUrl,
    );
    const subtitleRaw = cleanText(titleLink.attr('title') ?? '');
    const subtitle = subtitleRaw && subtitleRaw !== title ? subtitleRaw : null;

    parsed.push({
      id: extractTorrentId(detailsUrl, index + 1),
      title,
      category,
      subtitle,
      size: cleanText(cells.eq(3).text()) || 'Unknown',
      snatches: toInteger(cells.eq(7).text()),
      seeders: toInteger(cells.eq(5).text()),
      leechers: toInteger(cells.eq(6).text()),
      comments: toInteger(nameCell.find('a.comments').first().text()),
      isFreeleech: false,
      isNew: false,
      detailsUrl,
      downloadUrl,
    });
  });

  return parsed;
}

function hasNextPageLink(
  $: CheerioAPI,
  currentPage: number,
  baseUrl: string,
): boolean {
  const nextPage = currentPage + 1;

  return $('ul.pagination a[href]')
    .toArray()
    .some((anchor) => {
      const href = $(anchor).attr('href');
      if (!href) {
        return false;
      }

      try {
        const parsed = new URL(href, baseUrl);
        const pageParam = parsed.searchParams.get('p');
        const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
        return Number.isFinite(page) && page >= nextPage;
      } catch {
        return false;
      }
    });
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
  const match = detailsUrl.match(/\/view\/(\d+)/i);
  return match?.[1] ?? `nyaa-${fallbackIndex}`;
}

function cleanText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function toInteger(input: string): number {
  const digits = input.replace(/[^0-9]/g, '');
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
