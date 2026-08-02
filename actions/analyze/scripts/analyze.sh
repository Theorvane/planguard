#!/usr/bin/env bash
set -euo pipefail

: "${INPUT_API_URL:?api-url is required}"
: "${INPUT_API_TOKEN:?api-token is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"

working_directory="${INPUT_WORKING_DIRECTORY:-.}"
workdir="$(cd "$working_directory" && pwd)"
temporary_directory="$(mktemp -d)"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
trap 'rm -rf "$temporary_directory"' EXIT
plan_binary="$temporary_directory/plan.bin"
plan_json="$temporary_directory/plan.json"
sanitized_plan_json="$temporary_directory/sanitized-plan.json"
response_json="$temporary_directory/response.json"

terraform -chdir="$workdir" init -input=false
terraform -chdir="$workdir" plan -input=false -out="$plan_binary"
terraform -chdir="$workdir" show -json "$plan_binary" > "$plan_json"
node "$script_directory/prepare-upload.mjs" sanitize "$plan_json" "$sanitized_plan_json"
endpoint="$(node "$script_directory/prepare-upload.mjs" endpoint "$INPUT_API_URL")"
curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${INPUT_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data-binary "@$sanitized_plan_json" \
  "$endpoint" > "$response_json"

node --input-type=module - "$response_json" "$GITHUB_OUTPUT" "$GITHUB_STEP_SUMMARY" <<'NODE'
import { appendFile, readFile } from "node:fs/promises";
const [responsePath, outputPath, summaryPath] = process.argv.slice(2);
const response = JSON.parse(await readFile(responsePath, "utf8"));
const riskLevels = new Set(["Low", "Moderate", "High", "Critical"]);
if (
  !Number.isFinite(response?.risk?.score) ||
  response.risk.score < 0 || response.risk.score > 100 ||
  !riskLevels.has(response.risk.level) ||
  (response.risk.conclusion !== "success" && response.risk.conclusion !== "failure") ||
  typeof response.summary !== "string"
) throw new Error("PlanGuard API returned an invalid analysis response.");
await appendFile(outputPath, `risk-level=${response.risk.level}\nconclusion=${response.risk.conclusion}\n`);
await appendFile(summaryPath, `## PlanGuard\n\n${response.summary}\n`);
if (response.risk.conclusion === "failure") process.exitCode = 1;
NODE
