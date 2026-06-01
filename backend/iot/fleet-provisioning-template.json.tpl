{
  "Parameters": {
    "ThingName": { "Type": "String" },
    "SerialNumber": { "Type": "String" },
    "DeviceId": { "Type": "String" }
  },
  "Resources": {
    "thing": {
      "Type": "AWS::IoT::Thing",
      "Properties": {
        "ThingName": { "Ref": "ThingName" },
        "ThingTypeName": "${thing_type_name}",
        "AttributePayload": {
          "device_id": { "Ref": "DeviceId" },
          "serial_number": { "Ref": "SerialNumber" }
        }
      }
    },
    "certificate": {
      "Type": "AWS::IoT::Certificate",
      "Properties": {
        "CertificateId": { "Ref": "AWS::IoT::Certificate::Id" },
        "Status": "ACTIVE"
      }
    },
    "policy": {
      "Type": "AWS::IoT::Policy",
      "Properties": {
        "PolicyName": "${device_policy_name}"
      }
    }
  }
}
