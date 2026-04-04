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

  # Auth proxy subdomain
  enable_auth_proxy_dns = var.enable_auth_proxy
  auth_proxy_dns_value  = var.enable_auth_proxy ? "${module.auth_proxy[0].function_url}." : ""
}

# -----------------------------------------------------------------------------
# Auth Proxy — Cloud Function for OAuth code→token exchange
# -----------------------------------------------------------------------------

module "auth_proxy" {
  count  = var.enable_auth_proxy ? 1 : 0
  source = "./modules/auth-proxy"

  project_id     = var.gcp_project_id
  region         = var.gcp_region
  allowed_origin = var.auth_proxy_allowed_origin

  github_oauth_client_id     = var.github_oauth_client_id
  github_oauth_client_secret = var.github_oauth_client_secret
  gitlab_oauth_client_id     = var.gitlab_oauth_client_id
  gitlab_oauth_client_secret = var.gitlab_oauth_client_secret
}
