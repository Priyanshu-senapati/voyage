#!/usr/bin/env bash
# Deploy the hosted demo to Google Cloud Run. Cloud Build builds the Dockerfile, so no local Docker is needed.
#
#   gcloud auth login && gcloud config set project <your-project>    # once
#   deploy/cloudrun.sh                                                # from the repo root
#
# Settings (environment): REGION (default asia-south1), SERVICE (default voyance), and the demo keys
# VOYANCE_DEMO_KEY_ASHA, _RAVI, _MEERA, _ZED. Missing keys are kept from the running service, else made up.
# The demo keys are public by design (the sign-in page offers them), so never put real data in this service.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-voyance}"
PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] || { echo "No gcloud project set: run gcloud config set project <id>" >&2; exit 1; }

current() {  # a key already on the service, so redeploys don't sign everyone out
  gcloud run services describe "$SERVICE" --region "$REGION" --format=json 2>/dev/null |
    python3 -c "import json,sys
try: env = json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env', [])
except Exception: env = []
print(next((e.get('value', '') for e in env if e['name'] == '$1'), ''))"
}
new_key() { python3 -c "import secrets; print('vy_' + secrets.token_urlsafe(32))"; }

envs="VOYANCE_PROXY_HOPS=1"
for name in ASHA RAVI MEERA ZED; do
  var="VOYANCE_DEMO_KEY_${name}"
  value="${!var:-$(current "$var")}"
  envs+=",${var}=${value:-$(new_key)}"
done

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --quiet

# one instance at most: the demo database and the per-network limits live in its memory
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 120 \
  --set-env-vars "$envs" \
  --quiet

url="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "Live: $url"
curl -fsS "$url/healthz" && echo
