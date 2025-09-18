# JCAI (Jeonbuk Clean Air Index)
Air Trader - 대기질 기반 선물 계약 거래 시스템

## 실행 방법

### 1. 백엔드 서버 실행
```bash
cd air-trader/server
node index.js
```
백엔드 서버는 포트 5001에서 실행됩니다.

### 2. 프론트엔드 서버 실행
```bash
cd air-trader/client
python -m http.server 8001
```
프론트엔드는 포트 8001에서 실행됩니다.

### 3. 애플리케이션 접속
웹 브라우저에서 다음 주소로 접속합니다:
```
http://localhost:8001
```

## 주의사항
- 백엔드 서버가 반드시 먼저 실행되어야 합니다.
- 포트 5001(백엔드)과 8001(프론트엔드)이 다른 프로그램에서 사용 중이면 실행이 실패할 수 있습니다.
- "Failed to fetch" 오류가 발생하면 백엔드 서버가 실행 중인지 확인하세요.
