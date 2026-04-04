# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "dns_nameservers" {
  description = "DNS nameservers for the managed zone"
  value       = module.dns.nameservers
}

output "auth_proxy_url" {
  description = "URL of the auth proxy Cloud Function"
  value       = var.enable_auth_proxy ? module.auth_proxy[0].function_url : null
}
