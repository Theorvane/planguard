import { readFile, writeFile } from "node:fs/promises";

const MAX_PLAN_BYTES = 512 * 1024;
const MAX_RESPONSE_CHARS = 60_000;

const SYSTEM_PROMPT = [
  "You explain a sanitized Terraform plan for a human pull-request reviewer.",
  "Use only the supplied plan. Never infer secrets or claim that an unknown value is safe.",
  "You must not determine a pass/fail verdict, risk score, or deployment approval; those are deterministic-policy decisions.",
  "Explain material resource changes, likely operational impact, and review questions concisely in Markdown.",
  "Prefix any recommendation or inference that is not a direct restatement of the plan with 'Needs verification:'.",
].join(" ");

function assertModel(model) {
  if (typeof model !== "string" || !model.trim() || model.length > 200 || /[\r\n]/.test(model)) {
    throw new Error("model must be a non-empty single-line identifier.");
  }
  return model;
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

export function validateChatCompletionEndpoint(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("api-url must be an HTTPS endpoint.");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("api-url must be an HTTPS endpoint.");
  }
  return url.toString();
}

export function buildChatCompletionRequest(plan, model) {
  const sanitizedPlan = sanitizePlan(plan);
  const serializedPlan = JSON.stringify(sanitizedPlan);
  if (Buffer.byteLength(serializedPlan, "utf8") > MAX_PLAN_BYTES) {
    throw new Error("Sanitized Terraform plan exceeds the 512 KiB AI review limit.");
  }

  return {
    model: assertModel(model),
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Review this sanitized Terraform plan JSON:\n\n${serializedPlan}`,
      },
    ],
  };
}

export function parseChatCompletionResponse(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim() || content.length > MAX_RESPONSE_CHARS) {
    throw new Error("AI provider returned an invalid chat-completion response.");
  }
  return content.trim();
}

const [command, ...args] = process.argv.slice(2);
if (command === "request") {
  const [planPath, model, requestPath] = args;
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  await writeFile(requestPath, JSON.stringify(buildChatCompletionRequest(plan, model)));
} else if (command === "summary") {
  const [responsePath, summaryPath] = args;
  const response = JSON.parse(await readFile(responsePath, "utf8"));
  await writeFile(summaryPath, parseChatCompletionResponse(response));
}
