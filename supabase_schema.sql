-- =============================================================================
-- KỊCH BẢN SQL KHỞI TẠO CƠ SỞ DỮ LIỆU SUPABASE CHO TRUNG TÂM APLUS 2
-- Dự án Supabase: https://gdoxbonoiumnpiswqris.supabase.co
-- Hướng dẫn: Copy toàn bộ nội dung này dán vào mục "SQL Editor" trên Supabase và bấm "Run"
-- =============================================================================

-- 1. BẢNG ĐỒNG BỘ TRẠNG THÁI CHÍNH CỦA ỨNG DỤNG (Dùng để đồng bộ Realtime tức thì)
CREATE TABLE IF NOT EXISTS public.aplus2_app_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. BẢNG GIÁO VIÊN (teachers)
CREATE TABLE IF NOT EXISTS public.teachers (
  code TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  group_code TEXT,
  specialty TEXT,
  workplace TEXT,
  salary_model TEXT,
  salary_rate NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG LỚP HỌC (classes)
CREATE TABLE IF NOT EXISTS public.classes (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT,
  group_code TEXT,
  grade TEXT,
  teacher_code TEXT,
  schedule_summary TEXT,
  start_date TEXT,
  end_date TEXT,
  fee_per_session BIGINT DEFAULT 50000,
  billing_method TEXT,
  max_students INT DEFAULT 25,
  room_code TEXT,
  status TEXT DEFAULT 'DANG_HOC',
  schedule_items JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BẢNG HỒ SƠ HỌC VIÊN (students)
CREATE TABLE IF NOT EXISTS public.students (
  code TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  school TEXT,
  school_class TEXT,
  parent_name TEXT,
  phone TEXT,
  admission_date TEXT,
  status TEXT DEFAULT 'DANG_HOC',
  credit_balance BIGINT DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BẢNG ĐĂNG KÝ HỌC (enrollments)
CREATE TABLE IF NOT EXISTS public.enrollments (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL,
  class_code TEXT NOT NULL,
  enrollment_date TEXT,
  fee_start_date TEXT,
  end_date TEXT,
  actual_attended_sessions INT,
  stop_reason TEXT,
  applied_fee_per_session BIGINT DEFAULT 50000,
  discount_percent NUMERIC DEFAULT 0,
  discount_amount BIGINT DEFAULT 0,
  status TEXT DEFAULT 'DANG_HOC',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BẢNG BUỔI HỌC & LỊCH HỌC (sessions)
CREATE TABLE IF NOT EXISTS public.sessions (
  id TEXT PRIMARY KEY,
  class_code TEXT NOT NULL,
  date TEXT NOT NULL,
  shift_id INT,
  room_code TEXT,
  teacher_code TEXT,
  substitute_teacher_code TEXT,
  topic TEXT,
  status TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. BẢNG ĐIỂM DANH CHUYÊN CẦN (attendance)
CREATE TABLE IF NOT EXISTS public.attendance (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  class_code TEXT,
  student_code TEXT,
  date TEXT,
  status TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. BẢNG HỌC PHÍ & KHOẢN PHẢI THU (receivables)
CREATE TABLE IF NOT EXISTS public.receivables (
  id TEXT PRIMARY KEY,
  code TEXT,
  cycle_name TEXT,
  student_code TEXT,
  class_code TEXT,
  enrollment_id TEXT,
  due_date TEXT,
  session_count INT DEFAULT 0,
  unit_price BIGINT DEFAULT 0,
  gross_amount BIGINT DEFAULT 0,
  discount_amount BIGINT DEFAULT 0,
  net_amount BIGINT DEFAULT 0,
  paid_amount BIGINT DEFAULT 0,
  remaining_debt BIGINT DEFAULT 0,
  status TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. BẢNG PHIẾU THU HỌC PHÍ (receipts)
CREATE TABLE IF NOT EXISTS public.receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT,
  student_code TEXT,
  payment_date TEXT,
  total_amount BIGINT DEFAULT 0,
  allocated_total BIGINT DEFAULT 0,
  unallocated_credit BIGINT DEFAULT 0,
  payment_method TEXT,
  collector_name TEXT,
  content TEXT,
  allocations JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. BẢNG LƯƠNG GIÁO VIÊN (payrolls)
CREATE TABLE IF NOT EXISTS public.payrolls (
  id TEXT PRIMARY KEY,
  code TEXT,
  period_name TEXT,
  teacher_code TEXT,
  teacher_name TEXT,
  final_salary BIGINT DEFAULT 0,
  paid_amount BIGINT DEFAULT 0,
  remaining_payable BIGINT DEFAULT 0,
  status TEXT,
  line_items JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. BẢNG SỔ THU - CHI TÀI CHÍNH (cashflows)
CREATE TABLE IF NOT EXISTS public.cashflows (
  id TEXT PRIMARY KEY,
  code TEXT,
  date TEXT,
  type TEXT,
  category TEXT,
  amount BIGINT DEFAULT 0,
  payment_method TEXT,
  description TEXT,
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. BẢNG TÀI KHOẢN & PHÂN QUYỀN (accounts)
CREATE TABLE IF NOT EXISTS public.accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT DEFAULT '123456',
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  linked_teacher_code TEXT,
  linked_student_code TEXT,
  status TEXT DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- GỠ BỎ TRIGGER CŨ (nếu có) ĐỂ TRÁNH LỖI pg_safeupdate (code 21000: DELETE without WHERE)
-- Ứng dụng APLUS 2 hiện đã tự động đồng bộ trực tiếp vào tất cả các bảng chi tiết!
-- =============================================================================
DROP TRIGGER IF EXISTS trg_sync_aplus2_state_to_tables ON public.aplus2_app_state;
DROP FUNCTION IF EXISTS public.sync_aplus2_state_to_tables();

-- =============================================================================
-- PHÂN QUYỀN TRUY CẬP (ROW LEVEL SECURITY - RLS) CHO SUPABASE API
-- =============================================================================
ALTER TABLE public.aplus2_app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phep doc ghi du lieu APLUS 2" ON public.aplus2_app_state;
CREATE POLICY "Cho phep doc ghi du lieu APLUS 2" ON public.aplus2_app_state FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write teachers" ON public.teachers;
CREATE POLICY "Public read write teachers" ON public.teachers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write classes" ON public.classes;
CREATE POLICY "Public read write classes" ON public.classes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write students" ON public.students;
CREATE POLICY "Public read write students" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write enrollments" ON public.enrollments;
CREATE POLICY "Public read write enrollments" ON public.enrollments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write sessions" ON public.sessions;
CREATE POLICY "Public read write sessions" ON public.sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write attendance" ON public.attendance;
CREATE POLICY "Public read write attendance" ON public.attendance FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write receivables" ON public.receivables;
CREATE POLICY "Public read write receivables" ON public.receivables FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write receipts" ON public.receipts;
CREATE POLICY "Public read write receipts" ON public.receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write payrolls" ON public.payrolls;
CREATE POLICY "Public read write payrolls" ON public.payrolls FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write cashflows" ON public.cashflows;
CREATE POLICY "Public read write cashflows" ON public.cashflows FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read write accounts" ON public.accounts;
CREATE POLICY "Public read write accounts" ON public.accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
