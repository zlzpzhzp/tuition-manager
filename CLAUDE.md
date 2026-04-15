# Claude 작업 지침
@HANDOFF.md
@/root/shared/textbook-database.md
@/root/.claude/projects/-root-amnesia-manager/memory/apps/tuition.md
@/root/shared/bulletin.md

## 텔레그램 알림 규칙
- 터미널에서 확인 대기(permission prompt)가 발생하면 텔레그램으로 즉시 알린다
- 사용자는 터미널을 보고 있지 않으므로 텔레그램으로 승인 여부를 확인받는다
- 가만히 기다리지 말 것

## 속기사 모드 (대화 전체 기록)
- 세션 기록 시 사용자와 나눈 대화를 **전부** 기록하라 (중요한 것만 골라 적지 말 것)
- 텔레그램 메시지 포함, 시간순으로 원문에 가깝게 남긴다
- 다음 세션에서 맥락을 정확하게 이어가기 위함

## 메모리 시스템 (memory/)
- **세션 시작 시**: `WORK_CONTEXT.md`를 읽어서 전체 맥락 파악
- **작업 중**: 중요 작업 완료 시 `WORK_CONTEXT.md`의 "최근 작업" 섹션 갱신
- **세션 종료 시**: `WORK_CONTEXT.md`에 세션 요약 추가, `memory/sessions/`에 세션 파일 생성
- brain.md는 500줄 이내 유지. 오래된 세션은 한 줄로 압축

## 작업 컨텍스트 시스템

이 프로젝트에는 `WORK_CONTEXT.md` 파일이 있다. **모든 작업에서 반드시 따를 것:**

### 작업 시작 시 (세션 재시작 포함)
1. `git pull` 실행
2. **반드시** `WORK_CONTEXT.md`를 읽어서 이전 맥락 전부 복구하라
3. 이전 작업이 미완료 상태면 유저에게 알리고 이어서 할지 물어보기
4. 세션이 재시작된 경우 이전 대화 기억이 없으므로, WORK_CONTEXT.md의 세션 기록을 통해 맥락을 완전히 복구하라

### 작업 중
- 의미 있는 단위의 작업을 완료할 때마다 `WORK_CONTEXT.md` 업데이트
- 파일 수정, 기능 추가, 버그 수정 등 모든 변경사항 기록
- 아직 안 한 것, 다음에 해야 할 것도 기록

### 작업 종료 시 (커밋 전)
- `WORK_CONTEXT.md`에 최종 상태 반영
- 커밋에 WORK_CONTEXT.md 포함

## 프로젝트 규칙

- 작업 완료 시 묻지 말고 바로 커밋 → push → Vercel 프로덕션 배포까지 자동 실행
- Agent/Students 페이지는 Navbar에서 의도적으로 제거됨 - 되살리지 말 것
- 한국어로 소통

## 자가 복구 가이드

**문제 해결 순서**: 1) 에러 메시지 읽기 2) 아래 가이드 확인 3) 직접 해결 시도 4) 해결 안 되면 텔레그램으로 초능력자님께 보고 (원인 + 옵션 제시)

### Vercel 배포 실패
- `npx next build`로 로컬에서 먼저 빌드 확인
- `public/` 디렉토리에 대용량 파일이 없는지 확인 (Vercel 제한: 단일 파일 50MB)
- 빌드 로그의 에러 메시지를 정확히 읽고 해당 파일 수정

### Supabase 에러
- psql로 직접 접속해서 테이블/데이터 확인:
  ```bash
  PGPASSWORD="QvsrM2wmgQjUUL2Q" psql -h db.pasycnvfdotcdzzysqbz.supabase.co -p 5432 -U postgres -d postgres
  ```
- RLS 정책 문제인지, 스키마 문제인지, 데이터 문제인지 구분
- API 에러 시 Supabase 대시보드 로그도 확인

### 빌드 에러
- `npx eslint src/` 로 린트 에러 먼저 확인하고 수정
- TypeScript 에러는 `npx tsc --noEmit`으로 확인
- 린트 에러 발견 시 물어보지 말고 바로 수정


# 대화 아카이빙 (필수)
세션 종료 시 이번 세션의 대화 전문을 memory/conversations/conversation_YYYY-MM-DD.md에 저장하라.
- 텔레그램 메시지 + 터미널 작업 내용 포함
- 파일 상단에 키워드 5~10개 추출: `키워드: A, B, C, ...`
- 같은 날짜 파일이 있으면 아래에 추가
- 이것은 아카이브용이라 평소에 읽지 않음. 검색 시에만 사용.
