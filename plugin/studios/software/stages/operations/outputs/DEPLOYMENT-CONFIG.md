---
name: deployment-config
location: (project source tree — e.g., deploy/, .github/workflows/, infrastructure/)
scope: repo
format: code
required: true
---

# Deployment Config

Deployment configuration written directly to the project source tree. Like the code output, this is not a document to author — it is working infrastructure-as-code.

## Content Guide

Depending on the project's deployment tooling, this includes:

- **Infrastructure-as-code** — Terraform, CloudFormation, Pulumi, or similar manifests
- **Container definitions** — Dockerfile, docker-compose.yml
- **CI/CD pipeline definitions** — GitHub Actions workflows, GitLab CI, Jenkins pipelines
- **Environment configuration** — environment variable definitions, config maps, secrets references

Written to the appropriate location for the project's deployment tooling (e.g., `deploy/`, `.github/workflows/`, `infrastructure/`).

## Quality Signals

- No hardcoded secrets — all sensitive values reference secret stores or environment variables
- Pipeline includes plan/preview step before apply/deploy
- Health checks are configured and verified
- Rollback mechanism is defined and tested
- Configuration is environment-agnostic (staging and production use the same templates with different values)
