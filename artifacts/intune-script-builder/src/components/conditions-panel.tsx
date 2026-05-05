import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2, Database, Cog, FolderOpen, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  ALL_KINDS,
  KIND_LABELS,
  defaultConditionFor,
  type Condition,
  type ConditionKind,
} from "@/lib/conditions";
import type { BuilderFormValues } from "@/lib/builder-schema";

const KIND_ICONS: Record<ConditionKind, typeof Database> = {
  registry: Database,
  service: Cog,
  file: FolderOpen,
  scheduledTask: Clock,
};

interface ConditionsPanelProps {
  form: UseFormReturn<BuilderFormValues>;
}

export function ConditionsPanel({ form }: ConditionsPanelProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "conditions",
    keyName: "_rhfId",
  });

  const conditions = (form.watch("conditions") || []) as Condition[];
  const combinator = (form.watch("combinator") as "AND" | "OR") ?? "AND";
  const showCombinator = fields.length > 1;

  const addCondition = (kind: ConditionKind) => {
    append(defaultConditionFor(kind));
  };

  return (
    <div className="bg-secondary/20 p-4 rounded-md border border-border space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="font-semibold text-sm">Conditions</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs gap-1"
              data-testid="button-add-condition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Condition
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ALL_KINDS.map((kind) => {
              const Icon = KIND_ICONS[kind];
              return (
                <DropdownMenuItem
                  key={kind}
                  onClick={() => addCondition(kind)}
                  data-testid={`menu-add-condition-${kind}`}
                >
                  <Icon className="w-3.5 h-3.5 mr-2 text-primary" />
                  {KIND_LABELS[kind]}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showCombinator && (
        <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Combine conditions with
          </Label>
          <RadioGroup
            value={combinator}
            onValueChange={(v) => form.setValue("combinator", v as "AND" | "OR")}
            className="flex gap-4"
            data-testid="radio-combinator"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="AND" id="combinator-and" />
              <Label htmlFor="combinator-and" className="text-xs cursor-pointer font-normal">
                AND <span className="text-muted-foreground/70">(all must pass)</span>
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="OR" id="combinator-or" />
              <Label htmlFor="combinator-or" className="text-xs cursor-pointer font-normal">
                OR <span className="text-muted-foreground/70">(any must pass)</span>
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No conditions defined. Add at least one to generate a script.
        </p>
      ) : (
        <div className="space-y-3">
          {fields.map((f, idx) => {
            const cond = conditions[idx];
            if (!cond) return null;
            const Icon = KIND_ICONS[cond.kind];
            return (
              <div
                key={f._rhfId}
                className="rounded-md border border-border bg-background/40 p-3 space-y-3"
                data-testid={`condition-${idx}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold">Check {idx + 1}</span>
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                      {KIND_LABELS[cond.kind]}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => remove(idx)}
                    disabled={fields.length <= 1}
                    title={fields.length <= 1 ? "At least one condition is required" : undefined}
                    data-testid={`button-remove-condition-${idx}`}
                    aria-label={`Remove check ${idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>

                {cond.kind === "registry" && <RegistryConditionFields form={form} idx={idx} />}
                {cond.kind === "service" && <ServiceConditionFields form={form} idx={idx} />}
                {cond.kind === "file" && <FileConditionFields form={form} idx={idx} />}
                {cond.kind === "scheduledTask" && (
                  <ScheduledTaskConditionFields form={form} idx={idx} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface FieldsProps {
  form: UseFormReturn<BuilderFormValues>;
  idx: number;
}

function RegistryConditionFields({ form, idx }: FieldsProps) {
  return (
    <div className="space-y-3">
      <FormField
        control={form.control}
        name={`conditions.${idx}.registryPath`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Registry Path</FormLabel>
            <FormControl>
              <Input
                {...field}
                className="font-mono text-xs"
                data-testid={`input-condition-${idx}-registryPath`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name={`conditions.${idx}.registryValueName`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Value Name</FormLabel>
              <FormControl>
                <Input {...field} data-testid={`input-condition-${idx}-registryValueName`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`conditions.${idx}.expectedValue`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Expected Value</FormLabel>
              <FormControl>
                <Input {...field} data-testid={`input-condition-${idx}-expectedValue`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField
          control={form.control}
          name={`conditions.${idx}.valueType`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid={`select-condition-${idx}-valueType`}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="String">String</SelectItem>
                  <SelectItem value="DWORD">DWORD</SelectItem>
                  <SelectItem value="QWORD">QWORD</SelectItem>
                  <SelectItem value="MultiString">MultiString</SelectItem>
                  <SelectItem value="Binary">Binary</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`conditions.${idx}.detectionOperator`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Operator</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid={`select-condition-${idx}-detectionOperator`}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="-eq">Equals</SelectItem>
                  <SelectItem value="-ne">Not Equals</SelectItem>
                  <SelectItem value="-gt">Greater Than</SelectItem>
                  <SelectItem value="-lt">Less Than</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`conditions.${idx}.action`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Action</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid={`select-condition-${idx}-action`}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Set">Set Value</SelectItem>
                  <SelectItem value="Remove">Remove Value</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

function ServiceConditionFields({ form, idx }: FieldsProps) {
  return (
    <div className="space-y-3">
      <FormField
        control={form.control}
        name={`conditions.${idx}.serviceName`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Service Name</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="e.g. Spooler"
                className="font-mono text-xs"
                data-testid={`input-condition-${idx}-serviceName`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`conditions.${idx}.expectedStatus`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Expected Status</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid={`select-condition-${idx}-expectedStatus`}>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="Running">Running</SelectItem>
                <SelectItem value="Stopped">Stopped</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
    </div>
  );
}

function FileConditionFields({ form, idx }: FieldsProps) {
  return (
    <div className="space-y-3">
      <FormField
        control={form.control}
        name={`conditions.${idx}.filePath`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">File or Folder Path</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="e.g. C:\\Program Files\\Contoso\\app.exe"
                className="font-mono text-xs"
                data-testid={`input-condition-${idx}-filePath`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`conditions.${idx}.expected`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Expected State</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid={`select-condition-${idx}-expected`}>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="Exists">Exists</SelectItem>
                <SelectItem value="NotExists">Does Not Exist</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
    </div>
  );
}

function ScheduledTaskConditionFields({ form, idx }: FieldsProps) {
  return (
    <div className="space-y-3">
      <FormField
        control={form.control}
        name={`conditions.${idx}.taskName`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Task Name</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="e.g. ScheduledDefrag"
                className="font-mono text-xs"
                data-testid={`input-condition-${idx}-taskName`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`conditions.${idx}.expected`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Expected State</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid={`select-condition-${idx}-expected`}>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="Enabled">Enabled</SelectItem>
                <SelectItem value="Disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
    </div>
  );
}
