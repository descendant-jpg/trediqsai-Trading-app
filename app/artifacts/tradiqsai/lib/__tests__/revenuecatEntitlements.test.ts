import { describe, expect, it } from "vitest";
import { isActiveRevenueCatEntitlement } from "../revenuecatEntitlements";

const NOW = Date.parse("2026-08-23T00:00:00.000Z");

describe("private-channel RevenueCat entitlement checks", () => {
  it("does not grant access when the entitlement is absent", () => {
    expect(isActiveRevenueCatEntitlement(undefined, NOW)).toBe(false);
  });

  it("allows an active recurring subscription that is still renewing", () => {
    expect(
      isActiveRevenueCatEntitlement(
        { expirationDate: "2026-09-23T00:00:00.000Z", willRenew: true },
        NOW,
      ),
    ).toBe(true);
  });

  it("locks a cancelled recurring subscription immediately", () => {
    expect(
      isActiveRevenueCatEntitlement(
        { expirationDate: "2026-09-23T00:00:00.000Z", willRenew: false },
        NOW,
      ),
    ).toBe(false);
  });

  it("locks an expired subscription even if RevenueCat returns it in the active map", () => {
    expect(
      isActiveRevenueCatEntitlement(
        { expirationDate: "2026-08-22T23:59:59.999Z", willRenew: true },
        NOW,
      ),
    ).toBe(false);
  });

  it("keeps configured lifetime access active when it does not renew", () => {
    expect(
      isActiveRevenueCatEntitlement(
        { periodType: "LIFETIME", expirationDate: null, willRenew: false },
        NOW,
      ),
    ).toBe(true);
  });
});