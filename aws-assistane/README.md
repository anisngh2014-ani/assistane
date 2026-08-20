# Assistane Remote AWS Environment

This folder is the separate AWS environment for Assistane Remote. It is intentionally independent from ProtecVox and from the current Base44 deployment.

## What This Contains

- `template.yaml` - AWS SAM/CloudFormation infrastructure for the Assistane environment.
- `backend/` - Lambda backend that replaces the Base44 functions.
- Separate DynamoDB tables for accounts, devices, support codes, sessions, messages, WebRTC signals, and workspace settings.
- Separate S3 bucket for Agent/Viewer installer downloads and uploaded assets.

## Recommended Domains

- Dashboard: `app.assistane.com`
- API: `api.assistane.com`
- Downloads: `downloads.assistane.com`

## First Deployment Shape

The first AWS version uses:

- API Gateway HTTP API
- AWS Lambda Node.js backend
- DynamoDB pay-per-request tables
- S3 for downloads/assets
- CloudWatch logs

This keeps cost low and avoids running always-on servers.

## Deployment Requirements

Before deployment, prepare:

- AWS account dedicated to Assistane, or at least a clearly separate Assistane stack name.
- DNS access for `assistane.com`.
- An owner admin secret, stored in AWS as a parameter or supplied during deployment.
- A desktop API key used by Agent and Viewer installers.
- Optional JWT/session secret for account tokens.

## Suggested Stack Names

- Dev: `assistane-remote-dev`
- Production: `assistane-remote-prod`

## Do Not Mix With ProtecVox

Use separate:

- AWS stack name
- DynamoDB table prefixes
- S3 buckets
- CloudFront/API domains
- GitHub Actions secrets
- API keys

