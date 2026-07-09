import AmountFormatter from '../components/AmountFormatter.jsx';

export default {
  title: 'Components/AmountFormatter',
  component: AmountFormatter,
  tags: ['autodocs'],
  argTypes: {
    value: { control: 'number' },
    locale: { control: 'text' },
    tokenSymbol: { control: 'text' },
    tokenDecimals: { control: 'number' },
    minimumFractionDigits: { control: 'number' },
    maximumFractionDigits: { control: 'number' },
    compact: { control: 'boolean' },
    signDisplay: {
      control: 'select',
      options: ['auto', 'always', 'exceptZero', 'negative', 'never'],
    },
    tone: {
      control: 'select',
      options: ['default', 'accent', 'muted', 'success'],
    },
  },
};

export const Points = {
  args: {
    value: 1234.567,
    tokenSymbol: 'pts',
    maximumFractionDigits: 2,
    tone: 'accent',
  },
};

export const StellarLumens = {
  args: {
    value: 98765.4321,
    tokenSymbol: 'XLM',
    maximumFractionDigits: 4,
  },
};

export const RawUsdcAmount = {
  args: {
    value: 1234567,
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
    maximumFractionDigits: 4,
    tone: 'success',
  },
};

export const CompactSigned = {
  args: {
    value: 1500000,
    tokenSymbol: 'XLM',
    compact: true,
    signDisplay: 'always',
  },
};

export const MissingValue = {
  args: {
    value: null,
    tokenSymbol: 'pts',
    fallback: 'Not available',
    tone: 'muted',
  },
};
