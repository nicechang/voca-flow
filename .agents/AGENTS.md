# VocaFlow - 영어 암기 앱 프로젝트 가이드

이 문서에는 이 작업 공간(Workspace) 내의 VocaFlow 영어 암기 앱을 지속적으로 관리하고 개발하기 위한 프로젝트 규칙과 명령어 정보가 기술되어 있습니다.

---

## 📂 프로젝트 구조 (Project Structure)

*   **경로**: 루트 폴더 (`/`)가 바로 VocaFlow 프로젝트의 루트입니다.
*   **주요 파일**:
    *   [index.html](file:///Users/changwonsuh/.gemini/antigravity/scratch/voca-flow/index.html): 마크업 구조 및 PWA 모바일 세팅
    *   [styles.css](file:///Users/changwonsuh/.gemini/antigravity/scratch/voca-flow/styles.css): Premium Glassmorphism 테마 및 3D 카드 플립 애니메이션
    *   [app.js](file:///Users/changwonsuh/.gemini/antigravity/scratch/voca-flow/app.js): 상태 관리, 네이버 사전 파싱, 구글 시트 양방향 동기화 및 TTS 기능
    *   [server.py](file:///Users/changwonsuh/.gemini/antigravity/scratch/voca-flow/server.py): 로컬 Python 웹 서버 및 Naver API 프록시 (CORS 회피용)
    *   [google_script.js](file:///Users/changwonsuh/.gemini/antigravity/scratch/voca-flow/google_script.js): 구글 스프레드시트 Apps Script 연동 스크립트
    *   [database.json](file:///Users/changwonsuh/.gemini/antigravity/scratch/voca-flow/database.json): 로컬 모드용 파일 DB
    *   [README.md](file:///Users/changwonsuh/.gemini/antigravity/scratch/voca-flow/README.md): 프로젝트 설명서 및 깃허브 배포 가이드
*   **깃허브 저장소**: `https://github.com/nicechang/voca-flow.git`
*   **배포 웹페이지**: `https://nicechang.github.io/voca-flow/`

---

## 🚀 주요 개발 및 기동 명령어 (Commands)

### 1. VocaFlow 로컬 개발 서버 구동
로컬 웹 서버 및 API 프록시를 켭니다.
```bash
python3 server.py
```
*   로컬 호스트 주소: `http://localhost:8000`
*   네이버 API 프록시: `/api/naver?query={영어단어}`
*   로컬 파일 DB API: `/api/local-db` (GET/POST)

### 2. 버전 관리 및 푸시
```bash
git status
git add .
git commit -m "Commit message"
git push origin main
```

---

## 📌 개발 및 유지보수 규칙 (Guidelines)

1. **사전 조회 시 CORS 제약**: 브라우저 클라이언트 단에서 `dict.naver.com`으로 직접 요청하는 것은 브라우저 보안(CORS)으로 인해 차단됩니다. 단어를 검색할 때는 반드시 다음 프록시를 경유해 주세요:
   * **로컬 개발 모드**: 로컬 서버의 `/api/naver` 엔드포인트 경유
   * **클라우드 연동 모드**: Google Apps Script 웹앱 URL의 `action=searchNaver` 액션 경유
2. **동기화 병합(Merge) 규칙**: 데이터 동기화 시 로컬 스토리지의 단어와 구글 시트의 단어를 `id` 기반으로 비교합니다. 둘 다 존재하는 경우 `last_reviewed` 타임스탬프가 더 최신인 데이터가 덮어쓰여 병합됩니다.
3. **망각 곡선 가중치 공식**: 단어장의 오답률(Weakness Score)은 아래 공식에 의거하여 계산되며, 점수가 높을수록 카드 학습 및 퀴즈 세션에 가중 배치됩니다.
   $$\text{Score} = \frac{\text{Incorrect Count}}{\text{Correct Count} + \text{Incorrect Count} + 1} + (\text{Math.random()} \times 0.25)$$
