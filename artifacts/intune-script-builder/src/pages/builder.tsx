import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  AlertCircle,
  Search,
  ChevronDown,
  BookOpen,
  PackageSearch,
  RefreshCw,
  Rocket,
  Save,
  Share2,
  ShieldAlert,
} from "lucide-react";

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

import { scenarios, getScenarioById, cloneScenarioDefaults, type ScenarioDefaults } from "@/data/scenarios";
import { loadGpoLookup, type GpoLookupDataset } from "@/data/gpo-lookup";
import type { GpoMapping } from "@/data/gpo-mappings";
import { matchPitfalls } from "@/data/pitfalls";
import {
  findReferencedEntriesInScript,
  mergeReferenceMatches,
} from "@/data/modules-reference-map";
import { CodeBlock, scrollToCodeLine } from "@/components/code-block";
import { ExecutionFlow } from "@/components/execution-flow";
import { RiskChecklist } from "@/components/risk-checklist";
import { ConditionsPanel } from "@/components/conditions-panel";
import { VariablesPanel } from "@/components/variables-panel";
import { LintPanel, qualityBadge } from "@/components/lint-panel";
import { SimulatePanel } from "@/components/simulate-panel";
import { DiffPanel } from "@/components/diff-panel";
import { lintScript } from "@/lib/powershell/linter";
import { buildDeploymentPayload } from "@/lib/deployment";
import { DeployPanel } from "@/components/deploy-panel";
import { SaveScriptDialog } from "@/components/save-script-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { newConditionId, type Condition } from "@/lib/conditions";
import { builderSchema, type BuilderFormValues } from "@/lib/builder-schema";
import { buildShareUrl, decodeShareConfig, SHARE_URL_LENGTH_WARN } from "@/lib/library";
import {
  generateDetection,
  generateRemediation,
  generateRollback,
  generateIntuneNotes,
  generateTestingCommands,
  type ScriptInputs,
} from "@/lib/script-generation";

function defaultsToFormValues(scenarioId: string, d: ScenarioDefaults): BuilderFormValues {
  return {
    scenarioId,
    scriptName: d.scriptName,
    description: d.description,
    purpose: d.purpose,
    publisher: d.publisher,
    conditions: d.conditions,
    combinator: d.combinator,
    rollback: d.rollback,
    inverseMode: d.inverseMode,
    variables: d.variables,
    loggingLevel: d.loggingLevel,
    logPath: d.logPath,
    runContext: d.runContext,
    architecture: d.architecture,
    dryRunMode: d.dryRunMode,
    pilotGroup: d.pilotGroup,
  };
}

export default function Builder() {
  const { toast } = useToast();

  // Resolve the initial form values exactly once, in priority order:
  //   1. ?config=<base64> share link (highest priority)
  //   2. ?scenario=<id> picker
  //   3. first scenario default
  // We capture both the values and a "hint" object describing which path
  // was taken so we can surface a toast (e.g. malformed share link) and
  // skip the scenarioId-change reset that would otherwise clobber URL
  // hydration on the very first render.
  const initialBoot = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const cfg = sp.get("config");
    if (cfg) {
      const decoded = decodeShareConfig(cfg);
      if (decoded.ok) {
        return {
          values: decoded.config,
          source: "url" as const,
          payloadVersion: decoded.payloadVersion,
          versionMatches: decoded.versionMatches,
          decodeError: null as string | null,
        };
      }
      // Fall through to scenario default; remember the error to toast.
      const scenarioId = sp.get("scenario") || scenarios[0].id;
      const scenario = getScenarioById(scenarioId);
      return {
        values: defaultsToFormValues(scenario.id, cloneScenarioDefaults(scenario.defaults)),
        source: "scenario" as const,
        payloadVersion: null,
        versionMatches: true,
        decodeError: decoded.error,
      };
    }
    const scenarioId = sp.get("scenario") || scenarios[0].id;
    const scenario = getScenarioById(scenarioId);
    return {
      values: defaultsToFormValues(scenario.id, cloneScenarioDefaults(scenario.defaults)),
      source: "scenario" as const,
      payloadVersion: null,
      versionMatches: true,
      decodeError: null as string | null,
    };
  })[0];

  const form = useForm<BuilderFormValues>({
    resolver: zodResolver(builderSchema),
    // mode: "onChange" makes the cross-field unresolved-variable refinement
    // hard-fail validation as the user edits, rather than only on submit.
    mode: "onChange",
    defaultValues: initialBoot.values,
  });

  const values = form.watch();
  const selectedScenarioId = values.scenarioId;

  // Surface a one-shot toast describing the share-link hydration result.
  // Runs only on mount; the URL is parsed once at boot.
  //
  // We defer the dispatch with setTimeout(0) so the Toaster (which lives
  // higher in the tree) has had a chance to subscribe its listener.
  // Otherwise children's mount-time effects run before the parent's,
  // and the toast is added to module state but no one is notified.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (initialBoot.source === "url") {
        if (!initialBoot.versionMatches) {
          toast({
            title: "Loaded an older shared config",
            description: `Link uses schema "${initialBoot.payloadVersion}". Save it to upgrade to the current format.`,
          });
        } else {
          toast({
            title: "Loaded shared configuration",
            description: "The builder was pre-filled from the URL.",
          });
        }
      } else if (initialBoot.decodeError) {
        toast({
          title: "Couldn't load shared config",
          description: `${initialBoot.decodeError} Showing the scenario default instead.`,
        });
      }
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate the form from a scenario's defaults whenever the picker
  // *changes*. Skip the very first render so URL-hydrated values aren't
  // immediately overwritten with scenario defaults.
  const prevScenarioId = useRef(selectedScenarioId);
  useEffect(() => {
    if (prevScenarioId.current === selectedScenarioId) return;
    prevScenarioId.current = selectedScenarioId;
    const scenario = getScenarioById(selectedScenarioId);
    form.reset(defaultsToFormValues(scenario.id, cloneScenarioDefaults(scenario.defaults)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenarioId]);

  // Save & Share dialog state.
  const [saveOpen, setSaveOpen] = useState(false);

  // Builds a share URL from the *current* form values, copies it, and
  // surfaces a toast. Length warnings are appended to the description.
  const handleShare = async () => {
    const url = buildShareUrl(values);
    const longWarning =
      url.length > SHARE_URL_LENGTH_WARN
        ? ` (URL is ${url.length.toLocaleString()} chars; some apps may truncate it.)`
        : "";
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Share link copied",
        description: `Recipients land on the builder pre-filled.${longWarning}`,
      });
    } catch {
      toast({
        title: "Couldn't copy automatically",
        description: "Clipboard access was denied by the browser.",
      });
    }
  };

  // GPO Lookup state. The full dataset is large (1k+ entries), so it is
  // loaded lazily on first open of the collapsible. The free-text search is
  // debounced (~150ms) and the result list is fully virtualised with
  // @tanstack/react-virtual so we render only the rows in view, regardless
  // of how many entries match.
  const [gpoOpen, setGpoOpen] = useState(false);
  const [gpoQuery, setGpoQuery] = useState("");
  const [gpoQueryDebounced, setGpoQueryDebounced] = useState("");
  const [gpoCategoryFilter, setGpoCategoryFilter] = useState<string>("All");
  const [gpoData, setGpoData] = useState<GpoLookupDataset | null>(null);
  const [gpoLoading, setGpoLoading] = useState(false);
  const [gpoLoadError, setGpoLoadError] = useState<string | null>(null);
  const gpoListRef = useRef<HTMLDivElement | null>(null);

  // Trigger lazy load on first open of the collapsible.
  useEffect(() => {
    if (!gpoOpen || gpoData || gpoLoading) return;
    setGpoLoading(true);
    setGpoLoadError(null);
    loadGpoLookup()
      .then((data) => setGpoData(data))
      .catch((err) =>
        setGpoLoadError(err instanceof Error ? err.message : "Failed to load lookup data."),
      )
      .finally(() => setGpoLoading(false));
  }, [gpoOpen, gpoData, gpoLoading]);

  // Debounce the search input by ~150ms so each keystroke doesn't re-filter
  // thousands of entries.
  useEffect(() => {
    const handle = setTimeout(() => setGpoQueryDebounced(gpoQuery), 150);
    return () => clearTimeout(handle);
  }, [gpoQuery]);

  const allGpos: GpoMapping[] = gpoData?.entries ?? [];
  const allCategories: string[] = gpoData?.categories ?? [];

  const filteredGpos = useMemo(() => {
    const q = gpoQueryDebounced.trim().toLowerCase();
    return allGpos.filter((g) => {
      if (gpoCategoryFilter !== "All" && g.category !== gpoCategoryFilter) return false;
      if (!q) return true;
      return (
        g.gpoName.toLowerCase().includes(q) ||
        g.registryPath.toLowerCase().includes(q) ||
        g.valueName.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q)
      );
    });
  }, [allGpos, gpoQueryDebounced, gpoCategoryFilter]);

  // True windowed virtualisation. `estimateSize` is intentionally generous
  // (rows can wrap to 2-3 lines depending on description length) and
  // `measureElement` is wired so the virtualiser snaps to actual heights
  // after the browser lays out each row.
  const gpoVirtualizer = useVirtualizer({
    count: filteredGpos.length,
    getScrollElement: () => gpoListRef.current,
    estimateSize: () => 110,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
    getItemKey: (i) => filteredGpos[i]?.id ?? i,
  });

  // Re-measure when filters change so initial estimates don't get stuck.
  useEffect(() => {
    gpoVirtualizer.measure();
    if (gpoListRef.current) gpoListRef.current.scrollTop = 0;
  }, [gpoQueryDebounced, gpoCategoryFilter, gpoVirtualizer]);

  // Apply a GPO entry by replacing the conditions list with a single registry
  // condition derived from the GPO. We also infer execution context from the
  // hive (HKCU -> User) and architecture (WOW6432Node -> 32-bit).
  const applyGpo = (g: GpoMapping) => {
    const isUserHive = g.registryPath.toUpperCase().startsWith("HKCU:");
    const isWow6432 = g.registryPath.toUpperCase().includes("WOW6432NODE");

    const condition: Condition = {
      id: newConditionId(),
      kind: "registry",
      registryPath: g.registryPath,
      registryValueName: g.valueName,
      expectedValue: g.expectedValue,
      valueType: g.valueType,
      detectionOperator: "-eq",
      action: "Set",
    };

    form.setValue("conditions", [condition]);
    form.setValue("combinator", "AND");
    // GPO entries describe a desired (wanted) configuration, so reset
    // inverse/uninstall mode and clear stale variables to avoid surprising
    // carry-over from a previous scenario.
    form.setValue("inverseMode", false);
    form.setValue("variables", []);
    form.setValue("runContext", isUserHive ? "User" : "System");
    form.setValue("architecture", isWow6432 ? "32-bit" : "64-bit");
    form.setValue("scriptName", `Set-${g.id.replace(/[^a-zA-Z0-9]+/g, "-")}`);
    form.setValue("description", `${g.gpoName}. ${g.description}`);
    // GPO entries don't carry a separate "purpose" field; clear any
    // stale value carried over from a previous scenario so the new
    // header doesn't surface unrelated context.
    form.setValue("purpose", "");
    // Preserve any existing publisher; only seed a default if the field was
    // blanked out so the schema's `min(1)` rule keeps the form valid.
    if (!form.getValues("publisher")) {
      form.setValue("publisher", "IT Operations");
    }
  };

  // Build inputs for script generation. Memoize on values so generators run
  // only when the form actually changes.
  const scriptInputs: ScriptInputs = useMemo(
    () => ({
      scriptName: values.scriptName,
      description: values.description,
      purpose: values.purpose,
      publisher: values.publisher,
      conditions: values.conditions as Condition[],
      combinator: values.combinator,
      rollback: values.rollback,
      inverseMode: values.inverseMode,
      variables: values.variables,
      loggingLevel: values.loggingLevel,
      logPath: values.logPath,
      runContext: values.runContext,
      architecture: values.architecture,
      dryRunMode: values.dryRunMode,
      pilotGroup: values.pilotGroup,
    }),
    [values]
  );

  const detectionScript = useMemo(() => generateDetection(scriptInputs), [scriptInputs]);
  const remediationScript = useMemo(() => generateRemediation(scriptInputs), [scriptInputs]);
  const rollbackScript = useMemo(() => generateRollback(scriptInputs), [scriptInputs]);
  const intuneNotes = useMemo(() => generateIntuneNotes(scriptInputs), [scriptInputs]);
  const testingCommands = useMemo(() => generateTestingCommands(scriptInputs), [scriptInputs]);

  // Compute the deployment payload from the *full* form values (we need the
  // publisher field that ScriptInputs doesn't carry). Wrapped in try/catch:
  // when the form is invalid the generators may emit "no conditions"
  // placeholders, which is still safe to base64-encode.
  const deploymentPayload = useMemo(() => {
    try {
      return buildDeploymentPayload(values);
    } catch {
      return null;
    }
  }, [values]);

  // Run the in-browser linter on each generated script. Memoized on the
  // script text so the rule engine only re-runs when generation output
  // actually changes.
  const detectionLint = useMemo(() => lintScript(detectionScript), [detectionScript]);
  const remediationLint = useMemo(() => lintScript(remediationScript), [remediationScript]);
  const rollbackLint = useMemo(
    () => (values.rollback ? lintScript(rollbackScript) : null),
    [values.rollback, rollbackScript]
  );

  const detectionBadge = qualityBadge(detectionLint);
  const remediationBadge = qualityBadge(remediationLint);
  const rollbackBadge = rollbackLint ? qualityBadge(rollbackLint) : null;

  // Block the Copy button on every CodeBlock when the form fails validation
  // (e.g. unresolved {{var}} references, missing required fields). This
  // enforces the schema-level guard at the UX layer so users can't ship a
  // broken script. Subscribe to formState.isValid so it re-renders.
  const isFormValid = form.formState.isValid;
  const copyDisabledReason = isFormValid
    ? undefined
    : "Fix the validation errors in the form (e.g. unresolved {{variables}}) before copying.";

  // Match the current configuration against the pitfalls library so we can
  // surface a "Related pitfalls" deep-link in the disclaimer area.
  const matchedPitfalls = useMemo(() => matchPitfalls(values), [values]);

  // Walk every generated script and collect the reference-catalog entries
  // its cmdlets touch, so we can surface chip-style deep-links into the
  // Modules & APIs page (closing the loop between Builder and reference).
  // Rollback is only included when the user has actually opted in to it.
  const referenceMatches = useMemo(() => {
    const detection = findReferencedEntriesInScript(detectionScript);
    const remediation = findReferencedEntriesInScript(remediationScript);
    const rollback = values.rollback
      ? findReferencedEntriesInScript(rollbackScript)
      : [];
    return mergeReferenceMatches(detection, remediation, rollback);
  }, [detectionScript, remediationScript, rollbackScript, values.rollback]);

  return (
    <div className="container max-w-screen-2xl py-8 flex-1 flex flex-col lg:flex-row gap-8">
      {/* Form Sidebar */}
      <div className="w-full lg:w-1/3 xl:w-1/4 shrink-0 overflow-y-auto pr-2 custom-scrollbar">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Script Builder</h2>
            <p className="text-muted-foreground text-sm">
              Configure conditions and generate code.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSaveOpen(true)}
              data-testid="button-save-script"
              title="Save the current configuration to your local library"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleShare}
              data-testid="button-share-script"
              title="Copy a share URL for the current configuration"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </Button>
          </div>
        </div>

        <SaveScriptDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          config={values}
        />

        <Collapsible
          open={gpoOpen}
          onOpenChange={setGpoOpen}
          className="mb-5 rounded-md border border-border bg-secondary/20"
          data-testid="collapsible-gpo-lookup"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between p-3 text-left hover-elevate"
              data-testid="button-toggle-gpo-lookup"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">GPO Lookup</span>
                <Badge variant="secondary" className="bg-secondary/60 text-xs">
                  {gpoData ? `${gpoData.entries.length} settings` : "load on open"}
                </Badge>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${gpoOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Search by GPO display name, registry path, or value name. Selecting a result replaces
              the current conditions with a single registry check.
            </p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={gpoQuery}
                onChange={(e) => setGpoQuery(e.target.value)}
                placeholder="e.g. SmartScreen, BitLocker, HKLM\\SOFTWARE\\Policies..."
                className="pl-8 text-xs"
                data-testid="input-gpo-search"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {["All", ...allCategories].map((cat) => {
                const active = gpoCategoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setGpoCategoryFilter(cat)}
                    disabled={!gpoData && cat !== "All"}
                    className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                      active
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
                    } disabled:opacity-40 disabled:hover:text-muted-foreground`}
                    data-testid={`button-gpo-category-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
            <div
              ref={gpoListRef}
              className="max-h-72 overflow-y-auto custom-scrollbar rounded border border-border/60"
              data-testid="list-gpo-results"
            >
              {gpoLoading ? (
                <div className="p-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Loading policy reference...
                </div>
              ) : gpoLoadError ? (
                <div className="p-3 text-xs text-destructive text-center">
                  {gpoLoadError}
                </div>
              ) : !gpoData ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  Opening the lookup will load the full policy reference.
                </div>
              ) : filteredGpos.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  No GPO entries match your search.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      height: `${gpoVirtualizer.getTotalSize()}px`,
                      position: "relative",
                      width: "100%",
                    }}
                    data-testid="virtual-gpo-canvas"
                  >
                    {gpoVirtualizer.getVirtualItems().map((vRow) => {
                      const g = filteredGpos[vRow.index];
                      if (!g) return null;
                      return (
                        <button
                          key={g.id}
                          ref={gpoVirtualizer.measureElement}
                          data-index={vRow.index}
                          type="button"
                          onClick={() => applyGpo(g)}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${vRow.start}px)`,
                          }}
                          className="text-left p-2.5 border-b border-border/40 hover:bg-primary/5 transition-colors block"
                          data-testid={`button-apply-gpo-${g.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="text-xs font-medium text-foreground leading-snug flex items-center gap-1.5 flex-wrap">
                              <span>{g.gpoName}</span>
                              {g.verified && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 text-[9px] uppercase tracking-wider border-primary/40 text-primary bg-primary/10"
                                  data-testid={`badge-verified-${g.id}`}
                                >
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[9px] uppercase tracking-wider border-border/60 text-muted-foreground"
                            >
                              {g.category}
                            </Badge>
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground break-all">
                            {g.registryPath}
                          </div>
                          <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                            <span className="text-foreground/70">{g.valueName}</span>
                            {g.expectedValue !== "" && (
                              <>
                                {" = "}
                                <span className="text-primary/80">{g.expectedValue}</span>
                              </>
                            )}
                            {" · "}
                            {g.valueType}
                          </div>
                          {g.description && (
                            <div className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
                              {g.description.length > 180
                                ? `${g.description.slice(0, 180).trimEnd()}...`
                                : g.description}
                            </div>
                          )}
                          {g.supportedOn && (
                            <div className="text-[10px] text-muted-foreground/60 mt-0.5 italic">
                              Supported on: {g.supportedOn}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-1.5 text-[10px] text-muted-foreground bg-background/30 border-t border-border/40 text-center">
                    {filteredGpos.length} match{filteredGpos.length === 1 ? "" : "es"} (virtualised — only visible rows are in the DOM)
                  </div>
                </>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/70 italic">
              Mappings are starting points compiled from Microsoft policy references. Always
              validate paths and values in your environment before deploying.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <Form {...form}>
          <form className="space-y-5">
            <FormField
              control={form.control}
              name="scenarioId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scenario</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-scenario">
                        <SelectValue placeholder="Select a scenario" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {scenarios.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scriptName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Script Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-script-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} className="resize-none" rows={3} data-testid="textarea-description" />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      className="resize-none"
                      rows={2}
                      placeholder="Why this script exists / what business outcome it supports"
                      data-testid="textarea-purpose"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Optional. Embedded in the script header so reviewers can see the intent at a glance.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="publisher"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Publisher</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. IT Operations, Contoso Endpoint Eng"
                      data-testid="input-publisher"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Shown in the Intune portal and embedded in the Microsoft Graph payload.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <VariablesPanel form={form} />

            <ConditionsPanel form={form} />

            <FormField
              control={form.control}
              name="inverseMode"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-amber-500/30 p-3 shadow-sm bg-amber-500/5">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                      Inverse / Uninstall Mode
                    </FormLabel>
                    <FormDescription className="text-xs">
                      Conditions describe an UNWANTED state. In Intune terms: detection
                      exits <span className="font-mono">1 (non-compliant)</span> when the
                      unwanted state is present so remediation runs to remove/uninstall it,
                      and exits <span className="font-mono">0 (compliant)</span> once it is
                      gone. Rollback re-applies the original state.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-inverse-mode"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="bg-secondary/20 p-4 rounded-md border border-border space-y-4">
              <h3 className="font-semibold text-sm border-b border-border pb-2 flex items-center justify-between">
                Context & Execution
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Exit 0 = Compliant. Exit 1 = Non-compliant.</p>
                  </TooltipContent>
                </Tooltip>
              </h3>

              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="runContext"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Run Context</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="System" />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">System</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="User" />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">User</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="architecture"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Architecture</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="64-bit" />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">64-bit</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="32-bit" />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">32-bit</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-2 border-t border-border/50 space-y-4">
                <FormField
                  control={form.control}
                  name="loggingLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Logging Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-logging-level">
                            <SelectValue placeholder="Select logging level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Basic">
                            Basic — Write-Output only (Intune portal)
                          </SelectItem>
                          <SelectItem value="Detailed">
                            Detailed — also surface Verbose stream
                          </SelectItem>
                          <SelectItem value="Transcript">
                            Transcript — write full log to disk on the device
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        Controls how the generated script reports activity. Transcript adds a
                        log file on the device and tails the last 10 lines into the Intune
                        output column.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {values.loggingLevel === "Transcript" && (
                  <FormField
                    control={form.control}
                    name="logPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Log directory</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={"$env:ProgramData\\IntuneScripts"}
                            className="font-mono text-xs"
                            spellCheck={false}
                            data-testid="input-log-path"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Directory where the transcript log is written. PowerShell environment
                          expressions (e.g.{" "}
                          <span className="font-mono">{"$env:SystemDrive\\Logs"}</span>) are
                          expanded at run time on the device. The log filename is auto-generated
                          per script and run (e.g.{" "}
                          <span className="font-mono">
                            ScriptName-Detection-yyyyMMdd-HHmmss.log
                          </span>
                          ).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="space-y-4 pt-2 border-t border-border/50">
                <FormField
                  control={form.control}
                  name="rollback"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-sm bg-background/50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">Include Rollback</FormLabel>
                        <FormDescription className="text-xs">Generate a rollback script</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-rollback"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dryRunMode"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-sm bg-background/50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">Dry-Run Mode</FormLabel>
                        <FormDescription className="text-xs">Prefix actions with Write-Output</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-dry-run"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </form>
        </Form>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Alert variant="warning" className="mb-6 border-amber-500/30 bg-amber-500/10 text-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-400">Important Disclaimer</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Generated scripts are templates only. Always test in a pilot group before production
              deployment. Validate paths, detection logic, permissions, and rollback behavior.
            </p>
            {matchedPitfalls.length > 0 && (
              <Link
                href={`/pitfalls?ids=${matchedPitfalls.join(",")}`}
                className="inline-flex items-center gap-1.5 text-amber-200 hover:text-amber-100 underline decoration-amber-400/40 hover:decoration-amber-300 underline-offset-2 text-xs font-medium"
                data-testid="link-related-pitfalls"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Related pitfalls ({matchedPitfalls.length}) — review before deploying
              </Link>
            )}
          </AlertDescription>
        </Alert>

        {referenceMatches.length > 0 && (
          <div
            className="mb-6 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2"
            data-testid="panel-modules-used"
          >
            <div className="flex flex-wrap items-center gap-2">
              <PackageSearch className="w-3.5 h-3.5 text-fuchsia-300" />
              <span className="text-[11px] uppercase tracking-wider text-fuchsia-300 font-semibold">
                Modules used ({referenceMatches.length})
              </span>
              <span className="text-[11px] text-muted-foreground">
                Click an entry to open it in the Modules & APIs catalog.
              </span>
              <Link
                href={`/reference?ids=${referenceMatches
                  .map((m) => m.entry.id)
                  .join(",")}`}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-fuchsia-300 hover:text-fuchsia-200 underline decoration-fuchsia-400/40 hover:decoration-fuchsia-300 underline-offset-2"
                data-testid="link-modules-used-all"
              >
                Open all in catalog
                <BookOpen className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {referenceMatches.map((m) => (
                <Tooltip key={m.entry.id} delayDuration={120}>
                  <TooltipTrigger asChild>
                    <Link
                      href={`/reference?ids=${m.entry.id}`}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 hover:border-fuchsia-500/50 transition-colors"
                      data-testid={`chip-module-used-${m.entry.id}`}
                    >
                      {m.entry.name}
                      {m.cmdletNames.length > 1 && (
                        <span className="text-[9px] uppercase tracking-wider text-fuchsia-300/80 font-sans">
                          ×{m.cmdletNames.length}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-xs space-y-1 bg-popover text-popover-foreground border border-border p-2"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Cmdlets used in your scripts
                    </div>
                    <div className="font-mono text-xs text-foreground/90 leading-snug">
                      {m.cmdletNames.join(", ")}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="detection" className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start bg-secondary/30 rounded-none border-b border-border p-0 h-12 overflow-x-auto">
            <TabsTrigger
              value="detection"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 gap-2"
              data-testid="tab-detection"
            >
              Detection Script
              <span
                className={`uppercase tracking-wider text-[9px] font-bold rounded px-1.5 py-0.5 border ${detectionBadge.cls}`}
              >
                {detectionBadge.label}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="remediation"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 gap-2"
              data-testid="tab-remediation"
            >
              Remediation Script
              <span
                className={`uppercase tracking-wider text-[9px] font-bold rounded px-1.5 py-0.5 border ${remediationBadge.cls}`}
              >
                {remediationBadge.label}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="rollback"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 gap-2"
              data-testid="tab-rollback"
            >
              Rollback Script
              {rollbackBadge && (
                <span
                  className={`uppercase tracking-wider text-[9px] font-bold rounded px-1.5 py-0.5 border ${rollbackBadge.cls}`}
                >
                  {rollbackBadge.label}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="simulate"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
              data-testid="tab-simulate"
            >
              Simulate
            </TabsTrigger>
            <TabsTrigger
              value="diff"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
              data-testid="tab-diff"
            >
              Diff
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
            >
              Intune Notes
            </TabsTrigger>
            <TabsTrigger
              value="test"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
            >
              Test Commands
            </TabsTrigger>
            <TabsTrigger
              value="deploy"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 gap-2"
              data-testid="tab-deploy"
              title={
                isFormValid
                  ? undefined
                  : "Fix the validation errors in the form before deploying."
              }
            >
              <Rocket className="w-3.5 h-3.5" />
              Deploy
              {!isFormValid && (
                <span
                  className="uppercase tracking-wider text-[9px] font-bold rounded px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-300"
                  data-testid="badge-deploy-disabled"
                >
                  fix form
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 mt-4 overflow-hidden rounded-md border border-border">
            <TabsContent value="detection" className="h-full m-0 data-[state=active]:flex flex-col">
              <CodeBlock
                code={detectionScript}
                disabled={!isFormValid}
                disabledReason={copyDisabledReason}
                blockId="detection"
              />
              <LintPanel
                result={detectionLint}
                onJumpToLine={(line) => scrollToCodeLine("detection", line)}
              />
            </TabsContent>
            <TabsContent value="remediation" className="h-full m-0 data-[state=active]:flex flex-col">
              <CodeBlock
                code={remediationScript}
                disabled={!isFormValid}
                disabledReason={copyDisabledReason}
                blockId="remediation"
              />
              <LintPanel
                result={remediationLint}
                onJumpToLine={(line) => scrollToCodeLine("remediation", line)}
              />
            </TabsContent>
            <TabsContent value="rollback" className="h-full m-0 data-[state=active]:flex flex-col">
              <CodeBlock
                code={rollbackScript}
                disabled={!isFormValid}
                disabledReason={copyDisabledReason}
                blockId="rollback"
              />
              {rollbackLint && (
                <LintPanel
                  result={rollbackLint}
                  onJumpToLine={(line) => scrollToCodeLine("rollback", line)}
                />
              )}
            </TabsContent>
            <TabsContent value="simulate" className="h-full m-0 data-[state=active]:flex flex-col gap-4">
              <SimulateTabContent
                detection={detectionScript}
                remediation={remediationScript}
                rollback={values.rollback ? rollbackScript : null}
              />
            </TabsContent>
            <TabsContent value="diff" className="h-full m-0 data-[state=active]:flex flex-col">
              <DiffPanel
                leftLabel="Detection"
                rightLabel="Remediation"
                left={detectionScript}
                right={remediationScript}
              />
            </TabsContent>
            <TabsContent value="notes" className="h-full m-0 data-[state=active]:flex flex-col">
              <CodeBlock
                code={intuneNotes}
                language="text"
                disabled={!isFormValid}
                disabledReason={copyDisabledReason}
              />
            </TabsContent>
            <TabsContent value="test" className="h-full m-0 data-[state=active]:flex flex-col">
              <CodeBlock
                code={testingCommands}
                disabled={!isFormValid}
                disabledReason={copyDisabledReason}
              />
            </TabsContent>
            <TabsContent value="deploy" className="h-full m-0 data-[state=active]:flex flex-col">
              <DeployPanel
                payload={deploymentPayload}
                disabled={!isFormValid || !deploymentPayload}
                disabledReason={copyDisabledReason}
              />
            </TabsContent>
          </div>
        </Tabs>

        <ExecutionFlow
          conditionCount={values.conditions?.length ?? 1}
          combinator={values.combinator}
          inverseMode={values.inverseMode}
        />
        <RiskChecklist values={values} />
      </div>
    </div>
  );
}

// Simulate tab body. Lets the user pick which generated script to walk
// through. Kept as a small inner component so the picker state stays out
// of the main Builder component (it would otherwise reset every script
// re-render).
interface SimulateTabContentProps {
  detection: string;
  remediation: string;
  rollback: string | null;
}

function SimulateTabContent({ detection, remediation, rollback }: SimulateTabContentProps) {
  const [target, setTarget] = useState<"detection" | "remediation" | "rollback">("detection");
  const source =
    target === "detection" ? detection : target === "remediation" ? remediation : (rollback ?? "");

  const options: Array<{ value: "detection" | "remediation" | "rollback"; label: string; available: boolean }> = [
    { value: "detection", label: "Detection", available: true },
    { value: "remediation", label: "Remediation", available: true },
    { value: "rollback", label: "Rollback", available: rollback !== null },
  ];

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
          Walk through:
        </span>
        {options.map((o) => {
          const active = target === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={!o.available}
              onClick={() => setTarget(o.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                active
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
              } ${!o.available ? "opacity-40 cursor-not-allowed" : ""}`}
              data-testid={`button-sim-target-${o.value}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        <SimulatePanel source={source} />
      </div>
    </div>
  );
}
