# Auth proxy — OAuth code→token exchange
# Cloud Function v2 behind a regional HTTPS Load Balancer for public access
# without requiring allUsers IAM binding (respects org domain restrictions)

locals {
  function_name = "haiku-auth-proxy"
  source_dir    = "${path.module}/../../../auth-proxy"
}

# Archive the function source for upload
data "archive_file" "source" {
  type        = "zip"
  source_dir  = local.source_dir
  output_path = "${path.module}/.tmp/auth-proxy-source.zip"
  excludes    = ["node_modules", "dist", ".tmp"]
}

# GCS bucket for function source
resource "google_storage_bucket" "source" {
  name                        = "${var.project_id}-auth-proxy-source"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
}

# Upload source zip
resource "google_storage_bucket_object" "source" {
  name   = "auth-proxy-${data.archive_file.source.output_md5}.zip"
  bucket = google_storage_bucket.source.name
  source = data.archive_file.source.output_path
}

# Secret Manager — OAuth credentials
resource "google_secret_manager_secret" "github_client_id" {
  secret_id = "haiku-github-oauth-client-id"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "github_client_id" {
  secret      = google_secret_manager_secret.github_client_id.id
  secret_data = var.github_oauth_client_id
}

resource "google_secret_manager_secret" "github_client_secret" {
  secret_id = "haiku-github-oauth-client-secret"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "github_client_secret" {
  secret      = google_secret_manager_secret.github_client_secret.id
  secret_data = var.github_oauth_client_secret
}

resource "google_secret_manager_secret" "gitlab_client_id" {
  secret_id = "haiku-gitlab-oauth-client-id"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "gitlab_client_id" {
  secret      = google_secret_manager_secret.gitlab_client_id.id
  secret_data = var.gitlab_oauth_client_id
}

resource "google_secret_manager_secret" "gitlab_client_secret" {
  secret_id = "haiku-gitlab-oauth-client-secret"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "gitlab_client_secret" {
  secret      = google_secret_manager_secret.gitlab_client_secret.id
  secret_data = var.gitlab_oauth_client_secret
}

# Cloud Function v2 (internal — not directly public)
resource "google_cloudfunctions2_function" "auth_proxy" {
  name     = local.function_name
  project  = var.project_id
  location = var.region

  build_config {
    runtime     = "nodejs22"
    entry_point = "authProxy"
    source {
      storage_source {
        bucket = google_storage_bucket.source.name
        object = google_storage_bucket_object.source.name
      }
    }
  }

  service_config {
    min_instance_count             = 0
    max_instance_count             = 5
    available_memory               = "256M"
    timeout_seconds                = 30
    ingress_settings               = "ALLOW_ALL"
    all_traffic_on_latest_revision = true

    environment_variables = {
      ALLOWED_ORIGIN = var.allowed_origin
    }

    secret_environment_variables {
      key        = "HAIKU_GITHUB_OAUTH_CLIENT_ID"
      project_id = var.project_id
      secret     = google_secret_manager_secret.github_client_id.secret_id
      version    = "latest"
    }

    secret_environment_variables {
      key        = "HAIKU_GITHUB_OAUTH_CLIENT_SECRET"
      project_id = var.project_id
      secret     = google_secret_manager_secret.github_client_secret.secret_id
      version    = "latest"
    }

    secret_environment_variables {
      key        = "HAIKU_GITLAB_OAUTH_CLIENT_ID"
      project_id = var.project_id
      secret     = google_secret_manager_secret.gitlab_client_id.secret_id
      version    = "latest"
    }

    secret_environment_variables {
      key        = "HAIKU_GITLAB_OAUTH_CLIENT_SECRET"
      project_id = var.project_id
      secret     = google_secret_manager_secret.gitlab_client_secret.secret_id
      version    = "latest"
    }
  }
}

# NOTE: The compute service account (xxx-compute@developer.gserviceaccount.com)
# needs roles/secretmanager.secretAccessor granted manually — our Terraform SA
# doesn't have projectIamAdmin permissions.

# ---------------------------------------------------------------------------
# Regional HTTPS Load Balancer — provides public access without allUsers IAM
# ---------------------------------------------------------------------------

# Proxy-only subnet required by regional EXTERNAL_MANAGED LBs
resource "google_compute_subnetwork" "proxy_only" {
  name          = "haiku-proxy-only-subnet"
  project       = var.project_id
  region        = var.region
  network       = "default"
  ip_cidr_range = "10.129.0.0/23"
  purpose       = "REGIONAL_MANAGED_PROXY"
  role          = "ACTIVE"
}

# Reserve a static IP for the load balancer
resource "google_compute_address" "auth_proxy" {
  name    = "haiku-auth-proxy-ip"
  project = var.project_id
  region  = var.region
}

# Serverless NEG pointing to the Cloud Run service backing the function
resource "google_compute_region_network_endpoint_group" "auth_proxy" {
  name                  = "haiku-auth-proxy-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = local.function_name
  }
}

# Backend service
resource "google_compute_region_backend_service" "auth_proxy" {
  name                  = "haiku-auth-proxy-backend"
  project               = var.project_id
  region                = var.region
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group           = google_compute_region_network_endpoint_group.auth_proxy.id
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }
}

# URL map
resource "google_compute_region_url_map" "auth_proxy" {
  name            = "haiku-auth-proxy-urlmap"
  project         = var.project_id
  region          = var.region
  default_service = google_compute_region_backend_service.auth_proxy.id
}

# Google-managed SSL certificate
resource "google_compute_region_ssl_certificate" "auth_proxy" {
  name    = "haiku-auth-proxy-cert"
  project = var.project_id
  region  = var.region

  # Self-signed placeholder — use managed cert via google_certificate_manager_certificate for production
  # For now, traffic goes through the LB IP directly; DNS CNAME handles the domain
  certificate = tls_self_signed_cert.auth_proxy.cert_pem
  private_key = tls_private_key.auth_proxy.private_key_pem
}

resource "tls_private_key" "auth_proxy" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "auth_proxy" {
  private_key_pem = tls_private_key.auth_proxy.private_key_pem
  subject {
    common_name = "auth.${var.domain}"
  }
  validity_period_hours = 8760
  allowed_uses          = ["key_encipherment", "digital_signature", "server_auth"]
}

# HTTPS proxy
resource "google_compute_region_target_https_proxy" "auth_proxy" {
  name             = "haiku-auth-proxy-https"
  project          = var.project_id
  region           = var.region
  url_map          = google_compute_region_url_map.auth_proxy.id
  ssl_certificates = [google_compute_region_ssl_certificate.auth_proxy.id]
}

# Forwarding rule
resource "google_compute_forwarding_rule" "auth_proxy" {
  name                  = "haiku-auth-proxy-fwd"
  project               = var.project_id
  region                = var.region
  ip_address            = google_compute_address.auth_proxy.address
  ip_protocol           = "TCP"
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_region_target_https_proxy.auth_proxy.id
}
