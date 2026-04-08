# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "dns_nameservers" {
  description = "DNS nameservers for the managed zone"
  value       = module.dns.nameservers
}

output "auth_proxy_url" {
  description = "Public URL of the auth proxy (via load balancer)"
  value       = var.enable_auth_proxy ? "https://${var.auth_proxy_subdomain}.${var.domain}" : null
}
