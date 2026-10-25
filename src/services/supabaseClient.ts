import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppDatabase } from '../types';

const DEFAULT_SUPABASE_URL = 'https://gdoxbonoiumnpiswqris.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_eYFPXHwHldj4nqSombGNaA_ZWDOZRON';

export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string)?.trim() || DEFAULT_SUPABASE_URL;

export const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim() || DEFAULT_SUPABASE_ANON_KEY;

export const SUPABASE_TABLE_NAME = 'aplus2_app_state';
export const SUPABASE_MAIN_ROW_ID = 'aplus2_main';

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
        },
      })
    : null;

export type SupabaseSyncStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'SYNCING'
  | 'TABLE_MISSING'
  | 'ERROR';

export interface SupabaseFetchResult {
  status: SupabaseSyncStatus;
  data?: AppDatabase;
  updatedAt?: string;
  errorMessage?: string;
}

export const SUPABASE_SETUP_SQL = `-- Dán đoạn lệnh SQL này vào mục "SQL Editor" trên Supabase (https://supabase.com) và bấm "Run":
-- Kịch bản này tạo bảng đồng bộ chính + toàn bộ 11 bảng chi tiết (teachers, classes, students, enrollments, receivables, receipts, payrolls, cashflows, accounts...) và Trigger tự động cập nhật!

CREATE TABLE IF NOT EXISTS public.aplus2_app_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE OR REPLACE FUNCTION public.sync_aplus2_state_to_tables()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.teachers;
  IF jsonb_typeof(NEW.payload->'teachers') = 'array' THEN
    INSERT INTO public.teachers (code, full_name, phone, email, group_code, specialty, workplace, salary_model, salary_rate, status, note, updated_at)
    SELECT COALESCE(item->>'code',''), COALESCE(item->>'fullName',''), item->>'phone', item->>'email', item->>'group', item->>'specialty', item->>'workplace', item->>'salaryModel', COALESCE((item->>'salaryRate')::NUMERIC,0), COALESCE(item->>'status','ACTIVE'), item->>'note', NOW()
    FROM jsonb_array_elements(NEW.payload->'teachers') AS item WHERE COALESCE(item->>'code','') <> '' ON CONFLICT (code) DO NOTHING;
  END IF;

  DELETE FROM public.classes;
  IF jsonb_typeof(NEW.payload->'classes') = 'array' THEN
    INSERT INTO public.classes (code, name, subject, group_code, grade, teacher_code, schedule_summary, start_date, end_date, fee_per_session, billing_method, max_students, room_code, status, schedule_items, updated_at)
    SELECT COALESCE(item->>'code',''), COALESCE(item->>'name',''), item->>'subject', item->>'group', item->>'grade', item->>'teacherCode', item->>'scheduleSummary', item->>'startDate', item->>'endDate', COALESCE((item->>'feePerSession')::BIGINT,50000), item->>'billingMethod', COALESCE((item->>'maxStudents')::INT,25), item->>'roomCode', COALESCE(item->>'status','DANG_HOC'), COALESCE(item->'scheduleItems','[]'::jsonb), NOW()
    FROM jsonb_array_elements(NEW.payload->'classes') AS item WHERE COALESCE(item->>'code','') <> '' ON CONFLICT (code) DO NOTHING;
  END IF;

  DELETE FROM public.students;
  IF jsonb_typeof(NEW.payload->'students') = 'array' THEN
    INSERT INTO public.students (code, full_name, dob, gender, school, school_class, parent_name, phone, admission_date, status, credit_balance, note, updated_at)
    SELECT COALESCE(item->>'code',''), COALESCE(item->>'fullName',''), item->>'dob', item->>'gender', item->>'school', item->>'schoolClass', item->>'parentName', item->>'phone', item->>'admissionDate', COALESCE(item->>'status','DANG_HOC'), COALESCE((item->>'creditBalance')::BIGINT,0), item->>'note', NOW()
    FROM jsonb_array_elements(NEW.payload->'students') AS item WHERE COALESCE(item->>'code','') <> '' ON CONFLICT (code) DO NOTHING;
  END IF;

  DELETE FROM public.enrollments;
  IF jsonb_typeof(NEW.payload->'enrollments') = 'array' THEN
    INSERT INTO public.enrollments (id, student_code, class_code, enrollment_date, fee_start_date, end_date, actual_attended_sessions, stop_reason, applied_fee_per_session, discount_percent, discount_amount, status, updated_at)
    SELECT COALESCE(item->>'id',''), COALESCE(item->>'studentCode',''), COALESCE(item->>'classCode',''), item->>'enrollmentDate', item->>'feeStartDate', item->>'endDate', NULLIF(item->>'actualAttendedSessions','')::INT, item->>'stopReason', COALESCE((item->>'appliedFeePerSession')::BIGINT,50000), COALESCE((item->>'discountPercent')::NUMERIC,0), COALESCE((item->>'discountAmount')::BIGINT,0), COALESCE(item->>'status','DANG_HOC'), NOW()
    FROM jsonb_array_elements(NEW.payload->'enrollments') AS item WHERE COALESCE(item->>'id','') <> '' ON CONFLICT (id) DO NOTHING;
  END IF;

  DELETE FROM public.receivables;
  IF jsonb_typeof(NEW.payload->'receivables') = 'array' THEN
    INSERT INTO public.receivables (id, code, cycle_name, student_code, class_code, enrollment_id, due_date, session_count, unit_price, gross_amount, discount_amount, net_amount, paid_amount, remaining_debt, status, note, updated_at)
    SELECT COALESCE(item->>'id',''), item->>'code', item->>'cycleName', item->>'studentCode', item->>'classCode', item->>'enrollmentId', item->>'dueDate', COALESCE((item->>'sessionCount')::INT,0), COALESCE((item->>'unitPrice')::BIGINT,0), COALESCE((item->>'grossAmount')::BIGINT,0), COALESCE((item->>'discountAmount')::BIGINT,0), COALESCE((item->>'netAmount')::BIGINT,0), COALESCE((item->>'paidAmount')::BIGINT,0), COALESCE((item->>'remainingDebt')::BIGINT,0), item->>'status', item->>'note', NOW()
    FROM jsonb_array_elements(NEW.payload->'receivables') AS item WHERE COALESCE(item->>'id','') <> '' ON CONFLICT (id) DO NOTHING;
  END IF;

  DELETE FROM public.receipts;
  IF jsonb_typeof(NEW.payload->'receipts') = 'array' THEN
    INSERT INTO public.receipts (id, receipt_number, student_code, payment_date, total_amount, allocated_total, unallocated_credit, payment_method, collector_name, content, allocations, updated_at)
    SELECT COALESCE(item->>'id',''), item->>'receiptNumber', item->>'studentCode', item->>'paymentDate', COALESCE((item->>'totalAmount')::BIGINT,0), COALESCE((item->>'allocatedTotal')::BIGINT,0), COALESCE((item->>'unallocatedCredit')::BIGINT,0), item->>'paymentMethod', item->>'collectorName', item->>'content', COALESCE(item->'allocations','[]'::jsonb), NOW()
    FROM jsonb_array_elements(NEW.payload->'receipts') AS item WHERE COALESCE(item->>'id','') <> '' ON CONFLICT (id) DO NOTHING;
  END IF;

  DELETE FROM public.payrolls;
  IF jsonb_typeof(NEW.payload->'payrolls') = 'array' THEN
    INSERT INTO public.payrolls (id, code, period_name, teacher_code, teacher_name, final_salary, paid_amount, remaining_payable, status, line_items, updated_at)
    SELECT COALESCE(item->>'id',''), item->>'code', item->>'periodName', item->>'teacherCode', item->>'teacherName', COALESCE((item->>'finalSalary')::BIGINT,0), COALESCE((item->>'paidAmount')::BIGINT,0), COALESCE((item->>'remainingPayable')::BIGINT,0), item->>'status', COALESCE(item->'lineItems','[]'::jsonb), NOW()
    FROM jsonb_array_elements(NEW.payload->'payrolls') AS item WHERE COALESCE(item->>'id','') <> '' ON CONFLICT (id) DO NOTHING;
  END IF;

  DELETE FROM public.cashflows;
  IF jsonb_typeof(NEW.payload->'cashflows') = 'array' THEN
    INSERT INTO public.cashflows (id, code, date, type, category, amount, payment_method, description, created_by, updated_at)
    SELECT COALESCE(item->>'id',''), item->>'code', item->>'date', item->>'type', item->>'category', COALESCE((item->>'amount')::BIGINT,0), item->>'paymentMethod', item->>'description', item->>'createdBy', NOW()
    FROM jsonb_array_elements(NEW.payload->'cashflows') AS item WHERE COALESCE(item->>'id','') <> '' ON CONFLICT (id) DO NOTHING;
  END IF;

  DELETE FROM public.accounts;
  IF jsonb_typeof(NEW.payload->'accounts') = 'array' THEN
    INSERT INTO public.accounts (id, username, password, full_name, role, linked_teacher_code, linked_student_code, status, updated_at)
    SELECT COALESCE(item->>'id',''), COALESCE(item->>'username',''), COALESCE(item->>'password','123456'), COALESCE(item->>'fullName',''), COALESCE(item->>'role','ACADEMIC'), item->>'linkedTeacherCode', item->>'linkedStudentCode', COALESCE(item->>'status','ACTIVE'), NOW()
    FROM jsonb_array_elements(NEW.payload->'accounts') AS item WHERE COALESCE(item->>'id','') <> '' ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_aplus2_state_to_tables ON public.aplus2_app_state;
CREATE TRIGGER trg_sync_aplus2_state_to_tables
AFTER INSERT OR UPDATE ON public.aplus2_app_state
FOR EACH ROW EXECUTE FUNCTION public.sync_aplus2_state_to_tables();

ALTER TABLE public.aplus2_app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phep doc ghi du lieu APLUS 2" ON public.aplus2_app_state;
CREATE POLICY "Cho phep doc ghi du lieu APLUS 2" ON public.aplus2_app_state FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all teachers" ON public.teachers;
CREATE POLICY "Public all teachers" ON public.teachers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all classes" ON public.classes;
CREATE POLICY "Public all classes" ON public.classes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all students" ON public.students;
CREATE POLICY "Public all students" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all enrollments" ON public.enrollments;
CREATE POLICY "Public all enrollments" ON public.enrollments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all receivables" ON public.receivables;
CREATE POLICY "Public all receivables" ON public.receivables FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all receipts" ON public.receipts;
CREATE POLICY "Public all receipts" ON public.receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all payrolls" ON public.payrolls;
CREATE POLICY "Public all payrolls" ON public.payrolls FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all cashflows" ON public.cashflows;
CREATE POLICY "Public all cashflows" ON public.cashflows FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public all accounts" ON public.accounts;
CREATE POLICY "Public all accounts" ON public.accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);`;

export async function fetchDatabaseFromSupabase(): Promise<SupabaseFetchResult> {
  if (!supabase) {
    return {
      status: 'ERROR',
      errorMessage: 'Chưa cấu hình VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE_NAME)
      .select('id, payload, updated_at')
      .eq('id', SUPABASE_MAIN_ROW_ID)
      .maybeSingle();

    if (error) {
      const code = (error as { code?: string }).code || '';
      const msg = error.message || '';
      if (
        code === '42P01' ||
        code === 'PGRST205' ||
        msg.includes('aplus2_app_state') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      ) {
        return {
          status: 'TABLE_MISSING',
          errorMessage:
            'Đã kết nối tới dự án Supabase của bạn! Chỉ cần chạy lệnh SQL tạo bảng `aplus2_app_state` trong mục SQL Editor của Supabase để bắt đầu lưu dữ liệu.',
        };
      }
      return {
        status: 'ERROR',
        errorMessage: `Lỗi truy vấn Supabase: ${msg}`,
      };
    }

    if (data && data.payload) {
      return {
        status: 'CONNECTED',
        data: data.payload as AppDatabase,
        updatedAt: data.updated_at,
      };
    }

    return {
      status: 'CONNECTED',
      data: undefined,
    };
  } catch (err) {
    return {
      status: 'ERROR',
      errorMessage: err instanceof Error ? err.message : 'Không thể kết nối tới Supabase.',
    };
  }
}

export async function saveDatabaseToSupabase(
  db: AppDatabase
): Promise<{ ok: boolean; updatedAt?: string; status: SupabaseSyncStatus; errorMessage?: string }> {
  if (!supabase) {
    return {
      ok: false,
      status: 'ERROR',
      errorMessage: 'Chưa khởi tạo Supabase client.',
    };
  }

  try {
    const now = new Date().toISOString();
    const { error } = await supabase.from(SUPABASE_TABLE_NAME).upsert(
      {
        id: SUPABASE_MAIN_ROW_ID,
        payload: db,
        updated_at: now,
      },
      { onConflict: 'id' }
    );

    if (error) {
      const code = (error as { code?: string }).code || '';
      const msg = error.message || '';
      if (
        code === '42P01' ||
        code === 'PGRST205' ||
        msg.includes('aplus2_app_state') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      ) {
        return {
          ok: false,
          status: 'TABLE_MISSING',
          errorMessage:
            'Bảng `public.aplus2_app_state` chưa được tạo trên Supabase. Hãy mở hướng dẫn SQL để tạo bảng.',
        };
      }
      return {
        ok: false,
        status: 'ERROR',
        errorMessage: msg,
      };
    }

    return {
      ok: true,
      updatedAt: now,
      status: 'CONNECTED',
    };
  } catch (err) {
    return {
      ok: false,
      status: 'ERROR',
      errorMessage: err instanceof Error ? err.message : 'Lỗi lưu dữ liệu lên Supabase.',
    };
  }
}
