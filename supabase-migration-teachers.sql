-- 선생님 테이블 생성
CREATE TABLE IF NOT EXISTS tuition_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  memo TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE tuition_teachers ENABLE ROW LEVEL SECURITY;

-- anon 사용자 전체 접근 허용 (기존 테이블과 동일한 정책)
CREATE POLICY "Allow all for anon" ON tuition_teachers
  FOR ALL USING (true) WITH CHECK (true);

-- 반 테이블에 선생님 FK 추가
ALTER TABLE tuition_classes
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES tuition_teachers(id) ON DELETE SET NULL;
