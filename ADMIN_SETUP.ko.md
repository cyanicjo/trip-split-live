# 관리자 Google 로그인 설정과 배포

현재 상태: 코드와 가짜 데이터 검증 완료. 운영 DB·Google 설정·GitHub Pages에는 아직 적용하지 않았습니다.

## 1. DB 적용

기존 데이터를 백업한 후 DB 소유자 권한으로 적용합니다.

- 이전 보안 보완도 아직 적용하지 않았다면 `supabase/schema.sql`을 실행합니다. 두 마이그레이션을 순서대로 합친 파일입니다.
- 이전 보안 보완을 적용했다면 `supabase/migrations/20260930_admin_readonly.sql`만 실행합니다.
- `supabase/verify_security.sql`과 `supabase/verify_admin.sql`을 실행해 오류가 없는지 확인합니다. 관리자 0명은 등록 전 정상입니다.

여행 데이터와 기존 편집 권한을 보존합니다. 관리자 등록은 별도이며 최초 로그인 계정에 자동 부여하지 않습니다. 기존 보안 마이그레이션의 유출 링크 폐기·복구 사항은 `DEPLOYMENT.md`를 따릅니다.

## 2. Google 인증 설정

[Supabase 공식 Google 로그인 문서](https://supabase.com/docs/guides/auth/social-login/auth-google)를 기준으로 설정합니다.

1. Google Cloud에서 OAuth 동의 화면을 구성하고 웹 애플리케이션용 OAuth 클라이언트를 만듭니다. 테스트 상태라면 본인 Google 계정을 테스트 사용자로 등록합니다.
2. JavaScript 원본은 `https://cyanicjo.github.io`로 지정합니다.
3. 승인된 리디렉션 URI는 Supabase Google Provider 화면에서 제공하는 콜백 URL을 그대로 사용합니다. 현재 프로젝트는 `https://edyaihnztjshxsfissck.supabase.co/auth/v1/callback`입니다.
4. Supabase Authentication의 Google Provider에 Client ID와 Client Secret을 설정하고 활성화합니다. Client Secret과 service_role 키는 앱 파일이나 Git 저장소에 넣지 않습니다.
5. Supabase URL Configuration의 Redirect URLs에 `https://cyanicjo.github.io/trip-split-live/admin.html`을 정확하게 추가합니다. 기존 일반 여행용 Site URL은 유지합니다. 운영 주소에는 불필요한 와일드카드를 추가하지 않습니다.

로그인 클라이언트는 PKCE 흐름을 사용합니다. 고정 버전 `@supabase/supabase-js@2.117.2`를 자체 정적 파일로 제공하고 인증 정보는 sessionStorage에만 저장합니다. 일반 여행 화면은 기존 anon 기반 RPC 클라이언트를 계속 사용합니다.

## 3. 정적 앱 배포와 본인 등록

1. DB 변경 후 `docs/` 전체를 GitHub Pages에 배포합니다. 관리자 파일, 공유 계산 모듈, vendor 파일, CSV templates 폴더를 함께 포함해야 합니다.
2. `/trip-split-live/admin.html`에서 본인 Google 계정으로 로그인합니다. 아직 관리자가 아니므로 권한 안내만 표시되는 것이 정상입니다.
3. Supabase Authentication > Users에서 실제 로그인한 본인 이메일·Google 연결을 확인하고 해당 사용자의 UUID를 복사합니다. 다른 사람이 알려준 UUID를 검증 없이 등록하지 않습니다.
4. `supabase/manage_admin.sql` 사본에서 `target_user`를 그 UUID로, `action`을 `grant`로 바꿉니다. DB 소유자로 실행합니다. Google identity가 없는 UUID는 거부됩니다. 수정한 개인용 사본은 공개 저장소에 커밋하지 않습니다.
5. 관리자 화면에서 ‘목록 새로고침’을 누릅니다. 전체 여행이 최근 생성 순으로 50개씩 표시됩니다. 페이지를 넘기고 상세 내용을 확인합니다.

## 4. 적용 후 확인

- 본인 계정: 여행 목록, 계좌, 일정, 외화, 지출, 정산 결과를 조회합니다. 관리자 화면에는 편집·삭제·링크 재발급 기능이 없습니다.
- 별도 테스트 계정/미로그인: 관리자 API 접근이 거부되어야 합니다. 실제 여행을 수집하지 말고 전용 가짜 여행으로 상세 확인을 제한합니다.
- 로그아웃: 목록과 상세가 사라집니다. 관리자 세션은 일반 보기 링크의 편집 권한으로 사용되지 않습니다.
- 표준 CSV: 새 가짜 여행에서 작성 예시를 가져오면 지출 2건, 36000원, 가짜 참여자 3명이 됩니다. 동일 파일 재가져오기는 중복으로 제외됩니다.
- 관리자 상세는 보이는 탭에서 30초마다 권한과 최신 정보를 다시 확인합니다. 숨긴 탭은 표시 내용을 지우며 돌아올 때 재검사합니다. 서버의 관리자 제거는 다음 요청부터 적용됩니다. 이미 사람이 열람한 정보를 회수하는 기능은 아닙니다.

## 5. 권한 해제와 안전한 중지

- 개인 권한 해제: `manage_admin.sql`의 같은 UUID와 `action='revoke'`를 사용합니다. 여행 내용은 보존됩니다.
- 관리자 기능 전체 중지: `supabase/disable_admin.sql` 실행 후 관리자 화면을 제거할 수 있습니다. 일반 여행 보안 권한은 유지합니다.
- 재활성화: 관리자 마이그레이션을 다시 적용하면 기존 등록 목록에 한해 활성화됩니다. 필요하면 등록 목록부터 검토합니다.
- 구버전의 익명 전체 조회 정책이나 테이블 권한을 다시 열지 않습니다.

## 로컬 재현

Node.js 22 이상에서 `pnpm install --frozen-lockfile`, `pnpm test:all`로 검사합니다. SDK를 다시 만들 때는 `pnpm build:auth`를 사용합니다.

`pnpm preview:security`는 임시 PostgreSQL과 가짜 여행만 사용합니다. 출력 주소의 ‘관리자 화면 (로컬 인증 대역)’ 링크로 관리자 UI를 확인할 수 있습니다. 이는 실제 Google 로그인 검증이 아닙니다. 해당 서버와 인증 대역은 `test/`에만 있으며 GitHub Pages에 배포하지 않습니다. 종료하면 임시 DB를 지웁니다.
