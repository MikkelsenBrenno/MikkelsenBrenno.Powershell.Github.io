// Cmdlet reference for inline tooltips and linter severity decisions.
// `learnUrl` follows the Microsoft Learn convention; `dangerous` flags
// state-mutating cmdlets.

export interface CmdletInfo {
  name: string;
  module: string;
  description: string;
  dangerous?: boolean;
  learnUrl: string;
}

const REFS: ReadonlyArray<Omit<CmdletInfo, "learnUrl">> = [
  // Registry
  { name: "Get-ItemProperty", module: "microsoft.powershell.management", description: "Reads the value of a registry key or item property." },
  { name: "Get-ItemPropertyValue", module: "microsoft.powershell.management", description: "Returns just the value of one or more property names from a registry item." },
  { name: "Set-ItemProperty", module: "microsoft.powershell.management", description: "Writes a value to a registry key or item property.", dangerous: true },
  { name: "New-ItemProperty", module: "microsoft.powershell.management", description: "Creates a new registry value under an existing key.", dangerous: true },
  { name: "Remove-ItemProperty", module: "microsoft.powershell.management", description: "Deletes a single value from a registry key.", dangerous: true },
  { name: "New-Item", module: "microsoft.powershell.management", description: "Creates a new file, folder, or registry key.", dangerous: true },
  { name: "Remove-Item", module: "microsoft.powershell.management", description: "Deletes files, folders, or registry keys (recursive with -Recurse).", dangerous: true },
  { name: "Copy-Item", module: "microsoft.powershell.management", description: "Copies a file or folder to a new location.", dangerous: true },
  { name: "Move-Item", module: "microsoft.powershell.management", description: "Moves a file or folder to a new location.", dangerous: true },
  { name: "Rename-Item", module: "microsoft.powershell.management", description: "Renames a file, folder, or registry key.", dangerous: true },
  { name: "Test-Path", module: "microsoft.powershell.management", description: "Returns $true if the given path (file, folder, or registry key) exists." },
  { name: "Get-Item", module: "microsoft.powershell.management", description: "Returns the item at the specified path (file, folder, registry key)." },
  { name: "Get-ChildItem", module: "microsoft.powershell.management", description: "Lists files, folders, or registry subkeys under a path." },
  { name: "Resolve-Path", module: "microsoft.powershell.management", description: "Resolves wildcards in a path and returns the matching paths." },
  { name: "Push-Location", module: "microsoft.powershell.management", description: "Pushes the current location onto the stack and changes to a new one." },
  { name: "Pop-Location", module: "microsoft.powershell.management", description: "Returns to the most recent location pushed onto the stack." },

  // Services
  { name: "Get-Service", module: "microsoft.powershell.management", description: "Returns the status of one or more Windows services." },
  { name: "Start-Service", module: "microsoft.powershell.management", description: "Starts a stopped Windows service.", dangerous: true },
  { name: "Stop-Service", module: "microsoft.powershell.management", description: "Stops a running Windows service.", dangerous: true },
  { name: "Restart-Service", module: "microsoft.powershell.management", description: "Stops and then starts a Windows service.", dangerous: true },
  { name: "Set-Service", module: "microsoft.powershell.management", description: "Changes a service's startup type, display name, or status.", dangerous: true },
  { name: "New-Service", module: "microsoft.powershell.management", description: "Registers a new Windows service.", dangerous: true },

  // Scheduled tasks
  { name: "Get-ScheduledTask", module: "scheduledtasks", description: "Returns scheduled tasks that match the supplied filters." },
  { name: "Enable-ScheduledTask", module: "scheduledtasks", description: "Enables a scheduled task so it can run on its triggers.", dangerous: true },
  { name: "Disable-ScheduledTask", module: "scheduledtasks", description: "Disables a scheduled task without deleting it.", dangerous: true },
  { name: "Register-ScheduledTask", module: "scheduledtasks", description: "Registers a new scheduled task with the Task Scheduler.", dangerous: true },
  { name: "Unregister-ScheduledTask", module: "scheduledtasks", description: "Deletes a scheduled task from the Task Scheduler.", dangerous: true },
  { name: "Start-ScheduledTask", module: "scheduledtasks", description: "Runs a scheduled task immediately.", dangerous: true },
  { name: "Stop-ScheduledTask", module: "scheduledtasks", description: "Stops a running scheduled task.", dangerous: true },

  // Output / logging
  { name: "Write-Output", module: "microsoft.powershell.utility", description: "Writes objects to the success stream. The correct way to surface text in Intune Proactive Remediations." },
  { name: "Write-Host", module: "microsoft.powershell.utility", description: "Writes to the host UI. NOT captured by Intune - prefer Write-Output." },
  { name: "Write-Error", module: "microsoft.powershell.utility", description: "Writes a non-terminating error to the error stream." },
  { name: "Write-Warning", module: "microsoft.powershell.utility", description: "Writes a warning message to the warning stream." },
  { name: "Write-Verbose", module: "microsoft.powershell.utility", description: "Writes a verbose message (visible only when -Verbose or $VerbosePreference is set)." },
  { name: "Write-Debug", module: "microsoft.powershell.utility", description: "Writes a debug message (visible only when -Debug or $DebugPreference is set)." },
  { name: "Write-Information", module: "microsoft.powershell.utility", description: "Writes a message to the information stream (PS5+)." },
  { name: "Out-Null", module: "microsoft.powershell.core", description: "Discards its input - used to suppress unwanted output from a pipeline." },
  { name: "Out-File", module: "microsoft.powershell.utility", description: "Writes pipeline output to a file." },
  { name: "Out-String", module: "microsoft.powershell.utility", description: "Converts pipeline output to a single string." },
  { name: "Start-Transcript", module: "microsoft.powershell.host", description: "Begins recording the current session to a text file." },
  { name: "Stop-Transcript", module: "microsoft.powershell.host", description: "Stops recording the current session." },

  // Process / environment
  { name: "Get-Process", module: "microsoft.powershell.management", description: "Returns information about running processes." },
  { name: "Stop-Process", module: "microsoft.powershell.management", description: "Forcefully terminates a running process.", dangerous: true },
  { name: "Start-Process", module: "microsoft.powershell.management", description: "Starts a new process. Often used to invoke installers.", dangerous: true },
  { name: "Wait-Process", module: "microsoft.powershell.management", description: "Waits for a process to terminate before continuing." },
  { name: "Get-ComputerInfo", module: "microsoft.powershell.management", description: "Returns OS, BIOS, and hardware information about the local computer." },
  { name: "Get-WmiObject", module: "microsoft.powershell.management", description: "Returns WMI class instances. Deprecated in PS6+ - prefer Get-CimInstance." },
  { name: "Get-CimInstance", module: "cimcmdlets", description: "Returns CIM (WMI) class instances. The modern replacement for Get-WmiObject." },
  { name: "Invoke-CimMethod", module: "cimcmdlets", description: "Invokes a method on a CIM (WMI) class or instance.", dangerous: true },

  // Network / web
  { name: "Invoke-WebRequest", module: "microsoft.powershell.utility", description: "Sends an HTTP/HTTPS request and returns the response.", dangerous: true },
  { name: "Invoke-RestMethod", module: "microsoft.powershell.utility", description: "Sends an HTTP/HTTPS request and parses the JSON/XML response.", dangerous: true },
  { name: "Test-NetConnection", module: "nettcpip", description: "Diagnoses TCP/IP connectivity to a remote host." },

  // Security / dangerous
  { name: "Set-ExecutionPolicy", module: "microsoft.powershell.security", description: "Changes the PowerShell execution policy. Avoid in deployed scripts.", dangerous: true },
  { name: "Invoke-Expression", module: "microsoft.powershell.utility", description: "Executes a string as a PowerShell command. Major code-injection risk - avoid.", dangerous: true },
  { name: "Add-Type", module: "microsoft.powershell.utility", description: "Compiles and loads a .NET type from C#/VB source.", dangerous: true },
  { name: "Get-Credential", module: "microsoft.powershell.security", description: "Prompts the user for a credential. Won't work in non-interactive Intune contexts." },

  // Utility
  { name: "ForEach-Object", module: "microsoft.powershell.core", description: "Runs a script block once for each item in a pipeline." },
  { name: "Where-Object", module: "microsoft.powershell.core", description: "Filters pipeline objects against a script block or property test." },
  { name: "Select-Object", module: "microsoft.powershell.utility", description: "Selects properties or a subset of objects from a pipeline." },
  { name: "Sort-Object", module: "microsoft.powershell.utility", description: "Sorts pipeline objects by one or more properties." },
  { name: "Measure-Object", module: "microsoft.powershell.utility", description: "Computes count, sum, min, max, or average over pipeline objects." },
  { name: "Get-Date", module: "microsoft.powershell.utility", description: "Returns the current date and time, or formats a supplied date." },
  { name: "Join-Path", module: "microsoft.powershell.management", description: "Combines a parent path and a child path into a single path." },
  { name: "Split-Path", module: "microsoft.powershell.management", description: "Returns the parent or leaf portion of a path." },
];

function urlFor(module: string, name: string): string {
  return `https://learn.microsoft.com/powershell/module/${module}/${name.toLowerCase()}`;
}

const INDEX = new Map<string, CmdletInfo>();
for (const r of REFS) {
  const info: CmdletInfo = { ...r, learnUrl: urlFor(r.module, r.name) };
  INDEX.set(r.name.toLowerCase(), info);
}

export function lookupCmdlet(name: string): CmdletInfo | null {
  return INDEX.get(name.toLowerCase()) ?? null;
}

export function isDangerousCmdlet(name: string): boolean {
  return lookupCmdlet(name)?.dangerous === true;
}

export function allCmdletNames(): string[] {
  return REFS.map((r) => r.name);
}
