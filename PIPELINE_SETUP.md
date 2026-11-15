# Archived: one-minute collector deployment

This document preserves the original Korean-market collector instructions in English. The standalone public market dashboard has been removed. These notes describe an earlier architecture, not the current IBKR Live Lab companion. Use [LIVE_PAPER_SETUP.md](LIVE_PAPER_SETUP.md) for current operation.

The original collector was request-driven: Cloud Scheduler invoked Cloud Run during Korean market hours, the collector saved completed one-minute candles in Supabase, and then exited. Browser reads were restricted to explicitly released records.

## Original scope and cost assumptions

The first version supplied a demo chart, a disabled KIS collector, a Supabase schema, two scheduler jobs, and storage for future paper trades. API registration, credentials, deployment, redistribution permission and an execution engine were separate requirements.

The pilot targeted low usage rather than a guaranteed zero bill. Its historical assumptions were approximately 391 collector calls per weekday, Cloud Run request billing with `min=0`, `max=1`, 512 MiB and a 30-second timeout, two Scheduler jobs, four secrets, and a small single-symbol database. Free quotas and prices can change. A Google Cloud budget alert is not a spending cap. The original guide suggested a USD 1 monthly alert with 50%, 90% and 100% notifications; stopping scheduled work or deleting the service was the operational way to stop further collector activity.

## 1. KIS access

Register through the [Korea Investment & Securities developer portal](https://apiportal.koreainvestment.com/) and obtain the account's App Key and App Secret. Confirm whether the planned external display of one-minute OHLCV is permitted, including delay, attribution, caching and retention conditions. An individual API entitlement does not establish public redistribution rights.

Keep private keys out of repository files, browser configuration and chat. The legacy defaults were `PUBLIC_LIVE_DATA_ENABLED=false` and `publicLiveDataApproved: false`.

## 2. Supabase storage

Create a project, retain its database password privately, and execute [supabase/schema.sql](supabase/schema.sql) in SQL Editor. [supabase/retention.sql](supabase/retention.sql) was an optional cleanup script for the earlier collector.

The collector uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. A browser may use a publishable or anon key subject to RLS; a service-role or secret key must stay private. The original policy allowed anonymous reads only for completed candles with `public_visible=true` and released paper trades.

## 3. Google Cloud resources

The following commands are archived examples. Replace `YOUR_PROJECT_ID` with the intended project before any deliberate deployment. Nothing in the website language update runs these commands.

```bash
export QUANT_PROJECT_ID="YOUR_PROJECT_ID"
export QUANT_REGION="asia-northeast3"
gcloud config set project "$QUANT_PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com

gcloud artifacts repositories create quant-pipeline \
  --repository-format=docker \
  --location="$QUANT_REGION" \
  --description="Quant pipeline images"

gcloud iam service-accounts create quant-collector-sa \
  --display-name="Quant collector"
gcloud iam service-accounts create quant-scheduler-sa \
  --display-name="Quant scheduler invoker"
```

## 4. Private secrets

Create these secrets in Secret Manager, without surrounding whitespace:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Private Supabase service-role or secret key |
| `KIS_APP_KEY` | KIS App Key |
| `KIS_APP_SECRET` | KIS App Secret |

Grant the collector service account Secret Manager Secret Accessor on each secret. Its principal follows this pattern:

```text
quant-collector-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## 5. Historical build and deployment commands

From the repository root in Cloud Shell, the original container was built and deployed as follows:

```bash
gcloud builds submit cloud-run \
  --tag "$QUANT_REGION-docker.pkg.dev/$QUANT_PROJECT_ID/quant-pipeline/collector:v1"

gcloud run deploy quant-collector \
  --image "$QUANT_REGION-docker.pkg.dev/$QUANT_PROJECT_ID/quant-pipeline/collector:v1" \
  --region "$QUANT_REGION" \
  --platform managed \
  --no-allow-unauthenticated \
  --service-account "quant-collector-sa@$QUANT_PROJECT_ID.iam.gserviceaccount.com" \
  --cpu 1 \
  --memory 512Mi \
  --min 0 \
  --max 1 \
  --concurrency 1 \
  --timeout 30 \
  --set-env-vars "SYMBOLS=005930,MARKET_CODE=J,PUBLIC_LIVE_DATA_ENABLED=false,PAPER_TRADING_ENABLED=false,MAX_SYMBOLS=10" \
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,KIS_APP_KEY=KIS_APP_KEY:latest,KIS_APP_SECRET=KIS_APP_SECRET:latest"
```

Only the scheduler's service account was granted permission to invoke this private Cloud Run service:

```bash
gcloud run services add-iam-policy-binding quant-collector \
  --region "$QUANT_REGION" \
  --member "serviceAccount:quant-scheduler-sa@$QUANT_PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/run.invoker"
```

## 6. Original market-hours schedules

The original schedules used Asia/Seoul and two jobs. On exchange holidays the provider could return no data. Erroneous, duplicate or incomplete candles were not accepted as new complete records.

```bash
export QUANT_SERVICE_URL="$(gcloud run services describe quant-collector \
  --region "$QUANT_REGION" --format='value(status.url)')"

gcloud scheduler jobs create http quant-market-morning \
  --location "$QUANT_REGION" \
  --schedule "* 9-14 * * 1-5" \
  --time-zone "Asia/Seoul" \
  --uri "$QUANT_SERVICE_URL/collect" \
  --http-method POST \
  --oidc-service-account-email "quant-scheduler-sa@$QUANT_PROJECT_ID.iam.gserviceaccount.com" \
  --oidc-token-audience "$QUANT_SERVICE_URL"

gcloud scheduler jobs create http quant-market-close \
  --location "$QUANT_REGION" \
  --schedule "0-31 15 * * 1-5" \
  --time-zone "Asia/Seoul" \
  --uri "$QUANT_SERVICE_URL/collect" \
  --http-method POST \
  --oidc-service-account-email "quant-scheduler-sa@$QUANT_PROJECT_ID.iam.gserviceaccount.com" \
  --oidc-token-audience "$QUANT_SERVICE_URL"
```

A manual scheduler run was the initial check. Inspect Cloud Run logs for `configuration_error` or `symbol_collection_failed`, and verify the expected `candles_1m` and `pipeline_runs` records.

## 7. Public presentation

The former standalone page and its dedicated controller have been retired. The current public interface is [Quant Live Lab](testing-machine.html). The legacy collector does not supply the IBKR companion's four-ETF paper account. Do not replace the current `pipeline-config.js` with the historical configuration below.

## 8. Original publication configuration

After provider approval, the old collector could be redeployed with `PUBLIC_LIVE_DATA_ENABLED=true`. Its browser configuration used this historical format:

```js
window.PIPELINE_CONFIG = Object.freeze({
  mode: "live",
  symbol: "005930",
  symbolName: "Samsung Electronics",
  market: "KRX",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_OR_ANON_KEY",
  refreshMs: 30000,
  demoTickMs: 4500,
  maxCandles: 120,
  publicLiveDataApproved: true,
});
```

This example is retained as an archive, not as a current configuration to paste. A publishable client key can be public under RLS; a service-role key cannot.

## 9. Operational checks from the original pilot

- Keep Cloud Run minimum instances at zero and maximum instances at one.
- Retain only the intended scheduler jobs and remove temporary test jobs.
- The original guide called for checking cleanup when the database exceeded 350 MB; review current data dependencies before executing any retention routine.
- Pause the scheduler if repeated KIS token failures occur rather than repeatedly issuing new tokens.
- Monitor Supabase storage and egress if traffic grows; disable public publication while investigating excess usage.
- This project uses virtual execution. The website update does not add a broker order path.
