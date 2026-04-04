# Auth proxy subdomain → GCP Cloud Function (Cloud Run)
# The auth proxy handles OAuth code→token exchange for the browse feature.
# Cloud Run provides a *.run.app URL; we CNAME auth.domain to it.

resource "google_dns_record_set" "auth" {
  count        = var.enable_auth_proxy_dns ? 1 : 0
  name         = "auth.${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "CNAME"
  ttl          = 300
  rrdatas      = [var.auth_proxy_dns_value]
}
