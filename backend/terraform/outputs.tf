output "api_base_url" {
  value = "${aws_apigatewayv2_stage.prod.invoke_url}"
}

output "firmware_bucket" {
  value = aws_s3_bucket.firmware.bucket
}

output "fleet_template_name" {
  value = aws_iot_provisioning_template.fleet.name
}

output "device_policy_name" {
  value = aws_iot_policy.device_policy.name
}

output "iot_endpoint_address" {
  value = var.iot_endpoint_address
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.dashboard.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.dashboard.id
}
