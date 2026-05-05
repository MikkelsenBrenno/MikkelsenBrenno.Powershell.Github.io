export const MODULES_GUIDE_CATEGORIES = [
  "Gallery & Repositories",
  "Installing",
  "Versioning",
  "Side-by-Side",
  "Pinning in Scripts",
  "Offline / Air-Gapped",
  "Updating & Removing",
  "Publishing",
] as const;

export type ModulesGuideCategory = (typeof MODULES_GUIDE_CATEGORIES)[number];

export interface ModulesGuideExample {
  code: string;
  language?: "powershell" | "text";
}

export interface ModulesGuideSection {
  id: string;
  title: string;
  category: ModulesGuideCategory;
  summary: string;
  details: string;
  bullets?: string[];
  example?: ModulesGuideExample;
  gotchas?: string[];
  docsUrl?: string;
}

export const modulesGuide: ModulesGuideSection[] = [
  {
    id: "what-is-psgallery",
    title: "What the PowerShell Gallery actually is",
    category: "Gallery & Repositories",
    summary:
      "A public NuGet-style feed at www.powershellgallery.com that ships modules and scripts. It's where Install-Module pulls from by default.",
    details:
      "The Gallery is exposed in PowerShell as a registered repository named 'PSGallery'. It is shipped untrusted, which means the very first Install-Module from it prompts for confirmation in an interactive session and silently fails on a non-interactive one (like an Intune SYSTEM script) unless you either pass -Force or mark the repository Trusted. Use Get-PSRepository to see what's registered and Set-PSRepository to flip the trust flag.",
    bullets: [
      "Default repo name: 'PSGallery'.",
      "Source URL: https://www.powershellgallery.com/api/v2 (PowerShellGet v2) or https://www.powershellgallery.com/api/v3 (PSResourceGet).",
      "Untrusted by default — non-interactive installs need -Force or a one-time `Set-PSRepository PSGallery -InstallationPolicy Trusted`.",
    ],
    example: {
      language: "powershell",
      code:
        'Get-PSRepository\n\n# Make PSGallery trusted so unattended installs don\'t prompt\nSet-PSRepository -Name PSGallery -InstallationPolicy Trusted',
    },
    docsUrl:
      "https://learn.microsoft.com/powershell/gallery/getting-started",
  },
  {
    id: "powershellget-vs-psresourceget",
    title: "PowerShellGet v2 vs PSResourceGet (v3)",
    category: "Gallery & Repositories",
    summary:
      "Two different module managers ship in modern Windows. The classic one uses Install-Module / Find-Module; the new one uses Install-PSResource / Find-PSResource and is what Microsoft is steering everyone toward.",
    details:
      "PowerShellGet v2 is what most existing scripts and docs assume. It depends on the legacy PackageManagement / NuGet provider. Microsoft.PowerShell.PSResourceGet (formerly PowerShellGet v3) is the rewrite — faster, no NuGet bootstrap, friendlier semver — and ships in-box with PowerShell 7.4+. Both can be installed side-by-side; you can keep using Install-Module today and migrate to Install-PSResource on a script-by-script basis.",
    bullets: [
      "PS 5.1: PowerShellGet v2 in-box, PSResourceGet has to be installed (`Install-Module Microsoft.PowerShell.PSResourceGet`).",
      "PS 7.0–7.3: PowerShellGet v2 in-box.",
      "PS 7.4+: both are in-box.",
      "Cmdlet pairs: Install-Module ↔ Install-PSResource, Find-Module ↔ Find-PSResource, Save-Module ↔ Save-PSResource.",
    ],
    example: {
      language: "powershell",
      code:
        '# Classic (PowerShellGet v2)\nInstall-Module -Name Az.Accounts -Scope AllUsers -Force\n\n# Modern (PSResourceGet) — same outcome, no NuGet bootstrap\nInstall-PSResource -Name Az.Accounts -Scope AllUsers -TrustRepository',
    },
    docsUrl:
      "https://learn.microsoft.com/powershell/utility-modules/psresourceget/overview",
  },
  {
    id: "scopes",
    title: "Scopes: CurrentUser vs AllUsers",
    category: "Installing",
    summary:
      "Where the module files actually land. Intune scripts running as SYSTEM almost always want -Scope AllUsers so the module is reachable from any future session, not buried in SYSTEM's profile.",
    details:
      "Install-Module / Install-PSResource default to -Scope CurrentUser when not elevated and -Scope AllUsers when elevated. Be explicit — relying on the default has burned a lot of teams when the same script runs interactively in one place and as SYSTEM in another. The two scopes write to different folders, and the folders also differ between Windows PowerShell 5.1 and PowerShell 7.",
    bullets: [
      "PS 5.1 CurrentUser: `$HOME\\Documents\\WindowsPowerShell\\Modules`.",
      "PS 5.1 AllUsers:    `$env:ProgramFiles\\WindowsPowerShell\\Modules`.",
      "PS 7 CurrentUser:   `$HOME\\Documents\\PowerShell\\Modules`.",
      "PS 7 AllUsers:      `$env:ProgramFiles\\PowerShell\\Modules`.",
      "Microsoft's own modules also live under `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules` (PS 5.1) — don't write here yourself.",
    ],
    example: {
      language: "powershell",
      code:
        '# Always pass -Scope explicitly in unattended scripts\nInstall-Module -Name PSWindowsUpdate -Scope AllUsers -Force\n\n# Confirm where it landed\nGet-Module -Name PSWindowsUpdate -ListAvailable |\n  Select-Object Name, Version, Path',
    },
    gotchas: [
      "When SYSTEM uses -Scope CurrentUser the module ends up under `C:\\Windows\\System32\\config\\systemprofile\\Documents\\...` and is invisible to every other user.",
      "OneDrive's 'Documents' redirection can move the CurrentUser path under `OneDrive\\Documents\\PowerShell\\Modules` on user-context scripts. Test before assuming the path.",
    ],
    docsUrl:
      "https://learn.microsoft.com/powershell/scripting/developer/module/installing-a-powershell-module",
  },
  {
    id: "first-run-bootstrap",
    title: "First-run bootstrap on a clean Windows host",
    category: "Installing",
    summary:
      "The minimum sequence to make Install-Module succeed silently on a Windows PowerShell 5.1 box that has never installed anything from the gallery before.",
    details:
      "Three things tend to break unattended installs on a fresh 5.1 host: the default protocol is TLS 1.0/1.1 (the gallery requires 1.2+), the NuGet package provider isn't installed yet, and PSGallery is untrusted. Toggle all three before the first Install-Module call and the script becomes deterministic.",
    example: {
      language: "powershell",
      code:
        '# Force TLS 1.2 — required for the gallery on PS 5.1\nif ($PSVersionTable.PSVersion.Major -lt 6) {\n  [Net.ServicePointManager]::SecurityProtocol =\n    [Net.SecurityProtocolType]::Tls12\n}\n\n# Bootstrap the NuGet provider (silent on machines that already have it)\nInstall-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 `\n  -Scope AllUsers -Force | Out-Null\n\n# Trust the gallery so future installs don\'t prompt\nSet-PSRepository -Name PSGallery -InstallationPolicy Trusted\n\n# Now this is safe to call unattended\nInstall-Module -Name Microsoft.Graph.Authentication `\n  -Scope AllUsers -Force -AllowClobber',
    },
    gotchas: [
      "On PS 7 the TLS 1.2 toggle is unnecessary — the runtime already uses modern defaults.",
      "Behind a corporate proxy, point Install-PackageProvider at the proxy first or it'll hang trying to reach the NuGet bootstrap URL.",
    ],
    docsUrl:
      "https://learn.microsoft.com/powershell/gallery/powershellget/network-access",
  },
  {
    id: "picking-a-version",
    title: "Picking a specific version",
    category: "Versioning",
    summary:
      "Use -RequiredVersion to pin to exactly one version, -MinimumVersion / -MaximumVersion to bracket, and -AllowPrerelease to opt into versions tagged like 1.2.3-beta1.",
    details:
      "PowerShell follows NuGet's version-comparison rules, which are close to but not exactly SemVer. Stable versions sort by their numeric components; prerelease tags are alphanumeric, so '1.2.3-beta10' sorts before '1.2.3-beta2' — pad your prerelease numbers if you ship them yourself. Without -AllowPrerelease, prerelease versions are filtered out completely.",
    example: {
      language: "powershell",
      code:
        '# Exact version (most deterministic)\nInstall-Module -Name Az.Accounts -RequiredVersion 2.19.0 -Scope AllUsers -Force\n\n# Bracket: at least 2.0, less than 3.0\nInstall-Module -Name Az.Accounts -MinimumVersion 2.0.0 -MaximumVersion 2.99.99 `\n  -Scope AllUsers -Force\n\n# Opt into prereleases\nInstall-Module -Name Microsoft.Graph -AllowPrerelease -Scope AllUsers -Force',
    },
    gotchas: [
      "-RequiredVersion accepts only a single value, not a range — combine with -MinimumVersion/-MaximumVersion if you need a range.",
      "Without a dot separator, prerelease tags are compared as plain strings: '1.2.3-beta10' sorts before '1.2.3-beta2' because '1' < '2' character-wise. Pad your numbers ('beta02', 'beta10') if you ship them yourself.",
      "With a dot separator, SemVer 2.0 numeric identifiers are compared numerically: '1.2.3-rc.2' sorts before '1.2.3-rc.10', as you'd expect.",
    ],
    docsUrl:
      "https://learn.microsoft.com/powershell/module/powershellget/install-module",
  },
  {
    id: "find-module-before-install",
    title: "Find-Module before you install",
    category: "Versioning",
    summary:
      "Look at what's actually in the gallery before pulling it down. Find-Module / Find-PSResource list every available version and let you inspect the manifest.",
    details:
      "This is how you confirm a version exists, see when it was published, who signed it, what dependencies it pulls in, and what it claims to require. Always do this once when adopting a new module — it's faster than installing, importing, and reading Get-Module output afterward.",
    example: {
      language: "powershell",
      code:
        '# Latest version + metadata\nFind-Module -Name PSWindowsUpdate\n\n# Every published version\nFind-Module -Name PSWindowsUpdate -AllVersions |\n  Select-Object Name, Version, PublishedDate\n\n# Inspect dependencies before committing\n(Find-Module -Name Microsoft.Graph -RequiredVersion 2.20.0).Dependencies',
    },
    docsUrl:
      "https://learn.microsoft.com/powershell/module/powershellget/find-module",
  },
  {
    id: "side-by-side-versions",
    title: "Multiple versions of the same module on one box",
    category: "Side-by-Side",
    summary:
      "Modules install into <ModuleRoot>\\<Name>\\<Version>\\, so multiple versions naturally coexist. Get-Module -ListAvailable shows them all; Import-Module -RequiredVersion picks one for your session.",
    details:
      "When you `Install-Module -Force` a newer version, it does not delete the old one — both are kept on disk and the highest version wins by default at import time. That's a feature for compatibility but a footgun for disk usage and for 'why is the old version still being loaded' bugs. To collapse to a single version you have to Uninstall-Module the others explicitly.",
    example: {
      language: "powershell",
      code:
        '# Show every installed version of a module\nGet-Module -Name Az.Accounts -ListAvailable |\n  Select-Object Name, Version, ModuleBase\n\n# Force a specific one for this session\nImport-Module -Name Az.Accounts -RequiredVersion 2.13.0\n\n# Confirm what actually loaded\nGet-Module -Name Az.Accounts | Select-Object Name, Version, Path',
    },
    gotchas: [
      "If two cmdlet names collide between versions, the first one imported wins. Use -Prefix on Import-Module to disambiguate.",
      "PowerShell 5.1's auto-import always picks the highest version it can find on $env:PSModulePath — not necessarily the one you Installed last.",
    ],
  },
  {
    id: "requires-modules",
    title: "#Requires -Modules with version pinning",
    category: "Pinning in Scripts",
    summary:
      "A `#Requires` statement at the top of the script tells PowerShell to refuse to run unless the named module (and version) is available. The parser checks this before any of your code runs.",
    details:
      "The hashtable form lets you pin RequiredVersion, MinimumVersion, MaximumVersion, and Guid. If the box doesn't satisfy the requirement, the script aborts with a clear error — much easier to diagnose than a mid-script Import-Module failure. Pair this with the bootstrap-on-clean-host pattern so the module is actually installed before #Requires runs.",
    example: {
      language: "powershell",
      code:
        '#Requires -Version 5.1\n#Requires -Modules @{ ModuleName = \'PSWindowsUpdate\'; RequiredVersion = \'2.2.1.5\' }, @{ ModuleName = \'Microsoft.Graph.Authentication\'; MinimumVersion = \'2.0.0\' }\n\n# Script body only runs if both modules above are present at the right versions\nImport-Module PSWindowsUpdate, Microsoft.Graph.Authentication\nGet-WindowsUpdate -MicrosoftUpdate',
    },
    gotchas: [
      "`#Requires` lines must be at the very top of the file, above any code or comment-based help blocks that aren't preceded by `#`. A blank line before them is fine; a function declaration above is not.",
    ],
    docsUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_requires",
  },
  {
    id: "import-module-required-version",
    title: "Import a known version explicitly",
    category: "Pinning in Scripts",
    summary:
      "Even if the module is pinned at install time, an Import-Module -RequiredVersion at the top of the script removes any doubt about which version the rest of the code will see.",
    details:
      "Without this, PowerShell auto-imports the highest version it can resolve on $env:PSModulePath. That's fine until a remediation deploys a different module first, or until a side-by-side install leaves an old version sitting next to the new one. Pin explicitly and fail loudly if the version isn't there.",
    example: {
      language: "powershell",
      code:
        '$module = \'Az.Accounts\'\n$want   = \'2.19.0\'\n\nImport-Module -Name $module -RequiredVersion $want -ErrorAction Stop\n\n$loaded = (Get-Module -Name $module).Version\nif ($loaded.ToString() -ne $want) {\n  throw "Loaded $module $loaded but expected $want"\n}',
    },
  },
  {
    id: "save-module-offline",
    title: "Save-Module / Save-PSResource for offline endpoints",
    category: "Offline / Air-Gapped",
    summary:
      "Pull a module plus its dependencies to a folder on a connected box, ship the folder to the air-gapped fleet, and drop it into the AllUsers module path.",
    details:
      "Save-Module downloads to a folder you specify without installing — the layout matches what would have ended up under `Modules\\<Name>\\<Version>`. Save-PSResource is the PSResourceGet equivalent. Robocopy the resulting tree into `$env:ProgramFiles\\WindowsPowerShell\\Modules` (or the PS 7 equivalent) on the offline endpoint and Import-Module finds it without ever touching the gallery.",
    example: {
      language: "powershell",
      code:
        '# 1) On a connected admin workstation\n$staging = \'C:\\Staging\\Modules\'\nNew-Item -ItemType Directory -Path $staging -Force | Out-Null\nSave-Module -Name PSWindowsUpdate -RequiredVersion 2.2.1.5 -Path $staging\n\n# 2) Ship $staging to the offline endpoint, then on that endpoint:\n$dest = "$env:ProgramFiles\\WindowsPowerShell\\Modules"\nrobocopy "C:\\Staging\\Modules" $dest /E /R:1 /W:1 | Out-Null\n\n# 3) Verify\nGet-Module -Name PSWindowsUpdate -ListAvailable',
    },
    gotchas: [
      "Save-Module does not pull transitive system dependencies (e.g. .NET runtime updates) — only PowerShell module dependencies.",
      "Match the destination root to the host PowerShell edition: `WindowsPowerShell\\Modules` for 5.1, `PowerShell\\Modules` for 7.",
    ],
    docsUrl:
      "https://learn.microsoft.com/powershell/module/powershellget/save-module",
  },
  {
    id: "update-and-cleanup",
    title: "Update-Module vs install-and-leave; cleaning up old versions",
    category: "Updating & Removing",
    summary:
      "Update-Module installs the new version *next to* the old one — it doesn't delete anything. Cleaning up old versions is a separate, manual step.",
    details:
      "On a long-lived endpoint you'll accumulate every version of every module you've ever installed. Disk usage adds up fast for big modules like Az or Microsoft.Graph (hundreds of MB per version). Periodic cleanup uses Get-InstalledModule -AllVersions to enumerate, then Uninstall-Module per version. Note that `Uninstall-Module Name` alone only removes the *latest* version unless you pass -AllVersions or -RequiredVersion.",
    example: {
      language: "powershell",
      code:
        '# What\'s installed?\nGet-InstalledModule -Name Az.Accounts -AllVersions |\n  Select-Object Name, Version, InstalledDate\n\n# Keep only the latest, drop everything older\n$latest = (Get-InstalledModule -Name Az.Accounts).Version\nGet-InstalledModule -Name Az.Accounts -AllVersions |\n  Where-Object Version -ne $latest |\n  ForEach-Object {\n    Uninstall-Module -Name $_.Name -RequiredVersion $_.Version -Force\n  }',
    },
    gotchas: [
      "Uninstall-Module fails if any other installed module declares a dependency on the version you're trying to remove. Remove dependents first or pin them to a newer version.",
      "Modules that were copied in by hand (Save-Module / robocopy) are invisible to Get-InstalledModule because no install record was written. Delete those folders directly.",
    ],
  },
  {
    id: "publishing-internal",
    title: "Publishing your own module to a private repository",
    category: "Publishing",
    summary:
      "If your team needs internal-only modules, register a private NuGet feed (Azure Artifacts, ProGet, GitHub Packages, or a local file share) as a PSRepository and Publish-Module to it.",
    details:
      "The flow is: stand up a feed that speaks the NuGet v2 or v3 protocol, register it locally with Register-PSRepository (or Register-PSResourceRepository for PSResourceGet), then call Publish-Module / Publish-PSResource with the API key the feed gave you. Endpoints register the same repository read-only and Install-Module from it instead of (or alongside) PSGallery.",
    example: {
      language: "powershell",
      code:
        '# Register an internal feed once per machine\nRegister-PSRepository -Name ContosoInternal `\n  -SourceLocation \'https://pkgs.contoso.com/_packaging/PSModules/nuget/v2\' `\n  -InstallationPolicy Trusted\n\n# Publish a module folder you own\nPublish-Module -Path \'C:\\src\\Contoso.Endpoint\' `\n  -Repository ContosoInternal `\n  -NuGetApiKey $env:CONTOSO_FEED_KEY\n\n# Endpoints install from it\nInstall-Module -Name Contoso.Endpoint -Repository ContosoInternal `\n  -Scope AllUsers -Force',
    },
    docsUrl:
      "https://learn.microsoft.com/powershell/gallery/how-to/publishing-packages/publishing-a-package",
  },
];
