{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["iot:Connect"],
      "Resource": ["arn:aws:iot:${region}:${account_id}:client/$${iot:Connection.Thing.ThingName}"]
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Publish"],
      "Resource": [
        "arn:aws:iot:${region}:${account_id}:topic/env/$${iot:Connection.Thing.ThingName}/telemetry",
        "arn:aws:iot:${region}:${account_id}:topic/env/$${iot:Connection.Thing.ThingName}/status",
        "arn:aws:iot:${region}:${account_id}:topic/env/$${iot:Connection.Thing.ThingName}/alerts",
        "arn:aws:iot:${region}:${account_id}:topic/$aws/things/$${iot:Connection.Thing.ThingName}/shadow/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Subscribe"],
      "Resource": [
        "arn:aws:iot:${region}:${account_id}:topicfilter/env/$${iot:Connection.Thing.ThingName}/ota",
        "arn:aws:iot:${region}:${account_id}:topicfilter/$aws/things/$${iot:Connection.Thing.ThingName}/shadow/*",
        "arn:aws:iot:${region}:${account_id}:topicfilter/$aws/things/$${iot:Connection.Thing.ThingName}/jobs/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Receive"],
      "Resource": [
        "arn:aws:iot:${region}:${account_id}:topic/env/$${iot:Connection.Thing.ThingName}/ota",
        "arn:aws:iot:${region}:${account_id}:topic/$aws/things/$${iot:Connection.Thing.ThingName}/shadow/*",
        "arn:aws:iot:${region}:${account_id}:topic/$aws/things/$${iot:Connection.Thing.ThingName}/jobs/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "iot:DescribeJobExecution",
        "iot:GetPendingJobExecutions",
        "iot:StartNextPendingJobExecution",
        "iot:UpdateJobExecution"
      ],
      "Resource": ["arn:aws:iot:${region}:${account_id}:thing/$${iot:Connection.Thing.ThingName}"]
    }
  ]
}
