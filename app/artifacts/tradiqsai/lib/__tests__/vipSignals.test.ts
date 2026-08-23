import { describe, expect, it } from "vitest";
import { findVipLifetimePackage } from "../vipSignals";

const proPackage = {
  identifier: "$rc_lifetime",
  packageType: "LIFETIME",
  product: { identifier: "tradiqs_pro_lifetime", title: "TradiQs Pro" },
};
const elitePackage = {
  identifier: "elite_lifetime",
  packageType: "LIFETIME",
  product: { identifier: "tradiqs_elite_lifetime", title: "TradiQs Elite" },
};
const whalePackage = {
  identifier: "whale_lifetime",
  packageType: "LIFETIME",
  product: { identifier: "tradiqs_whale_lifetime", title: "TradiQs Whale" },
};

describe("VIP Signals RevenueCat package selection", () => {
  const offerings = {
    current: { availablePackages: [proPackage] },
    all: {
      pro: { availablePackages: [proPackage] },
      elite: { availablePackages: [elitePackage] },
      whale: { availablePackages: [whalePackage] },
      subscriptions: {
        availablePackages: [
          {
            identifier: "pro_monthly",
            packageType: "MONTHLY",
            product: { identifier: "tradiqs_pro_monthly" },
          },
        ],
      },
    },
  };

  it.each([
    ["Pro", proPackage],
    ["Elite", elitePackage],
    ["Whale", whalePackage],
  ] as const)("uses the configured %s lifetime package", (plan, expected) => {
    expect(findVipLifetimePackage(offerings, plan)).toBe(expected);
  });

  it("never substitutes a recurring package when a lifetime package is absent", () => {
    expect(
      findVipLifetimePackage(
        {
          current: {
            availablePackages: [
              {
                identifier: "elite_monthly",
                packageType: "MONTHLY",
                product: { identifier: "tradiqs_elite_monthly" },
              },
            ],
          },
        },
        "Elite",
      ),
    ).toBeNull();
  });
});