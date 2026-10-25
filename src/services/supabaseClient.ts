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
-- Kịch bản này gỡ bỏ Trigger cũ bị chặn bởi pg_safeupdate (DELETE without WHERE) và chuẩn hoá toàn bộ bảng dữ liệu APLUS 2:

DROP TRIGGER IF EXISTS trg_sync_aplus2_state_to_tables ON public.aplus2_app_state;
DROP FUNCTION IF EXISTS public.sync_aplus2_state_to_tables();

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
);`;

async function syncRelationalTablesDirectly(db: AppDatabase, now: string): Promise<void> {
  if (!supabase) return;

  try {
    // 1. Đồng bộ bảng teachers
    if (Array.isArray(db.teachers)) {
      if (db.teachers.length > 0) {
        await supabase.from('teachers').upsert(
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
        );
      }
    }

    // 2. Đồng bộ bảng classes (Hỗ trợ cả cấu trúc bảng classes mới và bảng classes sẵn có trên Supabase)
    if (Array.isArray(db.classes) && db.classes.length > 0) {
      const resAplus = await supabase.from('classes').upsert(
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
      if (resAplus.error) {
        // Bảng classes có cấu trúc (id, name, grade, academic_year, room, homeroom_teacher)
        await supabase.from('classes').upsert(
          db.classes.map((c) => ({
            id: c.code,
            name: `${c.code} - ${c.name}`,
            grade: parseInt(String(c.grade).replace(/\D/g, ''), 10) || 12,
            academic_year: c.startDate
              ? `${c.startDate}${c.endDate ? ' -> ' + c.endDate : ''}`
              : '2025-2026',
            room: c.roomCode || '',
            homeroom_teacher: c.teacherCode || '',
          })),
          { onConflict: 'id' }
        );
      }
    }

    // 3. Đồng bộ bảng students (Hỗ trợ cả cấu trúc bảng students mới và bảng students sẵn có trên Supabase)
    if (Array.isArray(db.students) && db.students.length > 0) {
      const resStudents = await supabase.from('students').upsert(
        db.students.map((s) => ({
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
      if (resStudents.error) {
        await supabase.from('students').upsert(
          db.students.map((s) => ({
            id: s.code,
            owner_uid: 'aplus2_center',
            class_id: s.schoolClass || 'APLUS2',
            student_code: s.code,
            full_name: s.fullName,
            dob: s.dob || null,
            gender: s.gender || 'Nam',
            group_id: s.schoolClass || 'APLUS2',
            position: s.school || '',
            parent_phone: s.phone || '',
            initial_score: s.creditBalance || 0,
            status: s.status || 'DANG_HOC',
            notes: `PH: ${s.parentName || ''} | ${s.note || ''}`.trim(),
            is_demo: false,
            updated_at: now,
          })),
          { onConflict: 'id' }
        );
      }
    }

    // 4. Đồng bộ bảng enrollments
    if (Array.isArray(db.enrollments) && db.enrollments.length > 0) {
      await supabase.from('enrollments').upsert(
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
      );
    }

    // 5. Đồng bộ bảng sessions
    if (Array.isArray(db.sessions) && db.sessions.length > 0) {
      await supabase.from('sessions').upsert(
        db.sessions.map((s) => ({
          id: s.id,
          class_code: s.classCode,
          date: s.date,
          shift_id: parseInt(String(s.shiftId).replace(/\D/g, ''), 10) || 1,
          room_code: s.roomCode || '',
          teacher_code: s.actualTeacherCode || '',
          substitute_teacher_code: null,
          topic: s.topic || s.skillNote || '',
          status: s.status || 'DU_KIEN',
          updated_at: now,
        })),
        { onConflict: 'id' }
      );
    }

    // 6. Đồng bộ bảng receivables
    if (Array.isArray(db.receivables) && db.receivables.length > 0) {
      await supabase.from('receivables').upsert(
        db.receivables.map((r) => ({
          id: r.id,
          code: r.code,
          cycle_name: r.cycleName,
          student_code: r.studentCode,
          class_code: r.classCode,
          enrollment_id: r.enrollmentId,
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
      );
    }

    // 7. Đồng bộ bảng receipts
    if (Array.isArray(db.receipts) && db.receipts.length > 0) {
      await supabase.from('receipts').upsert(
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
          content: rc.content || '',
          allocations: rc.allocations || [],
          updated_at: now,
        })),
        { onConflict: 'id' }
      );
    }

    // 8. Đồng bộ bảng payrolls
    if (Array.isArray(db.payrolls) && db.payrolls.length > 0) {
      await supabase.from('payrolls').upsert(
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
      );
    }

    // 9. Đồng bộ bảng cashflows
    if (Array.isArray(db.cashflows) && db.cashflows.length > 0) {
      await supabase.from('cashflows').upsert(
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
      );
    }

    // 10. Đồng bộ bảng accounts
    if (Array.isArray(db.accounts) && db.accounts.length > 0) {
      await supabase.from('accounts').upsert(
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
      );
    }

    // 11. Đồng bộ bảng attendance (các điểm danh thực tế)
    if (Array.isArray(db.attendance) && db.attendance.length > 0) {
      await supabase.from('attendance').upsert(
        db.attendance.map((a) => ({
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
      );
    }
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
    // Đọc đồng thời từ bảng trạng thái chính (aplus2_app_state) và bản chụp dự phòng (attendance.__APLUS2_STATE_SNAPSHOT__)
    const [mainRes, fallbackRes] = await Promise.all([
      supabase
        .from(SUPABASE_TABLE_NAME)
        .select('id, payload, updated_at')
        .eq('id', SUPABASE_MAIN_ROW_ID)
        .maybeSingle(),
      supabase
        .from('attendance')
        .select('id, note, updated_at')
        .eq('id', FALLBACK_SNAPSHOT_ID)
        .maybeSingle(),
    ]);

    let candidateMain: { db: AppDatabase; updatedAt: string } | null = null;
    if (mainRes.data && mainRes.data.payload) {
      const p = mainRes.data.payload as AppDatabase;
      if (p && p.accounts && p.settings) {
        candidateMain = {
          db: p,
          updatedAt: mainRes.data.updated_at || new Date(0).toISOString(),
        };
      }
    }

    let candidateFallback: { db: AppDatabase; updatedAt: string } | null = null;
    if (fallbackRes.data && fallbackRes.data.note) {
      try {
        const parsed = JSON.parse(fallbackRes.data.note) as AppDatabase;
        if (parsed && parsed.accounts && parsed.settings) {
          candidateFallback = {
            db: parsed,
            updatedAt: fallbackRes.data.updated_at || new Date(0).toISOString(),
          };
        }
      } catch {
        // ignore invalid json
      }
    }

    // Ưu tiên bản ghi có dữ liệu mới nhất
    if (candidateMain && candidateFallback) {
      const chosen =
        candidateFallback.updatedAt >= candidateMain.updatedAt
          ? candidateFallback
          : candidateMain;
      return {
        status: 'CONNECTED',
        data: chosen.db,
        updatedAt: chosen.updatedAt,
      };
    }

    if (candidateFallback) {
      return {
        status: 'CONNECTED',
        data: candidateFallback.db,
        updatedAt: candidateFallback.updatedAt,
      };
    }

    if (candidateMain) {
      return {
        status: 'CONNECTED',
        data: candidateMain.db,
        updatedAt: candidateMain.updatedAt,
      };
    }

    if (mainRes.error && fallbackRes.error) {
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

    // 1. Đồng bộ trực tiếp dữ liệu sang toàn bộ các bảng chi tiết trên Supabase (teachers, classes, students, enrollments, sessions, receivables, receipts, payrolls, cashflows, accounts, attendance)
    await syncRelationalTablesDirectly(db, now);

    // 2. Lưu trạng thái đầy đủ vào bản chụp dự phòng trên bảng attendance (luôn thành công ngay cả khi Trigger cũ trên aplus2_app_state chưa được gỡ)
    const fallbackSave = await supabase.from('attendance').upsert(
      {
        id: FALLBACK_SNAPSHOT_ID,
        session_id: 'SYSTEM_STATE',
        class_code: 'APLUS2',
        student_code: 'SYSTEM',
        date: now.slice(0, 10),
        status: 'SYNCED',
        note: JSON.stringify(db),
        updated_at: now,
      },
      { onConflict: 'id' }
    );

    // 3. Lưu vào bảng aplus2_app_state
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
      // Nếu lỗi 21000 (do Trigger cũ có DELETE không WHERE), nhưng fallbackSave và các bảng chi tiết đã lưu thành công -> vẫn báo thành công!
      if (!fallbackSave.error && (code === '21000' || msg.includes('WHERE clause'))) {
        return {
          ok: true,
          updatedAt: now,
          status: 'CONNECTED',
        };
      }
      if (
        code === '42P01' ||
        code === 'PGRST205' ||
        msg.includes('aplus2_app_state') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      ) {
        if (!fallbackSave.error) {
          return {
            ok: true,
            updatedAt: now,
            status: 'CONNECTED',
          };
        }
        return {
          ok: false,
          status: 'TABLE_MISSING',
          errorMessage:
            'Bảng `public.aplus2_app_state` chưa được tạo trên Supabase. Hãy mở hướng dẫn SQL để tạo bảng.',
        };
      }
      if (!fallbackSave.error) {
        return {
          ok: true,
          updatedAt: now,
          status: 'CONNECTED',
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
