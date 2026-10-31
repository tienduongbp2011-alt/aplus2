import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AppDatabase,
  Assignment,
  AssignmentSubmission,
  AttendanceRecord,
  AuditLogItem,
  CashflowTransaction,
  CenterSettings,
  ClassInfo,
  ClassSession,
  Enrollment,
  FinancialAdjustment,
  PaymentReceipt,
  PayrollRecord,
  Room,
  ShiftConfig,
  Student,
  Teacher,
  TuitionReceivable,
  TuitionReminderLog,
  UserAccount,
} from '../types';
import { createEmptyProductionDatabase, createInitialSeedDatabase } from '../data/seedData';
import { getClassAssignedTeacherCodes } from '../services/businessLogic';
import {
  fetchDatabaseFromSupabase,
  saveDatabaseToSupabase,
  supabase,
  SUPABASE_MAIN_ROW_ID,
  SUPABASE_TABLE_NAME,
  SUPABASE_URL,
  SupabaseSyncStatus,
} from '../services/supabaseClient';
import { formatDateVN, getTodayISO } from '../utils/formatters';
import { restoreDatabaseFromSavedFiles } from '../utils/excelService';

const STORAGE_KEY = 'APLUS2_EDU_MANAGER_DB_V3';
const USER_STORAGE_KEY = 'APLUS2_CURRENT_ACCOUNT_ID_V1';
const AUTH_STORAGE_KEY = 'APLUS2_IS_AUTHENTICATED_V1';

export interface ToastMessage {
  id: string;
  type: 'SUCCESS' | 'ERROR' | 'WARNING';
  text: string;
}

interface AppContextValue {
  db: AppDatabase;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithCredentials: (username: string, password: string) => boolean;
  logout: () => void;
  currentAccount: UserAccount;
  switchAccount: (accountId: string) => void;
  toasts: ToastMessage[];
  notify: (text: string, type?: 'SUCCESS' | 'ERROR' | 'WARNING') => void;
  dismissToast: (id: string) => void;
  updateDb: (updater: (prev: AppDatabase) => AppDatabase, auditInfo?: { action: string; target: string; detail: string }) => void;
  restoreFromSavedFiles: (files: FileList | File[]) => Promise<void>;
  resetDemoData: () => void;
  clearAllDemoData: () => void;
  supabaseStatus: SupabaseSyncStatus;
  supabaseLastSync: string | null;
  supabaseError: string | null;
  supabaseProjectUrl: string;
  syncWithSupabaseNow: (forcePushCurrent?: boolean) => Promise<void>;
  activeModule: string;
  setActiveModule: (mod: string) => void;
  selectedClassCodeForDetail: string | null;
  setSelectedClassCodeForDetail: (code: string | null) => void;
  selectedStudentCodeForDetail: string | null;
  setSelectedStudentCodeForDetail: (code: string | null) => void;
  // Nghiệp vụ tiện ích
  saveTeacher: (teacher: Teacher, isEdit: boolean) => boolean;
  toggleTeacherActive: (code: string) => void;
  saveClass: (cls: ClassInfo, isEdit: boolean) => boolean;
  saveStudent: (student: Student, isEdit: boolean) => boolean;
  deleteStudent: (code: string) => boolean;
  deleteUnenrolledStudents: (targetCodes?: string[]) => number;
  saveEnrollment: (enrollment: Enrollment, isEdit: boolean) => boolean;
  saveEnrollmentsBatch: (enrollments: Enrollment[]) => number;
  settleEarlyWithdrawalEnrollment: (params: {
    enrollmentId: string;
    stopDate: string;
    attendedSessions: number;
    unitPrice: number;
    stopReason: string;
  }) => void;
  saveSession: (session: ClassSession, isEdit: boolean) => boolean;
  saveBulkSessions: (sessions: ClassSession[]) => void;
  saveAttendanceBatch: (records: AttendanceRecord[]) => void;
  saveAssignment: (assignment: Assignment, isEdit: boolean) => void;
  submitAssignment: (submission: AssignmentSubmission) => void;
  gradeSubmission: (submission: AssignmentSubmission, publishScores?: boolean) => void;
  createReceivablesBatch: (receivables: TuitionReceivable[]) => void;
  createPaymentReceipt: (receipt: PaymentReceipt) => void;
  createFinancialAdjustment: (adj: FinancialAdjustment) => void;
  addReminderLog: (log: TuitionReminderLog) => void;
  savePayrollRecord: (payroll: PayrollRecord, isEdit: boolean) => void;
  updatePayrollStatus: (payrollId: string, nextStatus: PayrollRecord['status']) => void;
  saveCashflow: (tx: CashflowTransaction) => void;
  saveSettings: (settings: CenterSettings) => void;
  saveShiftsAndRooms: (shifts: ShiftConfig[], rooms: Room[]) => void;
  saveUserAccount: (acc: UserAccount, isEdit: boolean) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<AppDatabase>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppDatabase;
        if (parsed && parsed.teachers && parsed.classes && parsed.students) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupted storage
    }
    return createInitialSeedDatabase();
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const [selectedClassCodeForDetail, setSelectedClassCodeForDetail] = useState<string | null>(null);
  const [selectedStudentCodeForDetail, setSelectedStudentCodeForDetail] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseSyncStatus>('CONNECTING');
  const [supabaseLastSync, setSupabaseLastSync] = useState<string | null>(null);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  const [currentAccountId, setCurrentAccountId] = useState<string>(() => {
    return localStorage.getItem(USER_STORAGE_KEY) || 'ACC-001';
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  });

  const currentAccount =
    db.accounts.find((a) => a.id === currentAccountId) || db.accounts[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // ignore quota error
    }
  }, [db]);

  const notify = (text: string, type: 'SUCCESS' | 'ERROR' | 'WARNING' = 'SUCCESS') => {
    const id = `TOAST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loginWithCredentials = (username: string, password: string): boolean => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();
    const found = db.accounts.find(
      (a) =>
        a.username.toLowerCase() === cleanUser ||
        (cleanUser === 'giaovien' && a.role === 'TEACHER')
    );
    if (!found) {
      notify(`Tên đăng nhập "${username}" không tồn tại.`, 'ERROR');
      return false;
    }
    if (found.status === 'LOCKED') {
      notify('Tài khoản này đang bị khoá, vui lòng liên hệ Giám đốc trung tâm.', 'ERROR');
      return false;
    }
    const expectedPass = found.password || '123456';
    if (cleanPass !== expectedPass) {
      notify('Mật khẩu không chính xác (Mật khẩu mặc định là: 123456).', 'ERROR');
      return false;
    }
    setCurrentAccountId(found.id);
    setIsAuthenticated(true);
    localStorage.setItem(USER_STORAGE_KEY, found.id);
    localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    setActiveModule('dashboard');
    notify(`Đăng nhập thành công: ${found.fullName}`, 'SUCCESS');
    return true;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    notify('Đã đăng xuất khỏi hệ thống.', 'SUCCESS');
  };

  const switchAccount = (accountId: string) => {
    const found = db.accounts.find((a) => a.id === accountId);
    if (!found) return;
    if (found.status === 'LOCKED') {
      notify('Tài khoản này đang bị khoá, không thể chuyển đổi.', 'ERROR');
      return;
    }
    setCurrentAccountId(accountId);
    setIsAuthenticated(true);
    localStorage.setItem(USER_STORAGE_KEY, accountId);
    localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    notify(`Đã chuyển sang vai trò: ${found.fullName}`, 'SUCCESS');
  };

  const pushDbToSupabase = async (targetDb: AppDatabase, showToastOnSuccess = false) => {
    setSupabaseStatus('SYNCING');
    const res = await saveDatabaseToSupabase(targetDb);
    if (res.ok) {
      setSupabaseStatus('CONNECTED');
      const syncTime = res.updatedAt || new Date().toISOString();
      setSupabaseLastSync(syncTime);
      localStorage.setItem('APLUS2_LOCAL_UPDATED_AT_V1', syncTime);
      setSupabaseError(null);
      if (showToastOnSuccess) {
        notify('Đã lưu và đồng bộ toàn bộ dữ liệu lên Supabase thành công!', 'SUCCESS');
      }
    } else {
      setSupabaseStatus(res.status);
      setSupabaseError(res.errorMessage || null);
      if (showToastOnSuccess && res.errorMessage) {
        notify(res.errorMessage, res.status === 'TABLE_MISSING' ? 'WARNING' : 'ERROR');
      }
    }
  };

  const syncWithSupabaseNow = async (forcePushCurrent = false) => {
    setSupabaseStatus('CONNECTING');
    if (forcePushCurrent) {
      await pushDbToSupabase(db, true);
      return;
    }

    const res = await fetchDatabaseFromSupabase();
    if (res.status === 'CONNECTED') {
      if (res.data && res.data.accounts && res.data.settings) {
        setDb(res.data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
        if (res.updatedAt) {
          localStorage.setItem('APLUS2_LOCAL_UPDATED_AT_V1', res.updatedAt);
        }
        setSupabaseStatus('CONNECTED');
        setSupabaseLastSync(res.updatedAt || new Date().toISOString());
        setSupabaseError(null);
        notify('Đã tải và đồng bộ dữ liệu mới nhất từ Supabase!', 'SUCCESS');
      } else {
        // Bảng trên Supabase đang trống -> đẩy dữ liệu hiện tại lên Supabase
        await pushDbToSupabase(db, true);
      }
    } else {
      setSupabaseStatus(res.status);
      setSupabaseError(res.errorMessage || null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const res = await fetchDatabaseFromSupabase();
      if (!isMounted) return;
      if (res.status === 'CONNECTED') {
        const localUpdatedAt = localStorage.getItem('APLUS2_LOCAL_UPDATED_AT_V1') || '';
        const remoteUpdatedAt = res.updatedAt || '';
        const remoteData = res.data;
        const remoteCount = remoteData
          ? (remoteData.teachers?.length || 0) +
            (remoteData.classes?.length || 0) +
            (remoteData.students?.length || 0)
          : 0;
        const localCount =
          (db.teachers?.length || 0) + (db.classes?.length || 0) + (db.students?.length || 0);

        // Nếu trên Supabase chưa có dữ liệu, hoặc dữ liệu trên máy người dùng mới hơn / nhiều hơn bản rỗng -> đẩy dữ liệu trên máy lên Supabase
        if (
          !remoteData ||
          !remoteData.accounts ||
          !remoteData.settings ||
          (remoteCount === 0 && localCount > 0) ||
          (localUpdatedAt && remoteUpdatedAt && localUpdatedAt > remoteUpdatedAt)
        ) {
          const saveRes = await saveDatabaseToSupabase(db);
          if (!isMounted) return;
          setSupabaseStatus(saveRes.status);
          const syncTime = saveRes.updatedAt || new Date().toISOString();
          setSupabaseLastSync(syncTime);
          localStorage.setItem('APLUS2_LOCAL_UPDATED_AT_V1', syncTime);
          setSupabaseError(saveRes.errorMessage || null);
        } else {
          setDb(remoteData);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
          if (remoteUpdatedAt) {
            localStorage.setItem('APLUS2_LOCAL_UPDATED_AT_V1', remoteUpdatedAt);
          }
          setSupabaseStatus('CONNECTED');
          setSupabaseLastSync(remoteUpdatedAt || new Date().toISOString());
          setSupabaseError(null);
          // Đồng bộ luôn sang các bảng chi tiết trên Supabase để đảm bảo khớp 100%
          void saveDatabaseToSupabase(remoteData);
        }
      } else {
        setSupabaseStatus(res.status);
        setSupabaseError(res.errorMessage || null);
      }
    })();

    // Lắng nghe thay đổi Realtime từ Supabase (nếu bật Realtime cho bảng)
    const channel = supabase
      ? supabase
          .channel('aplus2_realtime_sync')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: SUPABASE_TABLE_NAME,
              filter: `id=eq.${SUPABASE_MAIN_ROW_ID}`,
            },
            (payload) => {
              const newRow = payload.new as { payload?: AppDatabase; updated_at?: string } | undefined;
              if (newRow && newRow.payload && newRow.payload.accounts) {
                setDb(newRow.payload);
                setSupabaseStatus('CONNECTED');
                setSupabaseLastSync(newRow.updated_at || new Date().toISOString());
              }
            }
          )
          .subscribe()
      : null;

    return () => {
      isMounted = false;
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const updateDb = (
    updater: (prev: AppDatabase) => AppDatabase,
    auditInfo?: { action: string; target: string; detail: string }
  ) => {
    setDb((prev) => {
      const next = updater(prev);
      const nowIso = new Date().toISOString();
      if (auditInfo) {
        const newLog: AuditLogItem = {
          id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: nowIso,
          actorName: currentAccount.fullName,
          actorRole: currentAccount.role,
          action: auditInfo.action,
          target: auditInfo.target,
          detail: auditInfo.detail,
        };
        next.auditLogs = [newLog, ...(next.auditLogs || [])];
      }
      const nextCopy = { ...next };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCopy));
        localStorage.setItem('APLUS2_LOCAL_UPDATED_AT_V1', nowIso);
      } catch {
        // ignore quota error
      }
      // Đồng bộ tự động lên Supabase
      void pushDbToSupabase(nextCopy, false);
      // Đồng bộ nền lên backend API nội bộ
      fetch('/api/sync-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-role': currentAccount.role,
          'x-actor-name': encodeURIComponent(currentAccount.fullName),
        },
        body: JSON.stringify({ updatedAt: nowIso }),
      }).catch(() => {});
      return nextCopy;
    });
  };

  const restoreFromSavedFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);
    try {
      const { nextDb, summary, totalRestored } = await restoreDatabaseFromSavedFiles(files, db);
      if (totalRestored === 0) {
        notify(
          'Không tìm thấy bản ghi Giáo viên, Lớp học, Học viên hoặc Đăng ký học hợp lệ trong file đã chọn.',
          'WARNING'
        );
        setIsLoading(false);
        return;
      }
      const nowIso = new Date().toISOString();
      nextDb.auditLogs = [
        {
          id: `LOG-${Date.now()}-RESTORE`,
          timestamp: nowIso,
          actorName: currentAccount.fullName,
          actorRole: currentAccount.role,
          action: 'KHÔI PHỤC DỮ LIỆU TỪ FILE ĐÃ LƯU',
          target: `${files.length} tệp từ máy tính`,
          detail: summary,
        },
        ...(nextDb.auditLogs || []),
      ];
      setDb(nextDb);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDb));
        localStorage.setItem('APLUS2_LOCAL_UPDATED_AT_V1', nowIso);
      } catch {
        // ignore quota error
      }
      await pushDbToSupabase(nextDb, false);
      notify(summary, 'SUCCESS');
    } catch (err) {
      notify(
        `Lỗi đọc tệp khôi phục: ${err instanceof Error ? err.message : 'Định dạng file không hợp lệ'}`,
        'ERROR'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resetDemoData = () => {
    setIsLoading(true);
    setTimeout(() => {
      const seed = createInitialSeedDatabase();
      seed.settings.logoDataUrl = db.settings.logoDataUrl || '';
      seed.settings.loginBackgroundDataUrl = db.settings.loginBackgroundDataUrl || '';
      setDb(seed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      void pushDbToSupabase(seed, false);
      setIsLoading(false);
      notify('Đã khôi phục bộ dữ liệu minh hoạ chuẩn của APLUS 2 và đồng bộ Supabase.', 'SUCCESS');
    }, 150);
  };

  const clearAllDemoData = () => {
    setIsLoading(true);
    setTimeout(() => {
      const emptyDb = createEmptyProductionDatabase(db.settings, db.accounts);
      setDb(emptyDb);
      setSelectedClassCodeForDetail(null);
      setSelectedStudentCodeForDetail(null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyDb));
      void pushDbToSupabase(emptyDb, false);
      setIsLoading(false);
      notify(
        'Đã xoá sạch toàn bộ dữ liệu Demo (đồng bộ trên Supabase)! Hệ thống đã sẵn sàng để bạn nhập dữ liệu thực tế.',
        'SUCCESS'
      );
    }, 150);
  };

  const saveTeacher = (teacher: Teacher, isEdit: boolean): boolean => {
    const cleanCode = teacher.code.trim().toUpperCase();
    if (!cleanCode || !teacher.fullName.trim()) {
      notify('Vui lòng nhập đầy đủ Mã giáo viên và Họ tên.', 'ERROR');
      return false;
    }
    if (!isEdit && db.teachers.some((t) => t.code === cleanCode)) {
      notify(`Mã giáo viên "${cleanCode}" đã tồn tại trên hệ thống.`, 'ERROR');
      return false;
    }

    updateDb(
      (prev) => {
        const list = [...prev.teachers];
        const idx = list.findIndex((t) => t.code === cleanCode);
        if (idx >= 0) {
          const old = list[idx];
          const updatedHistory = [...(old.rateHistory || [])];
          const rateChanged =
            old.percentageRate !== teacher.percentageRate ||
            old.shiftRate !== teacher.shiftRate ||
            old.effectiveDate !== teacher.effectiveDate;
          if (rateChanged) {
            updatedHistory.unshift({
              id: `RH-${cleanCode}-${Date.now()}`,
              effectiveDate: teacher.effectiveDate || getTodayISO(),
              group: teacher.group,
              percentageRate: teacher.group === 'VH' ? teacher.percentageRate : undefined,
              shiftRate: teacher.group === 'TATT' ? teacher.shiftRate : undefined,
              note: `Cập nhật mức lương áp dụng từ ${teacher.effectiveDate}`,
            });
          }
          list[idx] = { ...teacher, code: cleanCode, rateHistory: updatedHistory };
        } else {
          list.push({
            ...teacher,
            code: cleanCode,
            rateHistory: [
              {
                id: `RH-${cleanCode}-${Date.now()}`,
                effectiveDate: teacher.effectiveDate || getTodayISO(),
                group: teacher.group,
                percentageRate: teacher.group === 'VH' ? teacher.percentageRate : undefined,
                shiftRate: teacher.group === 'TATT' ? teacher.shiftRate : undefined,
                note: 'Thiết lập ban đầu',
              },
            ],
          });
        }
        return { ...prev, teachers: list };
      },
      {
        action: isEdit ? 'CẬP NHẬT GIÁO VIÊN' : 'THÊM GIÁO VIÊN',
        target: `${cleanCode} - ${teacher.fullName}`,
        detail: `Nhóm ${teacher.group}, mức lương hiệu lực từ ${teacher.effectiveDate}`,
      }
    );
    notify(isEdit ? 'Đã cập nhật thông tin giáo viên.' : 'Đã thêm giáo viên mới thành công.');
    return true;
  };

  const toggleTeacherActive = (code: string) => {
    const teacher = db.teachers.find((t) => t.code === code);
    if (!teacher) return;
    const nextStatus = teacher.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    updateDb(
      (prev) => ({
        ...prev,
        teachers: prev.teachers.map((t) => (t.code === code ? { ...t, status: nextStatus } : t)),
      }),
      {
        action: nextStatus === 'INACTIVE' ? 'NGỪNG HOẠT ĐỘNG GIÁO VIÊN' : 'KÍCH HOẠT LẠI GIÁO VIÊN',
        target: `${teacher.code} - ${teacher.fullName}`,
        detail: 'Bảo toàn lịch sử giảng dạy và bảng lương cũ theo đúng quy định.',
      }
    );
    notify(
      nextStatus === 'INACTIVE'
        ? `Đã chuyển giáo viên ${teacher.fullName} sang trạng thái Ngừng hoạt động (giữ nguyên lịch sử giảng dạy & lương).`
        : `Đã kích hoạt lại giáo viên ${teacher.fullName}.`
    );
  };

  const saveClass = (cls: ClassInfo, isEdit: boolean): boolean => {
    const cleanCode = cls.code.trim().toUpperCase();
    if (!cleanCode || !cls.name.trim()) {
      notify('Vui lòng nhập Mã lớp và Tên lớp.', 'ERROR');
      return false;
    }
    if (!isEdit && db.classes.some((c) => c.code === cleanCode)) {
      notify(`Mã lớp "${cleanCode}" đã tồn tại.`, 'ERROR');
      return false;
    }
    if (cls.feePerSession < 0) {
      notify('Học phí mỗi buổi không được âm.', 'ERROR');
      return false;
    }
    updateDb(
      (prev) => {
        const list = [...prev.classes];
        const idx = list.findIndex((c) => c.code === cleanCode);
        if (idx >= 0) {
          list[idx] = { ...cls, code: cleanCode };
        } else {
          list.push({ ...cls, code: cleanCode });
        }
        return { ...prev, classes: list };
      },
      {
        action: isEdit ? 'CẬP NHẬT LỚP HỌC' : 'TẠO LỚP HỌC MỚI',
        target: `${cleanCode} - ${cls.name}`,
        detail: `GV: ${cls.teacherCode || 'Chưa phân công'}, Đơn giá: ${cls.feePerSession.toLocaleString('vi-VN')} đ/buổi`,
      }
    );
    notify(isEdit ? 'Đã cập nhật thông tin lớp học.' : 'Đã tạo lớp học mới thành công.');
    return true;
  };

  const saveStudent = (student: Student, isEdit: boolean): boolean => {
    const cleanCode = student.code.trim().toUpperCase();
    if (!cleanCode || !student.fullName.trim()) {
      notify('Vui lòng nhập Mã học viên và Họ tên học viên.', 'ERROR');
      return false;
    }
    if (!isEdit && db.students.some((s) => s.code === cleanCode)) {
      notify(`Mã học viên "${cleanCode}" đã tồn tại. Mỗi học viên chỉ dùng 1 mã duy nhất trong toàn trung tâm.`, 'ERROR');
      return false;
    }
    updateDb(
      (prev) => {
        const list = [...prev.students];
        const idx = list.findIndex((s) => s.code === cleanCode);
        if (idx >= 0) {
          list[idx] = { ...student, code: cleanCode };
        } else {
          list.push({ ...student, code: cleanCode });
        }
        return { ...prev, students: list };
      },
      {
        action: isEdit ? 'CẬP NHẬT HỒ SƠ HỌC VIÊN' : 'TIẾP NHẬN HỌC VIÊN MỚI',
        target: `${cleanCode} - ${student.fullName}`,
        detail: `Trường ${student.school}, Phụ huynh: ${student.parentName} (${student.phone})`,
      }
    );
    notify(isEdit ? 'Đã cập nhật hồ sơ học viên.' : 'Đã lưu hồ sơ học viên thành công.');
    return true;
  };

  const deleteStudent = (code: string): boolean => {
    const student = db.students.find((s) => s.code === code);
    if (!student) return false;
    const activeEnrolls = db.enrollments.filter(
      (e) => e.studentCode === code && e.status === 'DANG_HOC'
    );
    if (activeEnrolls.length > 0) {
      notify(
        `Học viên ${student.fullName} (${code}) đang có ${activeEnrolls.length} lớp đang học. Không thể xoá khi đang có đăng ký học.`,
        'ERROR'
      );
      return false;
    }
    const hasDebt = db.receivables.some(
      (r) => r.studentCode === code && r.remainingDebt > 0
    );
    if (hasDebt) {
      notify(
        `Học viên ${student.fullName} (${code}) đang còn công nợ học phí chưa thanh toán, không thể xoá.`,
        'ERROR'
      );
      return false;
    }

    updateDb(
      (prev) => ({
        ...prev,
        students: prev.students.filter((s) => s.code !== code),
        enrollments: prev.enrollments.filter((e) => e.studentCode !== code),
        accounts: prev.accounts.filter((a) => a.linkedStudentCode !== code),
      }),
      {
        action: 'XOÁ HỒ SƠ HỌC VIÊN',
        target: `${code} - ${student.fullName}`,
        detail: 'Đã xoá học viên do không có lớp học nào đang hoạt động.',
      }
    );

    if (supabase) {
      Promise.resolve(
        supabase.from('students').delete().or(`code.eq.${code},id.eq.${code}`)
      ).catch(() => {});
    }

    if (selectedStudentCodeForDetail === code) {
      setSelectedStudentCodeForDetail(null);
    }

    notify(`Đã xoá học viên ${student.fullName} (${code}) thành công.`);
    return true;
  };

  const deleteUnenrolledStudents = (targetCodes?: string[]): number => {
    const unenrolled = db.students.filter((s) => {
      if (targetCodes && targetCodes.length > 0 && !targetCodes.includes(s.code)) {
        return false;
      }
      const hasActiveEnroll = db.enrollments.some(
        (e) => e.studentCode === s.code && e.status === 'DANG_HOC'
      );
      return !hasActiveEnroll;
    });

    if (unenrolled.length === 0) {
      notify('Không tìm thấy học sinh nào chưa đăng ký học để xoá.', 'WARNING');
      return 0;
    }

    const deletedCodes = unenrolled.map((s) => s.code);
    const codeSet = new Set(deletedCodes);

    updateDb(
      (prev) => ({
        ...prev,
        students: prev.students.filter((s) => !codeSet.has(s.code)),
        enrollments: prev.enrollments.filter((e) => !codeSet.has(e.studentCode)),
        accounts: prev.accounts.filter(
          (a) => !a.linkedStudentCode || !codeSet.has(a.linkedStudentCode)
        ),
      }),
      {
        action: 'XOÁ HỌC SINH KHÔNG ĐĂNG KÝ HỌC',
        target: `${deletedCodes.length} học viên`,
        detail: `Đã xoá các mã: ${deletedCodes.join(', ')} do không đăng ký bất kỳ môn nào.`,
      }
    );

    if (supabase) {
      Promise.resolve(supabase.from('students').delete().in('code', deletedCodes)).catch(() => {});
      Promise.resolve(supabase.from('students').delete().in('id', deletedCodes)).catch(() => {});
    }

    if (selectedStudentCodeForDetail && codeSet.has(selectedStudentCodeForDetail)) {
      setSelectedStudentCodeForDetail(null);
    }

    notify(
      `Đã xoá thành công ${deletedCodes.length} học sinh không đăng ký học bất kỳ môn nào khỏi danh sách học viên và phân hệ đăng ký học!`
    );
    return deletedCodes.length;
  };

  const saveEnrollment = (enrollment: Enrollment, isEdit: boolean): boolean => {
    const cls = db.classes.find((c) => c.code === enrollment.classCode);
    if (!cls || !cls.code) {
      notify('Lớp học không tồn tại.', 'ERROR');
      return false;
    }
    const assignedTeacherCodes = getClassAssignedTeacherCodes(cls);
    if (assignedTeacherCodes.length === 0) {
      notify(`Lớp ${cls.code} chưa có giáo viên phụ trách. Chỉ cho phép đăng ký khi lớp đã có mã và giáo viên phụ trách.`, 'ERROR');
      return false;
    }
    const primaryTeacherCode = cls.teacherCode || assignedTeacherCodes[0];
    const teacher = db.teachers.find((t) => t.code === primaryTeacherCode);
    if (!teacher || teacher.status !== 'ACTIVE') {
      notify(`Giáo viên phụ trách lớp ${cls.code} chưa hợp lệ hoặc đã ngừng hoạt động.`, 'ERROR');
      return false;
    }

    if (!isEdit && enrollment.status === 'DANG_HOC') {
      const duplicate = db.enrollments.some(
        (e) =>
          e.studentCode === enrollment.studentCode &&
          e.classCode === enrollment.classCode &&
          e.status === 'DANG_HOC'
      );
      if (duplicate) {
        notify(
          `Học viên ${enrollment.studentCode} đã có đăng ký đang hoạt động tại lớp ${enrollment.classCode}. Không cho tạo trùng đăng ký!`,
          'ERROR'
        );
        return false;
      }
    }

    const activeCount = db.enrollments.filter(
      (e) => e.classCode === cls.code && e.status === 'DANG_HOC' && e.id !== enrollment.id
    ).length;
    if (enrollment.status === 'DANG_HOC' && activeCount >= cls.maxStudents) {
      notify(`Lớp ${cls.code} đã đạt sĩ số tối đa (${cls.maxStudents} học viên).`, 'ERROR');
      return false;
    }

    updateDb(
      (prev) => {
        const list = [...prev.enrollments];
        const idx = list.findIndex((e) => e.id === enrollment.id);
        if (idx >= 0) {
          list[idx] = enrollment;
        } else {
          list.unshift(enrollment);
        }
        return { ...prev, enrollments: list };
      },
      {
        action: isEdit ? 'CẬP NHẬT ĐĂNG KÝ HỌC' : 'ĐĂNG KÝ LỚP HỌC',
        target: `HV ${enrollment.studentCode} -> Lớp ${enrollment.classCode}`,
        detail: `Tính phí từ ${enrollment.feeStartDate}, đơn giá ${enrollment.appliedFeePerSession.toLocaleString('vi-VN')} đ/buổi`,
      }
    );
    notify(isEdit ? 'Đã cập nhật đăng ký học.' : 'Đã đăng ký học viên vào lớp thành công.');
    return true;
  };

  const saveEnrollmentsBatch = (newEnrollments: Enrollment[]): number => {
    if (newEnrollments.length === 0) {
      notify('Vui lòng tích chọn ít nhất 1 môn / lớp học để đăng ký.', 'WARNING');
      return 0;
    }
    const validToSave: Enrollment[] = [];
    for (const enr of newEnrollments) {
      const cls = db.classes.find((c) => c.code === enr.classCode);
      if (!cls) continue;
      const assignedTeacherCodes = getClassAssignedTeacherCodes(cls);
      if (assignedTeacherCodes.length === 0) {
        notify(`Lớp ${cls.code} chưa có giáo viên phụ trách, bỏ qua lớp này.`, 'WARNING');
        continue;
      }
      const duplicate = db.enrollments.some(
        (e) =>
          e.studentCode === enr.studentCode &&
          e.classCode === enr.classCode &&
          e.status === 'DANG_HOC'
      );
      if (duplicate) {
        notify(`Học viên ${enr.studentCode} đã đang học lớp ${enr.classCode}.`, 'WARNING');
        continue;
      }
      validToSave.push(enr);
    }

    if (validToSave.length === 0) return 0;

    updateDb(
      (prev) => ({
        ...prev,
        enrollments: [...validToSave, ...prev.enrollments],
      }),
      {
        action: 'ĐĂNG KÝ NHIỀU MÔN / LỚP HỌC',
        target: `HV ${validToSave[0].studentCode} (${validToSave.length} lớp)`,
        detail: `Các lớp đăng ký: ${validToSave.map((e) => e.classCode).join(', ')}`,
      }
    );

    notify(
      `Đã đăng ký thành công ${validToSave.length} môn/lớp học (${validToSave.map((e) => e.classCode).join(', ')}) và tự động cập nhật vào danh sách các lớp!`
    );
    return validToSave.length;
  };

  const settleEarlyWithdrawalEnrollment = ({
    enrollmentId,
    stopDate,
    attendedSessions,
    unitPrice,
    stopReason,
  }: {
    enrollmentId: string;
    stopDate: string;
    attendedSessions: number;
    unitPrice: number;
    stopReason: string;
  }) => {
    const enr = db.enrollments.find((e) => e.id === enrollmentId);
    if (!enr) return;
    const cls = db.classes.find((c) => c.code === enr.classCode);
    const gross = Math.max(0, Math.round(attendedSessions * unitPrice));
    const discPctAmt = Math.round((gross * (enr.discountPercent || 0)) / 100);
    const totalDisc = Math.min(gross, discPctAmt + (enr.discountAmount || 0));
    const netAmount = Math.max(0, gross - totalDisc);

    updateDb(
      (prev) => {
        const updatedEnrollments = prev.enrollments.map((e) =>
          e.id === enrollmentId
            ? {
                ...e,
                endDate: stopDate,
                actualAttendedSessions: attendedSessions,
                appliedFeePerSession: unitPrice,
                stopReason,
                status: 'DA_NGHI' as const,
              }
            : e
        );

        const existingRec = prev.receivables.find((r) => r.enrollmentId === enrollmentId);
        let updatedReceivables = [...prev.receivables];

        if (existingRec) {
          updatedReceivables = updatedReceivables.map((r) => {
            if (r.id !== existingRec.id) return r;
            const nextNet = Math.max(0, netAmount + (r.adjustmentAmount || 0));
            const nextRem = Math.max(0, nextNet - r.paidAmount);
            const nextStatus: TuitionReceivable['status'] =
              nextRem === 0
                ? 'DA_DU'
                : r.paidAmount > 0
                  ? 'DONG_MOT_PHAN'
                  : 'CHUA_DONG';
            return {
              ...r,
              periodEnd: stopDate,
              sessionCount: attendedSessions,
              unitPrice,
              grossAmount: gross,
              discountAmount: totalDisc,
              netAmount: nextNet,
              remainingDebt: nextRem,
              status: nextStatus,
              note: `Chốt nghỉ từ ${formatDateVN(stopDate)}: ${attendedSessions} buổi × ${unitPrice.toLocaleString('vi-VN')} đ = ${nextNet.toLocaleString('vi-VN')} đ (${stopReason || 'Nghỉ trước khi kết thúc khoá'})`,
            };
          });
        } else {
          const newRec: TuitionReceivable = {
            id: `REC-STOP-${Date.now()}`,
            code: `KPT-NGHI-${String(prev.receivables.length + 1).padStart(3, '0')}`,
            cycleName: `Chốt học phí đến ngày nghỉ (${formatDateVN(enr.feeStartDate)} -> ${formatDateVN(stopDate)})`,
            studentCode: enr.studentCode,
            classCode: enr.classCode,
            enrollmentId: enr.id,
            createdAt: getTodayISO(),
            dueDate: stopDate,
            periodStart: enr.feeStartDate,
            periodEnd: stopDate,
            billingMethod: cls?.billingMethod || 'CYCLE_8_WEEKS',
            sessionIds: [],
            sessionDates: [],
            sessionCount: attendedSessions,
            unitPrice,
            grossAmount: gross,
            discountAmount: totalDisc,
            adjustmentAmount: 0,
            netAmount,
            openingDebtReference: 0,
            paidAmount: 0,
            remainingDebt: netAmount,
            status: netAmount === 0 ? 'DA_DU' : 'CHUA_DONG',
            note: `Chốt học phí nghỉ trước hạn: ${attendedSessions} buổi × ${unitPrice.toLocaleString('vi-VN')} đ`,
          };
          updatedReceivables = [newRec, ...updatedReceivables];
        }

        return {
          ...prev,
          enrollments: updatedEnrollments,
          receivables: updatedReceivables,
        };
      },
      {
        action: 'CHỐT HỌC PHÍ NGHỈ GIỮA CHỪNG',
        target: `HV ${enr.studentCode} – Lớp ${enr.classCode}`,
        detail: `Nghỉ từ ${formatDateVN(stopDate)}: ${attendedSessions} buổi × ${unitPrice.toLocaleString('vi-VN')} đ = ${netAmount.toLocaleString('vi-VN')} đ`,
      }
    );

    notify(
      `Đã chốt nghỉ cho HV ${enr.studentCode} tại lớp ${enr.classCode}: ${attendedSessions} buổi × ${unitPrice.toLocaleString('vi-VN')} đ = ${netAmount.toLocaleString('vi-VN')} đ.`
    );
  };

  const saveSession = (session: ClassSession, isEdit: boolean): boolean => {
    updateDb((prev) => {
      const list = [...prev.sessions];
      const idx = list.findIndex((s) => s.id === session.id);
      if (idx >= 0) {
        list[idx] = session;
      } else {
        list.push(session);
      }
      return { ...prev, sessions: list };
    });
    notify(
      isEdit
        ? 'Đã cập nhật buổi học (không làm thay đổi các buổi khác trong chuỗi lịch).'
        : 'Đã thêm buổi học vào lịch.'
    );
    return true;
  };

  const saveBulkSessions = (sessions: ClassSession[]) => {
    if (sessions.length === 0) {
      notify('Không có buổi học mới nào cần tạo hoặc đã tồn tại đủ.', 'WARNING');
      return;
    }
    updateDb((prev) => ({
      ...prev,
      sessions: [...prev.sessions, ...sessions],
    }));
    notify(`Đã sinh thành công ${sessions.length} buổi học từ lịch định kỳ.`);
  };

  const saveAttendanceBatch = (records: AttendanceRecord[]) => {
    updateDb((prev) => {
      const map = new Map<string, AttendanceRecord>();
      prev.attendance.forEach((a) => map.set(`${a.sessionId}__${a.studentCode}`, a));
      records.forEach((r) => map.set(`${r.sessionId}__${r.studentCode}`, r));
      return {
        ...prev,
        attendance: Array.from(map.values()),
      };
    });
    notify(`Đã lưu điểm danh cho ${records.length} học viên thành công.`);
  };

  const saveAssignment = (assignment: Assignment, isEdit: boolean) => {
    updateDb((prev) => {
      const list = [...prev.assignments];
      const idx = list.findIndex((a) => a.id === assignment.id);
      if (idx >= 0) list[idx] = assignment;
      else list.unshift(assignment);
      return { ...prev, assignments: list };
    });
    notify(isEdit ? 'Đã cập nhật bài tập/đề kiểm tra.' : 'Đã giao bài tập/kiểm tra mới thành công.');
  };

  const submitAssignment = (submission: AssignmentSubmission) => {
    updateDb((prev) => {
      const list = prev.submissions.filter(
        (s) => !(s.assignmentId === submission.assignmentId && s.studentCode === submission.studentCode)
      );
      return {
        ...prev,
        submissions: [submission, ...list],
      };
    });
    notify('Đã nộp bài thành công! Hệ thống đã tự động chấm phần trắc nghiệm.');
  };

  const gradeSubmission = (submission: AssignmentSubmission, publishScores?: boolean) => {
    updateDb((prev) => {
      const submissions = prev.submissions.map((s) => (s.id === submission.id ? submission : s));
      const assignments =
        publishScores !== undefined
          ? prev.assignments.map((a) =>
              a.id === submission.assignmentId ? { ...a, scoresPublished: publishScores } : a
            )
          : prev.assignments;
      return { ...prev, submissions, assignments };
    });
    notify('Đã lưu kết quả chấm bài và nhận xét của giáo viên.');
  };

  const createReceivablesBatch = (newReceivables: TuitionReceivable[]) => {
    if (newReceivables.length === 0) {
      notify('Không có khoản phải thu mới nào phát sinh (các buổi đã được lập kỳ thu trước đó).', 'WARNING');
      return;
    }
    updateDb(
      (prev) => ({
        ...prev,
        receivables: [...newReceivables, ...prev.receivables],
      }),
      {
        action: 'TẠO ĐỢT THU HỌC PHÍ',
        target: `${newReceivables.length} khoản phải thu`,
        detail: `Đợt thu: ${newReceivables[0]?.cycleName}`,
      }
    );
    notify(`Đã lập thành công ${newReceivables.length} khoản phải thu học phí.`);
  };

  const createPaymentReceipt = (receipt: PaymentReceipt) => {
    updateDb(
      (prev) => {
        const today = getTodayISO();
        // Cập nhật từng khoản phải thu được phân bổ
        const updatedReceivables = prev.receivables.map((rec) => {
          const matchingAllocs = receipt.allocations.filter((a) => a.receivableId === rec.id);
          if (matchingAllocs.length === 0) return rec;
          const addedPaid = matchingAllocs.reduce((s, a) => s + a.allocatedAmount, 0);
          const nextPaid = rec.paidAmount + addedPaid;
          const nextRemaining = Math.max(0, rec.netAmount - nextPaid);
          const nextStatus: TuitionReceivable['status'] =
            nextRemaining === 0
              ? 'DA_DU'
              : nextPaid > 0
                ? 'DONG_MOT_PHAN'
                : rec.dueDate < today
                  ? 'QUA_HAN'
                  : 'CHUA_DONG';
          return {
            ...rec,
            paidAmount: nextPaid,
            remainingDebt: nextRemaining,
            status: nextStatus,
          };
        });

        // Cập nhật tiền dư trả trước của học viên nếu nộp dư
        const updatedStudents = prev.students.map((st) => {
          if (st.code !== receipt.studentCode) return st;
          return {
            ...st,
            creditBalance: (st.creditBalance || 0) + (receipt.unallocatedCredit || 0),
          };
        });

        // Tự động ghi nhận 1 bút toán vào Sổ Thu–Chi (linkedReceiptId để không bị ghi 2 lần)
        const newCashflow: CashflowTransaction = {
          id: `CF-REC-${Date.now()}`,
          code: `TC-${receipt.receiptNumber}`,
          date: receipt.paymentDate,
          type: 'THU',
          category: 'THU_HOC_PHI',
          amount: receipt.totalAmount,
          studentCode: receipt.studentCode,
          classCode: receipt.allocations[0]?.classCode,
          linkedReceiptId: receipt.id,
          paymentMethod: receipt.paymentMethod,
          description: receipt.content,
          createdBy: receipt.collectorName,
        };

        return {
          ...prev,
          receivables: updatedReceivables,
          students: updatedStudents,
          receipts: [receipt, ...prev.receipts],
          cashflows: [newCashflow, ...prev.cashflows],
        };
      },
      {
        action: 'THU HỌC PHÍ – LẬP PHIẾU THU',
        target: `${receipt.receiptNumber} (HV ${receipt.studentCode})`,
        detail: `Thực thu: ${receipt.totalAmount.toLocaleString('vi-VN')} đ (${receipt.paymentMethod}), Phân bổ: ${receipt.allocatedTotal.toLocaleString('vi-VN')} đ, Tiền dư: ${receipt.unallocatedCredit.toLocaleString('vi-VN')} đ`,
      }
    );
    notify(`Đã lập phiếu thu ${receipt.receiptNumber} thành công.`);
  };

  const createFinancialAdjustment = (adj: FinancialAdjustment) => {
    updateDb(
      (prev) => {
        const today = getTodayISO();
        const updatedReceivables = prev.receivables.map((rec) => {
          if (rec.id !== adj.receivableId) return rec;
          const delta =
            adj.type === 'DIEU_CHINH_GIAM'
              ? -adj.amount
              : adj.type === 'DIEU_CHINH_TANG'
                ? adj.amount
                : 0;
          const nextAdj = rec.adjustmentAmount + delta;
          const nextNet = Math.max(0, rec.grossAmount - rec.discountAmount + nextAdj);
          const nextRemaining = Math.max(0, nextNet - rec.paidAmount);
          const nextStatus: TuitionReceivable['status'] =
            nextRemaining === 0
              ? 'DA_DU'
              : rec.paidAmount > 0
                ? 'DONG_MOT_PHAN'
                : rec.dueDate < today
                  ? 'QUA_HAN'
                  : 'CHUA_DONG';
          return {
            ...rec,
            adjustmentAmount: nextAdj,
            netAmount: nextNet,
            remainingDebt: nextRemaining,
            status: nextStatus,
          };
        });

        const nextCashflows = [...prev.cashflows];
        if (adj.type === 'HOAN_PHI') {
          nextCashflows.unshift({
            id: `CF-ADJ-${Date.now()}`,
            code: `TC-HOAN-${adj.code}`,
            date: adj.date,
            type: 'CHI',
            category: 'HOAN_HOC_PHI',
            amount: adj.amount,
            studentCode: adj.studentCode,
            linkedAdjustmentId: adj.id,
            paymentMethod: 'CK',
            description: `Hoàn học phí theo phiếu điều chỉnh ${adj.code}: ${adj.reason}`,
            createdBy: adj.approvedBy,
          });
        }

        return {
          ...prev,
          receivables: updatedReceivables,
          adjustments: [adj, ...prev.adjustments],
          cashflows: nextCashflows,
        };
      },
      {
        action: 'GIAO DỊCH ĐIỀU CHỈNH / HOÀN PHÍ',
        target: `${adj.code} (HV ${adj.studentCode})`,
        detail: `Loại: ${adj.type}, Số tiền: ${adj.amount.toLocaleString('vi-VN')} đ. Lý do: ${adj.reason}`,
      }
    );
    notify('Đã ghi nhận giao dịch điều chỉnh/hoàn phí vào lịch sử kiểm toán.');
  };

  const addReminderLog = (log: TuitionReminderLog) => {
    updateDb((prev) => ({
      ...prev,
      reminders: [log, ...prev.reminders],
    }));
  };

  const savePayrollRecord = (payroll: PayrollRecord, isEdit: boolean) => {
    updateDb(
      (prev) => {
        const list = [...prev.payrolls];
        const idx = list.findIndex((p) => p.id === payroll.id);
        if (idx >= 0) list[idx] = payroll;
        else list.unshift(payroll);

        // Đánh dấu các nguồn tính lương để không bị tính 2 lần
        const allocIds = new Set<string>();
        const sesIds = new Set<string>();
        payroll.lineItems.forEach((li) => {
          (li.sourceAllocationIds || []).forEach((id) => allocIds.add(id));
          (li.sourceSessionIds || []).forEach((id) => sesIds.add(id));
        });

        const updatedReceipts = prev.receipts.map((r) => ({
          ...r,
          allocations: r.allocations.map((a) =>
            allocIds.has(a.id) ? { ...a, includedInPayrollId: payroll.id } : a
          ),
        }));

        const updatedSessions = prev.sessions.map((s) =>
          sesIds.has(s.id) ? { ...s, payrollLocked: true, payrollId: payroll.id } : s
        );

        return {
          ...prev,
          payrolls: list,
          receipts: updatedReceipts,
          sessions: updatedSessions,
        };
      },
      {
        action: isEdit ? 'CẬP NHẬT BẢNG LƯƠNG' : 'LẬP BẢNG LƯƠNG GIÁO VIÊN',
        target: `${payroll.code} - ${payroll.teacherName}`,
        detail: `Kỳ: ${payroll.periodName}, Tổng lương: ${payroll.finalSalary.toLocaleString('vi-VN')} đ`,
      }
    );
    notify(isEdit ? 'Đã cập nhật bảng lương.' : `Đã lập bảng lương ${payroll.code} thành công.`);
  };

  const updatePayrollStatus = (payrollId: string, nextStatus: PayrollRecord['status']) => {
    const target = db.payrolls.find((p) => p.id === payrollId);
    if (!target) return;
    if ((nextStatus === 'DA_DUYET' || nextStatus === 'DA_THANH_TOAN') && currentAccount.role !== 'DIRECTOR' && currentAccount.role !== 'ACCOUNTANT') {
      notify('Chỉ Giám đốc hoặc Kế toán được phân quyền mới có thể duyệt/thanh toán lương.', 'ERROR');
      return;
    }

    updateDb(
      (prev) => {
        const today = getTodayISO();
        const updatedPayrolls = prev.payrolls.map((p) => {
          if (p.id !== payrollId) return p;
          const isPaid = nextStatus === 'DA_THANH_TOAN';
          return {
            ...p,
            status: nextStatus,
            lockedAt: nextStatus !== 'NHAP' ? p.lockedAt || today : p.lockedAt,
            approvedBy:
              nextStatus === 'DA_DUYET' || nextStatus === 'DA_THANH_TOAN'
                ? currentAccount.fullName
                : p.approvedBy,
            paidAmount: isPaid ? p.finalSalary : p.paidAmount,
            remainingPayable: isPaid ? 0 : p.finalSalary - p.paidAmount,
          };
        });

        const nextCashflows = [...prev.cashflows];
        if (
          nextStatus === 'DA_THANH_TOAN' &&
          !prev.cashflows.some((c) => c.linkedPayrollId === payrollId)
        ) {
          nextCashflows.unshift({
            id: `CF-PAY-${Date.now()}`,
            code: `TC-CHI-${target.code}`,
            date: today,
            type: 'CHI',
            category: 'CHI_LUONG',
            amount: target.finalSalary,
            teacherCode: target.teacherCode,
            classCode: target.lineItems[0]?.classCode,
            linkedPayrollId: target.id,
            paymentMethod: 'CK',
            description: `Chi thanh toán lương ${target.periodName} cho GV ${target.teacherName} (${target.code})`,
            createdBy: currentAccount.fullName,
          });
        }

        return {
          ...prev,
          payrolls: updatedPayrolls,
          cashflows: nextCashflows,
        };
      },
      {
        action: `CHUYỂN TRẠNG THÁI LƯƠNG -> ${nextStatus}`,
        target: `${target.code} (${target.teacherName})`,
        detail: `Số tiền: ${target.finalSalary.toLocaleString('vi-VN')} đ`,
      }
    );
    notify(`Đã cập nhật trạng thái bảng lương ${target.code}.`);
  };

  const saveCashflow = (tx: CashflowTransaction) => {
    updateDb(
      (prev) => ({
        ...prev,
        cashflows: [tx, ...prev.cashflows],
      }),
      {
        action: tx.type === 'THU' ? 'GHI NHẬN KHOẢN THU' : 'GHI NHẬN KHOẢN CHI',
        target: `${tx.code} (${tx.amount.toLocaleString('vi-VN')} đ)`,
        detail: tx.description,
      }
    );
    notify('Đã ghi nhận giao dịch thu–chi thành công.');
  };

  const saveSettings = (settings: CenterSettings) => {
    updateDb(
      (prev) => ({
        ...prev,
        settings,
      }),
      {
        action: 'CẬP NHẬT CÀI ĐẶT TRUNG TÂM',
        target: settings.centerShortName,
        detail: 'Cập nhật cấu hình thông tin trung tâm, chính sách học phí và mẫu nhắc phí.',
      }
    );
    notify('Đã lưu cài đặt hệ thống thành công.');
  };

  const saveShiftsAndRooms = (shifts: ShiftConfig[], rooms: Room[]) => {
    updateDb((prev) => ({
      ...prev,
      shifts,
      rooms,
    }));
    notify('Đã cập nhật cấu hình Ca học và Phòng học.');
  };

  const saveUserAccount = (acc: UserAccount, isEdit: boolean): boolean => {
    if (!acc.username.trim() || !acc.fullName.trim()) {
      notify('Vui lòng nhập Tên đăng nhập và Họ tên.', 'ERROR');
      return false;
    }
    const cleanUsername = acc.username.trim();
    const duplicate = db.accounts.some(
      (a) =>
        a.id !== acc.id && a.username.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      notify(`Tên đăng nhập "${cleanUsername}" đã tồn tại.`, 'ERROR');
      return false;
    }
    const normalizedAcc: UserAccount = {
      ...acc,
      username: cleanUsername,
      fullName: acc.fullName.trim(),
      password: acc.password?.trim() || '123456',
    };
    updateDb(
      (prev) => {
        const list = [...prev.accounts];
        const idx = list.findIndex((a) => a.id === normalizedAcc.id);
        if (idx >= 0) list[idx] = normalizedAcc;
        else list.push(normalizedAcc);
        return { ...prev, accounts: list };
      },
      {
        action: isEdit ? 'CẬP NHẬT TÀI KHOẢN / PHÂN QUYỀN' : 'TẠO TÀI KHOẢN MỚI',
        target: `${normalizedAcc.username} (${normalizedAcc.role})`,
        detail: `Họ tên: ${normalizedAcc.fullName}, Trạng thái: ${normalizedAcc.status}`,
      }
    );
    notify(
      isEdit
        ? `Đã cập nhật tài khoản "${normalizedAcc.username}" thành công.`
        : `Đã tạo tài khoản "${normalizedAcc.username}" thành công.`
    );
    return true;
  };

  return (
    <AppContext.Provider
      value={{
        db,
        isLoading,
        isAuthenticated,
        loginWithCredentials,
        logout,
        currentAccount,
        switchAccount,
        toasts,
        notify,
        dismissToast,
        updateDb,
        restoreFromSavedFiles,
        resetDemoData,
        clearAllDemoData,
        supabaseStatus,
        supabaseLastSync,
        supabaseError,
        supabaseProjectUrl: SUPABASE_URL,
        syncWithSupabaseNow,
        activeModule,
        setActiveModule,
        selectedClassCodeForDetail,
        setSelectedClassCodeForDetail,
        selectedStudentCodeForDetail,
        setSelectedStudentCodeForDetail,
        saveTeacher,
        toggleTeacherActive,
        saveClass,
        saveStudent,
        deleteStudent,
        deleteUnenrolledStudents,
        saveEnrollment,
        saveEnrollmentsBatch,
        settleEarlyWithdrawalEnrollment,
        saveSession,
        saveBulkSessions,
        saveAttendanceBatch,
        saveAssignment,
        submitAssignment,
        gradeSubmission,
        createReceivablesBatch,
        createPaymentReceipt,
        createFinancialAdjustment,
        addReminderLog,
        savePayrollRecord,
        updatePayrollStatus,
        saveCashflow,
        saveSettings,
        saveShiftsAndRooms,
        saveUserAccount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
