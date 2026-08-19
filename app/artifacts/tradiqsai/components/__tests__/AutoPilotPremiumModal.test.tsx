// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AutoPilotPremiumModal } from '../AutoPilotPremiumModal';

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

describe('AutoPilotPremiumModal', () => {
  afterEach(cleanup);

  it('closes when the dimmed backdrop is pressed', () => {
    const onClose = vi.fn();
    render(<AutoPilotPremiumModal visible onClose={onClose} onUpgrade={vi.fn()} />);

    fireEvent.click(screen.getByTestId('autopilot-premium-backdrop'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has an in-sheet close control without triggering an upgrade', () => {
    const onClose = vi.fn();
    const onUpgrade = vi.fn();
    render(<AutoPilotPremiumModal visible onClose={onClose} onUpgrade={onUpgrade} />);

    fireEvent.click(screen.getByTestId('autopilot-premium-close'));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it('does not dismiss when the sheet itself is pressed', () => {
    const onClose = vi.fn();
    render(<AutoPilotPremiumModal visible onClose={onClose} onUpgrade={vi.fn()} />);

    fireEvent.click(screen.getByTestId('autopilot-premium-sheet'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps upgrade separate from backdrop dismissal', () => {
    const onClose = vi.fn();
    const onUpgrade = vi.fn();
    render(<AutoPilotPremiumModal visible onClose={onClose} onUpgrade={onUpgrade} />);

    fireEvent.click(screen.getByTestId('autopilot-premium-upgrade'));

    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});