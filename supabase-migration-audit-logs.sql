-- 감사 로그 테이블
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,       -- 'payment', 'student', 'class', 'grade'
  entity_id uuid,
  action text NOT NULL,            -- 'create', 'update', 'delete'
  summary text NOT NULL,           -- 사람이 읽을 수 있는 요약
  details jsonb,                   -- 변경 상세 데이터
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
