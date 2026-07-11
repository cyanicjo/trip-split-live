# Trip Split Live 프로젝트 요약

마지막 정리일: 2026-07-04

이 파일은 다음 대화에서 긴 설명 없이 이어가기 위한 요약입니다.

## 한 줄 설명

여행 친구들이 링크 하나로 접속해서 지출, 개인별 차액, 송금표를 실시간으로 확인하는 여행 n빵 웹앱입니다.

## 현재 구조

- 화면 배포: GitHub Pages
- 데이터 저장: Supabase Database
- 실시간 갱신: Supabase Realtime
- 서버 방식: `server.js`는 쓰지 않음
- 공개 폴더: `docs/`
- DB 스키마: `supabase/schema.sql`
- 정산 테스트: `test/settlement.test.js`

## 중요한 주소와 저장소

- GitHub 저장소: `https://github.com/cyanicjo/trip-split-live.git`
- GitHub Pages 주소: `https://cyanicjo.github.io/trip-split-live/`
- 현재 자주 쓰던 여행방 예시:
  `https://cyanicjo.github.io/trip-split-live/?trip=trip-60ee873d6d964d12&edit=493a1fe369292780151d85ff98da7ecf14cc`

편집 링크에는 `edit=` 토큰이 들어 있습니다. 이 링크를 가진 사람은 친구와 지출을 수정할 수 있습니다.

## 핵심 파일

- `docs/index.html`: 화면 구조
- `docs/styles.css`: 전체 UI 스타일
- `docs/app.js`: 앱 로직, Supabase 연동, 정산 계산, 내보내기
- `docs/config.js`: Supabase URL과 anon key
- `docs/config.example.js`: config 예시
- `supabase/schema.sql`: Supabase에서 실행하는 테이블/RPC/Reatime 설정
- `README.md`: 프로젝트 개요
- `DEPLOYMENT.md`: 배포 방법

## 현재 주요 기능

- 여행방 생성
- 보기 링크와 편집 링크 분리
- 친구 추가
- 친구 목록 접기
- 친구별 은행명과 계좌번호 저장
- 계좌번호는 하이픈 없이 입력하도록 안내
- 친구 목록의 계좌 정보 클릭 복사
- 지출 입력을 팝업처럼 열기
- 지출 수정
- 결제자 선택
- 지출별 n빵 참여자 선택
- 카테고리 추가/삭제
- 여행방별 카테고리 관리
- 지출 목록 날짜 범위 필터
- 지출 목록 카테고리 필터
- 개인별 차액 계산
- 송금표 계산
- 완료한 송금은 송금표에서 제외
- 완료 송금 되돌리기
- 송금표 받는 사람 옆 계좌 정보 표시 및 클릭 복사
- 내 여행 목록 대시보드
- 내 여행 목록 항목 클릭으로 바로 열기
- 새 여행방 만들기
- CSV/PDF/JSON 내보내기
- 내보내기에 보기 링크 포함
- CSV 업로드로 지출 목록 추가
- CSV 업로드 시 컬럼 매핑, 미리보기, 직접 수정 지원
- CSV 업로드 시 결제자/참여자 이름 기준 친구 자동 추가
- CSV 업로드 시 기존 지출과 중복되는 행 건너뛰기
- 해외여행/외화 정산 옵션
- 외화 옵션 접기
- 외화 2개 사용
- 원화 기준 정산
- 여행 기본 환율 저장
- 지출별 환율 수정
- 환전 기록 저장
- 카드 실제 청구액 수정
- 외화 금액과 원화 금액 함께 표시
- 라오스 통화 포함
- 1보다 작은 환율은 역수 형태로도 이해하기 쉽게 표시

## Supabase 구조

`supabase/schema.sql`은 아래를 만듭니다.

- `public.trips`
  - `public_id`
  - `name`
  - `people`
  - `expenses`
  - `settings`
  - `version`
  - `created_at`
  - `updated_at`
- `public.trip_secrets`
  - `trip_id`
  - `edit_token_hash`
- RPC 함수
  - `create_trip()`
  - `get_trip(text)`
  - `update_trip_state(text, text, text, jsonb, jsonb, jsonb)`

`function gen_random_bytes(integer) does not exist` 오류가 나면 최신 `supabase/schema.sql` 전체를 Supabase SQL Editor에서 다시 실행하면 됩니다.

## 배포 방식

GitHub Pages 설정:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

수정 후 배포 흐름:

```bash
git add .
git commit -m "작업 내용"
git push
```

GitHub Pages 반영은 보통 조금 기다려야 합니다. 브라우저가 예전 `app.js`나 `styles.css`를 들고 있으면 강력 새로고침이 필요할 수 있습니다.

## 테스트와 확인

기본 테스트:

```bash
npm test
```

JS 문법 확인:

```bash
node --check docs/app.js
```

커밋 전 공백 오류 확인:

```bash
git diff --check
```

## 최근 주의할 점

- 최근 기능: 송금표에서 받는 사람 옆에 계좌 정보를 보여주고 클릭하면 복사되도록 추가했습니다.
- 사용자가 "방금 기능이 안되는데?"라고 말한 적이 있습니다.
- 다음에 이 문제를 다룰 때는 먼저 아래 둘을 확인하면 좋습니다.
  - 받는 사람에게 계좌 정보가 저장되어 있는지
  - GitHub Pages 캐시 때문에 최신 `app.js`가 아직 반영되지 않은 것인지
- 필요하면 계좌가 없는 사람에게 `계좌 없음` 표시를 추가하거나, `index.html`에서 `app.js?v=...`, `styles.css?v=...`처럼 버전 쿼리를 붙이면 됩니다.

## 디자인 방향

- 앱 첫 화면은 랜딩 페이지가 아니라 실제 정산 도구입니다.
- 카드가 너무 많아 보이지 않게 하되, 입력/목록/송금표는 명확히 구분합니다.
- 모바일과 PC 둘 다 고려합니다.
- 기본 브라우저 select 스타일 대신 앱 UI에 맞춘 커스텀 선택창을 선호합니다.
- 친구 목록과 해외여행 옵션은 접을 수 있어야 합니다.
- 해외여행 옵션은 평소에는 방해되지 않게 숨겨져야 합니다.

## 다음 대화에서 토큰을 아끼는 요청 예시

```text
PROJECT_NOTES.md 읽고 이어서 해줘.

이번에는 구현까지 하고, 테스트만 해줘. 배포는 하지 마.

수정할 것:
1. ...
2. ...

유지할 것:
- 기존 정산 계산 방식 유지
- 모바일 UI 깨지지 않게
```

배포까지 원할 때:

```text
PROJECT_NOTES.md 읽고 이어서 해줘.

수정하고 테스트한 뒤 git commit, push, Pages 배포 확인까지 해줘.
```

질문을 줄이고 싶을 때:

```text
애매한 부분은 기존 앱 스타일에 맞춰서 합리적으로 결정하고 진행해줘.
단, 데이터가 삭제될 수 있는 선택이면 먼저 물어봐줘.
```
