variable "tenancy_ocid" {
  description = "OCID of your OCI tenancy"
  type        = string
}

variable "user_ocid" {
  description = "OCID of the OCI user Terraform authenticates as"
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint of the API signing key uploaded for this user"
  type        = string
}

variable "private_key_path" {
  description = "Local path to the API signing private key (never commit this file)"
  type        = string
}

variable "region" {
  description = "OCI region, e.g. us-ashburn-1"
  type        = string
}

variable "compartment_ocid" {
  description = "OCID of the compartment to create resources in"
  type        = string
}

variable "project_name" {
  description = "Short name used to prefix/tag all resources"
  type        = string
  default     = "dumbbrew"
}

variable "ssh_public_key" {
  description = "Public key (contents) used to SSH into the compute instance"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to reach the instance on port 22. Restrict this to your own IP/32 in production."
  type        = string
  default     = "0.0.0.0/0"
}

variable "instance_ocpus" {
  description = "OCPUs for the Always Free Ampere A1 Flex shape (free tier allows up to 4 total across all A1 instances)"
  type        = number
  default     = 4
}

variable "instance_memory_gbs" {
  description = "Memory (GB) for the Always Free Ampere A1 Flex shape (free tier allows up to 24GB total)"
  type        = number
  default     = 24
}

variable "boot_volume_size_gbs" {
  description = "Boot volume size in GB (Always Free covers up to 200GB total across boot volumes)"
  type        = number
  default     = 100
}

variable "object_storage_namespace" {
  description = "OCI Object Storage namespace for this tenancy (run `oci os ns get` to find it)"
  type        = string
}

variable "media_bucket_name" {
  description = "Object Storage bucket name for uploaded images/media"
  type        = string
  default     = "dumbbrew-media"
}

variable "backup_bucket_name" {
  description = "Object Storage bucket name for database backups"
  type        = string
  default     = "dumbbrew-db-backups"
}

variable "git_repo_url" {
  description = "Git URL cloud-init will pull the backend/ directory from on first boot"
  type        = string
}

variable "git_branch" {
  description = "Branch to deploy on first boot"
  type        = string
  default     = "main"
}

variable "github_connection_id" {
  description = "OCID of the OCI DevOps GitHub connection (create once via Console/CLI, see infra/terraform/devops.tf comment)"
  type        = string
  default     = ""
}
