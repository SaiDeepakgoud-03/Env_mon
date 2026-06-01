# Lambda function — Environment Monitor

This single Lambda backs **both** writes and reads for the dashboard:

| Method | Source                              | Behaviour                                    |
| ------ | ----------------------------------- | -------------------------------------------- |
| POST   | ESP32 (HTTPS) **or** IoT Rule       | Insert reading into DynamoDB                 |
| GET    | Dashboard                           | Return latest N readings (default 50)        |
| OPTIONS| Browser CORS preflight              | Returns CORS headers                         |

## Environment variables

| Name                | Default                     | Purpose                                |
| ------------------- | --------------------------- | -------------------------------------- |
| `TABLE_NAME`        | `EnvironmentReadings`       | DynamoDB table name                    |
| `DEFAULT_DEVICE_ID` | `esp32-env-monitor-01`      | Used when payload omits `device_id`    |
| `MAX_HISTORY`       | `50`                        | Default number of rows GET returns     |
| `TTL_DAYS`          | `30`                        | Per-item TTL (auto-prune old readings) |

## IAM permissions

Attach the AWS-managed `AWSLambdaBasicExecutionRole` **plus** the following
inline policy (`EnvironmentReadingsRW`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/EnvironmentReadings"
    }
  ]
}
```

## Local test event (POST)

```json
{
  "body": "{\"temperature\":27.3,\"humidity\":61.2,\"air_quality\":182,\"fire\":0}"
}
```

## Local test event (GET)

```json
{
  "httpMethod": "GET",
  "queryStringParameters": { "limit": "10" }
}
```

## Packaging

Lambda's Python 3.12 runtime already ships with `boto3`, so the
deployment package is just `lambda_function.py`:

```bash
zip lambda.zip lambda_function.py
aws lambda update-function-code \
    --function-name EnvironmentMonitor \
    --zip-file fileb://lambda.zip
```
