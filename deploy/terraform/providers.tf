terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Terraform Cloud for remote state and VCS-triggered runs
  cloud {
    organization = "bushido-collective"

    workspaces {
      name = "ai-dlc"
    }
  }
}

provider "google" {
  # Credentials via GOOGLE_CREDENTIALS or Workload Identity
  # Project set via variable
}
