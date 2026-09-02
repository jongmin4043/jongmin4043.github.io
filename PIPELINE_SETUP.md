# 1분봉 데이터 파이프라인 배포 안내서

이 프로젝트는 서버를 계속 켜 두지 않습니다. Google Cloud Scheduler가 한국 장중에만
Cloud Run 수집기를 1분마다 호출하고, 수집기는 완성된 분봉을 Supabase에 저장한 뒤
종료합니다. GitHub Pages는 Supabase의 공개 허용 행만 읽습니다.

## 먼저 알아둘 현재 상태

| 항목 | 현재 상태 | 실사용 전 필요한 일 |
|---|---|---|
| 홈페이지 차트 | 데모 데이터로 즉시 작동 | 없음 |
| 한국투자 데이터 수집 | 코드 준비 완료, 비활성 | Open API 신청 및 App Key/App Secret 발급 |
| Supabase 저장 | 스키마 준비 완료 | 무료 프로젝트 생성 및 SQL 실행 |
| 1분 자동 실행 | 배포 명령 준비 완료 | Google Cloud 프로젝트에 Cloud Run/Scheduler 배포 |
| 사이트 전체 공개 | 가능 | 시세 재배포 허용 범위를 한국투자증권에 서면 확인 |
| 모의 매매 표시 | 테이블·차트 마커·DB 구조 준비 | 다음 단계에서 전략 실행기 연결 |

중요: 한국투자 Open API의 개인 조회 권한이 곧 불특정 다수에게 실시간 시세를 재배포할
권한이라는 근거는 확인되지 않았습니다. 따라서 기본값은 `PUBLIC_LIVE_DATA_ENABLED=false`,
`publicLiveDataApproved: false`입니다. 허용 여부를 확인하기 전에는 실데이터가 공개되지
않습니다.

## 예상 비용

작은 개인 프로젝트 규모에서는 월 0원을 목표로 한 구성입니다. 다만 무료 한도와 정책은
변경될 수 있고, Google Cloud 예산 알림은 결제를 강제로 차단하는 장치가 아닙니다.

| 서비스 | 이 프로젝트의 사용량 | 비용 보호 설정 |
|---|---:|---|
| GitHub Pages | 정적 HTML/CSS/JS | 공개 저장소 Pages 사용 |
| Cloud Run | 평일 장중 약 391회/일 | 요청 기반, `min=0`, `max=1`, 512 MiB, 30초 제한 |
| Cloud Scheduler | 작업 2개 | 결제 계정당 무료 3개 이내 |
| Supabase | 1종목 분봉 및 소량 조회 | Free 플랜, 120일 보관 정리 함수 |
| Secret Manager/컨테이너 이미지 | 비밀 4개, 이미지 1개 | 오래된 이미지·비밀 버전 누적 금지 |

배포 직후 Google Cloud **Billing → Budgets & alerts**에서 월 예산을 미화 1달러로 만들고
50%, 90%, 100% 알림을 켭니다. 이것은 경보이며 하드 캡은 아닙니다. 비용을 물리적으로
멈추려면 Scheduler 작업을 일시정지하거나 Cloud Run 서비스를 삭제해야 합니다.

## 1. 한국투자 Open API 신청

1. [한국투자 Open API 개발자센터](https://apiportal.koreainvestment.com/)에 로그인합니다.
2. 상단 **API신청**에서 보유 계좌로 서비스를 신청합니다.
3. 실전투자용 `App Key`, `App Secret`을 발급받습니다.
4. 개발자센터 고객지원에 아래 사항을 문의하고 답변을 보관합니다.

   > 개인 GitHub Pages에서 국내주식 1분 OHLCV를 불특정 다수에게 자동 표시해도 되는지,
   > 지연 표시·출처 표시·캐시/저장 기간 등 별도 조건이 있는지 확인 부탁드립니다.

키를 이 문서, GitHub, `pipeline-config.js`, 이 대화창에 붙여 넣지 마세요.

## 2. Supabase 무료 프로젝트 만들기

1. [Supabase](https://supabase.com/)에서 Free 프로젝트를 만듭니다. 가까운 리전을
   선택하고 데이터베이스 비밀번호는 별도로 보관합니다.
2. **SQL Editor**에서 [`supabase/schema.sql`](supabase/schema.sql) 전체를 실행합니다.
3. 선택 사항으로 [`supabase/retention.sql`](supabase/retention.sql)을 실행합니다.
4. **Project Settings → API**에서 다음 값을 기록합니다.

   - Project URL: Cloud Run의 `SUPABASE_URL`
   - Publishable/anon key: GitHub Pages의 `supabaseAnonKey`
   - service_role/secret key: Cloud Run의 `SUPABASE_SERVICE_ROLE_KEY`

`service_role` 또는 secret key는 절대로 GitHub에 올리면 안 됩니다. 스키마의 RLS 정책은
익명 방문자에게 `public_visible=true`인 완성 봉과 공개 모의매매만 읽도록 허용합니다.

## 3. Google Cloud 준비

[Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트를 만들고 결제
계정을 연결합니다. Cloud Shell을 열어 아래의 대문자 값을 자신의 프로젝트 ID로 바꿉니다.

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

## 4. 비밀 값 등록

Google Cloud Console의 **Security → Secret Manager**에서 아래 이름으로 비밀 4개를
만듭니다. 값은 복사할 때 주변 공백이나 줄바꿈이 들어가지 않게 합니다.

| Secret 이름 | 값 |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/secret key |
| `KIS_APP_KEY` | 한국투자 App Key |
| `KIS_APP_SECRET` | 한국투자 App Secret |

수집기 서비스 계정에 네 비밀 각각의 **Secret Manager Secret Accessor** 역할을
부여합니다. 콘솔에서 각 Secret의 **Permissions → Grant access**를 열고 아래 principal을
추가하면 됩니다.

```text
quant-collector-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## 5. 컨테이너 빌드와 Cloud Run 배포

ZIP의 전체 폴더를 Cloud Shell에 업로드하고 저장소 루트에서 실행합니다.

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

비공개 Cloud Run을 Scheduler만 호출하도록 권한을 부여합니다.

```bash
gcloud run services add-iam-policy-binding quant-collector \
  --region "$QUANT_REGION" \
  --member "serviceAccount:quant-scheduler-sa@$QUANT_PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/run.invoker"
```

## 6. 평일 장중 1분 스케줄 만들기

Cloud Scheduler의 무료 작업 3개 중 2개를 사용합니다. 한국거래소 휴장일에는 API가 빈
결과를 반환할 수 있지만, 수집기는 오류/중복/미완성 봉을 저장하지 않습니다.

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

첫 시험은 Cloud Scheduler에서 **Force run**으로 실행합니다. Cloud Run 로그에
`configuration_error`, `symbol_collection_failed`가 없는지 보고, Supabase의
`candles_1m`과 `pipeline_runs`에 행이 생기는지 확인합니다.

## 7. GitHub Pages에 홈페이지 게시

1. 이 폴더의 파일을 `jongmin4043/jongmin4043.github.io` 저장소 루트에 업로드합니다.
2. GitHub **Settings → Pages**에서 `main` 브랜치의 `/ (root)`를 선택합니다.
3. `https://jongmin4043.github.io/data-pipeline.html`을 엽니다.

현재 `pipeline-config.js`는 데모 모드이므로 방문자는 즉시 움직이는 차트와 모의 매매
예시를 볼 수 있습니다.

## 8. 공개 실데이터 활성화 — 허용 확인 후에만

한국투자증권에서 공개 재배포가 허용된다는 답변과 조건을 확인한 뒤 진행합니다.

1. Cloud Run 환경 변수 `PUBLIC_LIVE_DATA_ENABLED=true`로 새 revision을 배포합니다.
2. `pipeline-config.js`를 아래처럼 바꾸고 GitHub에 push합니다.

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

Publishable/anon key는 RLS가 적용된 공개 클라이언트 키라 웹에 들어갈 수 있습니다.
`service_role` 키를 넣지 않았는지 반드시 다시 확인하세요.

## 9. 운영 중 확인할 것

- Cloud Run `min instances`가 항상 0인지 확인합니다.
- Cloud Run `max instances`는 1을 유지합니다.
- Scheduler 작업은 두 개만 유지하고, 시험용 작업은 삭제합니다.
- Supabase 데이터베이스 사용량이 350 MB를 넘으면 `cleanup_quant_pipeline()`을 실행합니다.
- 한국투자 토큰 오류가 반복되면 Scheduler를 일시정지하고 토큰을 계속 재발급하지 않습니다.
- 공개 사이트 트래픽이 커져 Supabase egress가 늘면 실데이터 공개를 잠그고 사용량을 점검합니다.
- 매매는 현재 실제 주문이 아닌 paper trade 전용입니다. 실제 주문 기능은 별도 안전 검토
  없이는 추가하지 않습니다.
