# GitHub Pages A records for apex domain (haikumethod.ai)
# https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
resource "google_dns_record_set" "apex" {
  count        = var.enable_github_pages_dns ? 1 : 0
  name         = "${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "A"
  ttl          = 300
  rrdatas = [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ]
}

# GitHub Pages AAAA records for apex domain (IPv6)
resource "google_dns_record_set" "apex_ipv6" {
  count        = var.enable_github_pages_dns ? 1 : 0
  name         = "${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "AAAA"
  ttl          = 300
  rrdatas = [
    "2606:50c0:8000::153",
    "2606:50c0:8001::153",
    "2606:50c0:8002::153",
    "2606:50c0:8003::153",
  ]
}

# www subdomain → GitHub Pages
resource "google_dns_record_set" "www" {
  count        = var.enable_github_pages_dns ? 1 : 0
  name         = "www.${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "CNAME"
  ttl          = 300
  rrdatas      = ["thebushidocollective.github.io."]
}
