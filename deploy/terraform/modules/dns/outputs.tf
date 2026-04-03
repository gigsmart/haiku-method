output "nameservers" {
  description = "DNS nameservers for the managed zone"
  value       = google_dns_managed_zone.main.name_servers
}
