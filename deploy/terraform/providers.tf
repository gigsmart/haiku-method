terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    sentry = {
      source  = "jianyuan/sentry"
      version = "~> 0.14"
    }

  }

  backend "gcs" {
    bucket = "gigsmart-oss-terraform-state"
    prefix = "haiku"
  }
}

provider "google" {
  project = var.gcp_project_id
  # Auth via GOOGLE_APPLICATION_CREDENTIALS env var or gcloud ADC
}

provider "sentry" {
  base_url = var.sentry_base_url
  # Token via SENTRY_AUTH_TOKEN env var
}
