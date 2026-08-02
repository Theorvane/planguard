import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResourceChange } from "@planguard/schemas";
import { analyzePolicies } from "../src/index.js";

const OPEN_SSH: ResourceChange = {
  resource: "aws_security_group_rule.bastion_ssh",
  resourceType: "aws_security_group_rule",
  action: "update",
  replacementRequired: false,
  changedFields: [
    { field: "cidr_blocks", before: ["10.0.0.0/8"], after: ["0.0.0.0/0"] },
    { field: "from_port", before: 22, after: 22 },
    { field: "to_port", before: 22, after: 22 },
    { field: "protocol", before: "tcp", after: "tcp" },
  ],
};

const MULTI_AZ_DISABLED: ResourceChange = {
  resource: "aws_db_instance.production",
  resourceType: "aws_db_instance",
  action: "update",
  replacementRequired: false,
  changedFields: [{ field: "multi_az", before: true, after: false }],
};

test("reports public SSH exposure with a stable high-severity security finding", () => {
  const findings = analyzePolicies([OPEN_SSH]);

  assert.deepEqual(findings, [
    {
      category: "security",
      severity: "high",
      title: "SSH access is exposed to the internet",
      evidence:
        "aws_security_group_rule.bastion_ssh allows TCP port 22 from 0.0.0.0/0.",
      source: "planguard:PG-SEC-SSH-001",
      recommendation: "Restrict SSH access to a VPN or trusted administrative CIDR.",
    },
  ]);
});

test("reports public TCP ranges that include SSH", () => {
  const range = {
    ...OPEN_SSH,
    changedFields: [
      { field: "cidr_blocks", before: ["10.0.0.0/8"], after: ["0.0.0.0/0"] },
      { field: "from_port", before: 20, after: 20 },
      { field: "to_port", before: 22, after: 22 },
      { field: "protocol", before: "tcp", after: "tcp" },
    ],
  };

  assert.equal(analyzePolicies([range]).length, 1);
});

test("does not treat UDP or TCP ranges outside port 22 as SSH", () => {
  const udp = {
    ...OPEN_SSH,
    changedFields: OPEN_SSH.changedFields.map((field) =>
      field.field === "protocol" ? { ...field, after: "udp" } : field,
    ),
  };
  const outsideRange = {
    ...OPEN_SSH,
    changedFields: OPEN_SSH.changedFields.map((field) =>
      field.field === "from_port" ? { ...field, after: 23 } : field,
    ),
  };

  assert.deepEqual(analyzePolicies([udp, outsideRange]), []);
});

test("treats an all-protocol public rule as including SSH", () => {
  const allProtocols = {
    ...OPEN_SSH,
    changedFields: OPEN_SSH.changedFields.map((field) =>
      field.field === "protocol" ? { ...field, after: "-1" } : field,
    ),
  };

  assert.equal(analyzePolicies([allProtocols]).length, 1);
});

test("does not report SSH policy findings for non-public or non-SSH changes", () => {
  const privateSsh = {
    ...OPEN_SSH,
    changedFields: [
      { field: "cidr_blocks", before: ["10.0.0.0/8"], after: ["10.1.0.0/16"] },
      { field: "from_port", before: 22, after: 22 },
      { field: "to_port", before: 22, after: 22 },
    ],
  };
  const publicHttps = {
    ...OPEN_SSH,
    changedFields: [
      { field: "cidr_blocks", before: ["10.0.0.0/8"], after: ["0.0.0.0/0"] },
      { field: "from_port", before: 443, after: 443 },
      { field: "to_port", before: 443, after: 443 },
    ],
  };

  assert.deepEqual(analyzePolicies([privateSsh, publicHttps]), []);
});

test("reports disabling RDS Multi-AZ with a stable critical availability finding", () => {
  const findings = analyzePolicies([MULTI_AZ_DISABLED]);

  assert.deepEqual(findings, [
    {
      category: "availability",
      severity: "critical",
      title: "RDS Multi-AZ is being disabled",
      evidence: "aws_db_instance.production changes multi_az from true to false.",
      source: "planguard:PG-AVAIL-RDS-001",
      recommendation: "Keep Multi-AZ enabled for production databases.",
    },
  ]);
});

test("does not report Multi-AZ policy findings when availability is preserved", () => {
  const unchanged = { ...MULTI_AZ_DISABLED, changedFields: [] };
  const enabled = {
    ...MULTI_AZ_DISABLED,
    changedFields: [{ field: "multi_az", before: false, after: true }],
  };

  assert.deepEqual(analyzePolicies([unchanged, enabled]), []);
});
