-- 선생님 보너스 테이블
CREATE TABLE IF NOT EXISTS teacher_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES tuition_teachers(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,  -- YYYY-MM
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE teacher_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON teacher_bonuses
  FOR ALL USING (true) WITH CHECK (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_teacher_bonuses_teacher_month
  ON teacher_bonuses(teacher_id, billing_month);
