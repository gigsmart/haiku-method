---
title: Fork Deployment Guide
description: Everything you need to deploy your own fork of H·AI·K·U — GCP, Sentry, OAuth, DNS, and GitHub configuration
order: 95
---

This guide covers everything you need to get a full deployment running from a fork of the H·AI·K·U repo. The plugin works standalone with zero infrastructure, so read the "Minimum Viable Fork" section first and only set up what you actually need.

## Minimum Viable Fork

If you just want the plugin and don't care about hosting the website:

1. Fork the repo
2. That's it — the plugin works standalone via `/plugin install gigsmart/ai-dlc`

Everything below is only necessary if you want to host the website, run the auth proxy, or enable CI features like automated version bumping and PR reviews.

## Prerequisites

- A GitHub account with a fork of `gigsmart/haiku-method`
- A GCP project (for DNS + auth proxy infrastructure)
- A domain name (optional — skip DNS and the auth proxy if you're only using the plugin)

## Required Configuration

### GitHub Secrets

These are configured in your fork's Settings → Secrets and variables → Actions → Secrets.

| Secret | Purpose | How to get it |
|--------|---------|---------------|
| `GCP_SA_KEY` | GCP service account credentials for Terraform | Create a service account in your GCP project with DNS Admin, Cloud Functions Admin, Storage Admin, IAM Service Account User, and Cloud Run Admin roles. Export a JSON key. |
| `HAIKU_GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth for the browse/auth feature | Create a GitHub OAuth App (see OAuth Apps below). The client secret is generated when you create the app. |

### GitHub Variables

These are configured in your fork's Settings → Secrets and variables → Actions → Variables.

| Variable | Purpose | Default |
|----------|---------|---------|
| `HAIKU_DOMAIN` | Your domain | `haikumethod.ai` |
| `NEXT_PUBLIC_HAIKU_AUTH_PROXY_URL` | URL to your auth proxy | `https://auth.haikumethod.ai` |
| `NEXT_PUBLIC_HAIKU_GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth client ID | (none — auth proxy won't work without it) |
| `TF_VAR_auth_proxy_subdomain` | Auth proxy subdomain | `auth` |
| `HAIKU_AUTH_ALLOWED_ORIGIN` | CORS origin for auth proxy | `https://haikumethod.ai` |

## GCP Setup

1. Create a GCP project.
2. Enable these APIs: Cloud DNS, Cloud Functions, Cloud Build, Cloud Storage, IAM, Cloud Run.
3. Create a service account with the roles listed above (DNS Admin, Cloud Functions Admin, Storage Admin, IAM Service Account User, Cloud Run Admin).
4. Export a JSON key for the service account — this becomes your `GCP_SA_KEY` secret.
5. Create a GCS bucket for Terraform state. Name it `{project-id}-terraform-state`.
6. Create a Cloud DNS managed zone for your domain.
7. Point your domain's NS records to the Google nameservers from the managed zone.
8. Update `deploy/terraform/providers.tf` — change the backend bucket name to match yours.

## GitHub Pages (Website Deployment)

The website deploys to GitHub Pages automatically on push to main when files in `website/` change.

1. Enable GitHub Pages in your fork: Settings → Pages → Source: GitHub Actions.
2. If you're using a custom domain, create a DNS CNAME record pointing `yourdomain.com` to `{your-github-org}.github.io`.

## OAuth Apps (Browse Feature)

The browse feature lets users view their repos through the website. It requires an OAuth app and the auth proxy.

### GitHub OAuth

1. Go to `https://github.com/settings/developers` and create a new OAuth App.
2. Set the callback URL to `https://auth.yourdomain.com/callback/github`.
3. Copy the client ID into the `NEXT_PUBLIC_HAIKU_GITHUB_OAUTH_CLIENT_ID` variable.
4. Copy the client secret into the `HAIKU_GITHUB_OAUTH_CLIENT_SECRET` secret.

### GitLab OAuth (optional)

Same pattern as GitHub but for GitLab. Set the `NEXT_PUBLIC_HAIKU_GITLAB_OAUTH_CLIENT_ID` variable and `HAIKU_GITLAB_OAUTH_CLIENT_SECRET` secret if you want GitLab support.

## Optional Configuration

Everything in this section can be skipped entirely. The deployment works without it.

### Optional Secrets

| Secret | Purpose | How to get it |
|--------|---------|---------------|
| `SENTRY_AUTH_TOKEN` | Sentry sourcemap uploads + Terraform provider | Create at your Sentry instance under Settings → Auth Tokens. Needs `org:read`, `project:read`, `project:write` scopes. |
| `HAIKU_GITLAB_OAUTH_CLIENT_SECRET` | GitLab OAuth for browse/auth | Same pattern as GitHub but for GitLab. |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code GitHub Action for automated PR reviews | Get from Claude Code OAuth setup. Only needed for automated PR reviews. |
| `BUMP_TOKEN` | GitHub token for automated version bumping | A PAT with `repo` scope. Falls back to `GITHUB_TOKEN` if not set. |

### Optional Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_HAIKU_GITLAB_OAUTH_CLIENT_ID` | GitLab OAuth client ID | (none — GitLab auth disabled) |
| `SENTRY_BASE_URL` | Sentry API URL (for self-hosted) | `https://sentry.io/api/` |
| `SENTRY_ORGANIZATION` | Sentry org slug | `gigsmart` |

### Sentry Setup

Works with SaaS sentry.io or self-hosted. Set the `SENTRY_AUTH_TOKEN` secret and `SENTRY_ORGANIZATION` variable. For self-hosted, also set `SENTRY_BASE_URL` to `https://your-sentry.com/api/`.

If you skip Sentry entirely, error tracking is silently disabled. Everything else works fine.

## Local Development

For local website development, set these environment variables:

```bash
NEXT_PUBLIC_SENTRY_DSN=          # leave empty to disable
NEXT_PUBLIC_REPO_SLUG=your-org/haiku-method
NEXT_PUBLIC_HAIKU_AUTH_PROXY_URL=https://auth.yourdomain.com
NEXT_PUBLIC_HAIKU_GITHUB_OAUTH_CLIENT_ID=your-client-id
```

## What You Can Skip

| Component | Impact of skipping |
|-----------|--------------------|
| **Sentry** | Errors aren't tracked. Everything else works. |
| **Auth proxy + OAuth** | Browse feature on the website is disabled. |
| **DNS** | Can't host the website on a custom domain. Plugin still works. |
| **GitLab OAuth** | GitLab repos can't be browsed. GitHub-only is fine. |
| **Claude Code OAuth** | No automated PR reviews. Manual reviews still work. |
| **Version bump token** | Falls back to `GITHUB_TOKEN`. Version bumps still work in most cases. |
