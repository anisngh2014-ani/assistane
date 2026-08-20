# Assistane Remote AWS Deployment

This folder is for Assistane Remote only. Do not reuse ProtecVox stacks, hosted zones,
certificates, buckets, or secrets.

## Current Status

- AWS login has been verified for account `339713106066`.
- The current AWS CLI identity is the root account. Create a dedicated IAM deployment
  role or user before creating production resources.
- `assistane.com` is not currently visible as a Route53 hosted zone in this AWS account.
  Route53 only returned the existing `protecvox.com` zone. Keep Assistane DNS separate.
- The SAM template validates locally with `sam validate`.
- The Lambda backend syntax validates with `node --check`.

## Recommended AWS Shape

- `app.assistane.com`: dashboard frontend.
- `api.assistane.com`: API Gateway HTTP API + Lambda backend.
- `downloads.assistane.com`: installer downloads from S3/CloudFront.
- DynamoDB tables for accounts, devices, support codes, WebRTC signals, sessions,
  messages, and workspaces.
- CloudWatch logs for API and scheduled stale-device checks.

## Required Secrets

Generate strong unique values before deployment:

- `OwnerAdminSecret`: used by protected owner/admin API calls.
- `DesktopApiKey`: used by Agent and Viewer API calls.
- `SessionSecret`: used for dashboard/customer session signing.

Do not commit real secret values.

## First Deploy Command

Run from `aws-assistane` after dependency packaging is ready:

```powershell
sam deploy --guided `
  --stack-name assistane-remote-dev `
  --region us-east-1 `
  --capabilities CAPABILITY_IAM
```

For production, use a separate stack:

```powershell
sam deploy --guided `
  --stack-name assistane-remote-prod `
  --region us-east-1 `
  --capabilities CAPABILITY_IAM
```

Use different secrets for dev and prod.

## GitHub Secrets For Installer Builds

After API deployment, update GitHub repository secrets:

- `ASSISTANE_API_BASE_URL`: the deployed API URL, later `https://api.assistane.com`.
- `ASSISTANE_API_KEY`: the desktop API key.

The workflows still accept the old Base44 secret names as a temporary fallback, but
new builds should use the Assistane names.

## DNS

If DNS stays outside AWS, create records at the current DNS provider:

- `api.assistane.com` -> API custom domain target.
- `app.assistane.com` -> dashboard hosting target.
- `downloads.assistane.com` -> CloudFront distribution target.

If moving DNS into AWS Route53, create a new hosted zone for `assistane.com`, update
nameservers at the registrar, and do not touch the ProtecVox hosted zone.

## Migration Order

1. Deploy AWS API in dev.
2. Point Agent and Viewer dev builds to the AWS API.
3. Test support code generation, registration, heartbeat, WebRTC signal, commands,
   chat, sessions, file transfer, offline/uninstall behavior.
4. Move dashboard auth/entities from Base44 to the AWS API.
5. Add custom domains and TLS certificates.
6. Publish production Agent/Viewer installers with `ASSISTANE_API_BASE_URL`.
7. Cut over production dashboard.

