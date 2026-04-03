# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "dns_nameservers" {
  description = "DNS nameservers for the managed zone"
  value       = module.dns.nameservers
}
