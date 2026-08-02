import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [first, second, third] = address.split(".").map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 2 || second === 88 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0 && third === 113)
    );
  }
  if (isIP(address) === 6) {
    const [firstPart, secondPart] = address.toLowerCase().split(":");
    const firstHextet = Number.parseInt(firstPart || "0", 16);
    const secondHextet = Number.parseInt(secondPart || "0", 16);
    // Public IPv6 traffic must be global-unicast (2000::/3), excluding the documentation range 2001:db8::/32.
    // loopback, link-local, ULA, documentation, multicast, and all reserved ranges.
    return (firstHextet & 0xe000) === 0x2000 && !(firstHextet === 0x2001 && secondHextet === 0x0db8);
  }
  return false;
}

export async function prepareChatCompletionEndpoint(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("api-url must be an HTTPS endpoint.");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("api-url must be a public HTTPS endpoint.");
  }
  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("api-url must resolve to a public HTTPS endpoint.");
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("api-url must resolve only to public HTTPS addresses.");
  }
  if (isIP(url.hostname) !== 0) {
    throw new Error("api-url must use a public DNS hostname, not an IP address.");
  }
  const port = url.port || "443";
  const address = addresses[0].address;
  return { url: url.toString(), host: url.hostname, port, address };
}

export async function validateChatCompletionEndpoint(input) {
  return (await prepareChatCompletionEndpoint(input)).url;
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
} else if (command === "endpoint") {
  const [input, outputPath] = args;
  await writeFile(outputPath, JSON.stringify(await prepareChatCompletionEndpoint(input)));
} else if (command === "summary") {
  const [responsePath, summaryPath] = args;
  const response = JSON.parse(await readFile(responsePath, "utf8"));
  await writeFile(summaryPath, parseChatCompletionResponse(response));
}
