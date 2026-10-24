---
name: threads-연결
description: 내 스레드(Threads) 계정을 요메이트에 연결해서, 말로 부탁하면 글 올리기·답글·삭제·최근 글과 조회수·댓글 확인을 하게 만든다. 처음 실행하면 스레드 CLI를 내려받고, Meta 개발자 앱 만들기부터 토큰 연결까지 단계별로 안내한다. "스레드 연결해 줘", "스레드에 올려 줘", "스레드 댓글 확인해 줘"에 쓴다.
---

# 스레드 연결 (Threads CLI for Yomates)

이 스킬을 처음 쓰면 아래 '처음 한 번'을 끝까지 하고, 그 뒤로는 '매일 쓰기'만 한다.
CLI는 `~/yomates-threads/threads.mjs` 하나다. Node.js 18 이상이면 따로 설치할 패키지가 없다.

## 꼭 지킬 것

- **토큰은 내가 보지 않는다.** 토큰과 앱 시크릿 키는 셀러가 직접 복사하고, 나는 `--from-clipboard` 명령으로 클립보드에서 바로 파일에 넣는다.
  - 채팅에 붙여 넣어 달라고 하지 않는다.
  - 화면에서 값을 읽지 않는다.
  - 명령어나 파일에 직접 적지 않는다.
- **토큰 위치:** 토큰은 셀러 컴퓨터의 `~/.yomates-threads/config.json`에만 있다. 이 파일을 깃이나 다른 곳에 올리지 않는다.
- **글 올리기와 지우기는 셀러 확인 뒤에:** 올리기 전에 본문을 보여 주고 확인받는다. 삭제는 되돌릴 수 없으니 꼭 먼저 묻는다.
- **링크:** 본문에 넣지 않고 `--link`로 첫 댓글에 단다. 본문에 링크가 있으면 도달이 줄어든다.

## 처음 한 번

### 1. CLI 내려받기

먼저 Node.js가 있는지 본다: `node -v`. 18보다 낮거나 없으면 https://nodejs.org 에서 LTS를 설치하라고 안내하고 기다린다.

- 맥·리눅스:
  ```
  mkdir -p ~/yomates-threads && curl -fsSL https://raw.githubusercontent.com/from5302-lab/yomates-threads-skill/main/threads.mjs -o ~/yomates-threads/threads.mjs
  ```
- 윈도우(PowerShell):
  ```
  New-Item -ItemType Directory -Force "$HOME\yomates-threads" | Out-Null; Invoke-WebRequest https://raw.githubusercontent.com/from5302-lab/yomates-threads-skill/main/threads.mjs -OutFile "$HOME\yomates-threads\threads.mjs"
  ```

`node ~/yomates-threads/threads.mjs status`가 `"connected": false`를 내면 내려받기는 끝난 것이다.

### 2. Meta 개발자 앱 만들기 (셀러가 직접 로그인)

브라우저 창에 https://developers.facebook.com/apps 를 열고, 셀러에게 페이스북 계정으로 직접 로그인해 달라고 한다.
- 2단계 인증 알림이 2분 넘게 안 오면 '다른 방법 시도'로 다시 보내라고 안내한다.
- 메뉴 이름은 Meta가 자주 바꾸니, 화면에서 비슷한 이름을 찾아 누른다.

1. **앱 만들기:** 「앱 만들기」를 누르고, 사용 사례에서 「Threads API 액세스」를 고른다.
   - 비즈니스 포트폴리오는 「아직 연결하지 않음」을 고른다.
   - 앱 이름은 아무거나 괜찮다. 예: `my-threads-yomates`
2. **권한 추가:** 사용 사례 → Threads API → 「권한 및 기능」으로 간다. 기본으로 켜진 `threads_basic` 말고 아래 네 개를 「추가」한다.
   - `threads_content_publish` (글 올리기)
   - `threads_manage_replies` (답글)
   - `threads_read_replies` (댓글 읽기)
   - `threads_manage_insights` (조회수)
3. **테스터 초대:** 앱 역할 → 역할 → 「사람 추가」 → 「Threads 테스터」를 고르고, 셀러의 스레드 사용자 이름을 넣는다.
4. **초대 수락 (셀러가 직접):** 같은 브라우저에서 https://www.threads.com 에 그 스레드 계정으로 로그인한다. 그다음 설정 → 계정 → 「웹사이트 권한」 → 「초대」 탭에서 앱 초대를 수락한다.
   - 스레드 계정이 여러 개면, 토큰을 받을 계정으로 로그인해 두라고 미리 말한다.

앱이 '개발 모드'여도, 테스터로 등록한 본인 계정에는 검수 없이 바로 올릴 수 있다.

### 3. 토큰 연결 (값은 셀러가 복사, 나는 클립보드에서 저장)

1. 사용 사례 → Threads API → 「설정」 탭 → 「사용자 토큰 생성기」에서 셀러 계정 옆 「액세스 토큰 생성하기」를 누른다.
2. 동의 창이 뜨면 셀러가 '계속'과 '허용'을 누른다.
3. 토큰 창이 뜨면 셀러에게 이렇게 말한다. "아래 「이해합니다」를 체크하고, TH로 시작하는 토큰을 복사해 주세요. 채팅에는 붙여 넣지 마세요. 복사하셨으면 '복사했어'라고만 알려 주세요."
4. 셀러가 복사했다고 하면 실행한다.
   ```
   node ~/yomates-threads/threads.mjs setup --from-clipboard
   ```
   CLI는 토큰을 저장하고 클립보드를 비운 뒤, 연결된 `@계정`과 남은 날(60일)만 보여 준다.
5. 확인한다.
   ```
   node ~/yomates-threads/threads.mjs status
   node ~/yomates-threads/threads.mjs recent 1
   ```

**토큰이 1시간 만에 끊기는 경우:** 앱 설정 → 기본 설정에서 「앱 시크릿 코드」를 셀러가 복사하게 한다. 그다음 `secret --from-clipboard`를 실행하고, 토큰을 다시 복사해서 `setup --from-clipboard`를 실행한다. 이렇게 하면 60일짜리로 바뀌고, 시크릿 키는 바꾼 뒤 바로 지워진다.

## 매일 쓰기

| 할 일 | 명령 |
|---|---|
| 글 올리기 | `node ~/yomates-threads/threads.mjs post "본문" [--link URL] [--image 공개이미지URL]` |
| 답글 | `node ~/yomates-threads/threads.mjs reply <글ID> "본문"` |
| 삭제 | `node ~/yomates-threads/threads.mjs delete <글ID>` |
| 최근 글 (+조회수) | `node ~/yomates-threads/threads.mjs recent 5 --metrics` |
| 글 하나 조회수 | `node ~/yomates-threads/threads.mjs metrics <글ID>` |
| 남이 단 댓글 | `node ~/yomates-threads/threads.mjs scan 10` |
| 연결 상태 | `node ~/yomates-threads/threads.mjs status` |

- **윈도우(PowerShell):** `~/yomates-threads/threads.mjs` 대신 `"$HOME\yomates-threads\threads.mjs"`로 쓴다.
- 본문은 500자까지 쓸 수 있다. 이미지는 공개 주소(https)만 된다.
- 결과는 JSON으로 나온다. 셀러에게는 글 주소(permalink)와 숫자만 말한다.
- 토큰은 60일 쓴다. 남은 날이 10일 아래로 내려가면 명령을 쓸 때 저절로 다시 60일로 늘어난다.
  - 60일 동안 한 번도 안 쓰면 만료된다. 그러면 '3. 토큰 연결'부터 다시 한다.
- 매일 같은 시각에 올리거나 댓글을 확인하고 싶다고 하면, 요메이트 루틴으로 이 명령을 돌린다. 올리는 루틴은 본문 확인 단계를 빼지 않는다.

## 막힐 때

- **`토큰이 만료됐거나 맞지 않아요`:** '3. 토큰 연결'을 다시 한다.
- **`클립보드 값이 토큰 모양이 아니에요`:** 토큰이 ●●●로 가려진 채 복사됐다. 「이해합니다」를 체크한 뒤 다시 복사한다.
- **권한 오류(`permission`):** '2. 권한 추가'에서 빠진 권한이 있다. 추가한 뒤 토큰을 새로 만든다.
- **리눅스에서 클립보드를 못 읽을 때:** `xclip`이나 `wl-clipboard`를 설치한다.
- **연결 끊기:** `node ~/yomates-threads/threads.mjs logout`을 실행하면 이 컴퓨터의 토큰 파일이 지워진다.
