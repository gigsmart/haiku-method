variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "zone_name" {
  description = "Name of the Cloud DNS managed zone"
  type        = string
}

variable "domain" {
  description = "Domain name (e.g., haikumethod.ai)"
  type        = string
}

# GitHub Pages
variable "enable_github_pages_dns" {
  description = "Whether to create GitHub Pages DNS records for apex domain"
  type        = bool
  default     = false
}

# Auth proxy subdomain
variable "enable_auth_proxy_dns" {
  description = "Whether to create auth proxy subdomain DNS records"
  type        = bool
  default     = false
}

variable "auth_proxy_subdomain" {
  description = "Subdomain prefix for auth proxy (e.g., 'auth' → auth.domain, 'haiku-auth' → haiku-auth.domain)"
  type        = string
  default     = "auth"
}

variable "auth_proxy_dns_value" {
  description = "DNS CNAME target for auth proxy subdomain (e.g., haiku-auth-proxy.your-account.workers.dev.)"
  type        = string
  default     = ""
}
