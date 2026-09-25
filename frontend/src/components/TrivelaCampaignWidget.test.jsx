import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TrivelaCampaignWidget from './TrivelaCampaignWidget';
import EmbedSnippetGenerator from './EmbedSnippetGenerator';
import { EMBED_SANDBOX } from '../lib/embedSnippet.js';

describe('TrivelaCampaignWidget (#1219)', () => {
  it('renders a sandboxed iframe for the requested widget', () => {
    render(
      <TrivelaCampaignWidget origin="https://trivela.app" campaignId="9" widget="leaderboard" theme="light" limit={5} title="Top players" />,
    );
    const frame = screen.getByTitle('Top players');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('src')).toBe('https://trivela.app/embed/v1/leaderboard/9?theme=light&limit=5');
    expect(frame.getAttribute('sandbox')).toBe(EMBED_SANDBOX);
    expect(frame.getAttribute('height')).toBe('480');
    expect(frame.getAttribute('loading')).toBe('lazy');
  });

  it('renders nothing for invalid props instead of throwing', () => {
    const { container } = render(<TrivelaCampaignWidget campaignId="9" widget="banner" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('EmbedSnippetGenerator (#1219)', () => {
  it('switches widget and format, and copies the snippet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<EmbedSnippetGenerator campaignId="9" campaignName="Quest" origin="https://trivela.app" />);
    const code = screen.getByTestId('embed-snippet');
    expect(code.textContent).toContain('<iframe');
    expect(code.textContent).toContain('/embed/v1/card/9?theme=dark');

    fireEvent.change(screen.getByLabelText(/Widget/), { target: { value: 'progress' } });
    expect(code.textContent).toContain('/embed/v1/progress/9');

    fireEvent.change(screen.getByLabelText(/Format/), { target: { value: 'react' } });
    expect(code.textContent).toContain('<TrivelaCampaignWidget');
    expect(code.textContent).toContain('widget="progress"');

    fireEvent.click(screen.getByRole('button', { name: 'Copy snippet' }));
    await screen.findByRole('button', { name: 'Copied!' });
    expect(writeText).toHaveBeenCalledWith(code.textContent);
  });
});
