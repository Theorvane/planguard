#!/usr/bin/env bash
set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ -z "${INPUT_API_KEY:-}" || -z "${INPUT_MODEL:-}" || -z "${INPUT_API_URL:-}" || ! -f "${INPUT_PLAN_JSON_PATH:-}" ]]; then
  echo "api-key, model, api-url, and an existing plan-json-path are required." >&2
  exit 1
fi

work_directory=$(mktemp -d)
trap 'rm -rf "$work_directory"' EXIT
request_body="$work_directory/request.json"
response_body="$work_directory/response.json"
summary="$work_directory/summary.md"
endpoint_config="$work_directory/endpoint.json"

node "$script_directory/review.mjs" request "$INPUT_PLAN_JSON_PATH" "$INPUT_MODEL" "$request_body"
node "$script_directory/review.mjs" endpoint "$INPUT_API_URL" "$endpoint_config"
endpoint_url=$(node -e 'const e=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(e.url)' "$endpoint_config")
endpoint_host=$(node -e 'const e=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(e.host)' "$endpoint_config")
endpoint_port=$(node -e 'const e=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(e.port)' "$endpoint_config")
endpoint_address=$(node -e 'const e=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(e.address)' "$endpoint_config")

curl -q --noproxy '*' --fail --silent --show-error \
  --resolve "$endpoint_host:$endpoint_port:$endpoint_address" \
  --request POST \
  --header "Authorization: Bearer $INPUT_API_KEY" \
  --header "Content-Type: application/json" \
  --data-binary "@$request_body" \
  --output "$response_body" \
  "$endpoint_url"

node "$script_directory/review.mjs" summary "$response_body" "$summary"
{
  echo "## PlanGuard AI explanation"
  echo
  echo "AI-generated explanation only — deterministic policy/risk verdicts are not produced by this action."
  echo
  cat "$summary"
} >> "$GITHUB_STEP_SUMMARY"
