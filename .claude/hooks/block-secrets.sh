#!/usr/bin/env bash
# PreToolUse(Bash) hook: block destructive deletes and secret-file exposure.
# exit 2 + stderr blocks the command; Claude Code reads the reason.
#
# Regex alone is easy to bypass (`rm -r -f`, `rm --recursive --force`, `git add .`),
# so this tokenizes with python3 + shlex and inspects flags/targets/subcommands
# instead of pattern-matching the raw string.
#
# File types covered: .env (this repo's own secrets) plus Terraform/cloud
# credentials this product's users hand us — .pem, id_rsa*, *.tfstate, *.tfvars,
# and .aws/credentials — since terraform.tfstate and plan JSON can carry
# sensitive_values in plaintext (docs/PRODUCT_PLAN.md #15).

set -uo pipefail

exec python3 -c '
import json, sys, shlex, os, re, subprocess

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cmd = (data.get("tool_input", {}) or {}).get("command", "") or ""
if not cmd.strip():
    sys.exit(0)

def block(msg):
    sys.stderr.write("block-secrets: 차단됨 — " + msg + "\n")
    sys.exit(2)

segments = re.split(r"[;\n]|&&|\|\||\||&", cmd)

BROAD_TARGETS = {"/", "~", "$HOME", ".", "./", "*", "./*", "~/", "/*", ".."}
ASSIGN_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

ENV_RE = re.compile(r"^\.env(\..+)?$")
SECRET_NAME_RE = re.compile(
    r"^(\.env(\..+)?|id_rsa(\.[A-Za-z0-9]+)?|id_ed25519(\.[A-Za-z0-9]+)?|"
    r".+\.pem|.+\.tfstate|.+\.tfstate\.backup|.+\.tfvars|credentials)$"
)

def is_env_file(arg):
    base = os.path.basename(arg)
    return bool(ENV_RE.fullmatch(base)) and base != ".env.example"

def is_secret_file(arg):
    base = os.path.basename(arg)
    if base == ".env.example":
        return False
    if SECRET_NAME_RE.fullmatch(base):
        return True
    return arg.replace(os.sep, "/").rstrip("/").endswith(".aws/credentials")

def dangerous_target(t):
    tt = t.rstrip("/")
    return (
        t in BROAD_TARGETS
        or tt in ("", "/", "~", "$HOME", ".", "..")
        or t.startswith(("/", "~", "$HOME"))
        or "*" in t
    )

for seg in segments:
    try:
        tokens = shlex.split(seg)
    except ValueError:
        tokens = seg.split()
    if not tokens:
        continue

    idx = 0
    while idx < len(tokens):
        t = tokens[idx]
        if t in ("sudo", "env") or ASSIGN_RE.match(t):
            idx += 1
            continue
        break
    if idx >= len(tokens):
        continue

    name = os.path.basename(tokens[idx])
    args = tokens[idx + 1:]

    # 1) destructive rm (combined/separate flags, long options, wildcard targets)
    if name == "rm":
        recursive = force = False
        targets = []
        for a in args:
            if a == "--":
                continue
            if a == "--recursive":
                recursive = True
            elif a == "--force":
                force = True
            elif a.startswith("--"):
                pass
            elif a.startswith("-") and len(a) > 1:
                flags = a[1:]
                if "r" in flags or "R" in flags:
                    recursive = True
                if "f" in flags:
                    force = True
            else:
                targets.append(a)
        if recursive and any(dangerous_target(x) for x in targets):
            block("위험한 rm -r 대상(루트/홈/현재 디렉토리/와일드카드). 삭제 대상을 구체적 경로로 좁혀라.")

    # 2) secret/credential/terraform-state file content exposure
    if name in ("cat", "less", "more", "head", "tail", "cp", "scp",
                "curl", "wget", "nc", "xxd", "od", "base64", "strings", "bat", "grep"):
        if any(is_secret_file(a) for a in args if not a.startswith("-")):
            block("시크릿/자격증명/Terraform state 파일 내용 노출 시도. 커밋·출력·전송 금지.")

    # 3) git add staging a secret file (explicit, broad, or forced)
    if name == "git":
        VALUE_OPTS = ("-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix")
        gi = 0
        while gi < len(args) and args[gi].startswith("-"):
            gi += 2 if args[gi] in VALUE_OPTS else 1
        subcmd = args[gi] if gi < len(args) else None
        add_args = args[gi + 1:]

        if subcmd == "add":
            positionals = [a for a in add_args if not a.startswith("-")]
            force_add = any(a in ("-f", "--force") for a in add_args)
            explicit_secret = any(is_secret_file(a) for a in positionals)
            broad = any(a in (".", "./", "-A", "--all", "-u", "--update", "*") for a in add_args)

            if explicit_secret:
                block("시크릿 파일을 git에 추가하려는 시도. .env/.tfstate/.tfvars/자격증명은 커밋 금지.")
            if broad or force_add:
                status_cmd = ["git", "status", "--porcelain"]
                if force_add:
                    status_cmd.append("--ignored")
                status_cmd += ["--", ".env", "*.tfstate", "*.tfvars", ".aws/credentials"]
                try:
                    out = subprocess.run(status_cmd, capture_output=True, text=True, timeout=5)
                    if out.stdout.strip():
                        block("시크릿 파일이 스테이징 대상에 포함될 수 있음. 대상을 구체적 경로로 좁혀라.")
                except Exception:
                    pass

sys.exit(0)
'
