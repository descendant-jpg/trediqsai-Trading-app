// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionSuccessBanner } from '../SubscriptionSuccessBanner';

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

afterEach(cleanup);

describe('SubscriptionSuccessBanner', () => {
  it('disappears on the first render for a different signed-in account', () => {
    const success = { userId: 'user-a', tier: 'elite' as const };
    const { rerender } = render(
      <SubscriptionSuccessBanner success={success} currentUserId="user-a" />,
    );
    expect(screen.getByTestId('subscription-success')).toBeTruthy();

    rerender(
      <SubscriptionSuccessBanner success={success} currentUserId="user-b" />,
    );
    expect(screen.queryByTestId('subscription-success')).toBeNull();
  });
});