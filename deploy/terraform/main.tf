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

  # Auth proxy subdomain — points to LB IP as A record
  enable_auth_proxy_dns  = var.enable_auth_proxy
  auth_proxy_subdomain   = var.auth_proxy_subdomain
  auth_proxy_dns_value   = var.enable_auth_proxy ? module.auth_proxy[0].lb_ip : ""
}

# -----------------------------------------------------------------------------
# Auth Proxy — Cloud Function for OAuth code→token exchange
# -----------------------------------------------------------------------------

module "auth_proxy" {
  count  = var.enable_auth_proxy ? 1 : 0
  source = "./modules/auth-proxy"

  project_id     = var.gcp_project_id
  region         = var.gcp_region
  domain         = var.domain
  allowed_origin = var.auth_proxy_allowed_origin

  github_oauth_client_id     = var.github_oauth_client_id
  github_oauth_client_secret = var.github_oauth_client_secret
  gitlab_oauth_client_id     = var.gitlab_oauth_client_id
  gitlab_oauth_client_secret = var.gitlab_oauth_client_secret
}
