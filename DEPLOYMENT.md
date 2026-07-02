# GitHub + Railway 배포 가이드

이 앱은 GitHub에 코드를 올리고 Railway에서 실행하면 고정 링크로 사용할 수 있습니다.

## 1. GitHub에 올리기

1. GitHub에서 새 repository를 만듭니다.
2. 이름은 `trip-split-live`처럼 정합니다.
3. 아래 명령을 이 폴더에서 실행합니다.

```bash
git remote add origin https://github.com/YOUR_ID/trip-split-live.git
git branch -M main
git push -u origin main
```

`YOUR_ID`는 본인의 GitHub 아이디로 바꿔 주세요.

이미 `remote origin already exists`가 나오면 `remote add` 대신 아래 명령을 사용합니다.

```bash
git remote set-url origin https://github.com/YOUR_ID/trip-split-live.git
git push -u origin main
```

GitHub가 비밀번호를 물어볼 때는 GitHub 계정 비밀번호를 넣으면 안 됩니다.
GitHub는 터미널 push에서 계정 비밀번호 로그인을 지원하지 않습니다.

가장 쉬운 방법은 둘 중 하나입니다.

- GitHub Desktop으로 이 폴더를 열고 `Publish repository`를 누르기
- GitHub Personal Access Token을 만든 뒤, 터미널의 `Password` 자리에 토큰 붙여넣기

토큰으로 진행할 때 필요한 권한은 repository의 `Contents: Read and write`입니다.

## 2. Railway에서 배포하기

1. Railway에 로그인합니다.
2. `New Project`를 누릅니다.
3. `Deploy from GitHub repo`를 선택합니다.
4. GitHub 권한을 연결하고 `trip-split-live` repository를 선택합니다.
5. 배포가 끝나면 Railway가 고정 URL을 만들어 줍니다.

## 3. 데이터가 안 날아가게 Volume 붙이기

Railway 프로젝트에서 Volume을 추가한 뒤 앱에 붙입니다.

권장 설정:

- Mount path: `/app/data`
- Environment variable: `DATA_DIR=/app/data`

이렇게 하면 친구, 지출, 정산 데이터가 서버 재시작 후에도 유지됩니다.

## 4. 친구에게 공유하기

Railway URL을 열면 새 여행방으로 이동합니다.

예:

```text
https://your-app-name.up.railway.app/t/trip-xxxx
```

친구들에게는 `/t/trip-xxxx`가 붙은 여행방 링크를 보내면 됩니다.
