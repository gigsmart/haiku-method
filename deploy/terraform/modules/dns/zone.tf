# Create and manage the DNS zone
resource "google_dns_managed_zone" "main" {
  name        = var.zone_name
  dns_name    = "${var.domain}."
  project     = var.project_id
  description = "DNS zone for ${var.domain}"
}
