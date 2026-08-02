import { type TerraformPlanJson } from "@planguard/terraform-parser";
import { timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { analyzeUploadedPlan } from "./plan-upload.js";
import type { WebhookDeps } from "./webhook-handler.js";
import { handleWebhook } from "./webhook-handler.js";

/** Refuse oversized bodies rather than buffering them; GitHub payloads are far smaller. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new RangeError("Request body too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readUploadedPlanBody(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<string | undefined> {
  try {
    return await readBody(request);
  } catch (error) {
    if (error instanceof RangeError) {
      send(response, 413, { message: "Request body too large." });
      return undefined;
    }
    throw error;
  }
}

function hasBearerToken(authorization: string | undefined, expectedToken: string): boolean {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
  if (!token) return false;

  const received = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTerraformValueMarker(value: unknown): boolean {
  return (
    value === undefined ||
    value === true ||
    value === false ||
    (Array.isArray(value) && value.every(isTerraformValueMarker)) ||
    (isRecord(value) && Object.values(value).every(isTerraformValueMarker))
  );
}

function isNullableRecord(value: unknown): boolean {
  return value === null || isRecord(value);
}

function isTerraformResourceChange(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.change)) return false;
  const actions = value.change.actions;
  const validActions = new Set(["no-op", "create", "read", "update", "delete"]);
  return (
    typeof value.address === "string" &&
    (value.mode === "managed" || value.mode === "data") &&
    typeof value.type === "string" &&
    typeof value.name === "string" &&
    typeof value.provider_name === "string" &&
    Array.isArray(actions) && actions.length > 0 && actions.every((action) => typeof action === "string" && validActions.has(action)) &&
    isNullableRecord(value.change.before) &&
    isNullableRecord(value.change.after) &&
    (value.change.after_unknown === undefined || isTerraformValueMarker(value.change.after_unknown)) &&
    isTerraformValueMarker(value.change.before_sensitive) &&
    isTerraformValueMarker(value.change.after_sensitive)
  );
}

function parseTerraformPlanBody(body: string): TerraformPlanJson | undefined {
  try {
    const value: unknown = JSON.parse(body);
    if (!isRecord(value) || typeof value.format_version !== "string") return undefined;
    if (value.resource_changes !== undefined && (!Array.isArray(value.resource_changes) || !value.resource_changes.every(isTerraformResourceChange))) {
      return undefined;
    }
    return value as unknown as TerraformPlanJson;
  } catch {
    return undefined;
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

export interface ApiServerDeps extends WebhookDeps {
  /** Shared secret used only by repository Actions uploading a Terraform JSON plan. */
  readonly planUploadToken: string;
}

export function createApiServer(deps: ApiServerDeps): Server {
  return createServer((request, response) => {
    void route(request, response, deps).catch((error: unknown) => {
      // Never leak internals to the caller; the delivery is retryable on GitHub's side.
      console.error("Unhandled request error:", error);
      if (!response.headersSent) send(response, 500, { message: "Internal error." });
    });
  });
}

export function createBootstrapServer(): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      send(response, 200, { status: "bootstrap" });
      return;
    }
    send(response, 503, { message: "PlanGuard is awaiting GitHub App configuration." });
  });
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  deps: ApiServerDeps,
): Promise<void> {
  const url = request.url ?? "/";

  if (request.method === "POST" && url === "/analysis/terraform-plan") {
    if (!hasBearerToken(header(request, "authorization"), deps.planUploadToken)) {
      response.setHeader("connection", "close");
      send(response, 401, { message: "Unauthorized." });
      request.destroy();
      return;
    }

    const rawBody = await readUploadedPlanBody(request, response);
    if (rawBody === undefined) return;

    const plan = parseTerraformPlanBody(rawBody);
    if (plan === undefined) {
      send(response, 400, { message: "Invalid Terraform plan." });
      return;
    }

    send(response, 200, analyzeUploadedPlan(plan));
    return;
  }

  if (request.method === "GET" && url === "/healthz") {
    send(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && url === "/webhooks/github") {
    let rawBody: string;
    try {
      rawBody = await readBody(request);
    } catch {
      send(response, 413, { message: "Request body too large." });
      return;
    }

    const result = await handleWebhook(
      {
        rawBody,
        event: header(request, "x-github-event"),
        signature: header(request, "x-hub-signature-256"),
        deliveryId: header(request, "x-github-delivery"),
      },
      deps,
    );

    send(response, result.status, result.body);
    return;
  }

  send(response, 404, { message: "Not found." });
}
