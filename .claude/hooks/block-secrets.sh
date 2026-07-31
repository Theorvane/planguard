#!/usr/bin/env bash
# PreToolUse(Bash) hook: block commands that would expose or exfiltrate secrets
# this repo handles — .env, cloud credentials, and Terraform state/plan files,
# which can contain sensitive_values/before_sensitive/after_sensitive in plaintext
# (see docs/PRODUCT_PLAN.md #15). exit 2 blocks the command and shows stderr to the agent.
set -euo pipefail

input=$(cat)

cmd=$(printf '%s' "$input" | node -e '
let d="";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try { process.stdout.write(JSON.parse(d).tool_input?.command || ""); }
  catch { process.stdout.write(""); }
});
' 2>/dev/null || true)

[ -z "$cmd" ] && exit 0

block() {
  echo "차단됨: $1" >&2
  echo "이 명령은 block-secrets.sh 훅에 의해 막혔습니다. 의도한 작업이면 사람이 직접 실행하세요." >&2
  exit 2
}

SECRET_PATTERN='(\.env($|[^.a-zA-Z0-9])|\.env\.[a-z]+|id_rsa|id_ed25519|\.pem($|[^a-zA-Z])|\.tfstate($|[^a-zA-Z])|\.tfvars($|[^a-zA-Z])|credentials($|[^a-zA-Z])|\.aws/credentials)'

# 1) root/home 대상 파괴적 삭제 (rm -rf 류)
if printf '%s' "$cmd" | grep -Eq 'rm[[:space:]]+((-[a-zA-Z]+|--(recursive|force|no-preserve-root))[[:space:]]+)*(-[a-zA-Z]*[rRfF][a-zA-Z]*|--(recursive|force))[[:space:]]+(/|~|\$HOME|/\*|\.\*)([[:space:]]|$)'; then
  block "루트/홈 대상 파괴적 삭제(rm -rf)"
fi

# 2) .env / cloud credentials / terraform state·tfvars 내용 출력
if printf '%s' "$cmd" | grep -Eq "((cat|less|more|head|tail|xxd|od|base64|strings|grep|egrep|sed|awk|nl|tac)[[:space:]]+[^|;&]*|<[[:space:]]*)$SECRET_PATTERN"; then
  block "시크릿/자격증명/Terraform state 파일 내용 출력 시도"
fi

# 3) .env 또는 tfstate를 git에 강제 추가
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+add[[:space:]]+[^|;&]*(-f|--force)[^|;&]*(\.env|\.tfstate|\.tfvars)'; then
  block "시크릿 파일 강제 git add"
fi

# 4) 원격으로 시크릿 유출 (curl/wget에 .env·tfstate·credentials 첨부)
if printf '%s' "$cmd" | grep -Eq "(curl|wget)[[:space:]]+[^|;&]*$SECRET_PATTERN"; then
  block "시크릿/state 파일을 원격으로 전송 시도"
fi

exit 0
