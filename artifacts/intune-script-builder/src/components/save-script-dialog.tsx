import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import { saveEntry } from "@/lib/library";
import type { BuilderFormValues } from "@/lib/builder-schema";

interface SaveScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: BuilderFormValues;
  defaultName?: string;
}

export function SaveScriptDialog({
  open,
  onOpenChange,
  config,
  defaultName,
}: SaveScriptDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(defaultName ?? config.scriptName ?? "");

  // Reseed the input each time the dialog opens so the displayed name
  // always reflects the current builder state, not a stale prior value.
  useEffect(() => {
    if (open) {
      setName(defaultName ?? config.scriptName ?? "");
    }
  }, [open, defaultName, config.scriptName]);

  const onSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({
        title: "Name required",
        description: "Give your script a name so you can find it later.",
      });
      return;
    }
    const entry = saveEntry(trimmed, config);
    toast({
      title: "Saved to Library",
      description: `“${entry.name}” is now in your local library.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-save-script">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-4 h-4 text-primary" />
            Save to Library
          </DialogTitle>
          <DialogDescription>
            Stores the current builder configuration in this browser. Use the
            Library page to load, share, or remove it later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="save-script-name">Name</Label>
          <Input
            id="save-script-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Set EnableFeature on pilot ring"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave();
              }
            }}
            data-testid="input-save-script-name"
          />
          <p className="text-[11px] text-muted-foreground">
            Saved locally in your browser only — nothing leaves your device.
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-save-cancel"
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave} data-testid="button-save-confirm">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
