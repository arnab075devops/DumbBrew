terraform {
  required_version = ">= 1.6.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.40"
    }
  }

  # Remote state in an OCI Object Storage bucket (S3-compatible endpoint) keeps
  # state off this laptop and out of git. Create the bucket + a customer secret
  # key once by hand (or via the bootstrap steps in infra/terraform/README.md),
  # then uncomment this block and fill in the values.
  #
  # backend "s3" {
  #   bucket                      = "dumbbrew-tfstate"
  #   key                         = "dumbbrew/terraform.tfstate"
  #   region                      = "us-ashburn-1"
  #   endpoint                    = "https://<namespace>.compat.objectstorage.us-ashburn-1.oraclecloud.com"
  #   skip_region_validation      = true
  #   skip_credentials_validation = true
  #   skip_metadata_api_check     = true
  #   force_path_style            = true
  # }
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}
