---
name: threads-연결
description: 내 스레드(Threads) 계정을 요메이트에 연결해서, 말로 부탁하면 글 올리기·답글·삭제·최근 글과 조회수·댓글 확인을 하게 만든다. 쌤은 페이스북·스레드 로그인만 하고, CLI 설치·Meta 개발자 앱 만들기·권한·테스터·토큰 연결은 요메이트가 한다. "스레드 연결해 줘", "스레드에 올려 줘", "스레드 댓글 확인해 줘"에 쓴다.
---

# 스레드 연결 (Threads CLI for Yomates)

**원칙:** 이 스킬을 쓰는 사람은 학원 쌤이다. 쌤이 할 일은 로그인뿐이다. 나머지 설치와 화면 조작은 내가 명령과 브라우저로 한다.

처음 쓰면 '처음 한 번'을 끝까지 하고, 그 뒤로는 '매일 쓰기'만 한다. CLI는 `~/yomates-threads/threads.mjs` 하나이고, Node.js 18 이상이면 따로 설치할 패키지가 없다.

## 꼭 지킬 것

- **토큰은 내가 보지 않는다.** 화면의 '복사' 버튼으로 클립보드에 담고, `--from-clipboard` 명령으로 바로 파일에 넣는다.
  - 화면의 토큰 글자를 읽어 적지 않는다.
  - 채팅에 붙여 달라고 하지 않는다.
  - 명령어나 파일에 직접 쓰지 않는다.
- **토큰 위치:** 토큰은 쌤 컴퓨터의 `~/.yomates-threads/config.json`에만 있다. 이 파일을 깃이나 다른 곳에 올리지 않는다.
- **글 올리기와 지우기는 쌤 확인 뒤에:** 올리기 전에 본문을 보여 주고 확인받는다. 삭제는 되돌릴 수 없으니 꼭 먼저 묻는다.
- **링크:** 본문에 넣지 않고 `--link`로 첫 댓글에 단다. 본문에 링크가 있으면 도달이 줄어든다.

## 처음 한 번

### 1. CLI 내려받기 (내가)

먼저 `node -v`로 18 이상인지 본다. 없으면 https://nodejs.org LTS 설치를 안내하고 기다린다.

- 맥·리눅스:
  ```
  mkdir -p ~/yomates-threads && curl -fsSL https://raw.githubusercontent.com/from5302-lab/yomates-threads-skill/main/threads.mjs -o ~/yomates-threads/threads.mjs
  ```
- 윈도우(PowerShell):
  ```
  New-Item -ItemType Directory -Force "$HOME\yomates-threads" | Out-Null; Invoke-WebRequest https://raw.githubusercontent.com/from5302-lab/yomates-threads-skill/main/threads.mjs -OutFile "$HOME\yomates-threads\threads.mjs"
  ```
- 윈도우에서는 아래 명령의 `~/yomates-threads/threads.mjs`를 `"$HOME\yomates-threads\threads.mjs"`로 바꿔 쓴다.

`node ~/yomates-threads/threads.mjs status`가 `"connected": false`를 내면 내려받기는 끝난 것이다.

### 2. 로그인 (쌤이 직접)

1. 내 브라우저 창에 https://developers.facebook.com/apps 를 연다. 쌤에게 페이스북 계정으로 로그인해 달라고 하고 기다린다.
   - 처음이면 '개발자로 등록'을 묻는다. 휴대폰·이메일 인증은 쌤이 한다.
   - 2단계 인증 알림이 2분 넘게 안 오면 '다른 방법 시도'로 다시 보내라고 안내한다.
2. 같은 브라우저 새 탭에 https://www.threads.com 을 열고, 글을 올릴 스레드 계정으로 로그인해 달라고 한다.
   - 스레드 웹은 계정 전환이 안 된다. 계정이 여러 개면 올릴 계정으로 로그인해 두라고 미리 말한다.
3. 쌤이 스레드 사용자 이름(@ 없이)을 알려 주면 다음으로 넘어간다.

### 3. Meta 앱 만들기 (내가 화면 조작)

메뉴 이름은 Meta가 자주 바꾸니 비슷한 이름을 찾는다. 화면이 막히면 스크린샷을 보고 판단한다.

1. **앱 만들기:** 「앱 만들기」를 누르고, 사용 사례에서 「Threads API 액세스」를 고른다.
   - 비즈니스 포트폴리오는 「아직 연결하지 않음」을 고른다.
   - 앱 이름은 `yomates-threads-<사용자이름>`으로 한다.
   - 연락처 이메일은 이미 채워진 값을 둔다.
2. **권한:** 사용 사례 → Threads API → 「권한 및 기능」에서 아래 네 개를 「추가」한다.
   - `threads_content_publish`
   - `threads_manage_replies`
   - `threads_read_replies`
   - `threads_manage_insights`
3. **테스터:** 앱 역할 → 역할 → 「사람 추가」 → 「Threads 테스터」에 쌤 스레드 사용자 이름을 넣고 초대한다.
4. **초대 수락:** threads.com 탭에서 설정 → 계정 → 「웹사이트 권한」 → 「초대」로 가서 방금 앱의 초대를 수락한다. 쌤 계정에 쌤이 만든 앱을 잇는 것이라 내가 눌러도 된다.

앱이 '개발 모드'여도, 테스터로 등록한 본인 계정에는 검수 없이 바로 올릴 수 있다.

### 4. 토큰 연결 (값은 내가 보지 않는다)

1. 사용 사례 → Threads API → 「설정」 → 「사용자 토큰 생성기」에서 쌤 계정 옆 「액세스 토큰 생성하기」를 누른다.
2. 동의 창에서 그 계정으로 「계속」과 「허용」을 누른다.
3. 토큰 창에서 「이해합니다」를 체크하고 **'복사' 버튼**을 누른다. 화면의 토큰 글자는 읽지 않는다.
4. 실행한다.
   ```
   node ~/yomates-threads/threads.mjs setup --from-clipboard
   ```
   - CLI가 토큰을 저장하고 클립보드를 비운다. 화면에는 `@계정`과 남은 날(60일)만 나온다.
5. **복사 버튼이 없거나 'ERROR'(토큰 모양이 아님)가 나면:** 쌤에게 그 토큰의 복사만 부탁한다. "토큰 옆 복사를 눌러 주시고 '복사했어'라고만 알려 주세요. 채팅엔 붙이지 마세요."
6. `status`와 `recent 1`로 확인한다.
7. 쌤에게는 연결된 계정과 "이제 '스레드에 이 글 올려 줘'라고 하시면 돼요"만 알린다.

**토큰이 1시간 만에 끊기는 경우:**
1. 앱 설정 → 기본 설정의 「앱 시크릿 코드」 옆 '표시'와 '복사'를 누른다.
2. `secret --from-clipboard`를 실행한다.
3. 4단계를 다시 하면 60일짜리로 바뀐다. 시크릿 키는 바꾼 뒤 바로 지워진다.

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

- 본문은 500자까지 쓸 수 있다. 이미지는 공개 주소(https)만 된다.
- 결과는 JSON으로 나온다. 쌤에게는 글 주소(permalink)와 숫자만 말한다.
- 토큰은 60일 쓴다. 남은 날이 10일 아래로 내려가면 명령을 쓸 때 저절로 다시 60일로 늘어난다.
  - 60일 동안 한 번도 안 쓰면 만료된다. 그러면 '4. 토큰 연결'부터 다시 한다.
- 매일 같은 시각에 올리거나 댓글을 확인하고 싶다고 하면, 요메이트 루틴으로 이 명령을 돌린다. 올리는 루틴도 본문 확인 단계는 빼지 않는다.

## 막힐 때

- **`토큰이 만료됐거나 맞지 않아요`:** '4. 토큰 연결'을 다시 한다.
- **`클립보드 값이 토큰 모양이 아니에요`:** 토큰이 ●●●로 가려진 채 복사됐다. 「이해합니다」를 체크한 뒤 다시 복사한다.
- **권한 오류(`permission`):** '3. Meta 앱 만들기'의 권한 중 빠진 것이 있다. 추가한 뒤 토큰을 새로 만든다.
- **리눅스에서 클립보드를 못 읽을 때:** `xclip`이나 `wl-clipboard`를 설치한다.
- **연결 끊기:** `node ~/yomates-threads/threads.mjs logout`을 실행하면 이 컴퓨터의 토큰 파일이 지워진다.
