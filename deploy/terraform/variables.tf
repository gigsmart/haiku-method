# -----------------------------------------------------------------------------
# GCP DNS Configuration
# -----------------------------------------------------------------------------

variable "gcp_project_id" {
  description = "GCP project ID for Cloud DNS"
  type        = string
}

variable "gcp_dns_zone_name" {
  description = "Name of the Cloud DNS managed zone"
  type        = string
  default     = "haikumethod-ai"
}

variable "domain" {
  description = "Base domain"
  type        = string
  default     = "haikumethod.ai"
}

# -----------------------------------------------------------------------------
# Auth Proxy (optional — disabled by default)
# -----------------------------------------------------------------------------

variable "enable_auth_proxy" {
  description = "Whether to deploy the auth proxy Cloud Function and DNS"
  type        = bool
  default     = false
}

variable "gcp_region" {
  description = "GCP region for Cloud Functions"
  type        = string
  default     = "us-central1"
}

variable "auth_proxy_subdomain" {
  description = "Subdomain prefix for auth proxy DNS (e.g., 'auth' or 'haiku-auth')"
  type        = string
  default     = "auth"
}

variable "auth_proxy_allowed_origin" {
  description = "CORS allowed origin for the auth proxy (e.g., https://haikumethod.ai)"
  type        = string
  default     = "https://haikumethod.ai"
}

variable "github_oauth_client_id" {
  description = "GitHub OAuth App client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_oauth_client_secret" {
  description = "GitHub OAuth App client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gitlab_oauth_client_id" {
  description = "GitLab OAuth App client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gitlab_oauth_client_secret" {
  description = "GitLab OAuth App client secret"
  type        = string
  sensitive   = true
  default     = ""
}

# -----------------------------------------------------------------------------
# Sentry
# -----------------------------------------------------------------------------

variable "sentry_base_url" {
  description = "Sentry API base URL. Defaults to SaaS; override for self-hosted."
  type        = string
  default     = "https://sentry.io/api/"
}

variable "sentry_organization" {
  description = "Sentry organization slug"
  type        = string
  default     = "gigsmart"
}
