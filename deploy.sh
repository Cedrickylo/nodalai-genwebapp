#!/usr/bin/env bash
set -e

echo "Preparing Netlify deployment..."

# Auto-update build version to force service worker cache reset
VERSION=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{\"version\": \"$VERSION\"}" > build-version.json
echo "Build version updated: $VERSION"

if ! command -v netlify >/dev/null 2>&1; then
  echo "Netlify CLI not found. Install with: npm install -g netlify-cli"
  exit 1
fi

if [ -z "$NETLIFY_SITE_ID" ]; then
  echo "NETLIFY_SITE_ID not set — running interactive deploy (will prompt to link or create a site)."
  netlify deploy --prod --dir=. 
else
  echo "Deploying to site id: $NETLIFY_SITE_ID"
  netlify deploy --prod --dir=. --site "$NETLIFY_SITE_ID"
fi

echo "Deploy finished. If successful, visit your Netlify site dashboard to confirm." 
