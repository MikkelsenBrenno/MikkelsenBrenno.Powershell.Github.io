import { useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { ChevronDown, Plus, Trash2, Variable as VarIcon, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";

import { collectConditionStringValues, findUnresolvedRefs } from "@/lib/conditions";
import type { BuilderFormValues } from "@/lib/builder-schema";

interface VariablesPanelProps {
  form: UseFormReturn<BuilderFormValues>;
}

export function VariablesPanel({ form }: VariablesPanelProps) {
  const [open, setOpen] = useState(false);
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variables",
    keyName: "_rhfId",
  });

  const variables = form.watch("variables") ?? [];
  const conditions = form.watch("conditions") ?? [];
  const scriptName = form.watch("scriptName") ?? "";
  const description = form.watch("description") ?? "";

  // Scan all relevant text fields for unresolved {{var}} references.
  const allText = [
    scriptName,
    description,
    ...conditions.flatMap(collectConditionStringValues),
  ].join("\n");
  const unresolved = findUnresolvedRefs(allText, variables);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border bg-secondary/20"
      data-testid="collapsible-variables"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between p-3 text-left hover-elevate"
          data-testid="button-toggle-variables"
        >
          <div className="flex items-center gap-2">
            <VarIcon className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Variables</span>
            <Badge variant="secondary" className="text-xs" data-testid="badge-variable-count">
              {variables.length}
            </Badge>
            {unresolved.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10"
                data-testid="badge-unresolved-count"
              >
                {unresolved.length} unresolved
              </Badge>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Define key/value pairs. Reference them anywhere in script fields as{" "}
          <code className="font-mono text-foreground/80">{"{{name}}"}</code>. Values are substituted in
          all generated scripts and listed in each script header.
        </p>

        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No variables defined.</p>
        ) : (
          <div className="space-y-2" data-testid="list-variables">
            {fields.map((f, idx) => (
              <div
                key={f._rhfId}
                className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start"
                data-testid={`variable-row-${idx}`}
              >
                <FormField
                  control={form.control}
                  name={`variables.${idx}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="name"
                          className="font-mono text-xs h-8"
                          data-testid={`input-variable-${idx}-name`}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`variables.${idx}.value`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="value"
                          className="text-xs h-8"
                          data-testid={`input-variable-${idx}-value`}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => remove(idx)}
                  data-testid={`button-remove-variable-${idx}`}
                  aria-label={`Remove variable ${idx + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 text-xs gap-1 w-full"
          onClick={() => {
            // Auto-pick the next free `varN` name so the new row is valid by
            // default. This avoids immediately blocking the Copy button just
            // because the user clicked Add Variable.
            const taken = new Set(variables.map((v) => (v?.name ?? "").trim()));
            let n = variables.length + 1;
            let candidate = `var${n}`;
            while (taken.has(candidate)) {
              n += 1;
              candidate = `var${n}`;
            }
            append({ name: candidate, value: "" });
          }}
          data-testid="button-add-variable"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Variable
        </Button>

        {unresolved.length > 0 && (
          <div
            className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300 flex gap-2"
            data-testid="warning-unresolved-vars"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">Unresolved variable references</div>
              <div className="font-mono text-amber-200/90">
                {unresolved.map((u) => `{{${u}}}`).join(", ")}
              </div>
              <div className="mt-1 text-amber-300/80">
                Define each one above before deploying. The generated scripts also include this
                warning in their header.
              </div>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
