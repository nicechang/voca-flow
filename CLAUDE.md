# VocaFlow English Memorizer - 프로젝트 가이드

이 파일은 AI 개발 에이전트(Antigravity 등)가 이 프로젝트를 이해하고 관리할 수 있도록 안내하는 가이드 문서입니다.

## 🛠️ 기술 스택 & 구조
- **Frontend**: 표준 HTML5, CSS3 (Premium Dark Glassmorphism, 3D 카드 플립), 바닐라 JS (`app.js`)
- **Backend (Local)**: Python3 내장 모듈 기반 웹 서버 및 API 프록시 (`server.py`)
- **Backend (Cloud)**: Google Apps Script Web App (`google_script.js` -> Google Spreadsheet 연동)
- **Database**: 로컬 파일 DB (`database.json`) 및 구글 스프레드시트 2개 시트 (`Words`, `QuizLogs`)
- **주요 기능**: 네이버 영한사전 API 연동 (유사어, 활용표현 추출), Spaced Repetition (망각곡선 오답 누적 가중치 알고리즘), Speech TTS 재생

## 🚀 주요 명령어
- **로컬 개발 서버 실행**: 
  ```bash
  python3 server.py
  ```
  * 로컬 브라우저 주소: `http://localhost:8000`
  * Naver 사전 프록시 API: `/api/naver?query={단어}`
  * 로컬 파일 DB API: `/api/local-db` (GET/POST)

- **백그라운드 서버 모니터링**:
  ```bash
  lsof -i :8000
  ```

- **배포 및 빌드**:
  빌드 프로세스가 없는 정적 웹 앱이므로, 코드를 GitHub에 푸시하고 GitHub Pages를 활성화하면 바로 스마트폰에서 PWA(홈 화면에 추가) 형태로 전체화면으로 실행할 수 있습니다.

## 📌 개발 및 수정 규칙
1. **네이버 사전 CORS 회피**: 클라이언트 단에서 `dict.naver.com`으로 직접 페치 요청을 보내면 CORS 차단이 발생합니다. 반드시 로컬 서버의 `/api/naver` 프록시를 이용하거나, Cloud 모드 시 Google Apps Script의 `searchNaver` 액션을 사용해 요청해야 합니다.
2. **사전 요청 헤더 필수**: 네이버는 빈 헤더 차단을 방지하기 위해 반드시 `User-Agent`, `Referer: https://dict.naver.com/`, `Accept-Language` 헤더가 포함된 프록시 요청을 받아야 200 OK와 올바른 데이터를 리턴합니다.
3. **모바일 우선 디자인**: 손이 닿기 쉬운 하단 내비게이션 바(Sticky Bottom Bar)와 48px 이상의 넓은 터치 타겟을 설계하며, 3D 카드 플립 애니메이션 성능을 부드럽게 유지합니다.
4. **구글 시트 양방향 동기화**: 로컬 스토리지 데이터와 구글 스프레드시트 간의 무중단 양방향 머지(Merge) 로직을 탑재하여 타임스탬프가 최신인 데이터를 덮어쓰거나 결합하도록 관리합니다.
