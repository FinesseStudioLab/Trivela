import { Tooltip, Popover } from '../components/ui/Tooltip.jsx';

export default {
  title: 'Design System/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Tooltip is a passive description for inline glossary terms (TTL, vesting): it opens on ' +
          'hover *and* focus, stays open while the pointer is over the bubble, and is dismissable ' +
          'with Escape. Popover is the interactive sibling — role="dialog", focus moves in on open ' +
          'and returns to the trigger on close.',
      },
    },
  },
  argTypes: {
    placement: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    openDelay: { control: { type: 'number', min: 0, max: 1000, step: 20 } },
    closeDelay: { control: { type: 'number', min: 0, max: 1000, step: 20 } },
  },
};

const TriggerButton = (props) => (
  <button type="button" className="btn btn-secondary" {...props}>
    {props.children}
  </button>
);

export const Default = {
  args: {
    content: 'Time-to-live — how long the campaign ledger entry survives before it must be bumped.',
    children: <TriggerButton>TTL</TriggerButton>,
  },
};

/** Rendered open so the placement is visible in docs and visual snapshots. */
export const Placements = {
  render: () => (
    <div style={{ display: 'grid', gap: '5rem', placeItems: 'center', padding: '5rem' }}>
      <div style={{ display: 'flex', gap: '4rem' }}>
        {['top', 'bottom', 'left', 'right'].map((placement) => (
          <Tooltip
            key={placement}
            content={`Placed ${placement}`}
            placement={placement}
            defaultOpen
          >
            <TriggerButton>{placement}</TriggerButton>
          </Tooltip>
        ))}
      </div>
    </div>
  ),
};

export const LongCopy = {
  args: {
    content:
      'Vesting releases a reward gradually instead of all at once. Unclaimed portions stay in ' +
      'the campaign escrow until their unlock ledger passes, so a participant can leave and ' +
      'still claim what has already vested.',
    children: <TriggerButton>Vesting</TriggerButton>,
  },
};

/** The everyday case: a dotted-underline glossary term inside body copy. */
const termStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  textDecoration: 'underline dotted',
  textUnderlineOffset: '3px',
  cursor: 'help',
};

export const OnInlineTerm = {
  render: () => (
    <p style={{ maxWidth: '32rem', lineHeight: 1.8 }}>
      Rewards are streamed against the campaign&apos;s{' '}
      <Tooltip content="The escrowed balance the campaign can still pay out.">
        <button type="button" style={termStyle}>
          remaining budget
        </button>
      </Tooltip>{' '}
      and expire once the{' '}
      <Tooltip content="Time-to-live for the ledger entry backing this campaign.">
        <button type="button" style={termStyle}>
          TTL
        </button>
      </Tooltip>{' '}
      lapses.
    </p>
  ),
};

export const Disabled = {
  args: {
    content: 'You will never see this.',
    disabled: true,
    children: <TriggerButton>No tooltip</TriggerButton>,
  },
};

export const AsPopover = {
  render: () => (
    <Popover
      title="Vesting"
      content={
        <>
          <p style={{ marginTop: 0 }}>Rewards unlock on a schedule instead of all at once.</p>
          <a href="https://github.com/FinesseStudioLab/Trivela">Read the vesting guide</a>
        </>
      }
    >
      <TriggerButton>What is vesting?</TriggerButton>
    </Popover>
  ),
};

export const PopoverPlacements = {
  render: () => (
    <div style={{ display: 'flex', gap: '4rem', padding: '8rem 4rem' }}>
      {['top', 'bottom', 'left', 'right'].map((placement) => (
        <Popover
          key={placement}
          title={placement}
          content={<p style={{ margin: 0 }}>Panel anchored {placement}.</p>}
          placement={placement}
        >
          <TriggerButton>{placement}</TriggerButton>
        </Popover>
      ))}
    </div>
  ),
};

export const LightTheme = {
  args: {
    content: 'Time-to-live for the campaign ledger entry.',
    children: <TriggerButton>TTL</TriggerButton>,
    defaultOpen: true,
  },
  globals: { theme: 'light' },
};
