// frontend/src/stories/Pagination.stories.jsx
import Pagination from '../components/Pagination.jsx';

export default {
  title: 'Components/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  argTypes: {
    currentPage: { control: { type: 'number', min: 1 } },
    totalPages: { control: { type: 'number', min: 1 } },
    onPageChange: { action: 'pageChanged' },
  },
};

export const FirstPage = { args: { currentPage: 1, totalPages: 10, onPageChange: () => {} } };
export const MiddlePage = { args: { currentPage: 5, totalPages: 10, onPageChange: () => {} } };
export const LastPage = { args: { currentPage: 10, totalPages: 10, onPageChange: () => {} } };
export const SinglePage = { args: { currentPage: 1, totalPages: 1, onPageChange: () => {} } };
export const DarkMode = {
  args: { currentPage: 3, totalPages: 7, onPageChange: () => {} },
  parameters: { backgrounds: { default: 'dark' } },
};