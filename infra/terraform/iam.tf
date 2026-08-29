# Instance principal auth: lets the app VM (and code running on it) call
# Object Storage without any static API key stored on disk. The media-upload
# handler and the backup cron job both authenticate this way in production.

resource "oci_identity_dynamic_group" "app_instances" {
  compartment_id = var.tenancy_ocid
  name           = "${var.project_name}-app-instances"
  description    = "Instances running the DumbBrew backend"
  matching_rule  = "ALL {instance.compartment.id = '${var.compartment_ocid}'}"
}

resource "oci_identity_policy" "app_instance_policy" {
  compartment_id = var.compartment_ocid
  name           = "${var.project_name}-app-instance-policy"
  description    = "Allow DumbBrew app instances to read/write their Object Storage buckets"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.app_instances.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${var.media_bucket_name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.app_instances.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${var.backup_bucket_name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.app_instances.name} to read buckets in compartment id ${var.compartment_ocid}"
  ]
}
