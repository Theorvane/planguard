import type { Finding, FindingSeverity, ResourceAction, ResourceChange } from "@planguard/schemas";

/**
 * A sub-score plus the reason it came out that way. Every number PlanGuard shows a
 * user must be traceable to a rule, not a vibe (docs/PRODUCT_PLAN.md #3.1) — the
 * `reason` is what the Check summary and the explanation agent quote.
 */
export interface SubScore {
  readonly score: number;
  readonly reason: string;
}

const SEVERITY_WEIGHT: Readonly<Record<FindingSeverity, number>> = {
  low: 15,
  moderate: 40,
  high: 70,
  critical: 100,
};

/** Each finding past the worst one adds a little, so 3 highs outrank 1 high. */
const ADDITIONAL_FINDING_WEIGHT = 5;

const ACTION_WEIGHT: Readonly<Record<ResourceAction, number>> = {
  delete: 80,
  replace: 60,
  update: 20,
  create: 5,
  read: 0,
  "no-op": 0,
};

const DESTRUCTIVE_ACTIONS: ReadonlySet<ResourceAction> = new Set(["delete", "replace"]);

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Driven by the worst finding, nudged up by how many others there are. Findings
 * come from policy-engine/Checkov — this function never decides whether something
 * *is* a finding, only how much the ones it was handed weigh.
 */
export function scoreFindings(findings: ReadonlyArray<Finding>, label: string): SubScore {
  if (findings.length === 0) {
    return { score: 0, reason: `No ${label} findings.` };
  }

  const worst = findings.reduce((acc, f) =>
    SEVERITY_WEIGHT[f.severity] > SEVERITY_WEIGHT[acc.severity] ? f : acc,
  );
  const base = SEVERITY_WEIGHT[worst.severity];
  const extra = (findings.length - 1) * ADDITIONAL_FINDING_WEIGHT;

  const countPhrase =
    findings.length === 1 ? "1 finding" : `${findings.length} findings, worst is`;

  return {
    score: clamp(base + extra),
    reason: `${countPhrase} ${worst.severity}: ${worst.title}`,
  };
}

/**
 * How much of this change destroys rather than adds. Deleting or replacing a
 * resource means downtime or data loss risk in a way an in-place update does not.
 */
export function scoreDestructiveness(changes: ReadonlyArray<ResourceChange>): SubScore {
  const destructive = changes.filter((c) => DESTRUCTIVE_ACTIONS.has(c.action));

  if (destructive.length === 0) {
    const worst = changes.reduce<ResourceAction>(
      (acc, c) => (ACTION_WEIGHT[c.action] > ACTION_WEIGHT[acc] ? c.action : acc),
      "no-op",
    );
    return {
      score: clamp(ACTION_WEIGHT[worst]),
      reason:
        worst === "no-op"
          ? "No resources are created, changed, or destroyed."
          : `No resources are destroyed or replaced; heaviest action is ${worst}.`,
    };
  }

  const worstAction = destructive.some((c) => c.action === "delete") ? "delete" : "replace";
  const base = ACTION_WEIGHT[worstAction];
  const extra = (destructive.length - 1) * ADDITIONAL_FINDING_WEIGHT;
  const names = destructive.slice(0, 3).map((c) => c.resource);
  const suffix = destructive.length > 3 ? `, +${destructive.length - 3} more` : "";

  return {
    score: clamp(base + extra),
    reason: `${destructive.length} resource(s) destroyed or replaced: ${names.join(", ")}${suffix}`,
  };
}

/**
 * How wide the change reaches — both how many resources move and how many
 * distinct resource types are touched. Ten changes across one type is a narrower
 * blast radius than ten across six.
 */
export function scoreBlastRadius(changes: ReadonlyArray<ResourceChange>): SubScore {
  const effective = changes.filter((c) => c.action !== "no-op" && c.action !== "read");

  if (effective.length === 0) {
    return { score: 0, reason: "No resources are affected." };
  }

  const types = new Set(effective.map((c) => c.resourceType));
  const score = clamp(effective.length * 5 + types.size * 5);

  return {
    score,
    reason: `${effective.length} resource(s) across ${types.size} resource type(s).`,
  };
}

/**
 * Scales with the absolute size of the monthly swing — a large drop matters too,
 * since cost savings often come from removing redundancy.
 *
 * `undefined` means the estimator could not price this change. Per
 * docs/PRODUCT_PLAN.md #6.4 PlanGuard never invents a number, so it scores 0 and
 * says so rather than guessing.
 */
export function scoreCostImpact(
  monthlyDeltaUsd: number | undefined,
  saturationUsd: number,
): SubScore {
  if (monthlyDeltaUsd === undefined) {
    return { score: 0, reason: "Cost impact could not be estimated." };
  }

  const magnitude = Math.abs(monthlyDeltaUsd);
  const score = clamp((magnitude / saturationUsd) * 100);
  const direction = monthlyDeltaUsd >= 0 ? "increase" : "decrease";

  return {
    score,
    reason: `Estimated monthly ${direction} of $${magnitude.toFixed(2)}.`,
  };
}
