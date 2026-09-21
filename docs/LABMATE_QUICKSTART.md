# Labmate quick start

Research OS is local-first: the browser is a view/editor, while Markdown files
remain the canonical research memory. The safest way to trial it is the demo
release, which contains synthetic records only.

## One-click downloads

Use the [latest public release](https://github.com/pierandozzimichael/Research-OS/releases/latest)
for the synthetic demo:

- **Windows:** download `research-os-lab-latest-windows.zip`, unzip it, and
  double-click **Install Research OS.cmd**. This avoids PowerShell execution
  policy friction and will use `winget` to install Node.js 22 when available.
- **macOS/Linux:** download `research-os-lab-latest-macos.tar.gz`, extract it,
  and double-click **Install Research OS.command**. On macOS, Homebrew is used
  to install Node 22 when it is already available. If neither Node nor
  Homebrew is installed, the script prints the official Node.js download page.

The release assets are deliberately demo-only. Do not put an unpublished lab
vault into the public download archive.

## Windows install (manual/clone path)

1. Install Node.js 22.13 or newer from [nodejs.org](https://nodejs.org/).
2. Download and unzip the release archive, or clone the lab's private GitHub
   repository.
3. Right-click **Install Research OS.ps1** and choose **Run with PowerShell**
   (or double-click **Install Research OS.cmd**).
   The installer uses the lockfile, refreshes AI navigation, validates the
   schema, and creates an **APOE Research OS** desktop shortcut.
4. Open the shortcut. It starts a loopback-only server and opens the exact URL
   automatically.

The installer has bounded command timeouts and stops with a useful error if a
dependency or check hangs. Re-run it with `-SkipInstall` after dependencies are
already present. Use `-NoShortcut` on shared machines.

After installation, double-click **Start Research OS.cmd** on Windows or
**Start Research OS.command** on macOS. The launcher selects a free loopback
port, opens the exact local URL, and reuses a healthy server if one is already
running. The matching Stop launcher terminates the local process.

## Connecting a real lab project

Keep unpublished work outside a public GitHub repository. In the app, use the
project menu to create or re-add a project, or point the local AI tools at the
project directory. The project registry and vault are ordinary JSON/Markdown;
they work with Obsidian, Codex, Claude Code, Git, and normal text tools.

Before sharing anything, run:

```powershell
pnpm ai:doctor
pnpm schema:validate
pnpm ai:check
```

`01 Inbox/Literature` is staging, not canonical evidence. Generated files under
`14 AI Workspace/generated` are navigation projections and can be rebuilt.
Never place donor identifiers, MRNs, dates of birth, or other re-identifying
details in the vault.

## GitHub download model

For a public GitHub repository, publish the demo release or source without the
real `vault/` and `projects/` folders. For a private lab repository, the real
vault may be included only after the lab agrees on access controls and backup
policy. The repository does not contain a GitHub remote by default; the owner
must choose the organization, repository name, visibility, and collaborators.
