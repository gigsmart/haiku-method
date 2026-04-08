# -----------------------------------------------------------------------------
# Sentry — projects and DSN keys
# -----------------------------------------------------------------------------

resource "sentry_project" "haiku_mcp" {
  organization = var.sentry_organization
  teams        = []
  name         = "H·AI·K·U MCP"
  slug         = "haiku-mcp"
  platform     = "node"
}

resource "sentry_project" "haiku_spa" {
  organization = var.sentry_organization
  teams        = []
  name         = "H·AI·K·U Review SPA"
  slug         = "haiku-spa"
  platform     = "javascript-react"
}

resource "sentry_project" "haiku_website" {
  organization = var.sentry_organization
  teams        = []
  name         = "H·AI·K·U Website"
  slug         = "haiku-website"
  platform     = "javascript-nextjs"
}

resource "sentry_key" "haiku_mcp" {
  organization = var.sentry_organization
  project      = sentry_project.haiku_mcp.slug
  name         = "MCP Server"
}

resource "sentry_key" "haiku_spa" {
  organization = var.sentry_organization
  project      = sentry_project.haiku_spa.slug
  name         = "Review SPA"
}

resource "sentry_key" "haiku_website" {
  organization = var.sentry_organization
  project      = sentry_project.haiku_website.slug
  name         = "Website"
}

output "sentry_dsn_mcp" {
  description = "Sentry DSN for the MCP server"
  value       = sentry_key.haiku_mcp.dsn_public
  sensitive   = false
}

output "sentry_dsn_spa" {
  description = "Sentry DSN for the review SPA"
  value       = sentry_key.haiku_spa.dsn_public
  sensitive   = false
}

output "sentry_dsn_website" {
  description = "Sentry DSN for the website"
  value       = sentry_key.haiku_website.dsn_public
  sensitive   = false
}
