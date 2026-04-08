# Auth proxy subdomain → Load Balancer IP
# The LB fronts the Cloud Run service backing the auth proxy function,
# providing public HTTPS access without requiring allUsers IAM binding.

resource "google_dns_record_set" "auth" {
  count        = var.enable_auth_proxy_dns ? 1 : 0
  name         = "${var.auth_proxy_subdomain}.${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "A"
  ttl          = 300
  rrdatas      = [var.auth_proxy_dns_value]
}
