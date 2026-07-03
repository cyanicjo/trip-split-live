# GitHub Pages + Supabase 배포 가이드

이 버전은 돈 드는 Node 서버를 쓰지 않습니다.

- 화면: GitHub Pages
- 데이터 저장: Supabase Database
- 실시간 갱신: Supabase Realtime

## 1. Supabase 프로젝트 만들기

1. Supabase에 로그인합니다.
2. `New project`를 누릅니다.
3. 프로젝트 이름을 정합니다.
4. 데이터베이스 비밀번호를 저장해 둡니다.
5. 프로젝트가 준비될 때까지 기다립니다.

## 2. 테이블과 저장 함수 만들기

Supabase 프로젝트에서 아래로 이동합니다.

```text
SQL Editor → New query
```

그리고 이 저장소의 아래 파일 내용을 전부 붙여넣고 실행합니다.

```text
supabase/schema.sql
```

이 SQL은 `trips`, `trip_secrets` 테이블과 여행 생성/조회/저장 함수를 만듭니다.

이미 한 번 실행한 뒤에도 같은 파일 전체를 다시 실행해도 됩니다. 테이블은 유지되고 저장 함수만 최신 내용으로 덮어써집니다.

`function gen_random_bytes(integer) does not exist` 오류가 보이면 이 파일의 최신 버전을 다시 실행해 주세요. Supabase에서 랜덤 토큰 함수가 `extensions` 스키마에 있어서 생기는 오류입니다.

해외여행 모드, 환율, 환전 기록 기능을 쓰려면 최신 SQL을 다시 실행해야 합니다. 기존 여행 데이터는 유지되고 `settings` 컬럼과 저장 함수만 업데이트됩니다.

## 3. Supabase URL과 anon key 넣기

Supabase 프로젝트에서 아래로 이동합니다.

```text
Project Settings → Data API
```

또는 API 설정 화면에서 다음 값을 찾습니다.

- Project URL
- anon public key

그 값을 `docs/config.js`에 넣습니다.

```js
window.TRIP_SPLIT_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

`anon public key`는 브라우저 앱에서 쓰는 공개 키입니다. 단, `service_role` key는 절대 넣으면 안 됩니다.

## 4. GitHub에 올리기

```bash
git add .
git commit -m "Convert app to GitHub Pages and Supabase"
git push
```

## 5. GitHub Pages 켜기

GitHub repository에서 아래로 이동합니다.

```text
Settings → Pages
```

설정값:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

저장하면 잠시 뒤 이런 주소가 생깁니다.

```text
https://cyanicjo.github.io/trip-split-live/
```

처음 접속하면 새 여행방이 만들어지고, 주소에 `?trip=...&edit=...`가 붙습니다.

## 6. 링크 공유 방식

앱 안에는 두 가지 복사 버튼이 있습니다.

- `보기 링크`: 친구들이 정산 현황만 보는 링크
- `편집 링크`: 친구/지출을 추가하고 수정할 수 있는 링크

편집 링크는 너무 공개적으로 뿌리지 않는 편이 좋습니다.

## 참고

이 앱은 로그인 없이 쓰는 구조입니다. 여행 이름, 친구 이름, 지출 메모에 민감한 개인정보를 넣지 않는 것을 권장합니다.
