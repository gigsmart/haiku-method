output "function_url" {
  description = "The URL of the deployed Cloud Function (internal)"
  value       = google_cloudfunctions2_function.auth_proxy.url
}

output "lb_ip" {
  description = "The load balancer IP address for the auth proxy"
  value       = google_compute_address.auth_proxy.address
}
