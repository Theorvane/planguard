/**
 * Minimal shape of `terraform show -json` output (the plan representation,
 * format_version 1.x). Only the fields this parser reads are declared —
 * the real output has many more.
 */

export type TerraformChangeAction =
  | "no-op"
  | "create"
  | "read"
  | "update"
  | "delete";

export interface TerraformResourceChangeJson {
  readonly address: string;
  readonly mode: "managed" | "data";
  readonly type: string;
  readonly name: string;
  readonly provider_name: string;
  readonly change: {
    readonly actions: ReadonlyArray<TerraformChangeAction>;
    readonly before: Readonly<Record<string, unknown>> | null;
    readonly after: Readonly<Record<string, unknown>> | null;
    readonly after_unknown?: Readonly<Record<string, unknown>>;
    readonly before_sensitive?: Readonly<Record<string, unknown>> | boolean;
    readonly after_sensitive?: Readonly<Record<string, unknown>> | boolean;
  };
}

export interface TerraformPlanJson {
  readonly format_version: string;
  readonly terraform_version?: string;
  readonly resource_changes?: ReadonlyArray<TerraformResourceChangeJson>;
}
