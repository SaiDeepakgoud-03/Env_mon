# AWS IoT Core setup

Goal: a Thing + certificate + policy that lets the ESP32 publish to
`environment/data` over mTLS at:

```
mqtts://a2aazipzc1zlp2-ats.iot.us-east-1.amazonaws.com:8883
```

## 1. Find your IoT endpoint (sanity check)

```bash
aws iot describe-endpoint --endpoint-type iot:Data-ATS --region us-east-1
# {
#     "endpointAddress": "a2aazipzc1zlp2-ats.iot.us-east-1.amazonaws.com"
# }
```

That hostname is hard-coded as `AWS_ENDPOINT_URI` in `main/main.c`.

## 2. Create the Thing

```bash
aws iot create-thing --thing-name esp32-env-monitor-01 --region us-east-1
```

## 3. Create the device certificate (do this once)

```bash
aws iot create-keys-and-certificate \
    --set-as-active \
    --certificate-pem-outfile   device.pem.crt \
    --public-key-outfile        public.pem.key \
    --private-key-outfile       private.pem.key \
    --region us-east-1
```

Output gives you a `certificateArn` you will need below.

Also download the Amazon Root CA 1:

```bash
curl -s https://www.amazontrust.com/repository/AmazonRootCA1.pem \
     -o AmazonRootCA1.pem
```

Drop all three files in `main/`:

```
main/
├── AmazonRootCA1.pem
├── device.pem.crt
└── private.pem.key
```

They are picked up by `EMBED_TXTFILES` in `main/CMakeLists.txt`.

## 4. Create and attach the IoT policy

```bash
aws iot create-policy \
    --policy-name EnvironmentMonitorPolicy \
    --policy-document file://iot_policy.json \
    --region us-east-1

# Attach policy to the certificate
aws iot attach-policy \
    --policy-name EnvironmentMonitorPolicy \
    --target "<certificateArn from step 3>" \
    --region us-east-1

# Attach certificate to the Thing
aws iot attach-thing-principal \
    --thing-name esp32-env-monitor-01 \
    --principal  "<certificateArn from step 3>" \
    --region us-east-1
```

## 5. Test from the AWS console

* IoT Core → Test → MQTT test client
* Subscribe to `environment/data`
* Flash the firmware → you should see JSON arriving every 5 s.

## 6. (Optional but recommended) IoT Rule → Lambda

If you would rather the cloud (not the device) write to DynamoDB,
create a rule that forwards every MQTT message to your Lambda. See
`iot_rule_to_lambda.json` and:

```bash
# 1) Allow IoT to invoke the Lambda
aws lambda add-permission \
    --function-name EnvironmentMonitor \
    --statement-id  iot-invoke \
    --action        lambda:InvokeFunction \
    --principal     iot.amazonaws.com \
    --source-arn    "arn:aws:iot:us-east-1:<ACCOUNT>:rule/EnvironmentDataToLambda" \
    --region us-east-1

# 2) Create the rule
aws iot create-topic-rule \
    --rule-name EnvironmentDataToLambda \
    --topic-rule-payload file://iot_rule_to_lambda.json \
    --region us-east-1
```

With the rule in place, the ESP32 only needs to publish via MQTT — the
HTTPS POST path becomes optional belt-and-braces redundancy.
