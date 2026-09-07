# Public Dashboard v10 — Pipeline/TradingView 이중 보기

## 핵심 변경

- 기본 화면은 Supabase `get_public_chart_page`와 `get_public_chart_tail_v4`를 읽는
  `Pipeline feed`입니다.
- 삼성전자·SK하이닉스는 Cloud Run Collector와 Historical Backfill이 저장한 봉을
  홈페이지에서 확인할 수 있습니다.
- `TradingView tools` 탭은 다양한 Interval, Indicator, Drawing tool을 유지합니다.
- 종목 선택은 두 보기에 함께 적용됩니다.
- White mode와 모바일 레이아웃을 유지합니다.
- `pipeline-config.js`는 ZIP에 넣지 않았습니다. 기존 Publishable Key를 보존하기
  위해서입니다.

## GitHub 적용

ZIP 안의 아래 네 파일을 GitHub Pages 저장소 최상위 경로에 덮어씁니다.

- `data-pipeline.html`
- `data-pipeline-chart.js`
- `pipeline-core.js`
- `style.css`

`pipeline-config.js`는 수정하지 않습니다.

Commit message:

```text
Reconnect Supabase pipeline feed and preserve TradingView tools
```

## 확인

배포 후 다음 주소를 강력 새로고침합니다.

```text
https://jongmin4043.github.io/data-pipeline.html?instrument=KRX%3A005930&view=pipeline&build=10#market-dashboard
```

정상 상태:

1. `Pipeline feed`가 선택되어 있습니다.
2. 삼성전자를 선택하면 Supabase의 최신 저장 봉과 가격·시간이 표시됩니다.
3. SK hynix를 선택하면 헤더와 봉이 즉시 교체됩니다.
4. `TradingView tools`를 누르면 도구가 많은 Provider 차트가 나타납니다.
5. 주소에 `view=pipeline` 또는 `view=tradingview`, `build=10`이 표시됩니다.

`Supabase browser configuration is incomplete`가 나오면 기존
`pipeline-config.js`의 `supabasePublishableKey`가 Publishable Key인지 확인합니다.
Secret Key는 GitHub에 넣지 않습니다.
