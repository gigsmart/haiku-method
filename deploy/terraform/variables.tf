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
# MCP Subdomain (optional — disabled by default)
# -----------------------------------------------------------------------------

variable "enable_mcp_dns" {
  description = "Whether to create MCP subdomain DNS records"
  type        = bool
  default     = false
}

variable "mcp_dns_value" {
  description = "DNS target for MCP subdomain CNAME (e.g., Railway DNS value)"
  type        = string
  default     = ""
}

variable "mcp_domain_verify_txt" {
  description = "Domain verification TXT value for MCP subdomain"
  type        = string
  default     = ""
}
