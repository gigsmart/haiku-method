variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for the Cloud Function"
  type        = string
  default     = "us-central1"
}

variable "allowed_origin" {
  description = "CORS allowed origin (e.g., https://haikumethod.ai)"
  type        = string
}

variable "github_oauth_client_id" {
  description = "GitHub OAuth App client ID"
  type        = string
  sensitive   = true
}

variable "github_oauth_client_secret" {
  description = "GitHub OAuth App client secret"
  type        = string
  sensitive   = true
}

variable "gitlab_oauth_client_id" {
  description = "GitLab OAuth App client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gitlab_oauth_client_secret" {
  description = "GitLab OAuth App client secret"
  type        = string
  sensitive   = true
  default     = ""
}
