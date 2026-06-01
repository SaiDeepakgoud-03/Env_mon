# SNS fire-alert IoT Rule

When any device publishes `"fire": 1`, an SNS notification fires
instantly — email, SMS, mobile-push, or anything else SNS supports.

```
ESP32 → MQTT publish (fire=1)
   │
   ▼
AWS IoT Core
   │   (Rule with SQL: WHERE fire = 1)
   ▼
AWS SNS topic   →   email / SMS / Slack-via-webhook / Lambda → PagerDuty / etc.
```

Latency: <2 s from sensor read to your phone buzzing.

## 1. Create the SNS topic

```powershell
$region = "us-east-1"

$topicArn = aws sns create-topic --name EnvironmentFireAlerts --region $region --query "TopicArn" --output text
Write-Host "Topic: $topicArn"
```

## 2. Subscribe yourself

```powershell
# Email — you'll get a confirmation email; click the link
aws sns subscribe --topic-arn $topicArn `
  --protocol email --notification-endpoint you@example.com `
  --region $region

# SMS (US only on the basic tier; or use the SNS Mobile push)
aws sns subscribe --topic-arn $topicArn `
  --protocol sms --notification-endpoint +14155550123 `
  --region $region
```

## 3. Create an IAM role IoT Core can assume to publish to SNS

```powershell
# Trust policy: allow iot.amazonaws.com to assume the role
$trust = @'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "iot.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
'@
$trust | Out-File -Encoding ASCII trust.json

aws iam create-role --role-name IoTToSnsRole `
  --assume-role-policy-document file://trust.json

# Permission: publish to our topic
$perm = @"
{
  `"Version`": `"2012-10-17`",
  `"Statement`": [{
    `"Effect`": `"Allow`",
    `"Action`": `"sns:Publish`",
    `"Resource`": `"$topicArn`"
  }]
}
"@
$perm | Out-File -Encoding ASCII publish.json

aws iam put-role-policy --role-name IoTToSnsRole `
  --policy-name PublishFireAlerts `
  --policy-document file://publish.json
```

## 4. Create the IoT Rule

```powershell
$account = "077463315120"
$roleArn = "arn:aws:iam::${account}:role/IoTToSnsRole"

$rule = @"
{
  `"sql`":  `"SELECT device_id, temperature, humidity, air_quality, timestamp() AS ts FROM 'environment/data' WHERE fire = 1`",
  `"awsIotSqlVersion`": `"2016-03-23`",
  `"description`": `"Fan out fire=1 events to the SNS alerts topic`",
  `"ruleDisabled`": false,
  `"actions`": [{
    `"sns`": {
      `"targetArn`": `"$topicArn`",
      `"roleArn`":   `"$roleArn`",
      `"messageFormat`": `"RAW`"
    }
  }]
}
"@
$rule | Out-File -Encoding ASCII rule.json

aws iot create-topic-rule --rule-name FireAlertNotifier `
  --topic-rule-payload file://rule.json --region $region
```

## 5. Test

Hold a lighter to the flame sensor on any flashed ESP32. Within ~2 s:

```
Subject: AWS Notification Message
Body:    {"device_id":"esp32-env-A1B2C3","temperature":31.2,"humidity":42,"air_quality":61,"ts":1748275299123}
```

Your phone buzzes (if you subscribed SMS), the email arrives, etc.

## 6. Tuning

- **Avoid alert spam**: a single second-long flame produces ~1 message
  per 2 s sample. If you want a single email per "event", swap the
  direct SNS action for a Lambda action that debounces (e.g. one
  alert per device per 5-minute window using DynamoDB conditional
  writes).
- **Different on-call schedules**: subscribe a Slack/Teams webhook
  via an HTTPS endpoint subscription, or chain into PagerDuty.
- **High-fan-out**: SNS scales to millions of subscribers - safe even
  with 1 000 devices firing simultaneously.
