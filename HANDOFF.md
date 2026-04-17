@handoff tuition 2026-04-16T07:00+09
role=원비 port=3001 stack=Next.js16,Supabase,Gemini

[completed]
9287d00 납부 페이지 대대적 UI 개선 + 학생 데이터 정비
69fd1cb 청구서 발송 UI + 중복 발송 방지 + 안정성 강화
e082db3 PaySsam 콜백 URL 미들웨어 인증 면제
067a41b 결제선생(PaySsam) API 연동 — client + route + DB tables

[state]
paysam.api=연동완료 (스테이징서버)
paysam.callback=/api/paysam/callback
paysam.auth_exempt=true (미들웨어)
invoice.duplicate_check=student_id+month
invoice.ui=BillSendModal 중앙배치
design=토스다크, 디자인토큰 전면적용, 하드코딩색상 제거완료
auth=HMAC 세션, Web Crypto API
payment_method.default=payssam (결선)
payment_method.removed=remote (비대면→자동처리)
method_picker=포탈+스태거애니메이션 (업로더스타일)
phone.imported=엑셀→168명매칭→parent_phone 일괄등록
phone.indicator=📵 (미등록학생 표시)
payment_due_day=3월결제일기준 204명 설정완료
rls.tuition_students=anon INSERT/UPDATE/DELETE 추가

[next]
1. 명단불일치 33명 확인 (초능력자님 수동)
2. 페이민트 검수 승인 대기 → 운영 URL 전환
3. Vercel 배포

[trap]
- 같은 student_id+month 재발송 불가 (중복방지 로직)
- Tailwind v4 커스텀 클래스 충돌 주의 → 임의값 사용
- 드롭다운 overflow-hidden 이슈 → 포탈(createPortal) 필수
- payssam API는 stg.paymint.co.kr (스테이징)

[user_context]
초능력자님이 직접 앱 테스트하며 피드백 주는 중.
결제선생 앱에서 학생등록도 시도했으나 API발송만으로 충분한 상태.
명단 불일치(엑셀33명>DB) 확인작업 예정.
