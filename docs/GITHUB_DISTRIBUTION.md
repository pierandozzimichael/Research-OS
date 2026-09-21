# GitHub distribution choices

There are two safe ways to share Research OS with a lab. Choose one before
adding a remote or pushing a commit.

| Choice | What labmates download | Vault policy | Best for |
| --- | --- | --- | --- |
| Private lab repository | The source checkout plus the agreed project vaults | Access-controlled; unpublished records stay inside the private repository | A coordinated lab workspace with shared history |
| Public software repository | The source checkout plus the synthetic demo release | Real vaults stay out of GitHub; each labmate connects or creates a local vault | Broad adoption, demos, and external collaborators |

The repository currently has no GitHub remote and the GitHub CLI is not
configured. This is intentional: publishing a vault is an external data-sharing
decision, not an installation step. After choosing, add the remote and push only
the files appropriate to that policy.

## Public release path

The tagged-release workflow builds `research-os-lab-<version>.zip` from the
demo profile. It excludes `vault/`, additional `projects/`, local agent state,
build output, and credentials. A maintainer can also create the archive locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-lab-release.ps1
```

The archive is validated with the demo schema and AI readiness checks before it
is handed off. Do not copy real lab records into `examples/demo-vault`.

## Private lab path

Use a private repository with explicit collaborators, branch protection, and a
backup policy. Review `projects.json`, the vault privacy fields, literature
staging, and any local agent configuration before the first push. The app keeps
the vault canonical on disk; GitHub is a collaboration/backup surface, not a
replacement for the local privacy boundary.
