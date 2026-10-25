import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BillingMethod, ClassInfo, ClassStatus, TeachingGroup } from '../types';
import { getClassAssignedTeacherCodes } from '../services/businessLogic';
import {
  formatCurrency,
  formatDateVN,
  getAttendanceStatusLabel,
  getBillingMethodLabel,
  getClassStatusLabel,
  getDayOfWeekLabel,
  getGroupLabel,
  getReceivableStatusLabel,
  getSessionStatusLabel,
  getTodayISO,
} from '../utils/formatters';
import {
  exportAllClassesRosterWorkbook,
  exportClassRosterWithTeacherToExcel,
  exportRowsToExcel,
} from '../utils/excelService';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { Enrollment } from '../types';

type DetailTab = 'STUDENTS' | 'SCHEDULE' | 'ATTENDANCE' | 'ASSIGNMENTS' | 'TUITION' | 'SUMMARY';

export const ClassesView: React.FC = () => {
  const {
    db,
    currentAccount,
    saveClass,
    saveEnrollment,
    settleEarlyWithdrawalEnrollment,
    selectedClassCodeForDetail,
    setSelectedClassCodeForDetail,
    notify,
  } = useApp();

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | TeachingGroup>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClassStatus>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('STUDENTS');
  const [quickEnrollStudentCode, setQuickEnrollStudentCode] = useState('');

  // Modal báo nghỉ bất ưng cho học viên trong lớp -> tính tiền từ lúc tham gia đến khi nghỉ
  const [stopEnrollTarget, setStopEnrollTarget] = useState<Enrollment | null>(null);
  const [stopDateInput, setStopDateInput] = useState(getTodayISO());
  const [stopSessionsInput, setStopSessionsInput] = useState(6);
  const [stopUnitPriceInput, setStopUnitPriceInput] = useState(50000);
  const [stopReasonInput, setStopReasonInput] = useState('Xin nghỉ trước khi kết thúc khoá học');

  const emptyClass: ClassInfo = {
    code: '',
    name: '',
    subject: 'Toán',
    group: 'VH',
    grade: 'Khối 6',
    teacherCode: db.teachers[0]?.code || '',
    startDate: '2026-09-01',
    endDate: '',
    feePerSession: db.settings.defaultFeePerSession || 50000,
    billingMethod: 'CYCLE_8_WEEKS',
    maxStudents: 25,
    roomCode: db.rooms[0]?.code || 'P101',
    recurringSchedule: [
      { dayOfWeek: 1, shiftId: 'CHIEU_3', roomCode: db.rooms[0]?.code || 'P101' },
      { dayOfWeek: 4, shiftId: 'CHIEU_3', roomCode: db.rooms[0]?.code || 'P101' },
    ],
    status: 'DANG_HOC',
    note: '',
  };

  const [form, setForm] = useState<ClassInfo>(emptyClass);

  const visibleClasses = useMemo(() => {
    return db.classes.filter((c) => {
      const assignedCodes = getClassAssignedTeacherCodes(c);
      if (
        currentAccount.role === 'TEACHER' &&
        currentAccount.linkedTeacherCode &&
        !assignedCodes.includes(currentAccount.linkedTeacherCode)
      ) {
        return false;
      }
      if (groupFilter !== 'ALL' && c.group !== groupFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const teacherMatch = assignedCodes.some((code) => {
          const gv = db.teachers.find((t) => t.code === code);
          return (
            code.toLowerCase().includes(q) ||
            (gv && gv.fullName.toLowerCase().includes(q))
          );
        });
        const match =
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          teacherMatch;
        if (!match) return false;
      }
      return true;
    });
  }, [db.classes, db.teachers, currentAccount, groupFilter, statusFilter, search]);

  const selectedClass = db.classes.find((c) => c.code === selectedClassCodeForDetail) || null;

  const handleOpenAdd = () => {
    setForm({
      ...emptyClass,
      code: `LOP${String(db.classes.length + 1).padStart(2, '0')}A`,
      coTeacherAssignments: [],
    });
    setIsEdit(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: ClassInfo) => {
    setForm({
      ...c,
      coTeacherAssignments: c.coTeacherAssignments ? [...c.coTeacherAssignments] : [],
      recurringSchedule: c.recurringSchedule.map((r) => ({ ...r })),
    });
    setIsEdit(true);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveClass(form, isEdit)) {
      setIsModalOpen(false);
    }
  };

  const handleExportExcel = () => {
    const rows = visibleClasses.map((c) => {
      const gv = db.teachers.find((t) => t.code === c.teacherCode);
      const count = db.enrollments.filter(
        (e) => e.classCode === c.code && e.status === 'DANG_HOC'
      ).length;
      return {
        'Mã lớp': c.code,
        'Tên lớp': c.name,
        'Môn học': c.subject,
        Nhóm: getGroupLabel(c.group),
        'Khối lớp': c.grade,
        'Mã GV': c.teacherCode,
        'Giáo viên phụ trách': gv?.fullName || 'Chưa phân công',
        'Ngày bắt đầu': formatDateVN(c.startDate),
        'Ngày kết thúc': c.endDate ? formatDateVN(c.endDate) : 'Tự nhập khi kết thúc',
        'Học phí mỗi buổi (VNĐ)': c.feePerSession,
        'Cách xác định kỳ thu': getBillingMethodLabel(c.billingMethod),
        'Sĩ số hiện tại': count,
        'Sĩ số tối đa': c.maxStudents,
        'Phòng học': c.roomCode,
        'Trạng thái': getClassStatusLabel(c.status),
      };
    });
    exportRowsToExcel(rows, 'Danh_Sach_Lop_Hoc_APLUS2.xlsx', 'Lop_Hoc');
  };

  const openStopSettlementModal = (enr: Enrollment, cls: ClassInfo) => {
    const today = getTodayISO();
    const stopDt = enr.endDate || today;
    const countedSessions = db.sessions.filter(
      (s) =>
        s.classCode === enr.classCode &&
        s.date >= enr.feeStartDate &&
        s.date <= stopDt &&
        (s.status === 'DA_DAY' || s.status === 'DU_KIEN')
    ).length;
    setStopEnrollTarget(enr);
    setStopDateInput(stopDt);
    setStopSessionsInput(
      enr.actualAttendedSessions !== undefined
        ? enr.actualAttendedSessions
        : countedSessions > 0
          ? countedSessions
          : 6
    );
    setStopUnitPriceInput(
      enr.appliedFeePerSession || (cls.group === 'VH' ? 50000 : cls.feePerSession)
    );
    setStopReasonInput(enr.stopReason || 'Xin nghỉ bất ưng trước khi kết thúc khoá học');
  };

  const handleQuickEnroll = () => {
    if (!selectedClass) return;
    if (!selectedClass.code || !selectedClass.teacherCode) {
      notify('Chỉ cho phép đăng ký học viên vào lớp khi lớp có mã và giáo viên phụ trách!', 'ERROR');
      return;
    }
    if (!quickEnrollStudentCode) {
      notify('Vui lòng chọn học viên cần đăng ký vào lớp.', 'WARNING');
      return;
    }
    const today = getTodayISO();
    const ok = saveEnrollment(
      {
        id: `ENR-${quickEnrollStudentCode}-${selectedClass.code}-${Date.now()}`,
        studentCode: quickEnrollStudentCode,
        classCode: selectedClass.code,
        enrollmentDate: today,
        feeStartDate: today,
        appliedFeePerSession: selectedClass.feePerSession,
        discountPercent: 0,
        discountAmount: 0,
        status: 'DANG_HOC',
      },
      false
    );
    if (ok) {
      setQuickEnrollStudentCode('');
    }
  };

  // Nếu đang mở chi tiết 1 lớp học (có đủ 6 tab: Danh sách học viên, Lịch học, Điểm danh, Bài tập, Học phí, Tổng hợp)
  if (selectedClass) {
    const classTeacher = db.teachers.find((t) => t.code === selectedClass.teacherCode);
    const classEnrollments = db.enrollments.filter((e) => e.classCode === selectedClass.code);
    const classSessions = db.sessions
      .filter((s) => s.classCode === selectedClass.code)
      .sort((a, b) => a.date.localeCompare(b.date));
    const classAttendance = db.attendance.filter((a) => a.classCode === selectedClass.code);
    const classAssignments = db.assignments.filter((a) => a.classCode === selectedClass.code);
    const classReceivables = db.receivables.filter((r) => r.classCode === selectedClass.code);

    const totalReceivable = classReceivables.reduce((s, r) => s + r.netAmount, 0);
    const totalPaid = classReceivables.reduce((s, r) => s + r.paidAmount, 0);
    const totalDebt = classReceivables.reduce((s, r) => s + r.remainingDebt, 0);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedClassCodeForDetail(null)}
              className="inline-flex items-center gap-1 rounded border border-[#D4E8DB] px-3 py-1.5 text-sm font-bold hover:bg-[#F2FAF5]"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại danh sách
            </button>
            <div>
              <h2 className="text-2xl font-bold text-[#173B2C]">
                LỚP {selectedClass.name.toUpperCase()} ({selectedClass.code})
              </h2>
              <p className="text-sm text-[#173B2C]/80">
                Môn: <strong>{selectedClass.subject}</strong> ({getGroupLabel(selectedClass.group)}) · Giáo viên phụ trách:{' '}
                <strong>
                  {selectedClass.coTeacherAssignments && selectedClass.coTeacherAssignments.length > 0
                    ? selectedClass.coTeacherAssignments
                        .map((a) => {
                          const t = db.teachers.find((gv) => gv.code === a.teacherCode);
                          return `${t?.fullName || a.teacherCode} (${a.skillOrRole})`;
                        })
                        .join(' + ')
                    : classTeacher?.fullName || 'Chưa phân công'}
                </strong>{' '}
                · Phòng: <strong>{selectedClass.roomCode}</strong> · Đơn giá:{' '}
                <strong>{formatCurrency(selectedClass.feePerSession)}/buổi</strong> · Kết thúc:{' '}
                <strong>
                  {selectedClass.endDate
                    ? formatDateVN(selectedClass.endDate)
                    : 'Đang mở (Trung tâm tự nhập khi kết thúc)'}
                </strong>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportClassRosterWithTeacherToExcel(selectedClass, db)}
              className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Xuất Excel DS Học sinh & GV Lớp {selectedClass.code}
            </button>
            <button
              onClick={() => handleOpenEdit(selectedClass)}
              className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
            >
              <Edit2 className="h-4 w-4" />
              Chỉnh sửa lớp học
            </button>
          </div>
        </div>

        {/* 6 Tab Chi tiết lớp học */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-[#D4E8DB] bg-white p-1.5 shadow-xs">
          {(
            [
              ['STUDENTS', `1. Danh sách học viên (${classEnrollments.length})`],
              ['SCHEDULE', `2. Lịch học (${classSessions.length} buổi)`],
              ['ATTENDANCE', `3. Điểm danh (${classAttendance.length})`],
              ['ASSIGNMENTS', `4. Bài tập (${classAssignments.length})`],
              ['TUITION', `5. Học phí (${classReceivables.length})`],
              ['SUMMARY', '6. Tổng hợp lớp'],
            ] as [DetailTab, string][]
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className={`rounded px-4 py-2 text-sm font-bold transition ${
                activeTab === tabKey
                  ? 'bg-[#00543C] text-white'
                  : 'text-[#173B2C] hover:bg-[#F2FAF5]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Nội dung từng Tab */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          {activeTab === 'STUDENTS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                <div className="text-sm font-bold">
                  Đăng ký nhanh học viên vào lớp {selectedClass.code}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={quickEnrollStudentCode}
                    onChange={(e) => setQuickEnrollStudentCode(e.target.value)}
                    className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 text-sm"
                  >
                    <option value="">-- Chọn học viên trong trung tâm --</option>
                    {db.students.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} – {s.fullName} ({s.school})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleQuickEnroll}
                    className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-3.5 py-1.5 text-sm font-bold text-white hover:bg-[#006B42]"
                  >
                    <UserPlus className="h-4 w-4" />
                    Ghi danh vào lớp
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-[#00543C] text-white">
                    <tr>
                      <th className="p-2.5">Mã HV</th>
                      <th className="p-2.5">Họ và tên</th>
                      <th className="p-2.5">Trường / Lớp</th>
                      <th className="p-2.5">Phụ huynh & SĐT</th>
                      <th className="p-2.5">Tính phí từ → Ngày nghỉ</th>
                      <th className="p-2.5 text-center">Số buổi học</th>
                      <th className="p-2.5 text-right">Đơn giá / Tổng tiền</th>
                      <th className="p-2.5">Trạng thái ĐK</th>
                      <th className="p-2.5 text-right">Báo nghỉ / Chốt phí</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D4E8DB]">
                    {classEnrollments.map((enr) => {
                      const st = db.students.find((s) => s.code === enr.studentCode);
                      const rec = db.receivables.find((r) => r.enrollmentId === enr.id);
                      const sesCount =
                        enr.actualAttendedSessions !== undefined
                          ? enr.actualAttendedSessions
                          : rec
                            ? rec.sessionCount
                            : 16;
                      const calcTotal = sesCount * enr.appliedFeePerSession;
                      return (
                        <tr key={enr.id} className="hover:bg-[#F2FAF5]">
                          <td className="p-2.5 font-bold text-[#00543C]">{enr.studentCode}</td>
                          <td className="p-2.5 font-bold">{st?.fullName}</td>
                          <td className="p-2.5">
                            {st?.school} ({st?.schoolClass})
                          </td>
                          <td className="p-2.5">
                            {st?.parentName} · {st?.phone}
                          </td>
                          <td className="p-2.5 tabular-nums text-xs">
                            <div>Từ: <strong>{formatDateVN(enr.feeStartDate)}</strong></div>
                            <div>
                              Đến:{' '}
                              <strong className={enr.endDate ? 'text-red-600' : 'text-[#008653]'}>
                                {enr.endDate ? formatDateVN(enr.endDate) : 'Đang học'}
                              </strong>
                            </div>
                          </td>
                          <td className="p-2.5 text-center font-bold tabular-nums">
                            {sesCount} buổi
                          </td>
                          <td className="p-2.5 text-right tabular-nums">
                            <div className="font-bold text-[#00543C]">
                              {formatCurrency(enr.appliedFeePerSession)}/buổi
                            </div>
                            <div className="text-xs font-bold text-[#008653]">
                              = {formatCurrency(calcTotal)}
                            </div>
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`font-bold ${
                                enr.status === 'DA_NGHI' ? 'text-red-600' : 'text-[#008653]'
                              }`}
                            >
                              {enr.status === 'DA_NGHI' ? 'Đã nghỉ (Chốt phí)' : enr.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => openStopSettlementModal(enr, selectedClass)}
                              className="rounded border border-amber-600 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
                            >
                              Báo nghỉ / Tính tiền
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'SCHEDULE' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#00543C] text-white">
                  <tr>
                    <th className="p-2.5">Ngày học</th>
                    <th className="p-2.5">Khung giờ</th>
                    <th className="p-2.5">Phòng</th>
                    <th className="p-2.5">Giáo viên thực dạy</th>
                    <th className="p-2.5">Chuyên đề / Nội dung</th>
                    <th className="p-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4E8DB]">
                  {classSessions.map((s) => {
                    const gv = db.teachers.find((t) => t.code === s.actualTeacherCode);
                    const co = (selectedClass.coTeacherAssignments || []).find(
                      (a) => a.teacherCode === s.actualTeacherCode
                    );
                    const shiftRate = co?.customShiftRate ?? gv?.shiftRate;
                    return (
                      <tr key={s.id} className="hover:bg-[#F2FAF5]">
                        <td className="p-2.5 font-bold tabular-nums">{formatDateVN(s.date)}</td>
                        <td className="p-2.5 tabular-nums">
                          {s.startTime}–{s.endTime}
                        </td>
                        <td className="p-2.5">{s.roomCode}</td>
                        <td className="p-2.5">
                          <div className="font-bold text-[#00543C]">
                            {gv?.fullName || s.actualTeacherCode}{' '}
                            <span className="text-xs font-normal text-[#173B2C]/75">
                              ({s.actualTeacherCode})
                            </span>
                          </div>
                          {gv?.group === 'TATT' && (
                            <div className="text-xs text-[#008653] font-bold">
                              {gv.tattTeacherType === 'GV_NUOC_NGOAI'
                                ? 'GV Nước ngoài'
                                : 'GV Việt Nam'}
                              {shiftRate ? ` · ${formatCurrency(shiftRate)}/ca` : ''}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5">
                          {s.skillNote && (
                            <span className="mr-1.5 rounded bg-[#F2FAF5] px-2 py-0.5 text-xs font-bold text-[#00543C] border border-[#D4E8DB]">
                              {s.skillNote}
                            </span>
                          )}
                          <span>{s.topic}</span>
                        </td>
                        <td className="p-2.5 font-bold text-[#008653]">
                          {getSessionStatusLabel(s.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'ATTENDANCE' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#00543C] text-white">
                  <tr>
                    <th className="p-2.5">Ngày học</th>
                    <th className="p-2.5">Mã HV</th>
                    <th className="p-2.5">Họ tên học viên</th>
                    <th className="p-2.5">Trạng thái chuyên cần</th>
                    <th className="p-2.5">Ghi chú</th>
                    <th className="p-2.5">Người điểm danh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4E8DB]">
                  {classAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-[#173B2C]/70">
                        Chưa có bản ghi điểm danh nào cho lớp này.
                      </td>
                    </tr>
                  ) : (
                    classAttendance.map((a) => {
                      const st = db.students.find((s) => s.code === a.studentCode);
                      return (
                        <tr key={a.id}>
                          <td className="p-2.5 tabular-nums">{formatDateVN(a.date)}</td>
                          <td className="p-2.5 font-bold">{a.studentCode}</td>
                          <td className="p-2.5 font-bold">{st?.fullName}</td>
                          <td className="p-2.5 font-bold text-[#008653]">
                            {getAttendanceStatusLabel(a.status)}
                          </td>
                          <td className="p-2.5">{a.note}</td>
                          <td className="p-2.5">{a.updatedBy}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'ASSIGNMENTS' && (
            <div className="space-y-3">
              {classAssignments.map((asg) => {
                const subCount = db.submissions.filter((s) => s.assignmentId === asg.id).length;
                return (
                  <div
                    key={asg.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#D4E8DB] p-4"
                  >
                    <div>
                      <div className="font-bold text-base">
                        {asg.title} ({asg.code})
                      </div>
                      <div className="text-xs text-[#173B2C]/80">
                        Hạn nộp: {formatDateVN(asg.dueDate)} · Thời gian làm bài:{' '}
                        {asg.durationMinutes} phút · Số câu hỏi: {asg.questions.length}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-bold text-[#008653]">
                        Đã nộp: {subCount}/{classEnrollments.length} học viên
                      </div>
                      <div className="text-xs">
                        {asg.scoresPublished ? 'Đã công bố điểm' : 'Chưa công bố điểm'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'TUITION' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#00543C] text-white">
                  <tr>
                    <th className="p-2.5">Mã khoản thu</th>
                    <th className="p-2.5">Học viên</th>
                    <th className="p-2.5">Kỳ thu</th>
                    <th className="p-2.5 text-right">Số buổi</th>
                    <th className="p-2.5 text-right">Phải thu</th>
                    <th className="p-2.5 text-right">Đã đóng</th>
                    <th className="p-2.5 text-right">Còn nợ</th>
                    <th className="p-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4E8DB]">
                  {classReceivables.map((r) => {
                    const st = db.students.find((s) => s.code === r.studentCode);
                    return (
                      <tr key={r.id}>
                        <td className="p-2.5 font-bold">{r.code}</td>
                        <td className="p-2.5 font-bold">
                          {st?.fullName} ({r.studentCode})
                        </td>
                        <td className="p-2.5">{r.cycleName}</td>
                        <td className="p-2.5 text-right tabular-nums">{r.sessionCount} buổi</td>
                        <td className="p-2.5 text-right font-bold tabular-nums">
                          {formatCurrency(r.netAmount)}
                        </td>
                        <td className="p-2.5 text-right font-bold text-[#008653] tabular-nums">
                          {formatCurrency(r.paidAmount)}
                        </td>
                        <td className="p-2.5 text-right font-bold text-red-600 tabular-nums">
                          {formatCurrency(r.remainingDebt)}
                        </td>
                        <td className="p-2.5 font-bold">{getReceivableStatusLabel(r.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'SUMMARY' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4">
                <div className="text-xs font-bold text-[#173B2C]/70">TỔNG PHẢI THU CỦA LỚP</div>
                <div className="mt-1 text-2xl font-bold text-[#173B2C] tabular-nums">
                  {formatCurrency(totalReceivable)}
                </div>
              </div>
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4">
                <div className="text-xs font-bold text-[#173B2C]/70">ĐÃ THU THỰC TẾ</div>
                <div className="mt-1 text-2xl font-bold text-[#008653] tabular-nums">
                  {formatCurrency(totalPaid)}
                </div>
              </div>
              <div className="rounded border border-red-200 bg-red-50 p-4">
                <div className="text-xs font-bold text-red-700">CÔNG NỢ CÒN LẠI CỦA LỚP</div>
                <div className="mt-1 text-2xl font-bold text-red-600 tabular-nums">
                  {formatCurrency(totalDebt)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Báo nghỉ giữa khoá & Chốt số buổi tính tiền */}
        {stopEnrollTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
              <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
                <h3 className="text-lg font-bold">
                  Báo nghỉ giữa khoá & Tính tiền theo số buổi thực học
                </h3>
                <button onClick={() => setStopEnrollTarget(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleConfirmStopSettlement} className="space-y-4 p-6 text-sm">
                <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  Học viên xin nghỉ bất ưng khi chưa kết thúc khoá học: Trung tâm tính tiền từ lúc tham gia học (
                  <strong>{formatDateVN(stopEnrollTarget.feeStartDate)}</strong>) đến ngày nghỉ theo công thức:{' '}
                  <strong>Số buổi thực học × Đơn giá/buổi</strong> (Nhóm VH mặc định 50.000 đ/buổi hoặc đơn giá TATT).
                </div>

                <div className="grid grid-cols-2 gap-3 rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                  <div>
                    <div className="text-xs text-[#173B2C]/70">Mã & Tên học viên</div>
                    <div className="font-bold text-[#00543C]">
                      {stopEnrollTarget.studentCode} –{' '}
                      {db.students.find((s) => s.code === stopEnrollTarget.studentCode)?.fullName}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#173B2C]/70">Lớp học</div>
                    <div className="font-bold text-[#008653]">
                      {selectedClass.code} ({selectedClass.group})
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-bold">Ngày bắt đầu học</label>
                    <input
                      type="date"
                      disabled
                      value={stopEnrollTarget.feeStartDate}
                      className="mt-1 w-full rounded border border-[#D4E8DB] bg-gray-100 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-bold">Ngày xin nghỉ *</label>
                    <input
                      type="date"
                      required
                      value={stopDate}
                      onChange={(e) => handleStopDateChange(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold">Số buổi học thực tế *</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={stopSessionCount}
                      onChange={(e) => setStopSessionCount(Math.max(0, Number(e.target.value)))}
                      className="mt-1 w-full rounded border border-[#008653] px-3 py-2 font-bold text-[#00543C] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold">
                      Đơn giá 1 buổi ({selectedClass.group === 'VH' ? 'Giá nhóm VH' : 'Giá TATT'}) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      required
                      value={stopUnitPrice}
                      onChange={(e) => setStopUnitPrice(Math.max(0, Number(e.target.value)))}
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold">Lý do xin nghỉ</label>
                  <input
                    type="text"
                    value={stopReason}
                    onChange={(e) => setStopReason(e.target.value)}
                    placeholder="VD: Học viên xin nghỉ bất ưng vì lý do gia đình / trùng lịch..."
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>

                <div className="rounded-lg border-2 border-[#008653] bg-[#F2FAF5] p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-[#173B2C]">
                      Thành tiền chốt thu ({stopSessionCount} buổi × {formatCurrency(stopUnitPrice)}):
                    </span>
                    <span className="text-xl font-bold text-[#008653] tabular-nums">
                      {formatCurrency(stopSessionCount * stopUnitPrice)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                  <button
                    type="button"
                    onClick={() => setStopEnrollTarget(null)}
                    className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                  >
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                  >
                    Xác nhận chốt buổi & Cập nhật công nợ
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">QUẢN LÝ LỚP HỌC</h2>
          <p className="text-sm text-[#173B2C]/80">
            Quản lý lớp bồi dưỡng Văn hoá (VH) và Tiếng Anh TT (TATT), phân công giáo viên, lịch học định kỳ và kỳ thu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Nhập Excel (.xlsx)
          </button>
          <button
            onClick={() => exportAllClassesRosterWorkbook(db)}
            className="inline-flex items-center gap-1.5 rounded border border-[#00543C] bg-[#F2FAF5] px-3.5 py-2 text-sm font-bold text-[#00543C] hover:bg-[#D4E8DB]"
          >
            <Download className="h-4 w-4" />
            Xuất Excel DS Học sinh & GV các lớp
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold text-[#173B2C] hover:bg-[#F2FAF5]"
          >
            <Download className="h-4 w-4" />
            Xuất danh mục Lớp
          </button>
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            <Plus className="h-4 w-4" />
            Tạo lớp học mới
          </button>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#173B2C]/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã lớp, tên lớp, môn học, giáo viên phụ trách..."
            className="w-full rounded border border-[#D4E8DB] py-1.5 pl-9 pr-3 text-sm focus:border-[#008653] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as 'ALL' | TeachingGroup)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 text-sm font-bold"
          >
            <option value="ALL">Tất cả nhóm (VH & TATT)</option>
            <option value="VH">Nhóm Văn hoá (VH)</option>
            <option value="TATT">Nhóm Ngoại ngữ (TATT)</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ClassStatus)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 text-sm font-bold"
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="DANG_HOC">Đang học</option>
            <option value="SAP_MO">Sắp mở</option>
            <option value="TAM_DUNG">Tạm dừng</option>
            <option value="DA_KET_THUC">Đã kết thúc</option>
          </select>
        </div>
      </div>

      {/* Bảng lớp học */}
      <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#00543C] text-white">
              <th className="p-3">Mã lớp</th>
              <th className="p-3">Tên lớp / Môn</th>
              <th className="p-3">Nhóm / Khối</th>
              <th className="p-3">Giáo viên giảng dạy</th>
              <th className="p-3">Lịch định kỳ & Phòng</th>
              <th className="p-3 text-right">Đơn giá / Kỳ thu</th>
              <th className="p-3 text-center">Sĩ số</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D4E8DB]">
            {visibleClasses.map((c) => {
              const gv = db.teachers.find((t) => t.code === c.teacherCode);
              const count = db.enrollments.filter(
                (e) => e.classCode === c.code && e.status === 'DANG_HOC'
              ).length;
              const coList = c.coTeacherAssignments || [];

              return (
                <tr key={c.code} className="hover:bg-[#F2FAF5]/70">
                  <td className="p-3 font-bold text-[#00543C]">{c.code}</td>
                  <td className="p-3">
                    <div className="font-bold text-base">{c.name}</div>
                    <div className="text-xs text-[#173B2C]/75">
                      Môn {c.subject} · Khai giảng: {formatDateVN(c.startDate)} →{' '}
                      {c.endDate ? (
                        formatDateVN(c.endDate)
                      ) : (
                        <span className="font-bold text-[#008653]">Tự nhập khi kết thúc</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-[#008653]">{getGroupLabel(c.group)}</div>
                    <div className="text-xs">{c.grade}</div>
                  </td>
                  <td className="p-3">
                    {coList.length > 0 ? (
                      <div className="space-y-1">
                        {coList.map((co, idx) => {
                          const tObj = db.teachers.find((t) => t.code === co.teacherCode);
                          const rate = co.customShiftRate ?? tObj?.shiftRate;
                          return (
                            <div
                              key={`${co.teacherCode}-${idx}`}
                              className="rounded border border-[#D4E8DB] bg-[#F2FAF5]/70 px-2 py-1 text-xs"
                            >
                              <div className="font-bold text-[#00543C]">
                                {co.teacherCode} – {tObj?.fullName || co.teacherCode}
                              </div>
                              <div className="text-[#173B2C]/80">
                                <span className="font-bold text-[#008653]">{co.skillOrRole}</span>
                                {rate ? ` · ${formatCurrency(rate)}/ca` : ''}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : gv ? (
                      <div>
                        <div className="font-bold">{gv.fullName}</div>
                        <div className="text-xs text-[#173B2C]/75">
                          {gv.code} · {gv.workplace}
                        </div>
                      </div>
                    ) : (
                      <span className="font-bold text-red-600">Chưa có GV phụ trách</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    <div className="font-bold text-[#00543C]">Phòng mặc định: {c.roomCode}</div>
                    <div className="mt-1 space-y-0.5">
                      {c.recurringSchedule.map((r, i) => {
                        const sh = db.shifts.find((s) => s.id === r.shiftId);
                        const rTeacher = db.teachers.find(
                          (t) => t.code === (r.teacherCode || c.teacherCode)
                        );
                        return (
                          <div key={i} className="text-[#173B2C]/90">
                            • <strong>{getDayOfWeekLabel(r.dayOfWeek)}</strong> ({sh?.name || r.shiftId}
                            {r.roomCode && r.roomCode !== c.roomCode ? ` - P.${r.roomCode}` : ''})
                            {r.teacherCode ? (
                              <span className="ml-1 font-bold text-[#008653]">
                                → {rTeacher?.fullName || r.teacherCode}
                                {r.skillNote ? ` [${r.skillNote}]` : ''}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <div className="font-bold text-[#00543C]">
                      {formatCurrency(c.feePerSession)}/buổi
                    </div>
                    <div className="text-xs text-[#173B2C]/75">
                      {getBillingMethodLabel(c.billingMethod)}
                    </div>
                  </td>
                  <td className="p-3 text-center font-bold tabular-nums">
                    {count}/{c.maxStudents}
                  </td>
                  <td className="p-3 font-bold text-[#008653]">{getClassStatusLabel(c.status)}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => exportClassRosterWithTeacherToExcel(c, db)}
                        title={`Xuất Excel danh sách học sinh lớp ${c.name} kèm GV phụ trách`}
                        className="inline-flex items-center gap-1 rounded border border-[#00543C] bg-[#F2FAF5] px-2 py-1 text-xs font-bold text-[#00543C] hover:bg-[#D4E8DB]"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Excel Lớp
                      </button>
                      <button
                        onClick={() => setSelectedClassCodeForDetail(c.code)}
                        title="Mở chi tiết 6 tab của lớp"
                        className="inline-flex items-center gap-1 rounded border border-[#008653] px-2.5 py-1 text-xs font-bold text-[#008653] hover:bg-[#F2FAF5]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Chi tiết
                      </button>
                      <button
                        onClick={() => handleOpenEdit(c)}
                        title="Sửa thông tin lớp"
                        className="rounded border border-[#D4E8DB] p-1.5 text-[#173B2C] hover:bg-[#F2FAF5]"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm / Sửa Lớp học */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                {isEdit ? `Chỉnh sửa Lớp học: ${form.code}` : 'Tạo Lớp học mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-bold">Mã lớp duy nhất *</label>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Tên lớp *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Môn học *</label>
                  <input
                    type="text"
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Nhóm lớp *</label>
                  <select
                    value={form.group}
                    onChange={(e) => setForm({ ...form, group: e.target.value as TeachingGroup })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    <option value="VH">Văn hoá (VH)</option>
                    <option value="TATT">Ngoại ngữ (TATT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold">Khối lớp *</label>
                  <input
                    type="text"
                    required
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Giáo viên giảng dạy *</label>
                  <select
                    value={form.teacherCode}
                    onChange={(e) => setForm({ ...form, teacherCode: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    <option value="">-- Chưa phân công --</option>
                    {db.teachers
                      .filter((t) => t.status === 'ACTIVE')
                      .map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.code} – {t.fullName} ({t.specialty})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold">Ngày bắt đầu *</label>
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold">
                      Ngày kết thúc (Trung tâm tự nhập)
                    </label>
                    {form.endDate && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, endDate: '' })}
                        className="text-xs font-bold text-red-600 hover:underline"
                      >
                        Để trống
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    value={form.endDate || ''}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                  <span className="mt-0.5 block text-[11px] text-[#173B2C]/75">
                    Có thể để trống. Học viên xin nghỉ bất ưng giữa khoá sẽ tính tiền theo số buổi thực học × đơn giá.
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-bold">Học phí mỗi buổi (VNĐ) *</label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    required
                    value={form.feePerSession}
                    onChange={(e) => setForm({ ...form, feePerSession: Number(e.target.value) })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Cách xác định kỳ thu *</label>
                  <select
                    value={form.billingMethod}
                    onChange={(e) =>
                      setForm({ ...form, billingMethod: e.target.value as BillingMethod })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    <option value="CYCLE_8_WEEKS">Kỳ thu 8 tuần theo lịch</option>
                    <option value="PACKAGE_16_SESSIONS">Gói 16 buổi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold">Sĩ số tối đa *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={form.maxStudents}
                    onChange={(e) => setForm({ ...form, maxStudents: Number(e.target.value) })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Phòng học mặc định *</label>
                  <select
                    value={form.roomCode}
                    onChange={(e) => setForm({ ...form, roomCode: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    {db.rooms.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} – {r.name} ({r.capacity} chỗ)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold">Trạng thái lớp *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ClassStatus })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    <option value="SAP_MO">Sắp mở</option>
                    <option value="DANG_HOC">Đang học</option>
                    <option value="TAM_DUNG">Tạm dừng</option>
                    <option value="DA_KET_THUC">Đã kết thúc</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold">
                    Mức lương thiết lập riêng cho lớp này (Tuỳ chọn – để trống sẽ lấy theo GV)
                  </label>
                  <input
                    type="number"
                    placeholder={
                      form.group === 'VH'
                        ? 'Nhập % hưởng riêng cho lớp này (VD: 65)'
                        : 'Nhập đơn giá ca riêng (VD: 320000)'
                    }
                    value={form.teacherCustomRate || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        teacherCustomRate: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
              </div>

              {/* Phân công đội ngũ giáo viên cùng tham gia dạy lớp (Đặc biệt cho lớp TATT Kids 2 GV hoặc IELTS 4 GV) */}
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-[#00543C]">
                      Đội ngũ Giáo viên cùng tham gia dạy lớp (Hỗ trợ Kids 2 GV Việt/Nước ngoài & IELTS 4 GV 4 kỹ năng)
                    </div>
                    <div className="text-xs text-[#173B2C]/75">
                      Chọn các mã Giáo viên cùng tham gia giảng dạy lớp này và đơn giá mỗi ca riêng từng người (VD: GV Việt 300.000 đ/ca, GV Nước ngoài 800.000 đ/ca).
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {form.group === 'TATT' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const vnTeacher =
                              db.teachers.find(
                                (t) => t.group === 'TATT' && t.tattTeacherType !== 'GV_NUOC_NGOAI'
                              ) || db.teachers[0];
                            const fnTeacher =
                              db.teachers.find(
                                (t) => t.group === 'TATT' && t.tattTeacherType === 'GV_NUOC_NGOAI'
                              ) || db.teachers[0];
                            setForm({
                              ...form,
                              teacherCode: vnTeacher?.code || form.teacherCode,
                              coTeacherAssignments: [
                                {
                                  teacherCode: vnTeacher?.code || 'GVGV003',
                                  skillOrRole: 'GV Việt Nam – Ngữ pháp & Từ vựng (Buổi 1)',
                                  customShiftRate: vnTeacher?.shiftRate || 300000,
                                },
                                {
                                  teacherCode: fnTeacher?.code || 'GVNN004',
                                  skillOrRole: 'GV Nước ngoài – Giao tiếp & Phát âm (Buổi 2)',
                                  customShiftRate: fnTeacher?.shiftRate || 800000,
                                },
                              ],
                              recurringSchedule: [
                                {
                                  dayOfWeek: 6,
                                  shiftId: 'SANG_1',
                                  roomCode: form.roomCode,
                                  teacherCode: vnTeacher?.code || 'GVGV003',
                                  skillNote: 'Ngữ pháp & Từ vựng (GV Việt Nam)',
                                },
                                {
                                  dayOfWeek: 0,
                                  shiftId: 'SANG_1',
                                  roomCode: form.roomCode,
                                  teacherCode: fnTeacher?.code || 'GVNN004',
                                  skillNote: 'Giao tiếp & Phát âm (GV Nước ngoài)',
                                },
                              ],
                            });
                          }}
                          className="rounded border border-[#008653] bg-white px-2.5 py-1 text-xs font-bold text-[#008653] hover:bg-[#F2FAF5]"
                        >
                          Mẫu Kids 2 buổi (1 GV Việt + 1 GV Nước ngoài)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const tattTeachers = db.teachers.filter((t) => t.group === 'TATT');
                            const tListen = tattTeachers.find((t) => t.code === 'GVGV006') || tattTeachers[0];
                            const tSpeak = tattTeachers.find((t) => t.code === 'GVNN004') || tattTeachers[1] || tattTeachers[0];
                            const tRead = tattTeachers.find((t) => t.code === 'GVGV003') || tattTeachers[2] || tattTeachers[0];
                            const tWrite = tattTeachers.find((t) => t.code === 'GVGV005') || tattTeachers[3] || tattTeachers[0];
                            setForm({
                              ...form,
                              teacherCode: tListen?.code || form.teacherCode,
                              coTeacherAssignments: [
                                {
                                  teacherCode: tListen?.code || 'GVGV006',
                                  skillOrRole: 'Kỹ năng Listening (Nghe)',
                                  customShiftRate: tListen?.shiftRate || 400000,
                                },
                                {
                                  teacherCode: tSpeak?.code || 'GVNN004',
                                  skillOrRole: 'Kỹ năng Speaking (Nói – GV Nước ngoài)',
                                  customShiftRate: tSpeak?.shiftRate || 800000,
                                },
                                {
                                  teacherCode: tRead?.code || 'GVGV003',
                                  skillOrRole: 'Kỹ năng Reading (Đọc)',
                                  customShiftRate: tRead?.shiftRate || 350000,
                                },
                                {
                                  teacherCode: tWrite?.code || 'GVGV005',
                                  skillOrRole: 'Kỹ năng Writing (Viết)',
                                  customShiftRate: tWrite?.shiftRate || 400000,
                                },
                              ],
                              recurringSchedule: [
                                {
                                  dayOfWeek: 1,
                                  shiftId: 'TOI_1',
                                  roomCode: form.roomCode,
                                  teacherCode: tListen?.code || 'GVGV006',
                                  skillNote: 'IELTS Listening (Kỹ năng Nghe)',
                                },
                                {
                                  dayOfWeek: 3,
                                  shiftId: 'TOI_1',
                                  roomCode: form.roomCode,
                                  teacherCode: tSpeak?.code || 'GVNN004',
                                  skillNote: 'IELTS Speaking (Kỹ năng Nói – GV Nước ngoài)',
                                },
                                {
                                  dayOfWeek: 5,
                                  shiftId: 'TOI_1',
                                  roomCode: form.roomCode,
                                  teacherCode: tRead?.code || 'GVGV003',
                                  skillNote: 'IELTS Reading (Kỹ năng Đọc)',
                                },
                                {
                                  dayOfWeek: 0,
                                  shiftId: 'CHIEU_3',
                                  roomCode: form.roomCode,
                                  teacherCode: tWrite?.code || 'GVGV005',
                                  skillNote: 'IELTS Writing (Kỹ năng Viết)',
                                },
                              ],
                            });
                          }}
                          className="rounded border border-[#00543C] bg-white px-2.5 py-1 text-xs font-bold text-[#00543C] hover:bg-[#F2FAF5]"
                        >
                          Mẫu IELTS 4 buổi (4 GV dạy 4 kỹ năng)
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const defaultT =
                          db.teachers.find((t) => t.group === form.group && t.status === 'ACTIVE') ||
                          db.teachers[0];
                        setForm({
                          ...form,
                          coTeacherAssignments: [
                            ...(form.coTeacherAssignments || []),
                            {
                              teacherCode: defaultT?.code || '',
                              skillOrRole:
                                form.group === 'TATT' ? 'Kỹ năng / Buổi phụ trách' : 'Đồng giảng dạy',
                              customShiftRate:
                                form.group === 'TATT' ? defaultT?.shiftRate || 300000 : undefined,
                            },
                          ],
                        });
                      }}
                      className="rounded bg-[#008653] px-2.5 py-1 text-xs font-bold text-white"
                    >
                      + Thêm GV tham gia dạy
                    </button>
                  </div>
                </div>

                {(form.coTeacherAssignments || []).length === 0 ? (
                  <p className="text-xs text-[#173B2C]/70 italic">
                    Lớp 1 giáo viên duy nhất ({form.teacherCode || 'chưa chọn'}). Nhấn "+ Thêm GV tham gia dạy" hoặc chọn mẫu Kids/IELTS ở trên nếu lớp có nhiều giáo viên dạy các buổi khác nhau trong tuần.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(form.coTeacherAssignments || []).map((co, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 gap-2 rounded border border-[#D4E8DB] bg-white p-2.5 sm:grid-cols-12 items-center"
                      >
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-bold text-[#173B2C]/70">
                            Chọn Mã Giáo viên #{idx + 1}
                          </label>
                          <select
                            value={co.teacherCode}
                            onChange={(e) => {
                              const pickedCode = e.target.value;
                              const pickedT = db.teachers.find((t) => t.code === pickedCode);
                              const next = [...(form.coTeacherAssignments || [])];
                              next[idx] = {
                                ...co,
                                teacherCode: pickedCode,
                                customShiftRate:
                                  pickedT?.group === 'TATT'
                                    ? pickedT.shiftRate
                                    : co.customShiftRate,
                              };
                              setForm({
                                ...form,
                                teacherCode: idx === 0 ? pickedCode : form.teacherCode,
                                coTeacherAssignments: next,
                              });
                            }}
                            className="mt-0.5 w-full rounded border border-[#D4E8DB] px-2 py-1.5 text-xs font-bold"
                          >
                            {db.teachers
                              .filter((t) => t.status === 'ACTIVE')
                              .map((t) => (
                                <option key={t.code} value={t.code}>
                                  {t.code} – {t.fullName} (
                                  {t.group === 'TATT'
                                    ? `${t.tattTeacherType === 'GV_NUOC_NGOAI' ? 'GV Nước ngoài' : 'GV Việt'} - ${formatCurrency(t.shiftRate)}/ca`
                                    : `VH ${t.percentageRate}%`}
                                  )
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-bold text-[#173B2C]/70">
                            Vai trò / Kỹ năng phụ trách
                          </label>
                          <input
                            type="text"
                            value={co.skillOrRole}
                            onChange={(e) => {
                              const next = [...(form.coTeacherAssignments || [])];
                              next[idx] = { ...co, skillOrRole: e.target.value };
                              setForm({ ...form, coTeacherAssignments: next });
                            }}
                            placeholder="VD: GV Nước ngoài / Speaking"
                            className="mt-0.5 w-full rounded border border-[#D4E8DB] px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-[#173B2C]/70">
                            Đơn giá / ca (VNĐ)
                          </label>
                          <input
                            type="number"
                            step={10000}
                            value={co.customShiftRate || ''}
                            onChange={(e) => {
                              const next = [...(form.coTeacherAssignments || [])];
                              next[idx] = {
                                ...co,
                                customShiftRate: e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              };
                              setForm({ ...form, coTeacherAssignments: next });
                            }}
                            placeholder="Theo GV"
                            className="mt-0.5 w-full rounded border border-[#D4E8DB] px-2 py-1.5 text-xs font-bold tabular-nums"
                          />
                        </div>
                        <div className="sm:col-span-1 flex justify-end pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              const next = (form.coTeacherAssignments || []).filter(
                                (_, i) => i !== idx
                              );
                              setForm({ ...form, coTeacherAssignments: next });
                            }}
                            className="rounded p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lịch học định kỳ hàng tuần – Phân công rõ mỗi người dạy 1 buổi riêng biệt trong tuần */}
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-[#00543C]">
                      Lịch học định kỳ hàng tuần (Phân công Giáo viên dạy từng buổi riêng biệt)
                    </span>
                    <p className="text-xs text-[#173B2C]/75">
                      Mỗi buổi trong tuần có thể chọn Mã Giáo viên trực tiếp đứng lớp và kỹ năng giảng dạy của buổi đó.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        recurringSchedule: [
                          ...form.recurringSchedule,
                          {
                            dayOfWeek: 1,
                            shiftId: 'CHIEU_3',
                            roomCode: form.roomCode,
                            teacherCode: form.teacherCode,
                            skillNote: '',
                          },
                        ],
                      })
                    }
                    className="rounded bg-[#008653] px-2.5 py-1 text-xs font-bold text-white"
                  >
                    + Thêm buổi trong tuần
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {form.recurringSchedule.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2 rounded border border-[#D4E8DB] bg-white p-2"
                    >
                      <select
                        value={item.dayOfWeek}
                        onChange={(e) => {
                          const next = [...form.recurringSchedule];
                          next[idx] = { ...item, dayOfWeek: Number(e.target.value) };
                          setForm({ ...form, recurringSchedule: next });
                        }}
                        className="rounded border border-[#D4E8DB] bg-white px-2 py-1.5 text-xs font-bold"
                      >
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                          <option key={d} value={d}>
                            {getDayOfWeekLabel(d)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={item.shiftId}
                        onChange={(e) => {
                          const next = [...form.recurringSchedule];
                          next[idx] = { ...item, shiftId: e.target.value };
                          setForm({ ...form, recurringSchedule: next });
                        }}
                        className="rounded border border-[#D4E8DB] bg-white px-2 py-1.5 text-xs"
                      >
                        {db.shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.startTime}–{s.endTime})
                          </option>
                        ))}
                      </select>
                      <select
                        value={item.roomCode}
                        onChange={(e) => {
                          const next = [...form.recurringSchedule];
                          next[idx] = { ...item, roomCode: e.target.value };
                          setForm({ ...form, recurringSchedule: next });
                        }}
                        className="rounded border border-[#D4E8DB] bg-white px-2 py-1.5 text-xs"
                      >
                        {db.rooms.map((r) => (
                          <option key={r.code} value={r.code}>
                            Phòng {r.code}
                          </option>
                        ))}
                      </select>
                      <select
                        value={item.teacherCode || form.teacherCode}
                        onChange={(e) => {
                          const next = [...form.recurringSchedule];
                          next[idx] = { ...item, teacherCode: e.target.value };
                          setForm({ ...form, recurringSchedule: next });
                        }}
                        className="rounded border border-[#008653] bg-[#F2FAF5] px-2 py-1.5 text-xs font-bold text-[#00543C]"
                      >
                        <option value="">-- Theo GV chính của lớp --</option>
                        {db.teachers
                          .filter((t) => t.status === 'ACTIVE')
                          .map((t) => (
                            <option key={t.code} value={t.code}>
                              GV dạy: {t.code} – {t.fullName} (
                              {t.group === 'TATT'
                                ? `${formatCurrency(t.shiftRate)}/ca`
                                : `${t.percentageRate}%`}
                              )
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        value={item.skillNote || ''}
                        onChange={(e) => {
                          const next = [...form.recurringSchedule];
                          next[idx] = { ...item, skillNote: e.target.value };
                          setForm({ ...form, recurringSchedule: next });
                        }}
                        placeholder="Kỹ năng / Phân môn buổi này (VD: Speaking - GV Nước ngoài)"
                        className="min-w-[200px] flex-1 rounded border border-[#D4E8DB] px-2 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            recurringSchedule: form.recurringSchedule.filter((_, i) => i !== idx),
                          })
                        }
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  Lưu lớp học
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ExcelImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        entityType="CLASSES"
        title="Nhập danh sách Lớp học từ tệp Excel (.xlsx)"
      />
    </div>
  );
};
