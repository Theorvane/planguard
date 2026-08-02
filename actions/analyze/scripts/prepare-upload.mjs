import { readFile, writeFile } from "node:fs/promises";

const UPLOAD_PATH = "/analysis/terraform-plan";
const RISK_LEVELS = new Set(["Low", "Moderate", "High", "Critical"]);
const CONCLUSIONS = new Set(["success", "failure"]);

export function buildUploadEndpoint(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("api-url must be an HTTPS base URL or upload endpoint.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== UPLOAD_PATH)
  ) {
    throw new Error("api-url must be an HTTPS base URL or upload endpoint.");
  }

  url.pathname = UPLOAD_PATH;
  return url.toString();
}

export function sanitizePlan(plan) {
  return {
    format_version: plan.format_version,
    ...(typeof plan.terraform_version === "string" ? { terraform_version: plan.terraform_version } : {}),
    resource_changes: Array.isArray(plan.resource_changes)
      ? plan.resource_changes.map((resource) => ({
          address: resource.address,
          mode: resource.mode,
          type: resource.type,
          name: resource.name,
          provider_name: resource.provider_name,
          change: {
            actions: resource.change?.actions,
            before: redact(resource.change?.before, resource.change?.before_sensitive),
            after: redact(resource.change?.after, resource.change?.after_sensitive),
            ...(resource.change?.after_unknown === undefined ? {} : { after_unknown: resource.change.after_unknown }),
            ...(resource.change?.before_sensitive === undefined ? {} : { before_sensitive: resource.change.before_sensitive }),
            ...(resource.change?.after_sensitive === undefined ? {} : { after_sensitive: resource.change.after_sensitive }),
          },
        }))
      : plan.resource_changes,
  };
}

function redact(value, sensitive) {
  if (sensitive === true) return "[REDACTED]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item, index) => redact(item, Array.isArray(sensitive) ? sensitive[index] : undefined));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redact(item, sensitive && typeof sensitive === "object" ? sensitive[key] : undefined)]),
  );
}

export function validateResponse(response) {
  if (
    !Number.isFinite(response?.risk?.score) ||
    response.risk.score < 0 ||
    response.risk.score > 100 ||
    !RISK_LEVELS.has(response.risk.level) ||
    !CONCLUSIONS.has(response.risk.conclusion) ||
    typeof response.summary !== "string"
  ) {
    throw new Error("PlanGuard API returned an invalid analysis response.");
  }
  return response;
}

const [command, ...args] = process.argv.slice(2);
if (command === "sanitize") {
  const [inputPath, outputPath] = args;
  const plan = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, JSON.stringify(sanitizePlan(plan)));
} else if (command === "endpoint") {
  console.log(buildUploadEndpoint(args[0]));
}
