# Unit 09 Plan: Deploy Config

## Source Analysis

The haiku-method repo has two separate deployments:

| Component | Hosting | Domain | Notes |
|-----------|---------|--------|-------|
| `website/` (static Next.js) | GitHub Pages | `haikumethod.ai` (apex) | A/AAAA records → GitHub Pages IPs |
| `web/` (MCP server app) | Railway | `mcp.haikumethod.ai` | CNAME → Railway, has DB + OAuth |

**Key insight:** The static website does NOT deploy to Railway — it deploys to GitHub Pages. Railway hosts the MCP web app (separate codebase with Dockerfile, Postgres, OAuth). The ai-dlc repo has no `web/` equivalent.

## Existing State (ai-dlc repo)

- `.github/workflows/deploy-website.yml` — **Already exists**, uses Bun, deploys to GitHub Pages. Functional.
- No `deploy/` directory
- `.gitignore` — Missing Terraform exclusions
- `website/next.config.ts` — Static export, no base URL set for haikumethod.ai
- No MCP web app in this repo

## Plan

### 1. Create `deploy/terraform/` — DNS-only Terraform config

Bring over from haiku-method but **strip down to what ai-dlc actually needs**:

**KEEP:**
- `providers.tf` — Railway + GCP providers + Terraform Cloud backend
- `main.tf` — Adapted: DNS module only (no postgres, no web module)
- `variables.tf` — Adapted: remove web/postgres/OAuth vars
- `outputs.tf` — Adapted: DNS outputs only
- `modules/dns/` — Full copy (zone, GitHub Pages records, MCP CNAME, verification TXT)

**REMOVE (not applicable):**
- `modules/postgres/` — No database in ai-dlc
- `modules/web/` — No Railway-hosted app (website is on GitHub Pages)
- `modules/project/` — No Railway project needed without a Railway service

**Rationale:** The ai-dlc repo's website deploys to GitHub Pages via the existing workflow. Terraform's role is managing the GCP DNS zone for haikumethod.ai. If/when a Railway service is needed (e.g., MCP plugin distribution endpoint), the web/project/postgres modules can be brought back.

#### File structure:
```
deploy/
  terraform/
    providers.tf         # GCP provider + Terraform Cloud backend (remove Railway provider)
    main.tf              # DNS module instantiation only
    variables.tf         # GCP project, domain, DNS zone, MCP verification
    outputs.tf           # DNS nameservers output
    modules/
      dns/
        zone.tf          # google_dns_managed_zone
        records_github_pages.tf  # A/AAAA for apex → GitHub Pages, CNAME www
        records_mcp.tf   # CNAME mcp → placeholder (future Railway or redirect)
        providers.tf     # GCP provider requirement
        variables.tf     # zone_name, domain, enable flags, mcp values
```

### 2. Adapt Terraform Cloud backend

- Change workspace name from `haiku-web` → `ai-dlc` (new workspace for the merged repo)
- Keep organization `bushido-collective`
- Remove Railway provider (not needed without Railway services)
- Keep GCP provider for DNS

### 3. Update `providers.tf` variables

Adapt from haiku-method:
```hcl
variable "gcp_project_id" {}
variable "gcp_dns_zone_name" { default = "haikumethod-ai" }
variable "domain" { default = "haikumethod.ai" }
variable "mcp_domain_verify_txt" { default = "" }  # Railway verify TXT
variable "enable_mcp_dns" { default = false }       # MCP CNAME (off by default until service exists)
variable "mcp_dns_value" { default = "" }           # Railway DNS target
```

### 4. Update `.github/workflows/deploy-website.yml`

The existing workflow already works. Minor updates needed:
- Add `deploy/**` to the `paths` trigger so Terraform file changes also trigger (for awareness, though deploy itself is Terraform Cloud-driven)
- No other changes — it already uses Bun, deploys to GitHub Pages, has correct permissions

### 5. Update `.gitignore`

Add Terraform exclusions:
```
# Terraform
.terraform/
*.tfstate
*.tfstate.backup
terraform.tfvars
.terraform.lock.hcl
```

### 6. Update `website/next.config.ts`

No changes needed for base URL. GitHub Pages with a custom domain handles this automatically via CNAME file. The static export config is correct as-is. The domain routing (`haikumethod.ai` → GitHub Pages) is handled entirely by DNS.

However, if `website/public/CNAME` doesn't exist, create it:
```
haikumethod.ai
```
This tells GitHub Pages to serve the site under the custom domain.

### 7. Domain routing summary

| Domain | DNS Record | Target | Purpose |
|--------|-----------|--------|---------|
| `haikumethod.ai` | A + AAAA | GitHub Pages IPs | Main website (static) |
| `www.haikumethod.ai` | CNAME | `thebushidocollective.github.io.` | www → GitHub Pages |
| `mcp.haikumethod.ai` | CNAME | Railway DNS value (future) | Plugin distribution (not yet active) |

### 8. Migration considerations

- **Terraform state:** The haiku-method repo's Terraform Cloud workspace `haiku-web` manages the existing DNS zone and Railway resources. The ai-dlc repo needs a NEW workspace (`ai-dlc`). Existing resources must be imported via `terraform import` or the old workspace migrated.
- **No destructive DNS changes:** DNS records for haikumethod.ai are already live. The plan creates Terraform config to MANAGE them, not recreate. First `terraform plan` must be a no-op or import-only.
- **GitHub Pages CNAME:** The `TheBushidoCollective/ai-dlc` repo's GitHub Pages settings must be configured to use the custom domain `haikumethod.ai`. This is a manual GitHub settings change + the CNAME file.

## Files to create/modify

| Action | File | Description |
|--------|------|-------------|
| Create | `deploy/terraform/providers.tf` | GCP provider + TF Cloud backend |
| Create | `deploy/terraform/main.tf` | DNS module instantiation |
| Create | `deploy/terraform/variables.tf` | Input variables |
| Create | `deploy/terraform/outputs.tf` | DNS outputs |
| Create | `deploy/terraform/modules/dns/zone.tf` | DNS managed zone |
| Create | `deploy/terraform/modules/dns/records_github_pages.tf` | Apex + www records |
| Create | `deploy/terraform/modules/dns/records_mcp.tf` | MCP subdomain CNAME |
| Create | `deploy/terraform/modules/dns/providers.tf` | GCP provider requirement |
| Create | `deploy/terraform/modules/dns/variables.tf` | DNS module variables |
| Modify | `.gitignore` | Add Terraform exclusions |
| Create | `website/public/CNAME` | GitHub Pages custom domain file |
| Modify | `.github/workflows/deploy-website.yml` | Add deploy/** to paths trigger |

## NOT in scope (per unit boundaries)

- Website content changes (unit-10)
- Documentation updates (unit-11)
- CLAUDE.md/paper sync (unit-12)
- MCP web app migration (not in any unit — haiku-method's `web/` is a separate product)
- Terraform apply / state import (operational — needs manual execution after merge)

## Risks

1. **Terraform state ownership:** Haiku-method's TF Cloud workspace still manages the live DNS. Migrating ownership requires either importing into new workspace or renaming the old one. Recommend importing.
2. **GitHub Pages repo config:** Custom domain must be set in repo settings. This is a one-time manual step.
3. **MCP endpoint:** No Railway service exists in ai-dlc yet. MCP DNS records are off by default (`enable_mcp_dns = false`).
