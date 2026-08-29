output "instance_public_ip" {
  description = "Public IP of the app VM"
  value       = oci_core_instance.app.public_ip
}

output "media_bucket_name" {
  value = oci_objectstorage_bucket.media.name
}

output "backup_bucket_name" {
  value = oci_objectstorage_bucket.backups.name
}

output "ssh_command" {
  value = "ssh ubuntu@${oci_core_instance.app.public_ip}"
}

output "grafana_tunnel_command" {
  description = "Grafana is bound to 127.0.0.1:3000 on the VM only; tunnel to reach it"
  value       = "ssh -L 3000:localhost:3000 ubuntu@${oci_core_instance.app.public_ip}"
}
