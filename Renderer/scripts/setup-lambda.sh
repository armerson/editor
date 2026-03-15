#!/usr/bin/env bash
# =============================================================================
# Remotion Lambda — one-time setup script
#
# Run this once from the Renderer/ directory to deploy the Lambda function
# and upload the site bundle to S3.  After setup, copy the printed env vars
# to Railway (or your .env file for local testing).
#
# Prerequisites:
#   1. AWS account with the Remotion IAM policy attached to your IAM user.
#      Policy JSON: https://www.remotion.dev/docs/lambda/permissions
#   2. aws CLI configured (or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY set).
#   3. npm dependencies installed: `npm install` in this directory.
#
# Usage:
#   cd Renderer
#   chmod +x scripts/setup-lambda.sh
#   AWS_REGION=us-east-1 bash scripts/setup-lambda.sh
# =============================================================================
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
MEMORY_MB=2048        # 2 GB — comfortable for 1080p H.264, no OOM risk
DISK_MB=2048          # 2 GB ephemeral disk for decoded frames
TIMEOUT_SEC=120       # Max seconds per Lambda invocation (covers slowest frames)
SITE_NAME="highlight-reel"

echo ""
echo "=== Remotion Lambda Setup ==="
echo "Region : $REGION"
echo "Memory : ${MEMORY_MB} MB"
echo "Disk   : ${DISK_MB} MB"
echo "Timeout: ${TIMEOUT_SEC}s"
echo "Site   : $SITE_NAME"
echo ""

# ── Step 1: Deploy the Lambda function ────────────────────────────────────────
echo "--- Deploying Lambda function..."
FUNCTION_OUTPUT=$(npx remotion lambda functions deploy \
  --region="$REGION" \
  --memory="$MEMORY_MB" \
  --disk="$DISK_MB" \
  --timeout="$TIMEOUT_SEC" \
  2>&1)

echo "$FUNCTION_OUTPUT"

# Extract function name from output (format: "Lambda function remotion-render-... deployed")
FUNCTION_NAME=$(echo "$FUNCTION_OUTPUT" | grep -oP 'remotion-render-[^\s]+' | head -1 || true)

if [ -z "$FUNCTION_NAME" ]; then
  # Fallback: list deployed functions and take the most recent
  FUNCTION_NAME=$(npx remotion lambda functions ls --region="$REGION" --quiet 2>/dev/null | head -1 || true)
fi

if [ -z "$FUNCTION_NAME" ]; then
  echo ""
  echo "ERROR: Could not detect deployed function name."
  echo "Run: npx remotion lambda functions ls --region=$REGION"
  echo "Then set REMOTION_LAMBDA_FUNCTION_NAME manually."
  exit 1
fi

echo ""
echo "Function deployed: $FUNCTION_NAME"

# ── Step 2: Deploy the Remotion site to S3 ────────────────────────────────────
echo ""
echo "--- Deploying Remotion site to S3 (site name: $SITE_NAME)..."
SITE_OUTPUT=$(npx remotion lambda sites create \
  --region="$REGION" \
  --site-name="$SITE_NAME" \
  src/index.ts \
  2>&1)

echo "$SITE_OUTPUT"

# Extract serve URL from output
SERVE_URL=$(echo "$SITE_OUTPUT" | grep -oP 'https://[^\s]+\.amazonaws\.com/sites/[^\s]+' | head -1 || true)

if [ -z "$SERVE_URL" ]; then
  echo ""
  echo "ERROR: Could not detect serve URL."
  echo "Run: npx remotion lambda sites ls --region=$REGION"
  echo "Then set REMOTION_SERVE_URL manually."
  exit 1
fi

echo ""
echo "Site deployed: $SERVE_URL"

# ── Step 3: Print Railway env vars ────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Copy these env vars to Railway (or your .env file):"
echo "============================================================"
echo ""
echo "AWS_REGION=$REGION"
echo "AWS_ACCESS_KEY_ID=<your-key-id>"
echo "AWS_SECRET_ACCESS_KEY=<your-secret>"
echo "REMOTION_LAMBDA_FUNCTION_NAME=$FUNCTION_NAME"
echo "REMOTION_SERVE_URL=$SERVE_URL"
echo ""
echo "Optional tuning:"
echo "  REMOTION_FRAMES_PER_LAMBDA=20    # Frames per Lambda invocation (default: 20)"
echo "  REMOTION_FRAME_TIMEOUT_MS=60000  # Per-frame timeout ms (default: 60000)"
echo ""
echo "============================================================"
echo "  After setting env vars, redeploy your Railway server."
echo "  Renders will automatically use Lambda — no restart needed."
echo "============================================================"
echo ""

# ── Step 4: Quick smoke test (optional) ────────────────────────────────────────
echo "--- Running quick Lambda connectivity test..."
TEST_OUTPUT=$(npx remotion lambda functions ls --region="$REGION" 2>&1 || true)
if echo "$TEST_OUTPUT" | grep -q "$FUNCTION_NAME"; then
  echo "OK: Lambda function is reachable."
else
  echo "WARN: Could not confirm function is listed. Check AWS credentials."
fi

echo ""
echo "Setup complete."
