import type { Finding, ResourceChange } from "@planguard/schemas";

const PUBLIC_IPV4_CIDR = "0.0.0.0/0";

export function analyzeAwsPolicies(resourceChanges: ReadonlyArray<ResourceChange>): Finding[] {
  return resourceChanges.flatMap((resourceChange) => [
    ...analyzePublicSsh(resourceChange),
    ...analyzeRdsMultiAzDisable(resourceChange),
  ]);
}

function analyzePublicSsh(resourceChange: ResourceChange): Finding[] {
  if (
    resourceChange.resourceType !== "aws_security_group_rule" ||
    !isManagedChangeAction(resourceChange.action) ||
    !includesPort(resourceChange, 22) ||
    !changedToPublicCidr(resourceChange)
  ) {
    return [];
  }

  return [
    {
      category: "security",
      severity: "high",
      title: "SSH access is exposed to the internet",
      evidence: `${resourceChange.resource} allows TCP port 22 from ${PUBLIC_IPV4_CIDR}.`,
      source: "planguard:PG-SEC-SSH-001",
      recommendation: "Restrict SSH access to a VPN or trusted administrative CIDR.",
    },
  ];
}

function analyzeRdsMultiAzDisable(resourceChange: ResourceChange): Finding[] {
  const multiAz = findChangedField(resourceChange, "multi_az");
  if (
    resourceChange.resourceType !== "aws_db_instance" ||
    !isChangeAction(resourceChange.action) ||
    multiAz?.before !== true ||
    multiAz.after !== false
  ) {
    return [];
  }

  return [
    {
      category: "availability",
      severity: "critical",
      title: "RDS Multi-AZ is being disabled",
      evidence: `${resourceChange.resource} changes multi_az from true to false.`,
      source: "planguard:PG-AVAIL-RDS-001",
      recommendation: "Keep Multi-AZ enabled for production databases.",
    },
  ];
}

function isManagedChangeAction(action: ResourceChange["action"]): boolean {
  return action === "create" || action === "update" || action === "replace";
}

function isChangeAction(action: ResourceChange["action"]): boolean {
  return action === "update" || action === "replace";
}

function includesPort(resourceChange: ResourceChange, port: number): boolean {
  return (
    includesNumber(valueAfter(resourceChange, "from_port"), port) &&
    includesNumber(valueAfter(resourceChange, "to_port"), port)
  );
}

function changedToPublicCidr(resourceChange: ResourceChange): boolean {
  return includesString(valueAfter(resourceChange, "cidr_blocks"), PUBLIC_IPV4_CIDR);
}

function valueAfter(resourceChange: ResourceChange, field: string): unknown {
  return findChangedField(resourceChange, field)?.after ?? resourceChange.after?.[field];
}

function findChangedField(resourceChange: ResourceChange, field: string) {
  return resourceChange.changedFields.find((changedField) => changedField.field === field);
}

function includesNumber(value: unknown, expected: number): boolean {
  return value === expected || (Array.isArray(value) && value.includes(expected));
}

function includesString(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.includes(expected));
}
