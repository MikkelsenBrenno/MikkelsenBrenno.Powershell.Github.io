import * as z from "zod";

export const VALUE_TYPES = ["String", "DWORD", "QWORD", "MultiString", "Binary"] as const;
export const DETECTION_OPERATORS = ["-eq", "-ne", "-gt", "-lt"] as const;

export const registryConditionSchema = z.object({
  id: z.string(),
  kind: z.literal("registry"),
  registryPath: z.string().min(1, "Registry path is required"),
  registryValueName: z.string().min(1, "Value name is required"),
  expectedValue: z.string(),
  valueType: z.enum(VALUE_TYPES),
  detectionOperator: z.enum(DETECTION_OPERATORS),
  action: z.enum(["Set", "Remove"]),
});

export const serviceConditionSchema = z.object({
  id: z.string(),
  kind: z.literal("service"),
  serviceName: z.string().min(1, "Service name is required"),
  expectedStatus: z.enum(["Running", "Stopped"]),
});

export const fileConditionSchema = z.object({
  id: z.string(),
  kind: z.literal("file"),
  filePath: z.string().min(1, "File or folder path is required"),
  expected: z.enum(["Exists", "NotExists"]),
});

export const taskConditionSchema = z.object({
  id: z.string(),
  kind: z.literal("scheduledTask"),
  taskName: z.string().min(1, "Task name is required"),
  expected: z.enum(["Enabled", "Disabled"]),
});

export const conditionSchema = z.discriminatedUnion("kind", [
  registryConditionSchema,
  serviceConditionSchema,
  fileConditionSchema,
  taskConditionSchema,
]);

export type Condition = z.infer<typeof conditionSchema>;
export type ConditionKind = Condition["kind"];
export type RegistryCondition = z.infer<typeof registryConditionSchema>;
export type ServiceCondition = z.infer<typeof serviceConditionSchema>;
export type FileCondition = z.infer<typeof fileConditionSchema>;
export type TaskCondition = z.infer<typeof taskConditionSchema>;

export const variableSchema = z.object({
  name: z
    .string()
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      "Use letters, digits, and underscore only; must not start with a digit"
    ),
  value: z.string(),
});

export type Variable = z.infer<typeof variableSchema>;

export function newConditionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export const KIND_LABELS: Record<ConditionKind, string> = {
  registry: "Registry Value",
  service: "Windows Service",
  file: "File / Folder",
  scheduledTask: "Scheduled Task",
};

export const ALL_KINDS: ConditionKind[] = ["registry", "service", "file", "scheduledTask"];

export function defaultConditionFor(kind: ConditionKind): Condition {
  switch (kind) {
    case "registry":
      return {
        id: newConditionId(),
        kind: "registry",
        registryPath: "HKLM:\\SOFTWARE\\Contoso",
        registryValueName: "Configured",
        expectedValue: "1",
        valueType: "DWORD",
        detectionOperator: "-eq",
        action: "Set",
      };
    case "service":
      return {
        id: newConditionId(),
        kind: "service",
        serviceName: "Spooler",
        expectedStatus: "Running",
      };
    case "file":
      return {
        id: newConditionId(),
        kind: "file",
        filePath: "C:\\ProgramData\\Contoso\\marker.txt",
        expected: "Exists",
      };
    case "scheduledTask":
      return {
        id: newConditionId(),
        kind: "scheduledTask",
        taskName: "ScheduledDefrag",
        expected: "Enabled",
      };
  }
}

export interface ConditionPreview {
  primaryPath: string;
  valueLabel: string;
  actionLabel: string;
  kindLabel: string;
}

export function previewCondition(c: Condition): ConditionPreview {
  switch (c.kind) {
    case "registry":
      return {
        kindLabel: KIND_LABELS.registry,
        primaryPath: c.registryPath,
        valueLabel:
          c.registryValueName +
          (c.expectedValue !== "" ? ` = ${c.expectedValue}` : "") +
          ` · ${c.valueType}`,
        actionLabel: c.action === "Set" ? "Set value" : "Remove value",
      };
    case "service":
      return {
        kindLabel: KIND_LABELS.service,
        primaryPath: `Service: ${c.serviceName}`,
        valueLabel: `Expect ${c.expectedStatus}`,
        actionLabel: c.expectedStatus === "Running" ? "Ensure Running" : "Ensure Stopped",
      };
    case "file":
      return {
        kindLabel: KIND_LABELS.file,
        primaryPath: c.filePath,
        valueLabel: c.expected === "Exists" ? "Expect path exists" : "Expect path absent",
        actionLabel: c.expected === "Exists" ? "Ensure Exists" : "Ensure Removed",
      };
    case "scheduledTask":
      return {
        kindLabel: KIND_LABELS.scheduledTask,
        primaryPath: `Task: ${c.taskName}`,
        valueLabel: `Expect ${c.expected}`,
        actionLabel: c.expected === "Enabled" ? "Enable task" : "Disable task",
      };
  }
}

const VAR_REF_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function findVariableRefs(text: string): string[] {
  if (!text) return [];
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_REF_RE.lastIndex = 0;
  while ((m = VAR_REF_RE.exec(text)) !== null) {
    set.add(m[1]);
  }
  return Array.from(set);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function substituteVariables(text: string, vars: Variable[]): string {
  if (!text) return text;
  let out = text;
  for (const v of vars) {
    if (!v.name) continue;
    const re = new RegExp(`\\{\\{\\s*${escapeRegExp(v.name)}\\s*\\}\\}`, "g");
    out = out.replace(re, v.value);
  }
  return out;
}

export function findUnresolvedRefs(text: string, vars: Variable[]): string[] {
  const defined = new Set(vars.map((v) => v.name).filter(Boolean));
  return findVariableRefs(text).filter((n) => !defined.has(n));
}

export function collectConditionStringValues(c: Condition): string[] {
  switch (c.kind) {
    case "registry":
      return [c.registryPath, c.registryValueName, c.expectedValue];
    case "service":
      return [c.serviceName];
    case "file":
      return [c.filePath];
    case "scheduledTask":
      return [c.taskName];
  }
}
