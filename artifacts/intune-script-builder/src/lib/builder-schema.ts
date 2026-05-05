import * as z from "zod";

import {
  conditionSchema,
  variableSchema,
  collectConditionStringValues,
  findVariableRefs,
} from "./conditions";

// Top-level builder form schema. The `superRefine` block hard-fails the
// form whenever a condition references a variable that is not defined
// (or whose name is empty). This is a true validation failure that
// populates `formState.errors`, not just a UI warning.
export const builderSchema = z
  .object({
    scriptName: z.string().min(1, "Script Name is required"),
    description: z.string(),
    // `purpose` is optional. The `.default("")` keeps older library
    // entries and share links (saved before this field existed) loading
    // cleanly: when absent on input the schema fills in an empty
    // string so validation still passes and the form just shows the
    // field empty.
    purpose: z.string().default(""),
    publisher: z.string().min(1, "Publisher is required"),
    scenarioId: z.string(),
    conditions: z.array(conditionSchema).min(1, "Add at least one condition"),
    combinator: z.enum(["AND", "OR"]),
    rollback: z.boolean(),
    inverseMode: z.boolean(),
    variables: z.array(variableSchema),
    loggingLevel: z.string(),
    // `.default(...)` keeps backward compatibility with library entries and
    // share links that were saved before this field existed: when absent on
    // input, the default is filled in so the config still passes validation
    // and round-trips correctly. New entries always carry the explicit value.
    logPath: z
      .string()
      .min(1, "Log directory cannot be empty")
      .default("$env:ProgramData\\IntuneScripts"),
    runContext: z.enum(["System", "User"]),
    architecture: z.enum(["64-bit", "32-bit"]),
    dryRunMode: z.boolean(),
    pilotGroup: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const definedVars = new Set(
      data.variables.map((v) => v.name).filter((n): n is string => Boolean(n))
    );

    const reportUnresolved = (text: string, path: (string | number)[]) => {
      const refs = findVariableRefs(text);
      const unresolved = refs.filter((r) => !definedVars.has(r));
      if (unresolved.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Unresolved variable reference(s): ${unresolved
            .map((u) => `{{${u}}}`)
            .join(", ")}. Define them in the Variables panel.`,
        });
      }
    };

    // Templated top-level fields.
    reportUnresolved(data.scriptName, ["scriptName"]);
    reportUnresolved(data.description, ["description"]);
    reportUnresolved(data.purpose, ["purpose"]);

    // Condition string fields.
    data.conditions.forEach((cond, idx) => {
      const combined = collectConditionStringValues(cond).join("\n");
      reportUnresolved(combined, ["conditions", idx]);
    });
  });

export type BuilderFormValues = z.infer<typeof builderSchema>;
