import {
  AppDatabase,
  ClassInfo,
  ClassSession,
  Enrollment,
  PayrollLineItem,
  ShiftConfig,
  Teacher,
  TuitionReceivable,
  UserRole,
} from '../types';
import { formatDateVN, getTodayISO } from '../utils/formatters';

export interface ConflictWarning {
  type: 'TEACHER_CONFLICT' | 'ROOM_CONFLICT' | 'STUDENT_CONFLICT' | 'CAPACITY_EXCEEDED';
  message: string;
  severity: 'ERROR' | 'WARNING';
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isTimeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  return sA < eB && sB < eA;
}

/**
 * Lấy danh sách toàn bộ Mã Giáo viên cùng tham gia giảng dạy một lớp
 * (Gồm GV chính, danh sách coTeacherAssignments và các GV gắn trong từng buổi định kỳ)
 */
export function getClassAssignedTeacherCodes(cls: ClassInfo): string[] {
  const codes = new Set<string>();
  if (cls.teacherCode) codes.add(cls.teacherCode);
  (cls.coTeacherAssignments || []).forEach((a) => {
    if (a.teacherCode) codes.add(a.teacherCode);
  });
  (cls.recurringSchedule || []).forEach((r) => {
    if (r.teacherCode) codes.add(r.teacherCode);
  });
  return Array.from(codes);
}

/**
 * Phát hiện xung đột lịch học theo thời gian thực tế:
 * 1. Giáo viên trùng giờ (kiểm tra đúng giáo viên dạy buổi đó)
 * 2. Phòng trùng giờ
 * 3. Học viên có hai lớp trùng giờ
 * 4. Sĩ số vượt sức chứa phòng
 */
export function detectSessionConflicts(
  candidate: Omit<ClassSession, 'id'> & { id?: string },
  db: AppDatabase
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  if (candidate.status === 'HUY' || candidate.status === 'NGHI') {
    return warnings;
  }

  // Kiểm tra sức chứa phòng
  const room = db.rooms.find((r) => r.code === candidate.roomCode);
  const activeEnrollmentsInCandidateClass = db.enrollments.filter(
    (e) =>
      e.classCode === candidate.classCode &&
      e.status === 'DANG_HOC' &&
      e.feeStartDate <= candidate.date &&
      (!e.endDate || e.endDate >= candidate.date)
  );

  if (room && activeEnrollmentsInCandidateClass.length > room.capacity) {
    warnings.push({
      type: 'CAPACITY_EXCEEDED',
      severity: 'WARNING',
      message: `Sĩ số lớp ${candidate.classCode} (${activeEnrollmentsInCandidateClass.length} HV) vượt sức chứa phòng ${room.name} (${room.capacity} chỗ).`,
    });
  }

  const sameDaySessions = db.sessions.filter(
    (s) =>
      s.date === candidate.date &&
      s.id !== candidate.id &&
      s.status !== 'HUY' &&
      s.status !== 'NGHI'
  );

  const candidateStudentCodes = new Set(activeEnrollmentsInCandidateClass.map((e) => e.studentCode));

  for (const other of sameDaySessions) {
    if (!isTimeOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime)) {
      continue;
    }

    // 1. Giáo viên trùng giờ
    if (candidate.actualTeacherCode && candidate.actualTeacherCode === other.actualTeacherCode) {
      const teacher = db.teachers.find((t) => t.code === candidate.actualTeacherCode);
      warnings.push({
        type: 'TEACHER_CONFLICT',
        severity: 'ERROR',
        message: `Giáo viên ${teacher?.fullName || candidate.actualTeacherCode} bị trùng lịch dạy với lớp ${other.classCode} (${other.startTime}–${other.endTime} ngày ${formatDateVN(candidate.date)}).`,
      });
    }

    // 2. Phòng học trùng giờ
    if (candidate.roomCode && candidate.roomCode === other.roomCode) {
      warnings.push({
        type: 'ROOM_CONFLICT',
        severity: 'ERROR',
        message: `Phòng ${candidate.roomCode} đã được xếp cho lớp ${other.classCode} (${other.startTime}–${other.endTime} ngày ${formatDateVN(candidate.date)}).`,
      });
    }

    // 3. Học viên có 2 lớp trùng giờ
    const otherActiveStudents = db.enrollments.filter(
      (e) =>
        e.classCode === other.classCode &&
        e.status === 'DANG_HOC' &&
        e.feeStartDate <= other.date &&
        (!e.endDate || e.endDate >= other.date) &&
        candidateStudentCodes.has(e.studentCode)
    );

    if (otherActiveStudents.length > 0) {
      const names = otherActiveStudents
        .map((e) => {
          const st = db.students.find((s) => s.code === e.studentCode);
          return st ? `${st.fullName} (${st.code})` : e.studentCode;
        })
        .join(', ');
      warnings.push({
        type: 'STUDENT_CONFLICT',
        severity: 'WARNING',
        message: `Học viên bị trùng giờ học giữa lớp ${candidate.classCode} và ${other.classCode} (${other.startTime}–${other.endTime}): ${names}.`,
      });
    }
  }

  return warnings;
}

/**
 * Tạo các buổi học từ lịch định kỳ trong khoảng thời gian chọn.
 * Hỗ trợ gán đúng Giáo viên phụ trách từng buổi riêng biệt trong tuần (VD: Kids 2 GV, IELTS 4 GV theo 4 kỹ năng).
 */
export function generateSessionsFromSchedule(
  cls: ClassInfo,
  fromDate: string,
  toDate: string,
  shifts: ShiftConfig[],
  existingSessions: ClassSession[]
): ClassSession[] {
  const created: ClassSession[] = [];
  const start = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return created;

  const current = new Date(start);
  let seq = existingSessions.length + 1;

  while (current <= end) {
    const dayOfWeek = current.getDay();
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateISO = `${y}-${m}-${d}`;

    for (const rule of cls.recurringSchedule) {
      if (rule.dayOfWeek === dayOfWeek) {
        const shift = shifts.find((s) => s.id === rule.shiftId);
        if (!shift) continue;
        const alreadyExists = existingSessions.some(
          (s) => s.classCode === cls.code && s.date === dateISO && s.shiftId === rule.shiftId
        );
        if (!alreadyExists) {
          const sessionTeacherCode = rule.teacherCode || cls.teacherCode;
          const skillPrefix = rule.skillNote ? `[${rule.skillNote}] ` : '';
          created.push({
            id: `SES-${cls.code}-${dateISO.replace(/-/g, '')}-${rule.shiftId}-${seq++}`,
            classCode: cls.code,
            date: dateISO,
            shiftId: rule.shiftId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            roomCode: rule.roomCode || cls.roomCode,
            actualTeacherCode: sessionTeacherCode,
            skillNote: rule.skillNote,
            status: 'DU_KIEN',
            topic: `${skillPrefix}Buổi học định kỳ lớp ${cls.name}`,
          });
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return created;
}

/**
 * Tính danh sách các buổi học tính phí cho 1 đăng ký học trong khoảng kỳ thu:
 * - Chỉ tính buổi thuộc thời gian đăng ký hợp lệ (date >= enrollment.feeStartDate và <= endDate)
 * - Không tính buổi HUY, NGHI
 * - Không tính buổi HOC_BU lần 2 (vì buổi học bù đã liên kết buổi gốc makeupForSessionId)
 * - Trừ các buổi vắng có duyệt miễn phí rõ ràng (feeWaivedForAbsence === true)
 */
export function getBillableSessionsForEnrollment(
  enrollment: Enrollment,
  cls: ClassInfo,
  periodStart: string,
  periodEnd: string,
  db: AppDatabase
): ClassSession[] {
  const effectiveStart = enrollment.feeStartDate > periodStart ? enrollment.feeStartDate : periodStart;
  const effectiveEnd =
    enrollment.endDate && enrollment.endDate < periodEnd ? enrollment.endDate : periodEnd;

  const classSessions = db.sessions
    .filter((s) => s.classCode === cls.code)
    .sort((a, b) => a.date.localeCompare(b.date));

  const alreadyBilledSessionIds = new Set<string>();
  db.receivables
    .filter((r) => r.enrollmentId === enrollment.id)
    .forEach((r) => r.sessionIds.forEach((id) => alreadyBilledSessionIds.add(id)));

  const billableCandidates = classSessions.filter((s) => {
    if (alreadyBilledSessionIds.has(s.id)) return false;
    if (s.date < effectiveStart || s.date > effectiveEnd) return false;
    if (s.status === 'HOC_BU' || s.makeupForSessionId) return false;
    if (s.status === 'HUY' || s.status === 'NGHI') return false;

    const att = db.attendance.find(
      (a) => a.sessionId === s.id && a.studentCode === enrollment.studentCode
    );
    if (att && att.feeWaivedForAbsence) return false;

    return true;
  });

  if (cls.billingMethod === 'PACKAGE_16_SESSIONS') {
    return billableCandidates.slice(0, 16);
  }
  return billableCandidates;
}

/**
 * Tạo khoản phải thu chuẩn xác có danh sách buổi và đơn giá tương ứng,
 * kèm hiển thị nợ đầu kỳ tham chiếu (không tạo lại khoản phải thu cũ gây nhân đôi nợ)
 */
export function buildTuitionReceivable(params: {
  cycleName: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  enrollment: Enrollment;
  cls: ClassInfo;
  db: AppDatabase;
  seqNumber: number;
}): TuitionReceivable | null {
  const { cycleName, periodStart, periodEnd, dueDate, enrollment, cls, db, seqNumber } = params;
  const sessions = getBillableSessionsForEnrollment(enrollment, cls, periodStart, periodEnd, db);
  if (sessions.length === 0) return null;

  const unitPrice = enrollment.appliedFeePerSession || cls.feePerSession || db.settings.defaultFeePerSession;
  const sessionCount = sessions.length;
  const grossAmount = Math.round(sessionCount * unitPrice);

  const percentDiscount = Math.round((grossAmount * (enrollment.discountPercent || 0)) / 100);
  const discountAmount = Math.min(grossAmount, percentDiscount + Math.round(enrollment.discountAmount || 0));
  const netAmount = Math.max(0, grossAmount - discountAmount);

  const openingDebtReference = db.receivables
    .filter((r) => r.studentCode === enrollment.studentCode && r.remainingDebt > 0)
    .reduce((sum, r) => sum + r.remainingDebt, 0);

  const today = getTodayISO();
  const status = netAmount === 0 ? 'DA_DU' : dueDate < today ? 'QUA_HAN' : 'CHUA_DONG';

  return {
    id: `REC-${enrollment.studentCode}-${cls.code}-${Date.now()}-${seqNumber}`,
    code: `KPT-${periodStart.slice(0, 7).replace('-', '')}-${String(seqNumber).padStart(3, '0')}`,
    cycleName,
    studentCode: enrollment.studentCode,
    classCode: cls.code,
    enrollmentId: enrollment.id,
    createdAt: today,
    dueDate,
    periodStart,
    periodEnd,
    billingMethod: cls.billingMethod,
    sessionIds: sessions.map((s) => s.id),
    sessionDates: sessions.map((s) => s.date),
    sessionCount,
    unitPrice,
    grossAmount,
    discountAmount,
    adjustmentAmount: 0,
    netAmount,
    openingDebtReference,
    paidAmount: 0,
    remainingDebt: netAmount,
    status,
  };
}

/**
 * Lấy mức lương giáo viên có hiệu lực tại ngày targetDate cho lớp cụ thể.
 * Hỗ trợ đơn giá ca riêng của từng giáo viên trong lớp nhiều GV (coTeacherAssignments)
 * cũng như đơn giá khác nhau giữa GV Việt Nam và GV Nước ngoài.
 */
export function getEffectiveTeacherRate(
  teacher: Teacher,
  cls?: ClassInfo,
  targetDate: string = getTodayISO()
): number {
  // 1. Nếu lớp có thiết lập đơn giá ca riêng cho GV này trong coTeacherAssignments
  if (cls && teacher.group === 'TATT' && cls.coTeacherAssignments) {
    const coAssign = cls.coTeacherAssignments.find((a) => a.teacherCode === teacher.code);
    if (coAssign && coAssign.customShiftRate && coAssign.customShiftRate > 0) {
      return coAssign.customShiftRate;
    }
  }

  // 2. Kiểm tra lịch sử thiết lập theo ngày hiệu lực của GV
  const applicableHistory = (teacher.rateHistory || [])
    .filter(
      (h) =>
        h.effectiveDate <= targetDate &&
        (!h.classCode || (cls && h.classCode === cls.code))
    )
    .sort((a, b) => {
      if (a.classCode && !b.classCode) return -1;
      if (!a.classCode && b.classCode) return 1;
      return b.effectiveDate.localeCompare(a.effectiveDate);
    });

  if (applicableHistory.length > 0) {
    const top = applicableHistory[0];
    if (teacher.group === 'VH' && top.percentageRate !== undefined) {
      return top.percentageRate;
    }
    if (teacher.group === 'TATT' && top.shiftRate !== undefined) {
      return top.shiftRate;
    }
  }

  // 3. Nếu là GV chính và lớp có teacherCustomRate
  if (
    cls?.teacherCustomRate !== undefined &&
    cls.teacherCustomRate > 0 &&
    cls.teacherCode === teacher.code
  ) {
    if (!cls.teacherRateEffectiveDate || cls.teacherRateEffectiveDate <= targetDate) {
      return cls.teacherCustomRate;
    }
  }

  return teacher.group === 'VH' ? teacher.percentageRate : teacher.shiftRate;
}

/**
 * Tính dự thảo bảng lương giáo viên:
 * A. Văn hoá (VH):
 *    Lương = Học phí thực thu đã phân bổ cho lớp và kỳ (sau miễn giảm/hoàn phí) × Tỷ lệ hưởng.
 * B. Ngoại ngữ (TATT):
 *    Lương = Số ca đã dạy được xác nhận (`status === 'DA_DAY' || status === 'HOC_BU'`) × Đơn giá ca có hiệu lực tại ngày dạy.
 *    Hỗ trợ hoàn hảo lớp có 2 GV (1 GV Việt + 1 GV Nước ngoài) hoặc lớp IELTS 4 GV dạy 4 buổi/tuần:
 *    Ai dạy buổi nào được tính đúng số ca của buổi đó với đúng đơn giá ca của người đó!
 */
export function calculateTeacherPayrollDraft(
  teacher: Teacher,
  periodMonth: string, // YYYY-MM
  db: AppDatabase
): PayrollLineItem[] {
  const lines: PayrollLineItem[] = [];

  if (teacher.group === 'VH') {
    const teacherClasses = db.classes.filter((c) => c.teacherCode === teacher.code);

    for (const cls of teacherClasses) {
      const unbilledAllocations: {
        allocId: string;
        amount: number;
        allocationDate: string;
        cycleName: string;
        isSupplemental: boolean;
      }[] = [];

      for (const receipt of db.receipts) {
        for (const alloc of receipt.allocations) {
          if (alloc.classCode === cls.code && !alloc.includedInPayrollId && alloc.allocatedAmount > 0) {
            const rec = db.receivables.find((r) => r.id === alloc.receivableId);
            const recMonth = rec ? rec.periodStart.slice(0, 7) : alloc.allocationDate.slice(0, 7);
            const isSupplemental = recMonth < periodMonth;
            unbilledAllocations.push({
              allocId: alloc.id,
              amount: alloc.allocatedAmount,
              allocationDate: alloc.allocationDate,
              cycleName: alloc.cycleName,
              isSupplemental,
            });
          }
        }
      }

      const classRefunds = db.adjustments
        .filter(
          (adj) =>
            adj.type === 'HOAN_PHI' &&
            adj.date.startsWith(periodMonth) &&
            adj.receivableId &&
            db.receivables.find((r) => r.id === adj.receivableId)?.classCode === cls.code
        )
        .reduce((s, a) => s + a.amount, 0);

      const regularAllocs = unbilledAllocations.filter((a) => !a.isSupplemental);
      const supplementalAllocs = unbilledAllocations.filter((a) => a.isSupplemental);

      const rate = getEffectiveTeacherRate(teacher, cls, `${periodMonth}-28`);

      if (regularAllocs.length > 0) {
        const totalCollected = Math.max(
          0,
          regularAllocs.reduce((sum, a) => sum + a.amount, 0) - classRefunds
        );
        const salary = Math.round((totalCollected * rate) / 100);
        lines.push({
          id: `PLI-${cls.code}-REG-${Date.now()}`,
          classCode: cls.code,
          className: cls.name,
          description: `Học phí thực thu kỳ hiện tại đã phân bổ (${regularAllocs.length} khoản thu${classRefunds > 0 ? `, sau trừ hoàn phí ${classRefunds.toLocaleString('vi-VN')} đ` : ''})`,
          basisAmountOrShifts: totalCollected,
          rateApplied: rate,
          calculatedSalary: salary,
          sourceAllocationIds: regularAllocs.map((a) => a.allocId),
          isSupplementalDebtCollection: false,
        });
      }

      if (supplementalAllocs.length > 0) {
        const suppTotal = supplementalAllocs.reduce((sum, a) => sum + a.amount, 0);
        const salary = Math.round((suppTotal * rate) / 100);
        lines.push({
          id: `PLI-${cls.code}-SUPP-${Date.now()}`,
          classCode: cls.code,
          className: cls.name,
          description: `Lương bổ sung từ học phí nợ kỳ trước thu sau (${supplementalAllocs.length} khoản thu nợ)`,
          basisAmountOrShifts: suppTotal,
          rateApplied: rate,
          calculatedSalary: salary,
          sourceAllocationIds: supplementalAllocs.map((a) => a.allocId),
          isSupplementalDebtCollection: true,
        });
      }
    }
  } else {
    // Nhóm TATT: tính theo số ca thực dạy đã xác nhận (DA_DAY hoặc HOC_BU) chưa chốt lương của chính giáo viên đó
    const taughtSessions = db.sessions.filter(
      (s) =>
        s.actualTeacherCode === teacher.code &&
        (s.status === 'DA_DAY' || s.status === 'HOC_BU') &&
        !s.payrollLocked &&
        s.date.startsWith(periodMonth)
    );

    const groupedByClass = new Map<string, ClassSession[]>();
    for (const ses of taughtSessions) {
      const list = groupedByClass.get(ses.classCode) || [];
      list.push(ses);
      groupedByClass.set(ses.classCode, list);
    }

    for (const [classCode, sessions] of groupedByClass.entries()) {
      const cls = db.classes.find((c) => c.code === classCode);
      let totalSalary = 0;
      let latestRate = teacher.shiftRate;
      for (const s of sessions) {
        const rate = getEffectiveTeacherRate(teacher, cls, s.date);
        latestRate = rate;
        totalSalary += rate;
      }

      const assignedCodes = cls ? getClassAssignedTeacherCodes(cls) : [];
      const coRole = cls?.coTeacherAssignments?.find((a) => a.teacherCode === teacher.code)?.skillOrRole;
      const isSubstitute = cls && !assignedCodes.includes(teacher.code);
      const teacherTypeLabel =
        teacher.tattTeacherType === 'GV_NUOC_NGOAI' ? 'GV Nước ngoài' : 'GV Việt Nam';

      lines.push({
        id: `PLI-${classCode}-${teacher.code}-TATT-${Date.now()}`,
        classCode,
        className: cls?.name || classCode,
        description: `${sessions.length} ca thực dạy (${teacherTypeLabel}${coRole ? ` – ${coRole}` : isSubstitute ? ' – Dạy thay' : ''}) trong tháng ${periodMonth}`,
        basisAmountOrShifts: sessions.length,
        rateApplied: latestRate,
        calculatedSalary: Math.round(totalSalary),
        sourceSessionIds: sessions.map((s) => s.id),
      });
    }
  }

  return lines;
}

/**
 * Kiểm tra phân quyền truy cập phân hệ theo vai trò (dùng chung cho cả giao diện và API backend)
 */
export function canRoleAccessModule(role: UserRole, moduleId: string): boolean {
  const matrix: Record<UserRole, string[]> = {
    DIRECTOR: [
      'dashboard',
      'teachers',
      'classes',
      'students',
      'enrollments',
      'schedule',
      'attendance',
      'assignments',
      'tuition',
      'reminders',
      'payroll',
      'cashflow',
      'reports',
      'accounts',
      'settings',
    ],
    ACADEMIC: [
      'dashboard',
      'teachers',
      'classes',
      'students',
      'enrollments',
      'schedule',
      'attendance',
      'assignments',
      'reports',
    ],
    ACCOUNTANT: [
      'dashboard',
      'students',
      'enrollments',
      'tuition',
      'reminders',
      'payroll',
      'cashflow',
      'reports',
    ],
    TEACHER: ['dashboard', 'classes', 'schedule', 'attendance', 'assignments', 'payroll'],
    STUDENT: ['dashboard', 'schedule', 'attendance', 'assignments', 'tuition'],
  };

  return (matrix[role] || []).includes(moduleId);
}
