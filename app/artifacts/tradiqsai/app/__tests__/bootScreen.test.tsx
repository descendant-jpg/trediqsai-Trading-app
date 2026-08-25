// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedBootScreen } from '@/components/AnimatedBootScreen';

describe('AnimatedBootScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the brand sequence and finishes once on schedule', () => {
    const onFinish = vi.fn();
    render(<AnimatedBootScreen onFinish={onFinish} />);

    expect(screen.getByText('TradiQs')).toBeTruthy();
    expect(screen.getByText('AI-Powered Trading')).toBeTruthy();
    expect(screen.getByText('Forex, Crypto & Stocks')).toBeTruthy();
    expect(screen.getByText('Multi-TF Bias Analysis')).toBeTruthy();
    expect(screen.getByText('AutoPilot Execution')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(onFinish).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('ignores parent re-renders with a fresh callback identity', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<AnimatedBootScreen onFinish={first} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // A new inline callback mid-boot must not restart the timeline.
    rerender(<AnimatedBootScreen onFinish={second} />);
    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
