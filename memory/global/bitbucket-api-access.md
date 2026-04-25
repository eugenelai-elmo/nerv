---
id: bitbucket-api-access
title: Bitbucket Cloud API Access
scope: global
type: knowledge
category: convention
confidence: extracted
tags: [bitbucket, api, credentials, pr, global]
related: []
source: global/bitbucket_api_access
---

Basic auth with Atlassian API token. Credentials in `.env.local` as `BB_EMAIL` / `BB_TOKEN`. Workspace `elmodevelopment`.

## Authentication
- **Method**: Basic auth with Atlassian API token
- **Credentials**: stored in `.env.local` as `BB_EMAIL` and `BB_TOKEN`
- **Workspace**: elmodevelopment
- **Repo**: elmo-application
- **Username**: eugenelai1

## Usage

### Load credentials
```bash
source .env.local  # or parse BB_EMAIL / BB_TOKEN from it
```

### Test auth
```bash
curl -s -u "$BB_EMAIL:$BB_TOKEN" https://api.bitbucket.org/2.0/user
```

### Create PR
```bash
curl -s -u "$BB_EMAIL:$BB_TOKEN" \
  -X POST -H "Content-Type: application/json" \
  https://api.bitbucket.org/2.0/repositories/elmodevelopment/elmo-application/pullrequests \
  -d '{ "title": "...", "source": { "branch": { "name": "..." } }, "destination": { "branch": { "name": "master" } }, "description": "...", "close_source_branch": true }'
```

### Response
PR ID and HTML link are in `response.id` and `response.links.html.href`.
