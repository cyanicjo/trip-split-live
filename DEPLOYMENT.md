# 보안 보완 배포 안내

이 버전은 기존 DB를 보존하면서 접근 권한·RPC·공유 링크를 변경합니다. **현재 작업 결과는 로컬에서 검증됐으며 운영에는 미적용입니다.** 먼저 `security/REPORT.ko.md`를 읽어 주세요.

## 적용 전 준비

- Supabase 프로젝트 소유자 권한과 GitHub 저장소 배포 권한이 필요합니다. 브라우저용 anon 키만으로 DB 스키마를 변경할 수 없습니다.
- Supabase의 백업/스냅샷과 GitHub의 현재 배포 커밋을 확보합니다. 백업에는 민감한 데이터가 있으므로 Git에 넣지 않습니다.
- 기존 편집 링크를 개인적으로 확보합니다. SQL 적용 후 기존의 짧은 보기 링크는 중지됩니다. 노출된 편집 키 1개는 강제 폐기되므로 해당 여행은 아래 소유자 복구가 필요합니다.
- UI와 RPC가 함께 바뀝니다. 짧은 점검 시간을 정하고 저장을 멈춘 뒤 DB → 앱 순서로 적용합니다. 이전 앱은 새 DB에 저장할 수 없습니다.
- 현재 `docs/config.js`는 기존 Supabase URL과 anon 키를 사용합니다. 다른 프로젝트에서 시험할 때는 설정과 `docs/index.html`의 CSP `connect-src`를 함께 해당 프로젝트로 변경합니다. `service_role` 또는 DB 비밀번호를 앱에 넣지 않습니다.

## 로컬 재검증

테스트 환경: Node.js 24.19.0, pnpm 11.19.0, PostgreSQL 17.10 (가짜 데이터만 사용).

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:db
```

Node.js 22 이상을 사용합니다. DB 테스트는 임시 디렉터리와 127.0.0.1의 임의 포트를 사용하고 종료 시 정리합니다. pnpm의 `allowBuilds` 설정으로 테스트용 PostgreSQL의 공식 설치 스크립트만 허용합니다. 실제 Supabase에 연결하지 않습니다.

```sh
pnpm preview:security
```

출력된 로컬 `/fixtures` 주소에서 가짜 여행 A의 편집/보기 링크, 여행 B의 편집 링크를 열 수 있습니다. 미리보기 서버는 테스트용 RPC 연결 코드이므로 운영 배포하지 않습니다. 공개 배포 폴더는 `docs/`만 사용합니다.

## 운영 적용 순서

1. Supabase SQL Editor에서 `supabase/migrations/20260929_security_hardening.sql` 전체를 DB 소유자로 실행합니다. 트랜잭션이 실패하면 원인을 확인하고 중지합니다. `supabase/schema.sql`도 같은 내용이며 두 파일을 모두 실행할 필요는 없습니다.
2. `supabase/verify_security.sql`을 실행합니다. `security checks passed`를 확인하고, 링크 재발급 대기 여행 수와 소유자 복구 대기 수를 확인합니다. 실제 여행 내용을 출력하지 않는 점검입니다.
3. `supabase/recover_revoked_links.sql`을 소유자 계정으로 실행합니다. 공개 기록에서 노출된 키와 일치한 여행에만 새 ID와 편집 키를 발급합니다. 결과를 개인적으로 보관하고 아래 형식으로 링크를 만듭니다. 출력값을 문서·채팅방·Git 기록에 공개하지 않습니다.
4. 이 수정본을 GitHub 저장소에 반영하고 Pages의 `main` / `docs` 배포가 끝날 때까지 기다립니다. `security.mjs`, `vendor/lucide-0.468.0.min.js`, 라이선스 파일도 함께 반영합니다. 앱·스타일의 캐시 버전이 변경돼 있습니다.
5. 새로고침한 소유자 화면에서 읽기·저장·계좌 복사·정산·내보내기를 확인합니다. 노출되지 않은 기존 편집 링크는 들어가서 여행 메뉴 → ‘공유 링크 재발급’을 선택합니다. 새 링크를 기존 참가자에게 다시 전달해야 합니다.
6. 운영 전용 가짜 테스트방 하나로 보기 링크 수정 거부, 다른 여행 키 거부, 두 화면 갱신을 확인합니다. 실제 여행 전체 목록을 익명 API로 조회하는 테스트는 하지 않습니다.

링크 형식:

```text
보기: https://cyanicjo.github.io/trip-split-live/?trip=새_PUBLIC_ID
편집: https://cyanicjo.github.io/trip-split-live/?trip=새_PUBLIC_ID#edit=새_EDIT_TOKEN
```

노출 키의 해시가 현재 DB와 일치하지 않으면 소유자 복구 SQL 결과는 없을 수 있습니다. 이미 다른 키로 바뀌었거나 관련 여행이 없는 경우입니다. 실제 개인정보를 조회하지 않고 운영 상태를 단정하지 마세요.

## 변경된 RPC

- `create_trip()` → `public_id`, `edit_token` 반환. 각각 독립적인 256비트 난수.
- `get_trip(p_public_id, p_edit_token default null)` → 기존 여행 필드와 `can_edit`. 새로운 보기 ID는 조회 가능하고, 이전 짧은 ID는 유효한 편집 키가 필요합니다.
- `update_trip_state(p_public_id, p_edit_token, p_name, p_people, p_expenses, p_expected_version, p_settings)` → 기존 여행 필드. 예상 버전이 다르면 `40001`, 편집 권한이 없으면 `42501`, 입력 오류는 `22023`.
- `rotate_trip_links(p_public_id, p_edit_token, p_expected_version, p_new_public_id, p_new_edit_token)` → 새 `public_id`, `edit_token`. 클라이언트가 암호학적 난수를 준비하고 세션에 보관한 후 요청합니다. 동일한 새 키로 재시도하면 같은 결과를 돌려주며 버전을 또 올리지 않습니다.
- 이전 조회·저장·재발급 RPC 시그니처는 제거됩니다. 예전 쓰기 API로 되돌아가는 fallback은 없습니다.

## 운영 확인과 장애 복구

- 적용 후 24~48시간은 Supabase 로그에서 `42501`/`22023`/`40001` 및 5xx 비율, 요청량·DB 크기·응답 시간을 확인합니다. 예전 클라이언트의 저장 오류는 새로고침을 안내합니다. 이 문서가 자동 모니터링을 생성한 것은 아닙니다.
- 링크 만료: 편집자에게 새 링크를 받습니다. 노출 키로는 복구할 수 없습니다. DB 소유자가 복구 SQL을 사용합니다.
- 동시 저장 충돌: 입력 내용은 보존됩니다. 최신 기록을 확인하고 명시적으로 재시도합니다. 모든 충돌을 자동 병합하지 않습니다.
- 재발급 중 연결 오류: 같은 탭에서 새로고침하면 세션의 대기 키를 이용해 이미 발급된 링크를 복구합니다. 세션을 지우거나 탭을 닫기 전에 새 편집 링크를 보관하세요.
- 입력 제한으로 저장 불가: 원본을 백업한 뒤 제한 초과·비정상 항목을 소유자가 검토합니다. 자동으로 지출을 삭제하거나 금액을 수정하지 않습니다.
- 기능 장애가 나도 예전 `Anyone can read trips` 정책, 테이블 권한, Realtime 발행을 복구하지 않습니다. 안전한 RPC를 유지한 채 UI를 고치거나 임시 점검 화면을 배포합니다. 과거의 취약한 앱과 DB를 함께 되돌리는 방식은 사용하지 않습니다.
- 백업에서 복원해야 한다면 외부 접속이 차단된 상태에서 복원한 뒤 이 보안 스크립트를 재적용하고, 키 재발급을 마친 후 공개합니다.

GitHub Pages 자체의 응답 헤더 설정 한계 때문에 클릭재킹 방어용 `frame-ancestors`는 이번 정적 HTML에 넣지 않았습니다. 해당 요구가 있으면 헤더를 제어할 수 있는 배포 구성을 별도로 선택해야 합니다.
