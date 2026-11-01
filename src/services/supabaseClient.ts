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
const FALLBACK_SNAPSHOT_ID = '__APLUS2_STATE_SNAPSHOT__';

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
-- Kịch bản tạo đầy đủ tất cả các bảng dữ liệu chuẩn của Hệ thống Quản lý Trung tâm APLUS 2:

DROP TRIGGER IF EXISTS trg_sync_aplus2_state_to_tables ON public.aplus2_app_state;
DROP FUNCTION IF EXISTS public.sync_aplus2_state_to_tables();

-- 1. Bảng lưu trữ trạng thái đồng bộ trung tâm
CREATE TABLE IF NOT EXISTS public.aplus2_app_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Bảng Giáo viên
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

-- 3. Bảng Lớp học tại trung tâm
CREATE TABLE IF NOT EXISTS public.classes (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT,
  group_code TEXT,
  grade TEXT,
  teacher_code TEXT,
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

-- 4. Bảng Hồ sơ Học viên (hỗ trợ phân lớp trường phổ thông: 12TN1 - THPT Thanh Hoà)
CREATE TABLE IF NOT EXISTS public.students (
  code TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  dob TEXT,
  gender TEXT DEFAULT 'Nam',
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

-- 5. Bảng Đăng ký môn học / Ghi danh lớp
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

-- 6. Bảng Buổi học
CREATE TABLE IF NOT EXISTS public.sessions (
  id TEXT PRIMARY KEY,
  class_code TEXT NOT NULL,
  date TEXT NOT NULL,
  shift_id TEXT,
  room_code TEXT,
  teacher_code TEXT,
  substitute_teacher_code TEXT,
  topic TEXT,
  status TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Bảng Điểm danh
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

-- 8. Bảng Đợt thu học phí / Khoản phải thu
CREATE TABLE IF NOT EXISTS public.receivables (
  id TEXT PRIMARY KEY,
  code TEXT,
  cycle_name TEXT,
  student_code TEXT,
  class_code TEXT,
  enrollment_id TEXT,
  period_start TEXT,
  period_end TEXT,
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

-- 9. Bảng Phiếu thu học phí
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
  payer_name TEXT,
  content TEXT,
  allocations JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bổ sung cột mới nếu bảng đã tồn tại từ trước
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS period_start TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS period_end TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS payer_name TEXT;

-- 10. Bảng Lương Giáo viên
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

-- 11. Bảng Sổ quỹ Thu - Chi
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

-- 12. Bảng Tài khoản & Phân quyền
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

-- 13. Cấp quyền truy cập đọc/ghi cho ứng dụng (Anon Key)
ALTER TABLE public.aplus2_app_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflows DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;`;

let lastSyncedStudentsSignature = '';

async function syncRelationalTablesDirectly(db: AppDatabase, now: string): Promise<void> {
  if (!supabase) return;

  try {
    const tasks: Promise<unknown>[] = [];

    // 1. Đồng bộ bảng teachers
    if (Array.isArray(db.teachers) && db.teachers.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('teachers').upsert(
            db.teachers.map((t) => ({
              code: t.code,
              full_name: t.fullName,
              phone: t.phone || '',
              email: t.email || '',
              group_code: t.group,
              specialty: t.specialty || '',
              workplace: t.workplace || '',
              salary_model: t.salaryMethod,
              salary_rate: t.group === 'VH' ? (t.percentageRate ?? 0) : (t.shiftRate ?? 0),
              status: t.status || 'ACTIVE',
              note: t.note || '',
              updated_at: now,
            })),
            { onConflict: 'code' }
          )
        )
      );
    }

    // 2. Đồng bộ bảng classes (Tương thích cả cấu trúc (id, data, updated_at) và cấu trúc cột chi tiết)
    if (Array.isArray(db.classes) && db.classes.length > 0) {
      tasks.push(
        (async () => {
          const resJson = await supabase.from('classes').upsert(
            db.classes.map((c) => ({
              id: c.code,
              data: c,
              updated_at: now,
            })),
            { onConflict: 'id' }
          );
          if (resJson.error) {
            await supabase.from('classes').upsert(
              db.classes.map((c) => ({
                code: c.code,
                name: c.name,
                subject: c.subject || '',
                group_code: c.group,
                grade: c.grade || '',
                teacher_code: c.teacherCode || '',
                start_date: c.startDate || '',
                end_date: c.endDate || '',
                fee_per_session: c.feePerSession || 50000,
                billing_method: c.billingMethod,
                max_students: c.maxStudents || 25,
                room_code: c.roomCode || '',
                status: c.status || 'DANG_HOC',
                schedule_items: c.recurringSchedule || [],
                updated_at: now,
              })),
              { onConflict: 'code' }
            );
          }
        })()
      );
    }

    // 3. Đồng bộ bảng students theo lô (chỉ đẩy khi danh sách học viên thay đổi để tăng tốc tối đa)
    if (Array.isArray(db.students) && db.students.length > 0) {
      const firstCode = db.students[0]?.code || '';
      const lastCode = db.students[db.students.length - 1]?.code || '';
      const sig = `${db.students.length}:${firstCode}:${lastCode}`;
      if (sig !== lastSyncedStudentsSignature) {
        lastSyncedStudentsSignature = sig;
        tasks.push(
          (async () => {
            const chunkSize = 300;
            for (let i = 0; i < db.students.length; i += chunkSize) {
              const slice = db.students.slice(i, i + chunkSize);
              const resJson = await supabase.from('students').upsert(
                slice.map((s) => ({
                  id: s.code,
                  data: s,
                  school: s.school || '',
                  school_class: s.schoolClass || '',
                  updated_at: now,
                })),
                { onConflict: 'id' }
              );
              if (resJson.error) {
                await supabase.from('students').upsert(
                  slice.map((s) => ({
                    code: s.code,
                    full_name: s.fullName,
                    dob: s.dob || null,
                    gender: s.gender || 'Nam',
                    school: s.school || '',
                    school_class: s.schoolClass || '',
                    parent_name: s.parentName || '',
                    phone: s.phone || '',
                    admission_date: s.admissionDate || '',
                    status: s.status || 'DANG_HOC',
                    credit_balance: s.creditBalance || 0,
                    note: s.note || '',
                    updated_at: now,
                  })),
                  { onConflict: 'code' }
                );
              }
            }
          })()
        );
      }
    }

    // 4. Đồng bộ bảng enrollments
    if (Array.isArray(db.enrollments) && db.enrollments.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('enrollments').upsert(
            db.enrollments.map((e) => ({
              id: e.id,
              student_code: e.studentCode,
              class_code: e.classCode,
              enrollment_date: e.enrollmentDate || '',
              fee_start_date: e.feeStartDate || '',
              end_date: e.endDate || null,
              actual_attended_sessions: e.actualAttendedSessions ?? null,
              stop_reason: e.stopReason || null,
              applied_fee_per_session: e.appliedFeePerSession || 50000,
              discount_percent: e.discountPercent || 0,
              discount_amount: e.discountAmount || 0,
              status: e.status || 'DANG_HOC',
              updated_at: now,
            })),
            { onConflict: 'id' }
          )
        )
      );
    }

    // 5. Đồng bộ bảng sessions
    if (Array.isArray(db.sessions) && db.sessions.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('sessions').upsert(
            db.sessions.map((s) => ({
              id: s.id,
              class_code: s.classCode,
              date: s.date,
              shift_id: String(parseInt(String(s.shiftId).replace(/\D/g, ''), 10) || 1),
              room_code: s.roomCode || '',
              teacher_code: s.actualTeacherCode || '',
              substitute_teacher_code: null,
              topic: s.topic || s.skillNote || '',
              status: s.status || 'DU_KIEN',
              updated_at: now,
            })),
            { onConflict: 'id' }
          )
        )
      );
    }

    // 6. Đồng bộ bảng receivables
    if (Array.isArray(db.receivables) && db.receivables.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('receivables').upsert(
            db.receivables.map((r) => ({
              id: r.id,
              code: r.code,
              cycle_name: r.cycleName,
              student_code: r.studentCode,
              class_code: r.classCode,
              enrollment_id: r.enrollmentId,
              period_start: r.periodStart || '',
              period_end: r.periodEnd || '',
              due_date: r.dueDate,
              session_count: r.sessionCount || 0,
              unit_price: r.unitPrice || 0,
              gross_amount: r.grossAmount || 0,
              discount_amount: r.discountAmount || 0,
              net_amount: r.netAmount || 0,
              paid_amount: r.paidAmount || 0,
              remaining_debt: r.remainingDebt || 0,
              status: r.status,
              note: r.note || '',
              updated_at: now,
            })),
            { onConflict: 'id' }
          )
        )
      );
    }

    // 7. Đồng bộ bảng receipts
    if (Array.isArray(db.receipts) && db.receipts.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('receipts').upsert(
            db.receipts.map((rc) => ({
              id: rc.id,
              receipt_number: rc.receiptNumber,
              student_code: rc.studentCode,
              payment_date: rc.paymentDate,
              total_amount: rc.totalAmount || 0,
              allocated_total: rc.allocatedTotal || 0,
              unallocated_credit: rc.unallocatedCredit || 0,
              payment_method: rc.paymentMethod,
              collector_name: rc.collectorName || '',
              payer_name: rc.payerName || '',
              content: rc.content || '',
              allocations: rc.allocations || [],
              updated_at: now,
            })),
            { onConflict: 'id' }
          )
        )
      );
    }

    // 8. Đồng bộ bảng payrolls
    if (Array.isArray(db.payrolls) && db.payrolls.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('payrolls').upsert(
            db.payrolls.map((p) => ({
              id: p.id,
              code: p.code,
              period_name: p.periodName,
              teacher_code: p.teacherCode,
              teacher_name: p.teacherName,
              final_salary: p.finalSalary || 0,
              paid_amount: p.paidAmount || 0,
              remaining_payable: p.remainingPayable || 0,
              status: p.status,
              line_items: p.lineItems || [],
              updated_at: now,
            })),
            { onConflict: 'id' }
          )
        )
      );
    }

    // 9. Đồng bộ bảng cashflows
    if (Array.isArray(db.cashflows) && db.cashflows.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('cashflows').upsert(
            db.cashflows.map((cf) => ({
              id: cf.id,
              code: cf.code,
              date: cf.date,
              type: cf.type,
              category: cf.category,
              amount: cf.amount || 0,
              payment_method: cf.paymentMethod,
              description: cf.description || '',
              created_by: cf.createdBy || '',
              updated_at: now,
            })),
            { onConflict: 'id' }
          )
        )
      );
    }

    // 10. Đồng bộ bảng accounts
    if (Array.isArray(db.accounts) && db.accounts.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('accounts').upsert(
            db.accounts.map((acc) => ({
              id: acc.id,
              username: acc.username,
              password: acc.password || '123456',
              full_name: acc.fullName,
              role: acc.role,
              linked_teacher_code: acc.linkedTeacherCode || null,
              linked_student_code: acc.linkedStudentCode || null,
              status: acc.status || 'ACTIVE',
              updated_at: now,
            })),
            { onConflict: 'id' }
          )
        )
      );
    }

    // 11. Đồng bộ bảng attendance (các điểm danh thực tế)
    if (Array.isArray(db.attendance) && db.attendance.length > 0) {
      tasks.push(
        Promise.resolve(
          supabase.from('attendance').upsert(
            db.attendance
              .filter((a) => a.id !== FALLBACK_SNAPSHOT_ID)
              .map((a) => ({
                id: a.id,
                session_id: a.sessionId,
                class_code: a.classCode,
                student_code: a.studentCode,
                date: a.date,
                status: a.status,
                note: a.note || '',
                updated_at: now,
              })),
            { onConflict: 'id' }
          )
        )
      );
    }

    await Promise.allSettled(tasks);
  } catch {
    // Bỏ qua lỗi phụ ở bảng con nếu có để không cản trở luồng chính
  }
}

export async function fetchDatabaseFromSupabase(): Promise<SupabaseFetchResult> {
  if (!supabase) {
    return {
      status: 'ERROR',
      errorMessage: 'Chưa cấu hình VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const [mainRes, teachersRes, enrollmentsRes, receivablesRes, receiptsRes, accountsRes] =
      await Promise.all([
        supabase
          .from(SUPABASE_TABLE_NAME)
          .select('id, payload, updated_at')
          .eq('id', SUPABASE_MAIN_ROW_ID)
          .maybeSingle(),
        supabase.from('teachers').select('*'),
        supabase.from('enrollments').select('*'),
        supabase.from('receivables').select('*'),
        supabase.from('receipts').select('*'),
        supabase.from('accounts').select('*'),
      ]);

    if (mainRes.error) {
      const code = (mainRes.error as { code?: string }).code || '';
      const msg = mainRes.error.message || '';
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
            'Đã kết nối tới dự án Supabase của bạn! Chỉ cần chạy lệnh SQL khởi tạo bảng trong SQL Editor để bắt đầu lưu dữ liệu.',
        };
      }
      return {
        status: 'ERROR',
        errorMessage: `Lỗi truy vấn Supabase: ${msg}`,
      };
    }

    if (mainRes.data && mainRes.data.payload) {
      const p = mainRes.data.payload as AppDatabase;
      if (p && p.accounts && p.settings) {
        // Hợp nhất bổ sung từ các bảng quan hệ trên Supabase (tránh sót dữ liệu từ các bảng chi tiết)
        if (Array.isArray(teachersRes.data) && teachersRes.data.length > 0) {
          const tMap = new Map((p.teachers || []).map((t) => [t.code, t]));
          for (const row of teachersRes.data) {
            if (row.code && !tMap.has(row.code)) {
              const isVH = row.group_code === 'VH';
              tMap.set(row.code, {
                code: row.code,
                fullName: row.full_name || row.code,
                phone: row.phone || '',
                email: row.email || '',
                group: isVH ? 'VH' : 'TATT',
                specialty: row.specialty || '',
                qualification: 'Cử nhân',
                workplace: row.workplace || '',
                salaryMethod: isVH ? 'PERCENTAGE_RECEIPT' : 'PER_SHIFT',
                percentageRate: isVH ? Number(row.salary_rate || 70) : 0,
                shiftRate: !isVH ? Number(row.salary_rate || 300000) : 0,
                effectiveDate: '2026-07-01',
                status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                note: row.note || '',
                rateHistory: [],
              });
            }
          }
          p.teachers = Array.from(tMap.values());
        }

        if (Array.isArray(enrollmentsRes.data) && enrollmentsRes.data.length > 0) {
          const eMap = new Map((p.enrollments || []).map((e) => [e.id, e]));
          for (const row of enrollmentsRes.data) {
            if (row.id && !eMap.has(row.id)) {
              eMap.set(row.id, {
                id: row.id,
                studentCode: row.student_code,
                classCode: row.class_code,
                enrollmentDate: row.enrollment_date || '2026-07-06',
                feeStartDate: row.fee_start_date || '2026-07-06',
                endDate: row.end_date || undefined,
                actualAttendedSessions: row.actual_attended_sessions ?? undefined,
                stopReason: row.stop_reason || undefined,
                appliedFeePerSession: Number(row.applied_fee_per_session || 50000),
                discountPercent: Number(row.discount_percent || 0),
                discountAmount: Number(row.discount_amount || 0),
                status: row.status || 'DANG_HOC',
              });
            }
          }
          p.enrollments = Array.from(eMap.values());
        }

        if (Array.isArray(receivablesRes.data) && receivablesRes.data.length > 0) {
          const rMap = new Map((p.receivables || []).map((r) => [r.id, r]));
          for (const row of receivablesRes.data) {
            if (row.id && !rMap.has(row.id)) {
              rMap.set(row.id, {
                id: row.id,
                code: row.code || row.id,
                cycleName: row.cycle_name || 'Đợt học phí',
                studentCode: row.student_code,
                classCode: row.class_code,
                enrollmentId: row.enrollment_id || '',
                createdAt: (row.updated_at || '').slice(0, 10) || '2026-08-01',
                dueDate: row.due_date || '2026-08-15',
                periodStart: row.period_start || '2026-07-06',
                periodEnd: row.period_end || '2026-08-30',
                billingMethod: 'CYCLE_8_WEEKS',
                sessionIds: [],
                sessionDates: [],
                sessionCount: Number(row.session_count || 0),
                unitPrice: Number(row.unit_price || 50000),
                grossAmount: Number(row.gross_amount || 0),
                discountAmount: Number(row.discount_amount || 0),
                adjustmentAmount: 0,
                netAmount: Number(row.net_amount || 0),
                openingDebtReference: 0,
                paidAmount: Number(row.paid_amount || 0),
                remainingDebt: Number(row.remaining_debt || 0),
                status: row.status || 'CHUA_DONG',
                note: row.note || '',
              });
            }
          }
          p.receivables = Array.from(rMap.values());
        }

        if (Array.isArray(receiptsRes.data) && receiptsRes.data.length > 0) {
          const ptMap = new Map((p.receipts || []).map((pt) => [pt.id, pt]));
          for (const row of receiptsRes.data) {
            if (row.id && !ptMap.has(row.id)) {
              ptMap.set(row.id, {
                id: row.id,
                receiptNumber: row.receipt_number || row.id,
                studentCode: row.student_code,
                paymentDate: row.payment_date || '2026-08-01',
                totalAmount: Number(row.total_amount || 0),
                allocatedTotal: Number(row.allocated_total || 0),
                unallocatedCredit: Number(row.unallocated_credit || 0),
                paymentMethod: row.payment_method === 'TM' ? 'TM' : 'CK',
                collectorName: row.collector_name || 'Kế toán',
                payerName: row.payer_name || undefined,
                content: row.content || '',
                allocations: Array.isArray(row.allocations) ? row.allocations : [],
                createdAt: row.updated_at || new Date().toISOString(),
              });
            }
          }
          p.receipts = Array.from(ptMap.values());
        }

        if (Array.isArray(accountsRes.data) && accountsRes.data.length > 0) {
          const aMap = new Map((p.accounts || []).map((a) => [a.id, a]));
          for (const row of accountsRes.data) {
            if (row.id && !aMap.has(row.id)) {
              aMap.set(row.id, {
                id: row.id,
                username: row.username,
                password: row.password || '123456',
                fullName: row.full_name || row.username,
                role: row.role || 'ACCOUNTANT',
                linkedTeacherCode: row.linked_teacher_code || undefined,
                linkedStudentCode: row.linked_student_code || undefined,
                status: row.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
                lastLogin: row.updated_at || new Date().toISOString(),
              });
            }
          }
          p.accounts = Array.from(aMap.values());
        }

        return {
          status: 'CONNECTED',
          data: p,
          updatedAt: mainRes.data.updated_at || new Date().toISOString(),
        };
      }
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

    // 1. Lưu ngay lập tức vào bảng aplus2_app_state (đảm bảo tốc độ < 300ms, không bị nghẽn)
    const { error } = await supabase.from(SUPABASE_TABLE_NAME).upsert(
      {
        id: SUPABASE_MAIN_ROW_ID,
        payload: db,
        updated_at: now,
      },
      { onConflict: 'id' }
    );

    // 2. Đồng bộ nền sang toàn bộ các bảng chi tiết (teachers, classes, students, enrollments, sessions, receivables, receipts, payrolls, cashflows, accounts, attendance)
    void syncRelationalTablesDirectly(db, now);

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
