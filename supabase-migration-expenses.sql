-- 학원 지출 항목 테이블
CREATE TABLE IF NOT EXISTS academy_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_month TEXT NOT NULL,          -- YYYY-MM
  category TEXT NOT NULL,               -- 'fixed' 또는 'variable'
  name TEXT NOT NULL,                   -- 항목명 (임대료, 관리비, 비품 등)
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE academy_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON academy_expenses
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_academy_expenses_month
  ON academy_expenses(billing_month);
