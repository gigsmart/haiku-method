output "function_url" {
  description = "The URL of the deployed Cloud Function (internal)"
  value       = google_cloudfunctions2_function.auth_proxy.url
}

output "lb_ip" {
  description = "The load balancer IP address for the auth proxy"
  value       = google_compute_address.auth_proxy.address
}

output "dns_auth_record" {
  description = "CNAME record needed for certificate DNS authorization"
  value = {
    name = google_certificate_manager_dns_authorization.auth_proxy.dns_resource_record[0].name
    data = google_certificate_manager_dns_authorization.auth_proxy.dns_resource_record[0].data
  }
}
