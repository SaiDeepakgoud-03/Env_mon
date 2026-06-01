# Debugging

## Captive Portal Does Not Open

- Open `http://192.168.4.1` manually.
- Confirm the device hotspot is `EnvMon-Setup-XXXX`.
- Forget the network and reconnect if the phone keeps mobile data active.

## Wi-Fi Connect Fails

- ESP32 supports 2.4 GHz Wi-Fi only.
- Hold BOOT for more than five seconds during reset to erase saved credentials.
- Check serial logs for `WIFI` retry messages.

## Fleet Provisioning Fails

- Confirm `claim.pem.crt` and `claim.private.pem.key` are real AWS IoT claim credentials.
- Confirm the claim policy allows `$aws/certificates/create/*` and `$aws/provisioning-templates/<template>/provision/*`.
- Confirm the template name in `main/fleet_provisioning.c` matches the Terraform output.
- Confirm the IoT endpoint in firmware matches `aws iot describe-endpoint --endpoint-type iot:Data-ATS`.

## MQTT Connect Fails

- Verify the device has a permanent certificate stored in NVS.
- Verify the IoT policy is attached and scoped to the Thing name.
- Check CloudWatch IoT logs and AWS IoT Core test client.

## Dashboard Is Empty

- Local dashboard uses mocks unless `VITE_ENABLE_MOCKS=false` and `VITE_API_BASE` is set.
- Confirm the API Gateway URL ends with `/prod`.
- Check browser console for CORS or Cognito errors.
