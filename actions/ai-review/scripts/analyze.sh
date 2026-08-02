#!/usr/bin/env bash
set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
working_directory=${INPUT_WORKING_DIRECTORY:-.}

if [[ ! -d "$working_directory" ]]; then
  echo "working-directory does not exist: $working_directory" >&2
  exit 1
fi
if [[ -z "${INPUT_API_KEY:-}" || -z "${INPUT_MODEL:-}" || -z "${INPUT_API_URL:-}" ]]; then
  echo "api-key, model, and api-url are required." >&2
  exit 1
fi

work_directory=$(mktemp -d)
trap 'rm -rf "$work_directory"' EXIT
raw_plan="$work_directory/plan.json"
request_body="$work_directory/request.json"
response_body="$work_directory/response.json"
summary="$work_directory/summary.md"

pushd "$working_directory" >/dev/null
env -u INPUT_API_KEY terraform init -input=false -no-color
env -u INPUT_API_KEY terraform plan -input=false -no-color -out="$work_directory/plan.bin"
env -u INPUT_API_KEY terraform show -json "$work_directory/plan.bin" > "$raw_plan"
popd >/dev/null

node "$script_directory/review.mjs" request "$raw_plan" "$INPUT_MODEL" "$request_body"
endpoint_config="$work_directory/endpoint.json"
node "$script_directory/review.mjs" endpoint "$INPUT_API_URL" "$endpoint_config"
endpoint_url=$(node -e 'const endpoint=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(endpoint.url)' "$endpoint_config")
endpoint_host=$(node -e 'const endpoint=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(endpoint.host)' "$endpoint_config")
endpoint_port=$(node -e 'const endpoint=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(endpoint.port)' "$endpoint_config")
endpoint_address=$(node -e 'const endpoint=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(endpoint.address)' "$endpoint_config")

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
