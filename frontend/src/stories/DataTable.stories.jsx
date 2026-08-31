import { useState } from 'react';
import DataTable from '../components/ui/DataTable.jsx';

export default {
  title: 'Design System/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Accessible, sortable, paginated data table for leaderboards, history lists, and admin ' +
          'views. Presentational — no data fetching. All theming via CSS custom properties.',
      },
    },
  },
  argTypes: {
    onSort: { action: 'sorted' },
    onPageChange: { action: 'page changed' },
  },
};

const COLUMNS = [
  { key: 'rank', header: 'Rank' },
  { key: 'wallet', header: 'Wallet' },
  { key: 'points', header: 'Points', sortable: true },
  { key: 'claimed', header: 'Claimed XLM', sortable: true },
];

const ROWS = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  rank: i + 1,
  wallet: `G${Math.random().toString(36).slice(2, 10).toUpperCase()}…`,
  points: Math.floor(Math.random() * 1000) + 100,
  claimed: (Math.random() * 50).toFixed(2),
}));

export const Default = {
  args: {
    columns: COLUMNS,
    rows: ROWS,
    pageCount: 1,
  },
};

export const Sortable = {
  args: {
    columns: COLUMNS,
    rows: ROWS,
    sortKey: 'points',
    sortDir: 'desc',
    pageCount: 1,
  },
};

export const WithPagination = {
  Render: (args) => {
    const [page, setPage] = useState(1);
    const [sortKey, setSortKey] = useState('points');
    const [sortDir, setSortDir] = useState('desc');

    function handleSort(key, dir) {
      setSortKey(key);
      setSortDir(dir);
    }

    return (
      <DataTable
        {...args}
        page={page}
        onPageChange={setPage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
    );
  },
  args: {
    columns: COLUMNS,
    rows: ROWS,
    pageCount: 5,
  },
};

export const Loading = {
  args: {
    columns: COLUMNS,
    rows: [],
    isLoading: true,
    pageCount: 1,
  },
};

export const Empty = {
  args: {
    columns: COLUMNS,
    rows: [],
    emptyMessage: 'No participants yet. Be the first to join!',
    pageCount: 1,
  },
};

export const Error = {
  args: {
    columns: COLUMNS,
    rows: [],
    isError: true,
    errorMessage: 'Could not load leaderboard. Please try again.',
    pageCount: 1,
  },
};

export const CustomCellRender = {
  args: {
    columns: [
      { key: 'rank', header: '#' },
      { key: 'wallet', header: 'Wallet' },
      {
        key: 'points',
        header: 'Points',
        sortable: true,
        render: (val) => (
          <span style={{ fontWeight: 600, color: '#4b9cf5' }}>{val.toLocaleString()} pts</span>
        ),
      },
    ],
    rows: ROWS.slice(0, 5),
    pageCount: 1,
  },
};

export const LightTheme = {
  args: {
    columns: COLUMNS,
    rows: ROWS,
    pageCount: 1,
  },
  globals: { theme: 'light' },
};
