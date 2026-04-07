terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    # Override via TF init: terraform init -backend-config="bucket=YOUR_BUCKET"
    bucket = "haikumethod-ai-terraform-state"
    prefix = "haiku"
  }
}

provider "google" {
  project = var.gcp_project_id
  # Auth via GOOGLE_APPLICATION_CREDENTIALS env var or gcloud ADC
}
