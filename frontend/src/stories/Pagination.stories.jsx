import { useState } from 'react';
import Pagination from '../components/ui/Pagination.jsx';

export default {
  title: 'Design System/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Presentational pagination control shared by every long list. Renders as a labelled ' +
          '<nav> around an ordered list, marks the active page with aria-current, gives every ' +
          'control an explicit label, and announces the visible range in a polite live region.',
      },
    },
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    siblingCount: { control: { type: 'number', min: 0, max: 3 } },
    boundaryCount: { control: { type: 'number', min: 1, max: 3 } },
    onPageChange: { action: 'pageChanged' },
  },
};

export const Default = {
  args: { page: 1, pageCount: 5 },
};

export const Truncated = {
  args: { page: 10, pageCount: 20 },
};

export const WithResultSummary = {
  args: { page: 2, pageCount: 14, pageSize: 25, totalItems: 340 },
};

export const WithPageSizePicker = {
  args: {
    page: 2,
    pageCount: 14,
    pageSize: 25,
    totalItems: 340,
    onPageSizeChange: () => {},
  },
};

export const WithFirstAndLastJumps = {
  args: { page: 10, pageCount: 20, showFirstLast: true },
};

export const Small = {
  args: { page: 3, pageCount: 12, size: 'sm' },
};

export const Loading = {
  args: { page: 3, pageCount: 12, disabled: true },
};

export const SinglePage = {
  args: { page: 1, pageCount: 1 },
};

const PAGE_SIZE = 25;
const TOTAL = 340;

function StatefulPagination(args) {
  const [page, setPage] = useState(1);

  return (
    <Pagination
      {...args}
      page={page}
      pageCount={Math.ceil(TOTAL / PAGE_SIZE)}
      pageSize={PAGE_SIZE}
      totalItems={TOTAL}
      onPageChange={setPage}
    />
  );
}

/** Wired to local state so the control can actually be driven in the canvas. */
export const Interactive = {
  render: (args) => <StatefulPagination {...args} />,
  args: { showFirstLast: true },
};

export const LightTheme = {
  args: { page: 10, pageCount: 20, pageSize: 25, totalItems: 500 },
  globals: { theme: 'light' },
};
