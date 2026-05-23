import type {
  IptSortDirection,
  IptSortField,
} from '../../services/iptorrentsShared';

interface IptorrentsSortToolbarProps {
  trackerLabel: string;
  sortField: IptSortField;
  sortDirection: IptSortDirection;
  nameFilter: string;
  onChangeSortField: (field: IptSortField) => void;
  onToggleSortDirection: () => void;
  onChangeNameFilter: (value: string) => void;
}

export function IptorrentsSortToolbar({
  trackerLabel,
  sortField,
  sortDirection,
  nameFilter,
  onChangeSortField,
  onToggleSortDirection,
  onChangeNameFilter,
}: IptorrentsSortToolbarProps) {
  return (
    <div className="ipt-sort-toolbar" role="group" aria-label={`Sort ${trackerLabel} results`}>
      <span className="ipt-sort-label">Sort by</span>
      <div className="ipt-sort-options">
        <button
          type="button"
          className={`ipt-sort-chip${sortField === 'size' ? ' is-active' : ''}`}
          onClick={() => onChangeSortField('size')}
        >
          Size
        </button>
        <button
          type="button"
          className={`ipt-sort-chip${sortField === 'seeders' ? ' is-active' : ''}`}
          onClick={() => onChangeSortField('seeders')}
        >
          Seeders
        </button>
        <button
          type="button"
          className={`ipt-sort-chip${sortField === 'leechers' ? ' is-active' : ''}`}
          onClick={() => onChangeSortField('leechers')}
        >
          Leechers
        </button>
      </div>
      <button
        type="button"
        className="ipt-sort-direction"
        onClick={onToggleSortDirection}
      >
        {sortDirection === 'desc' ? 'High to low' : 'Low to high'}
      </button>
      <label className="ipt-local-filter">
        <span className="ipt-local-filter-label">Filter names</span>
        <input
          type="text"
          value={nameFilter}
          onChange={(event) => onChangeNameFilter(event.target.value)}
          placeholder="Filter results locally"
        />
      </label>
    </div>
  );
}
