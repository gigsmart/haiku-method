terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "waldrip-net-terraform-state"
    prefix = "haiku"
  }
}

provider "google" {
  project = var.gcp_project_id
  # Auth via GOOGLE_APPLICATION_CREDENTIALS env var or gcloud ADC
}
