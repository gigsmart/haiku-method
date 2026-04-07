terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    # Bucket is injected at init time via -backend-config
    # See deploy-auth-proxy.yml workflow
  }
}

provider "google" {
  project = var.gcp_project_id
  # Auth via GOOGLE_APPLICATION_CREDENTIALS env var or gcloud ADC
}
