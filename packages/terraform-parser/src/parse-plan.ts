import type { ChangedField, ResourceAction, ResourceChange } from "@planguard/schemas";
import type { TerraformPlanJson, TerraformResourceChangeJson } from "./plan-json.js";

const REDACTED = "(sensitive value hidden)";

/**
 * Parses `terraform show -json` plan output into PlanGuard's ResourceChange[]
 * (docs/PRODUCT_PLAN.md #6.1). Only managed resources are returned — data
 * source reads (`mode: "data"`) are not user-facing changes.
 *
 * Sensitive values are redacted per the before_sensitive/after_sensitive
 * markers Terraform includes, per docs/PRODUCT_PLAN.md #15.
 */
export function parseTerraformPlan(plan: TerraformPlanJson): ResourceChange[] {
  const resourceChanges = plan.resource_changes ?? [];

  return resourceChanges
    .filter((change) => change.mode === "managed")
    .map(toResourceChange);
}

function toResourceChange(raw: TerraformResourceChangeJson): ResourceChange {
  const { actions, before, after, after_unknown, before_sensitive, after_sensitive } =
    raw.change;
  const action = mapAction(actions);

  return {
    resource: raw.address,
    resourceType: raw.type,
    action,
    changedFields: shouldDiff(action)
      ? diffFields(before, after, after_unknown, before_sensitive, after_sensitive)
      : [],
    replacementRequired: isReplace(actions),
  };
}

function shouldDiff(action: ResourceAction): boolean {
  return action === "update" || action === "replace";
}

function isReplace(actions: ReadonlyArray<string>): boolean {
  return actions.includes("create") && actions.includes("delete");
}

function mapAction(actions: ReadonlyArray<string>): ResourceAction {
  if (isReplace(actions)) return "replace";
  if (actions.includes("update")) return "update";
  if (actions.includes("create")) return "create";
  if (actions.includes("delete")) return "delete";
  if (actions.includes("read")) return "read";
  return "no-op";
}

function diffFields(
  before: Readonly<Record<string, unknown>> | null,
  after: Readonly<Record<string, unknown>> | null,
  afterUnknown: Readonly<Record<string, unknown>> | undefined,
  beforeSensitive: Readonly<Record<string, unknown>> | boolean | undefined,
  afterSensitive: Readonly<Record<string, unknown>> | boolean | undefined,
): ChangedField[] {
  const beforeObj = before ?? {};
  const afterObj = after ?? {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const fields: ChangedField[] = [];

  for (const key of keys) {
    if (afterUnknown?.[key] === true) {
      // Value isn't known until apply (e.g. a generated id) — nothing to report yet.
      continue;
    }

    const beforeValue = beforeObj[key];
    const afterValue = afterObj[key];

    if (deepEqual(beforeValue, afterValue)) continue;

    const sensitive = isSensitiveField(beforeSensitive, key) || isSensitiveField(afterSensitive, key);

    fields.push({
      field: key,
      before: sensitive ? REDACTED : beforeValue,
      after: sensitive ? REDACTED : afterValue,
    });
  }

  return fields;
}

function isSensitiveField(
  sensitive: Readonly<Record<string, unknown>> | boolean | undefined,
  key: string,
): boolean {
  if (sensitive === true) return true;
  if (!sensitive) return false;
  return Boolean(sensitive[key]);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
