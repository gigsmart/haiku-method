# Auth proxy subdomain → Cloudflare Workers
# The auth proxy handles OAuth code→token exchange for the browse feature.
# Cloudflare Workers custom domains require a proxied CNAME — but since
# DNS is on GCP (not Cloudflare), we CNAME to the workers.dev subdomain
# and configure the custom domain in the Cloudflare Workers dashboard.

resource "google_dns_record_set" "auth" {
  count        = var.enable_auth_proxy_dns ? 1 : 0
  name         = "auth.${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "CNAME"
  ttl          = 300
  rrdatas      = [var.auth_proxy_dns_value]
}
