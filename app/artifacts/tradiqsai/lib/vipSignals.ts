export type VipPlan = "Pro" | "Elite" | "Whale";

export const VIP_TELEGRAM_CHANNEL_URL = "https://t.me/tradiqsai";

type RevenueCatPackage = {
  identifier?: string;
  packageType?: string;
  product?: {
    identifier?: string;
    title?: string;
  };
};

type RevenueCatOffering = {
  availablePackages?: RevenueCatPackage[];
};

type RevenueCatOfferings = {
  current?: RevenueCatOffering | null;
  all?: Record<string, RevenueCatOffering>;
};

function packageSearchText(revenueCatPackage: RevenueCatPackage): string {
  return [
    revenueCatPackage.identifier,
    revenueCatPackage.product?.identifier,
    revenueCatPackage.product?.title,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

/**
 * RevenueCat owns product configuration. The app deliberately chooses only a
 * configured LIFETIME package whose identifiers identify the requested tier.
 */
export function findVipLifetimePackage(
  offerings: RevenueCatOfferings | null | undefined,
  plan: VipPlan,
): RevenueCatPackage | null {
  const packages = Object.values(offerings?.all ?? {})
    .flatMap((offering) => offering.availablePackages ?? [])
    .concat(offerings?.current?.availablePackages ?? []);
  const planName = plan.toLowerCase();

  return (
    packages.find(
      (revenueCatPackage) =>
        revenueCatPackage.packageType === "LIFETIME" &&
        packageSearchText(revenueCatPackage).includes(planName),
    ) ?? null
  );
}