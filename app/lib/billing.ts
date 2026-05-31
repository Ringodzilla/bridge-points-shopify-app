export const BILLING_CURRENCY_CODE = "USD";
export const OVERAGE_UNIT_PRICE_USD = 0.1;
export const USAGE_CAP_USD = 100;

export const FREE_PLAN_KEY = "bridge-points-free";
export const ADVANCED_PLAN_KEY = "bridge-points-advanced";
export const PREMIUM_PLAN_KEY = "bridge-points-premium";
export const UNLIMITED_PLAN_KEY = "bridge-points-unlimited";

export const BILLING_PLAN_KEYS = [
  FREE_PLAN_KEY,
  ADVANCED_PLAN_KEY,
  PREMIUM_PLAN_KEY,
  UNLIMITED_PLAN_KEY,
] as const;

export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];

type LimitedBillingPlanDefinition = {
  key: BillingPlanKey;
  label: string;
  monthlyPriceUsd: number;
  includedMonthlyOrders: number;
  overageUnitPriceUsd: number;
  usageCapUsd: number;
  isUnlimited: false;
  sortOrder: number;
};

type UnlimitedBillingPlanDefinition = {
  key: BillingPlanKey;
  label: string;
  monthlyPriceUsd: number;
  includedMonthlyOrders: null;
  overageUnitPriceUsd: null;
  usageCapUsd: null;
  isUnlimited: true;
  sortOrder: number;
};

export type BillingPlanDefinition =
  | LimitedBillingPlanDefinition
  | UnlimitedBillingPlanDefinition;

const BILLING_TEST_INCLUDED_ORDER_OVERRIDE_ENV_BY_PLAN: Partial<
  Record<BillingPlanKey, string>
> = {
  [FREE_PLAN_KEY]: "SHOPIFY_BILLING_TEST_INCLUDED_ORDERS_OVERRIDE_FREE",
  [ADVANCED_PLAN_KEY]: "SHOPIFY_BILLING_TEST_INCLUDED_ORDERS_OVERRIDE_ADVANCED",
  [PREMIUM_PLAN_KEY]: "SHOPIFY_BILLING_TEST_INCLUDED_ORDERS_OVERRIDE_PREMIUM",
};

export const BILLING_PLANS: BillingPlanDefinition[] = [
  {
    key: FREE_PLAN_KEY,
    label: "Free",
    monthlyPriceUsd: 0,
    includedMonthlyOrders: 100,
    overageUnitPriceUsd: OVERAGE_UNIT_PRICE_USD,
    usageCapUsd: USAGE_CAP_USD,
    isUnlimited: false,
    sortOrder: 0,
  },
  {
    key: ADVANCED_PLAN_KEY,
    label: "Advanced",
    monthlyPriceUsd: 9,
    includedMonthlyOrders: 500,
    overageUnitPriceUsd: OVERAGE_UNIT_PRICE_USD,
    usageCapUsd: USAGE_CAP_USD,
    isUnlimited: false,
    sortOrder: 1,
  },
  {
    key: PREMIUM_PLAN_KEY,
    label: "Premium",
    monthlyPriceUsd: 19,
    includedMonthlyOrders: 1000,
    overageUnitPriceUsd: OVERAGE_UNIT_PRICE_USD,
    usageCapUsd: USAGE_CAP_USD,
    isUnlimited: false,
    sortOrder: 2,
  },
  {
    key: UNLIMITED_PLAN_KEY,
    label: "Unlimited",
    monthlyPriceUsd: 39,
    includedMonthlyOrders: null,
    overageUnitPriceUsd: null,
    usageCapUsd: null,
    isUnlimited: true,
    sortOrder: 3,
  },
];

function parseNonNegativeInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function getBillingTestIncludedOrderOverride(planKey: BillingPlanKey) {
  if (process.env.SHOPIFY_BILLING_TEST_MODE === "false") {
    return null;
  }

  const specificEnvName = BILLING_TEST_INCLUDED_ORDER_OVERRIDE_ENV_BY_PLAN[planKey];
  const specificValue = specificEnvName
    ? parseNonNegativeInteger(process.env[specificEnvName])
    : null;

  if (specificValue !== null) {
    return specificValue;
  }

  return parseNonNegativeInteger(process.env.SHOPIFY_BILLING_TEST_INCLUDED_ORDERS_OVERRIDE);
}

export function getEffectiveBillingPlan(plan: BillingPlanDefinition) {
  if (plan.isUnlimited) {
    return plan;
  }

  const overrideIncludedMonthlyOrders = getBillingTestIncludedOrderOverride(plan.key);

  if (overrideIncludedMonthlyOrders === null) {
    return plan;
  }

  return {
    ...plan,
    includedMonthlyOrders: overrideIncludedMonthlyOrders,
  } satisfies BillingPlanDefinition;
}

export function getBillingPlan(planKey: BillingPlanKey) {
  const matchedPlan = BILLING_PLANS.find((plan) => plan.key === planKey);

  if (!matchedPlan) {
    throw new Error(`Unknown billing plan: ${planKey}`);
  }

  return getEffectiveBillingPlan(matchedPlan);
}

export function isBillingPlanKey(value: string): value is BillingPlanKey {
  return BILLING_PLAN_KEYS.includes(value as BillingPlanKey);
}

export function calculatePlanOverageOrderCount(
  plan: BillingPlanDefinition,
  monthlyOrderCount: number,
) {
  const effectivePlan = getEffectiveBillingPlan(plan);
  const normalizedMonthlyOrderCount = Number.isFinite(monthlyOrderCount)
    ? Math.max(0, Math.floor(monthlyOrderCount))
    : 0;

  if (effectivePlan.isUnlimited) {
    return 0;
  }

  return Math.max(0, normalizedMonthlyOrderCount - effectivePlan.includedMonthlyOrders);
}

export function calculatePlanUsageChargeUsd(
  plan: BillingPlanDefinition,
  monthlyOrderCount: number,
) {
  const effectivePlan = getEffectiveBillingPlan(plan);

  if (effectivePlan.isUnlimited) {
    return 0;
  }

  const rawCharge =
    calculatePlanOverageOrderCount(effectivePlan, monthlyOrderCount) *
    effectivePlan.overageUnitPriceUsd;

  return Math.min(effectivePlan.usageCapUsd, Math.round(rawCharge * 100) / 100);
}

export function calculatePlanProjectedChargeUsd(
  plan: BillingPlanDefinition,
  monthlyOrderCount: number,
) {
  return Math.round(
    (plan.monthlyPriceUsd + calculatePlanUsageChargeUsd(plan, monthlyOrderCount)) * 100,
  ) / 100;
}

export function findCheapestPlan(projectedMonthlyOrderCount: number) {
  const cheapestPlan = BILLING_PLANS.slice().sort((left, right) => {
    const leftProjectedChargeUsd = calculatePlanProjectedChargeUsd(
      left,
      projectedMonthlyOrderCount,
    );
    const rightProjectedChargeUsd = calculatePlanProjectedChargeUsd(
      right,
      projectedMonthlyOrderCount,
    );

    if (leftProjectedChargeUsd !== rightProjectedChargeUsd) {
      return leftProjectedChargeUsd - rightProjectedChargeUsd;
    }

    return left.sortOrder - right.sortOrder;
  })[0];

  return getBillingPlan(cheapestPlan.key);
}

export function findRecommendedPlanChange({
  currentPlanKey,
  projectedMonthlyOrderCount,
}: {
  currentPlanKey: BillingPlanKey | null;
  projectedMonthlyOrderCount: number;
}) {
  if (!currentPlanKey) {
    return null;
  }

  const currentPlan = getBillingPlan(currentPlanKey);
  const currentPlanProjectedChargeUsd = calculatePlanProjectedChargeUsd(
    currentPlan,
    projectedMonthlyOrderCount,
  );

  const cheaperPlans = BILLING_PLANS.filter(
    (plan) =>
      plan.key !== currentPlan.key &&
      calculatePlanProjectedChargeUsd(plan, projectedMonthlyOrderCount) <
        currentPlanProjectedChargeUsd,
  ).sort((left, right) => {
    const leftProjectedChargeUsd = calculatePlanProjectedChargeUsd(
      left,
      projectedMonthlyOrderCount,
    );
    const rightProjectedChargeUsd = calculatePlanProjectedChargeUsd(
      right,
      projectedMonthlyOrderCount,
    );

    if (leftProjectedChargeUsd !== rightProjectedChargeUsd) {
      return leftProjectedChargeUsd - rightProjectedChargeUsd;
    }

    return left.sortOrder - right.sortOrder;
  });

  if (cheaperPlans.length === 0) {
    return null;
  }

  const recommendedPlan = getBillingPlan(cheaperPlans[0].key);
  const recommendedPlanProjectedChargeUsd = calculatePlanProjectedChargeUsd(
    recommendedPlan,
    projectedMonthlyOrderCount,
  );

  return {
    plan: recommendedPlan,
    currentPlan,
    direction:
      recommendedPlan.sortOrder > currentPlan.sortOrder
        ? ("upgrade" as const)
        : ("downgrade" as const),
    projectedSavingsUsd: Math.round(
      (currentPlanProjectedChargeUsd - recommendedPlanProjectedChargeUsd) * 100,
    ) / 100,
    currentPlanProjectedChargeUsd,
    recommendedPlanProjectedChargeUsd,
  };
}
