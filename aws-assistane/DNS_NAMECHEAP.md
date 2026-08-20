# Namecheap DNS Records For Assistane AWS

Certificate status: `ISSUED`

## Working Temporary URLs

- Dashboard CloudFront: https://d39jglycwz2iu8.cloudfront.net
- API Gateway default: https://aypoylicwj.execute-api.us-east-1.amazonaws.com/prod

## ACM Validation Records

These are already added and validated. Keep them in Namecheap so AWS can renew the certificate automatically.

| Type | Host | Value |
| --- | --- | --- |
| CNAME | `_ef337f9229785c7feebf00777048c358.app` | `_b84d2506d5d5c4d96ea974b6b0963700.jkddzztszm.acm-validations.aws.` |
| CNAME | `_f1fd5a04fc9199cd5dd547a4b379a586.api` | `_370157bbb34a2b8ab1a2764e45bd87c5.jkddzztszm.acm-validations.aws.` |
| CNAME | `_b4ee6e9db41c9cfd474281eb5ef5f57c.downloads` | `_b15769930c8c5dd37e7cc8f05b75c7a8.jkddzztszm.acm-validations.aws.` |

Certificate ARN:

`arn:aws:acm:us-east-1:339713106066:certificate/6ce10d90-4af4-4203-99df-0c257ace1b70`

## Add These Namecheap DNS Records Now

| Type | Host | Value |
| --- | --- | --- |
| CNAME | `app` | `d39jglycwz2iu8.cloudfront.net` |
| CNAME | `api` | `d-64t5oi2fq4.execute-api.us-east-1.amazonaws.com` |

Recommended TTL: `Automatic` or `30 min`.

Do not touch any ProtecVox DNS records.

## Later

`downloads.assistane.com` is certificate-ready but not yet attached to a downloads CloudFront distribution. Use it after installer files are moved from GitHub Releases to AWS S3/CloudFront.