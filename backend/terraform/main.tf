terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

data "aws_caller_identity" "current" {}

resource "aws_dynamodb_table" "devices" {
  name         = "${local.name_prefix}-devices"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "device_id"

  attribute {
    name = "device_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "locations" {
  name         = "${local.name_prefix}-locations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "device_id"

  attribute {
    name = "device_id"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "status" {
  name         = "${local.name_prefix}-status"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "device_id"

  attribute {
    name = "device_id"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "readings" {
  name         = "${local.name_prefix}-readings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "device_id"
  range_key    = "timestamp"

  attribute {
    name = "device_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "ota_logs" {
  name         = "${local.name_prefix}-ota-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "device_id"
  range_key    = "version"

  attribute {
    name = "device_id"
    type = "S"
  }

  attribute {
    name = "version"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_s3_bucket" "firmware" {
  bucket = "${local.name_prefix}-firmware-${data.aws_caller_identity.current.account_id}"
  tags   = local.common_tags
}

resource "aws_s3_bucket_versioning" "firmware" {
  bucket = aws_s3_bucket.firmware.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "firmware" {
  bucket = aws_s3_bucket.firmware.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "firmware" {
  bucket                  = aws_s3_bucket.firmware.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_role" "lambda_role" {
  name = "${local.name_prefix}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${local.name_prefix}-lambda-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.devices.arn,
          aws_dynamodb_table.locations.arn,
          aws_dynamodb_table.status.arn,
          aws_dynamodb_table.readings.arn,
          aws_dynamodb_table.ota_logs.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iot:CreateJob",
          "iot:DescribeThing",
          "iot:GetThingShadow",
          "iot:UpdateThingShadow",
          "iot:Publish"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.firmware.arn,
          "${aws_s3_bucket.firmware.arn}/*"
        ]
      }
    ]
  })
}

data "archive_file" "api_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../lambda"
  output_path = "${path.module}/build/api-lambda.zip"
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name_prefix}-api"
  role             = aws_iam_role.lambda_role.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.api_lambda_zip.output_path
  source_code_hash = data.archive_file.api_lambda_zip.output_base64sha256
  timeout          = 20
  memory_size      = 256

  environment {
    variables = {
      DEVICES_TABLE     = aws_dynamodb_table.devices.name
      LOCATIONS_TABLE   = aws_dynamodb_table.locations.name
      STATUS_TABLE      = aws_dynamodb_table.status.name
      READINGS_TABLE    = aws_dynamodb_table.readings.name
      OTA_TABLE         = aws_dynamodb_table.ota_logs.name
      FIRMWARE_BUCKET   = aws_s3_bucket.firmware.bucket
      AWS_ACCOUNT_ID    = data.aws_caller_identity.current.account_id
      ACTIVE_WINDOW_MS  = "15000"
      CORS_ORIGINS      = join(",", var.allowed_dashboard_origins)
    }
  }

  tags = local.common_tags
}

resource "aws_cognito_user_pool" "dashboard" {
  name = "${local.name_prefix}-dashboard-users"

  password_policy {
    minimum_length    = 10
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  auto_verified_attributes = ["email"]
  tags                     = local.common_tags
}

resource "aws_cognito_user_pool_client" "dashboard" {
  name         = "${local.name_prefix}-dashboard-client"
  user_pool_id = aws_cognito_user_pool.dashboard.id

  generate_secret                      = false
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows_user_pool_client = false
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_dashboard_origins
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "routes" {
  for_each = toset([
    "GET /devices",
    "GET /devices/{device_id}",
    "PATCH /devices/{device_id}",
    "DELETE /devices/{device_id}",
    "POST /devices/register",
    "POST /sensor-data",
    "GET /analytics",
    "GET /app/dashboard",
    "GET /ota",
    "POST /ota",
    "GET /shadow/{device_id}"
  ])

  api_id    = aws_apigatewayv2_api.http.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "prod"
  auto_deploy = true

  tags = local.common_tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_iot_policy" "device_policy" {
  name = "${local.name_prefix}-device-policy"

  policy = templatefile("${path.module}/../iot/device-policy.json.tpl", {
    region     = var.aws_region
    account_id = data.aws_caller_identity.current.account_id
  })
}

resource "aws_iot_thing_type" "environment_monitor" {
  name = "${local.name_prefix}-device"

  properties {
    description = "Industrial environment monitor ESP32 device"
  }

  tags = local.common_tags
}

resource "aws_iot_provisioning_template" "fleet" {
  name                  = "envmon-${var.environment}-fleet"
  enabled               = true
  provisioning_role_arn = aws_iam_role.iot_provisioning_role.arn
  template_body = templatefile("${path.module}/../iot/fleet-provisioning-template.json.tpl", {
    device_policy_name = aws_iot_policy.device_policy.name
    thing_type_name    = aws_iot_thing_type.environment_monitor.name
  })

  tags = local.common_tags
}

resource "aws_iam_role" "iot_provisioning_role" {
  name = "${local.name_prefix}-iot-provisioning-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "iot.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "iot_provisioning_policy" {
  name = "${local.name_prefix}-iot-provisioning-policy"
  role = aws_iam_role.iot_provisioning_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "iot:CreateThing",
        "iot:DescribeThing",
        "iot:DescribeThingGroup",
        "iot:DescribeThingType",
        "iot:GetPolicy",
        "iot:CreatePolicy",
        "iot:AttachPolicy",
        "iot:AttachPrincipalPolicy",
        "iot:AttachThingPrincipal",
        "iot:DetachPolicy",
        "iot:DetachThingPrincipal",
        "iot:AddThingToThingGroup",
        "iot:ListAttachedPolicies",
        "iot:ListPolicyPrincipals",
        "iot:ListPrincipalPolicies",
        "iot:ListPrincipalThings",
        "iot:ListTargetsForPolicy",
        "iot:ListThingGroupsForThing",
        "iot:ListThingPrincipals",
        "iot:DescribeCertificate",
        "iot:RegisterCertificate",
        "iot:RegisterThing",
        "iot:RemoveThingFromThingGroup",
        "iot:CreateCertificateFromCsr",
        "iot:UpdateCertificate",
        "iot:UpdateThing",
        "iot:UpdateThingGroupsForThing"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "iot_things_registration" {
  role       = aws_iam_role.iot_provisioning_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSIoTThingsRegistration"
}

resource "aws_iot_topic_rule" "telemetry_to_lambda" {
  name        = replace("${local.name_prefix}-telemetry-to-lambda", "-", "_")
  enabled     = true
  sql         = "SELECT *, topic(2) AS device_id FROM 'env/+/telemetry'"
  sql_version = "2016-03-23"

  lambda {
    function_arn = aws_lambda_function.api.arn
  }

  tags = local.common_tags
}

resource "aws_lambda_permission" "iot_rule" {
  statement_id  = "AllowIotRuleInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "iot.amazonaws.com"
  source_arn    = aws_iot_topic_rule.telemetry_to_lambda.arn
}
