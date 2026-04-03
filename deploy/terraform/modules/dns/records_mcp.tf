# MCP subdomain (mcp.haikumethod.ai)
resource "google_dns_record_set" "mcp" {
  count        = var.enable_mcp_dns ? 1 : 0
  name         = "mcp.${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "CNAME"
  ttl          = 300
  rrdatas      = ["${var.mcp_dns_value}."]
}

# Domain verification for mcp.haikumethod.ai
resource "google_dns_record_set" "mcp_verify" {
  count        = var.enable_mcp_dns && var.mcp_verify_txt != "" ? 1 : 0
  name         = "_railway-verify.mcp.${var.domain}."
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  type         = "TXT"
  ttl          = 300
  rrdatas      = ["\"${var.mcp_verify_txt}\""]
}
