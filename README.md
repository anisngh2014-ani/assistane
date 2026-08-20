# Assistane Remote

Assistane Remote is now configured to run on AWS instead of Base44.

Primary AWS migration files live in `aws-assistane/`:

- `template.yaml` provisions the Assistane backend resources.
- `backend/src/handler.js` implements dashboard, Agent, Viewer, support-code, device, WebRTC, chat, session, and owner/user APIs.
- `DEPLOYMENT.md` documents deployment and DNS steps.

Build-time dashboard API variable:

```bash
VITE_ASSISTANE_API_BASE_URL=https://your-api-url/prod
```

Agent/Viewer build secrets:

- `ASSISTANE_API_BASE_URL`
- `ASSISTANE_API_KEY`