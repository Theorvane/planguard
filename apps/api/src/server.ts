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

function parseTerraformPlanBody(body: string): TerraformPlanJson | undefined {
  try {
    const value: unknown = JSON.parse(body);
    if (
      value === null ||
      typeof value !== "object" ||
      typeof (value as { format_version?: unknown }).format_version !== "string"
    ) {
      return undefined;
    }

    const resourceChanges = (value as { resource_changes?: unknown }).resource_changes;
    if (resourceChanges !== undefined && !Array.isArray(resourceChanges)) return undefined;
    return value as TerraformPlanJson;
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

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  deps: ApiServerDeps,
): Promise<void> {
  const url = request.url ?? "/";

  if (request.method === "POST" && url === "/analysis/terraform-plan") {
    if (!hasBearerToken(header(request, "authorization"), deps.planUploadToken)) {
      send(response, 401, { message: "Unauthorized." });
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
