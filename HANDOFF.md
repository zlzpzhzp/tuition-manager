@handoff tuition 2026-04-15T21:15+09
role=원비 port=3001 stack=Next.js16,Supabase,Gemini

[completed]
69fd1cb 청구서 발송 UI + 중복 발송 방지 + 안정성 강화
e082db3 PaySsam 콜백 URL 미들웨어 인증 면제
067a41b 결제선생(PaySsam) API 연동 — client + route + DB tables
55a9757 Tailwind v4 클래스 충돌 수정
690aeb6 /simplify — CryptoKey 캐싱 + will-change 제거
5ae967d 미들웨어 crypto → Web Crypto API (Edge Runtime)
e9d3283 디자인 시스템 도입 — 시맨틱 토큰 + 하드코딩 색상 교체
e2c5a9f 보안: HMAC 세션 토큰 도입
436ec2a+f719a9e 토스급 UI/UX (Framer Motion, GPU 가속)

[state]
paysam.api=연동완료
paysam.callback=/api/paysam/callback
paysam.auth_exempt=true (미들웨어)
invoice.duplicate_check=student_id+month
invoice.ui=BillSendModal 완성
design=토스 다크 스타일, 시맨틱 토큰 적용
auth=HMAC 세션, Web Crypto API

[next]
1. 납부탭에 청구서 발송 버튼 추가 (미납 학생 인라인 폼)
2. 빌드+배포
3. 페이민트 검수 승인 대기 → 운영 전환

[trap]
- 같은 student_id+month 재발송 불가 (중복방지 로직)
- test 시 invoices 테이블 초기화 필요할 수 있음
- Tailwind v4 커스텀 클래스 충돌 주의 → 임의값([var(--x)]) 사용

[user_context]
오늘 작업량 많았음. PaySsam 연동+UI+보안+디자인 한번에 진행.
초능력자님이 결과물에 만족하는 상태.
