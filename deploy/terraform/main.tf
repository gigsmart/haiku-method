# -----------------------------------------------------------------------------
# AI-DLC - GCP Cloud DNS for haikumethod.ai
# -----------------------------------------------------------------------------

module "dns" {
  source = "./modules/dns"

  project_id = var.gcp_project_id
  zone_name  = var.gcp_dns_zone_name
  domain     = var.domain

  # GitHub Pages for apex domain (static website)
  enable_github_pages_dns = true

  # MCP subdomain (off by default — no service exists yet)
  enable_mcp_dns = var.enable_mcp_dns
  mcp_dns_value  = var.mcp_dns_value
  mcp_verify_txt = var.mcp_domain_verify_txt

  # Auth proxy subdomain → Cloudflare Workers
  enable_auth_proxy_dns = var.enable_auth_proxy_dns
  auth_proxy_dns_value  = var.auth_proxy_dns_value
}
