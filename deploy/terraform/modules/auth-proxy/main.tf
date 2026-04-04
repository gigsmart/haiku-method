# Auth proxy Cloud Function — OAuth code→token exchange
# Deployed as Cloud Functions v2 (Cloud Run backed)

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

# Cloud Function v2
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
    min_instance_count = 0
    max_instance_count = 5
    available_memory   = "256M"
    timeout_seconds    = 30

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

# Allow unauthenticated access (public OAuth endpoint)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloudfunctions2_function.auth_proxy.service_config[0].service
  role     = "roles/run.invoker"
  member   = "allUsers"
}
