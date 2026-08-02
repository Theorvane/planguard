#!/usr/bin/env bash
set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
working_directory=${INPUT_WORKING_DIRECTORY:-.}
output_path=${INPUT_OUTPUT_PATH:-planguard-sanitized-plan.json}

if [[ ! -d "$working_directory" ]]; then
  echo "working-directory does not exist: $working_directory" >&2
  exit 1
fi

work_directory=$(mktemp -d)
trap 'rm -rf "$work_directory"' EXIT
raw_plan="$work_directory/plan.json"

pushd "$working_directory" >/dev/null
terraform init -input=false -no-color
terraform plan -input=false -no-color -out="$work_directory/plan.bin"
terraform show -json "$work_directory/plan.bin" > "$raw_plan"
popd >/dev/null

node "$script_directory/review.mjs" sanitize "$raw_plan" "$output_path"
