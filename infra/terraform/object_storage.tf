# Media bucket: uploaded images/gallery assets. No per-object size cap is
# enforced by Object Storage itself (multipart upload supports objects well
# into the TB range); "no limitation on picture size" is satisfied by not
# imposing an app-level cap either — see docs/ARCHITECTURE.md.
resource "oci_objectstorage_bucket" "media" {
  compartment_id = var.compartment_ocid
  namespace      = var.object_storage_namespace
  name           = var.media_bucket_name
  access_type    = "ObjectRead" # publicly readable images, writes require auth
  versioning     = "Disabled"
  storage_tier   = "Standard"
}

resource "oci_objectstorage_bucket" "backups" {
  compartment_id = var.compartment_ocid
  namespace      = var.object_storage_namespace
  name           = var.backup_bucket_name
  access_type    = "NoPublicAccess"
  versioning     = "Disabled"
  storage_tier   = "Standard"
}

# Auto-expire old DB backups after 30 days to keep Object Storage cost near
# zero (Always Free tier includes 10GB; this keeps you well under it).
resource "oci_objectstorage_object_lifecycle_policy" "backups_lifecycle" {
  namespace = var.object_storage_namespace
  bucket    = oci_objectstorage_bucket.backups.name

  rules {
    name        = "expire-old-backups"
    action      = "DELETE"
    time_amount = 30
    time_unit   = "DAYS"
    is_enabled  = true
    target      = "objects"
    object_name_filter {
      inclusion_prefixes = ["db-backups/"]
    }
  }
}
