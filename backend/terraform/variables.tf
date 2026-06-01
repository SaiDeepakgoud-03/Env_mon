variable "project_name" {
  description = "Short project prefix used for AWS resource names."
  type        = string
  default     = "environment-monitor"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "iot_endpoint_address" {
  description = "AWS IoT data ATS endpoint, for outputs/documentation only."
  type        = string
  default     = ""
}

variable "allowed_dashboard_origins" {
  description = "CORS origins for the dashboard."
  type        = list(string)
  default     = ["http://localhost:5173"]
}
