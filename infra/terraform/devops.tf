# OCI DevOps project: build pipeline (test + build + push to OCIR) and
# deploy pipeline (rolling deploy to the app VM via the deploy agent).
#
# One piece is deliberately NOT here: the GitHub connection. Creating it
# requires a one-time OAuth grant / personal access token exchange that OCI
# intentionally keeps as a console (or `oci devops connection create`) action
# rather than something Terraform can do non-interactively with a token in
# tfvars. Create it once (Console: Developer Services → DevOps → Connections),
# then pass its OCID in as var.github_connection_id.

resource "oci_devops_project" "main" {
  compartment_id = var.compartment_ocid
  name           = "${var.project_name}-project"
  description    = "DumbBrew backend build & deploy"
}

resource "oci_artifacts_container_repository" "auth_service" {
  compartment_id = var.compartment_ocid
  display_name   = "dumbbrew/auth-service"
  is_public       = false
}

resource "oci_artifacts_container_repository" "content_service" {
  compartment_id = var.compartment_ocid
  display_name   = "dumbbrew/content-service"
  is_public       = false
}

resource "oci_artifacts_container_repository" "gateway" {
  compartment_id = var.compartment_ocid
  display_name   = "dumbbrew/gateway"
  is_public       = false
}

resource "oci_devops_build_pipeline" "main" {
  compartment_id = var.compartment_ocid
  project_id     = oci_devops_project.main.id
  display_name   = "${var.project_name}-build"
}

resource "oci_devops_build_pipeline_stage" "build_stage" {
  build_pipeline_id     = oci_devops_build_pipeline.main.id
  display_name          = "${var.project_name}-build-stage"
  build_pipeline_stage_type = "BUILD"
  build_spec_file        = "infra/devops-pipelines/build_spec.yaml"
  image                   = "OL7_X86_64_STANDARD_10"

  build_source_collection {
    items {
      name              = "dumbbrew-source"
      connection_type   = "GITHUB"
      connection_id     = var.github_connection_id
      repository_url    = var.git_repo_url
      branch            = var.git_branch
    }
  }
}

resource "oci_devops_deploy_pipeline" "main" {
  compartment_id = var.compartment_ocid
  project_id     = oci_devops_project.main.id
  display_name   = "${var.project_name}-deploy"
}

# Static compute-instance target: the single Always Free VM. If you ever
# outgrow one instance, swap this for a real instance group and switch the
# deploy stage type to a rolling deployment across it.
resource "oci_devops_deploy_environment" "app_vm" {
  compartment_id           = var.compartment_ocid
  project_id                = oci_devops_project.main.id
  display_name               = "${var.project_name}-app-vm"
  deploy_environment_type   = "COMPUTE_INSTANCE_GROUP"

  compute_instance_group_selectors {
    items {
      selector_type = "INSTANCE_IDS"
      compute_instance_ids = [oci_core_instance.app.id]
    }
  }
}

resource "oci_devops_deploy_stage" "deploy_to_vm" {
  deploy_pipeline_id  = oci_devops_deploy_pipeline.main.id
  display_name        = "${var.project_name}-deploy-to-vm"
  deploy_stage_type   = "COMPUTE_INSTANCE_GROUP_ROLLING_DEPLOYMENT"

  compute_instance_group_deploy_environment_id = oci_devops_deploy_environment.app_vm.id
  deployment_spec_deploy_artifact_id            = "deploy_manifest"

  rolling_deploy_strategy {
    batch_count             = 1
    batch_delay_in_seconds  = 0
    batch_percentage        = 100
    ramp_limit_percent      = 0
  }
}

output "devops_console_note" {
  value = "After apply: create the GitHub connection in Console → DevOps → Connections, pass its OCID as github_connection_id, then re-apply to wire the build stage source."
}
