---
status: completed
last_updated: "2026-04-03T01:56:53Z"
depends_on: [unit-02-skills-metadata-rename]
branch: ai-dlc/haiku-rebrand/09-deploy-config
discipline: devops
stage: ""
workflow: ""
ticket: ""
hat: reviewer
---

# unit-09-deploy-config

## Description

Bring deployment infrastructure from the haiku-method repo into the merged ai-dlc repo. This includes Terraform configuration for Railway + GCP DNS, deployment scripts, domain routing for haikumethod.ai, and CI/CD for website deployment on push to main.

## Discipline

devops - Infrastructure as code (Terraform), CI/CD pipeline configuration, DNS and domain routing.

## Domain Entities

### Source (haiku-method repo)

The haiku-method infrastructure lives in the `TheBushidoCollective/haiku-method` GitHub repository. Before executing this unit, an agent must clone it:

```bash
git clone https://github.com/TheBushidoCollective/haiku-method.git /tmp/haiku-method
```

- `/tmp/haiku-method/deploy/terraform/` — Terraform configs for Railway + GCP DNS
- `/tmp/haiku-method/website/` — deployed website with haikumethod.ai domain

If the repo is private, configure access via the `GITHUB_TOKEN` environment variable or SSH keys before cloning.

### Destination (this repo)

- `deploy/terraform/` — merged Terraform configuration
- `.github/workflows/` — CI/CD pipeline definitions
- `website/` — adapted for haikumethod.ai deployment

## Technical Specification

### Terraform Configuration

Bring over from `/tmp/haiku-method/deploy/terraform/` (cloned from `TheBushidoCollective/haiku-method`):

1. **Railway configuration** — web service for the Next.js static site
   - Service name, region, build command, start command
   - Environment variables
   - Custom domain: `haikumethod.ai`, `www.haikumethod.ai`

2. **GCP DNS** — DNS zone and records for haikumethod.ai
   - A/AAAA records pointing to Railway
   - CNAME for `www` subdomain
   - MCP subdomain: `mcp.haikumethod.ai` for plugin distribution

3. **Adapt for merged repo structure**:
   - Update build paths (website may be in a different relative location)
   - Update service references
   - Ensure Terraform state is compatible or plan for migration

### Directory Structure

```
deploy/
  terraform/
    main.tf              # Provider configuration (Railway, GCP)
    railway.tf           # Railway web service
    dns.tf               # GCP DNS zone and records
    variables.tf         # Input variables
    outputs.tf           # Output values
    terraform.tfvars     # Variable values (gitignored)
    .terraform.lock.hcl  # Dependency lock
```

### Domain Configuration

| Domain | Target | Purpose |
|--------|--------|---------|
| `haikumethod.ai` | Railway web service | Main website |
| `www.haikumethod.ai` | CNAME -> `haikumethod.ai` | www redirect |
| `mcp.haikumethod.ai` | Plugin MCP endpoint | Plugin distribution |

### CI/CD Pipeline

Create `.github/workflows/deploy-website.yml`:

```yaml
name: Deploy Website
on:
  push:
    branches: [main]
    paths:
      - 'website/**'
      - 'deploy/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: cd website && bun install && bun run build
      - name: Deploy to Railway
        # Railway deployment trigger (webhook or CLI)
```

Also consider:

- **Preview deployments** for PRs that modify `website/`
- **Terraform plan** on PR, **Terraform apply** on merge to main
- **Plugin version bump** CI (existing — verify it still works after rename)

### Website Adaptation

Update `website/next.config.ts` or equivalent for the new domain:

- Base URL: `https://haikumethod.ai`
- Asset prefix (if using CDN)
- Sitemap generation URL
- RSS/Atom feed URLs (from existing feed infrastructure)
- Open Graph metadata URLs

### MCP Subdomain

`mcp.haikumethod.ai` serves the plugin metadata for Claude Code plugin discovery:

- Plugin manifest at `mcp.haikumethod.ai/.well-known/claude-plugin.json`
- Or configure as a CNAME/redirect depending on how Claude Code plugin distribution works

### Terraform Variables

```hcl
variable "railway_token" {
  description = "Railway API token"
  type        = string
  sensitive   = true
}

variable "gcp_project" {
  description = "GCP project ID for DNS"
  type        = string
}

variable "domain" {
  description = "Primary domain"
  type        = string
  default     = "haikumethod.ai"
}
```

### Migration Considerations

- The haiku-method repo's Terraform state may already manage these resources. Plan for state migration or re-import.
- If the repo is renamed on GitHub, update CI webhook URLs and Railway source configuration.
- Ensure `.gitignore` excludes `terraform.tfvars`, `.terraform/`, and `*.tfstate*`.

## Success Criteria

- [ ] `deploy/terraform/` directory exists with complete Terraform configuration
- [ ] Railway web service configured for the website
- [ ] GCP DNS zone and records configured for `haikumethod.ai`
- [ ] `mcp.haikumethod.ai` subdomain configured
- [ ] `.github/workflows/deploy-website.yml` exists and triggers on website changes
- [ ] CI/CD deploys successfully on push to main
- [ ] Website is accessible at `https://haikumethod.ai`
- [ ] `www.haikumethod.ai` redirects to `haikumethod.ai`
- [ ] Website `next.config.ts` updated for haikumethod.ai base URL
- [ ] Feed URLs (RSS/Atom/JSON) work at the new domain
- [ ] Terraform state is clean (no orphaned resources from haiku-method repo)
- [ ] `.gitignore` excludes sensitive Terraform files

## Risks

- **Terraform state conflict**: The haiku-method repo may already manage these resources. Importing state into the new repo requires careful `terraform import` commands. Mitigation: plan the state migration before applying changes.
- **DNS propagation**: Domain changes take time to propagate. Mitigation: use low TTLs during migration, verify with `dig` before marking complete.
- **Railway service linking**: Railway projects are linked to specific GitHub repos. Changing the repo requires re-linking. Mitigation: document the re-linking steps or use Railway API.
- **Secrets management**: Terraform variables and Railway tokens must be configured in GitHub Actions secrets. Mitigation: document all required secrets.

## Boundaries

This unit handles deployment infrastructure only. It does NOT modify website content (unit-10), write documentation (unit-11), or update CLAUDE.md/paper (unit-12). It assumes the website builds successfully and focuses on getting it deployed to the new domain.
