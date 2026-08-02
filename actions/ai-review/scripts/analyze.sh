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
node -e 'import(process.argv[1]).then(async ({validateChatCompletionEndpoint}) => console.log(await validateChatCompletionEndpoint(process.argv[2])))' \
  "$script_directory/review.mjs" "$INPUT_API_URL" > "$work_directory/api-url"

curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer $INPUT_API_KEY" \
  --header "Content-Type: application/json" \
  --data-binary "@$request_body" \
  --output "$response_body" \
  "$(<"$work_directory/api-url")"

node "$script_directory/review.mjs" summary "$response_body" "$summary"
{
  echo "## PlanGuard AI explanation"
  echo
  echo "AI-generated explanation only — deterministic policy/risk verdicts are not produced by this action."
  echo
  cat "$summary"
} >> "$GITHUB_STEP_SUMMARY"
