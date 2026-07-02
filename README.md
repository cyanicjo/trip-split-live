# 실시간 여행 n빵

GitHub Pages와 Supabase로 운영하는 링크 기반 여행 정산 웹앱입니다.

## 구조

- `docs/`: GitHub Pages에서 공개할 정적 웹앱
- `supabase/schema.sql`: Supabase SQL Editor에서 실행할 DB/RPC 설정
- `test/`: 정산 계산 테스트

Node 서버(`server.js`)는 사용하지 않습니다.

## 기능

- 링크 기반 여행 정산방
- 보기 링크와 편집 링크 분리
- 친구 추가
- 지출별 결제자 선택
- 지출별 n빵 참여자 선택
- Supabase 저장
- Supabase Realtime으로 실시간 갱신
- 누가 누구에게 얼마 보내면 되는지 송금표 계산

## 배포 순서

자세한 순서는 [DEPLOYMENT.md](./DEPLOYMENT.md)를 봐 주세요.

큰 흐름은 아래와 같습니다.

1. Supabase 프로젝트 생성
2. Supabase SQL Editor에서 `supabase/schema.sql` 실행
3. `docs/config.js`에 Supabase URL과 anon key 입력
4. GitHub에 push
5. GitHub repository Settings에서 Pages source를 `main` / `docs`로 설정

## 테스트

```bash
npm test
```
