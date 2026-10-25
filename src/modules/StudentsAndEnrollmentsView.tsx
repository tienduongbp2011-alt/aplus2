import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  LogOut,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Enrollment, Student } from '../types';
import {
  formatCurrency,
  formatDateVN,
  getAttendanceStatusLabel,
  getReceivableStatusLabel,
  getTodayISO,
} from '../utils/formatters';
import {
  exportAllClassesRosterWorkbook,
  exportClassRosterWithTeacherToExcel,
  exportRowsToExcel,
} from '../utils/excelService';
import { ExcelImportModal } from '../components/ExcelImportModal';

export const StudentsAndEnrollmentsView: React.FC<{ mode: 'STUDENTS' | 'ENROLLMENTS' }> = ({
  mode,
}) => {
  const {
    db,
    saveStudent,
    saveEnrollment,
    saveEnrollmentsBatch,
    settleEarlyWithdrawalEnrollment,
    selectedStudentCodeForDetail,
    setSelectedStudentCodeForDetail,
    setActiveModule,
    notify,
  } = useApp();

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isEditStudent, setIsEditStudent] = useState(false);

  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [isEditEnroll, setIsEditEnroll] = useState(false);
  const [selectedMultiClassCodes, setSelectedMultiClassCodes] = useState<string[]>([]);

  // Modal Báo nghỉ giữa khoá & Chốt buổi học thực tế
  const [stopEnrollTarget, setStopEnrollTarget] = useState<Enrollment | null>(null);
  const [stopDate, setStopDate] = useState(getTodayISO());
  const [stopSessionCount, setStopSessionCount] = useState(5);
  const [stopUnitPrice, setStopUnitPrice] = useState(50000);
  const [stopReason, setStopReason] = useState('Học viên xin nghỉ giữa khoá');

  const [isImportOpen, setIsImportOpen] = useState(false);

  const emptyStudent: Student = {
    code: '',
    fullName: '',
    dob: '2014-05-10',
    gender: 'Nam',
    school: 'THCS Bình An',
    schoolClass: '6A1',
    parentName: '',
    phone: '',
    admissionDate: getTodayISO(),
    status: 'DANG_HOC',
    creditBalance: 0,
    note: '',
  };

  const [studentForm, setStudentForm] = useState<Student>(emptyStudent);

  const emptyEnroll: Enrollment = {
    id: '',
    studentCode: db.students[0]?.code || '',
    classCode: db.classes[0]?.code || '',
    enrollmentDate: getTodayISO(),
    feeStartDate: getTodayISO(),
    endDate: '',
    appliedFeePerSession: db.settings.defaultFeePerSession || 50000,
    discountPercent: 0,
    discountAmount: 0,
    discountReason: '',
    status: 'DANG_HOC',
  };

  const [enrollForm, setEnrollForm] = useState<Enrollment>(emptyEnroll);

  const filteredStudents = useMemo(() => {
    return db.students.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (classFilter !== 'ALL') {
        const inClass = db.enrollments.some(
          (e) => e.studentCode === s.code && e.classCode === classFilter
        );
        if (!inClass) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          s.code.toLowerCase().includes(q) ||
          s.fullName.toLowerCase().includes(q) ||
          s.parentName.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.school.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [db.students, db.enrollments, statusFilter, classFilter, search]);

  const filteredEnrollments = useMemo(() => {
    return db.enrollments.filter((e) => {
      if (classFilter !== 'ALL' && e.classCode !== classFilter) return false;
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const st = db.students.find((s) => s.code === e.studentCode);
        const cls = db.classes.find((c) => c.code === e.classCode);
        const match =
          e.studentCode.toLowerCase().includes(q) ||
          e.classCode.toLowerCase().includes(q) ||
          (st && st.fullName.toLowerCase().includes(q)) ||
          (cls && cls.name.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [db.enrollments, db.students, db.classes, classFilter, statusFilter, search]);

  const detailStudent =
    db.students.find((s) => s.code === selectedStudentCodeForDetail) || null;

  const handleOpenAddStudent = () => {
    setStudentForm({
      ...emptyStudent,
      code: `HV${String(db.students.length + 1).padStart(3, '0')}`,
    });
    setIsEditStudent(false);
    setIsStudentModalOpen(true);
  };

  const handleOpenEditStudent = (s: Student) => {
    setStudentForm({ ...s });
    setIsEditStudent(true);
    setIsStudentModalOpen(true);
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveStudent(studentForm, isEditStudent)) {
      setIsStudentModalOpen(false);
    }
  };

  const handleOpenAddEnroll = (preselectStudentCode?: string) => {
    const firstValidClass =
      db.classes.find(
        (c) =>
          Boolean(c.code) &&
          (Boolean(c.teacherCode) || (c.scheduleItems && c.scheduleItems.some((i) => i.teacherCode)))
      ) || db.classes[0];
    const targetStudent = preselectStudentCode || db.students[0]?.code || '';
    setEnrollForm({
      ...emptyEnroll,
      id: `ENR-${Date.now()}`,
      studentCode: targetStudent,
      classCode: firstValidClass?.code || '',
      appliedFeePerSession: firstValidClass?.feePerSession || 50000,
    });
    setSelectedMultiClassCodes(firstValidClass?.code ? [firstValidClass.code] : []);
    setIsEditEnroll(false);
    setIsEnrollModalOpen(true);
  };

  const handleOpenEditEnroll = (enr: Enrollment) => {
    setEnrollForm({ ...enr });
    setSelectedMultiClassCodes([enr.classCode]);
    setIsEditEnroll(true);
    setIsEnrollModalOpen(true);
  };

  const toggleClassCheckbox = (code: string) => {
    setSelectedMultiClassCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleEnrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditEnroll) {
      if (saveEnrollment(enrollForm, true)) {
        setIsEnrollModalOpen(false);
      }
      return;
    }

    if (selectedMultiClassCodes.length === 0) {
      notify('Vui lòng tích chọn ít nhất 1 môn / lớp học để đăng ký cho học viên.', 'ERROR');
      return;
    }

    const batchList: Enrollment[] = selectedMultiClassCodes.map((clsCode, idx) => {
      const cls = db.classes.find((c) => c.code === clsCode);
      return {
        ...enrollForm,
        id: `ENR-${Date.now()}-${idx + 1}`,
        classCode: clsCode,
        appliedFeePerSession: cls?.feePerSession || enrollForm.appliedFeePerSession || 50000,
      };
    });

    const addedCount = saveEnrollmentsBatch(batchList);
    if (addedCount > 0) {
      setIsEnrollModalOpen(false);
      if (selectedMultiClassCodes.length === 1) {
        setClassFilter(selectedMultiClassCodes[0]);
      }
    }
  };

  const openStopSettlementModal = (enr: Enrollment) => {
    const cls = db.classes.find((c) => c.code === enr.classCode);
    const defaultStop = enr.endDate || getTodayISO();
    const countedSessions = db.sessions.filter(
      (s) =>
        s.classCode === enr.classCode &&
        s.date >= enr.feeStartDate &&
        s.date <= defaultStop &&
        s.status !== 'HUY' &&
        s.status !== 'NGHI'
    ).length;

    const unitPrice =
      enr.appliedFeePerSession ||
      (cls?.group === 'VH' ? 50000 : cls?.feePerSession || 50000);

    setStopEnrollTarget(enr);
    setStopDate(defaultStop);
    setStopSessionCount(enr.actualAttendedSessions ?? (countedSessions > 0 ? countedSessions : 5));
    setStopUnitPrice(unitPrice);
    setStopReason(enr.stopReason || 'Học viên xin nghỉ bất ưng khi chưa kết thúc khoá học');
  };

  const handleStopDateChange = (newStopDate: string) => {
    setStopDate(newStopDate);
    if (!stopEnrollTarget) return;
    const countedSessions = db.sessions.filter(
      (s) =>
        s.classCode === stopEnrollTarget.classCode &&
        s.date >= stopEnrollTarget.feeStartDate &&
        s.date <= newStopDate &&
        s.status !== 'HUY' &&
        s.status !== 'NGHI'
    ).length;
    if (countedSessions > 0) {
      setStopSessionCount(countedSessions);
    }
  };

  const handleConfirmStopSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopEnrollTarget) return;
    settleEarlyWithdrawalEnrollment({
      enrollmentId: stopEnrollTarget.id,
      stopDate,
      attendedSessions: stopSessionCount,
      unitPrice: stopUnitPrice,
      reason: stopReason,
    });
    setStopEnrollTarget(null);
  };

  const handleExportStudents = () => {
    const rows = filteredStudents.map((s) => {
      const enrolledClasses = db.enrollments
        .filter((e) => e.studentCode === s.code && e.status === 'DANG_HOC')
        .map((e) => e.classCode)
        .join(', ');
      const totalDebt = db.receivables
        .filter((r) => r.studentCode === s.code)
        .reduce((sum, r) => sum + r.remainingDebt, 0);
      return {
        'Mã học viên': s.code,
        'Họ và tên': s.fullName,
        'Ngày sinh': formatDateVN(s.dob),
        'Giới tính': s.gender,
        'Trường đang học': s.school,
        'Lớp tại trường': s.schoolClass,
        'Họ tên phụ huynh': s.parentName,
        'Điện thoại liên hệ': s.phone,
        'Ngày tiếp nhận': formatDateVN(s.admissionDate),
        'Các lớp đang học': enrolledClasses || 'Chưa đăng ký lớp',
        'Công nợ hiện tại (VNĐ)': totalDebt,
        'Tiền dư trả trước (VNĐ)': s.creditBalance || 0,
        'Trạng thái': s.status,
        'Ghi chú': s.note,
      };
    });
    exportRowsToExcel(rows, 'Danh_Sach_Hoc_Vien_APLUS2.xlsx', 'Hoc_Vien');
  };

  const handleExportEnrollments = () => {
    const rows = filteredEnrollments.map((e) => {
      const st = db.students.find((s) => s.code === e.studentCode);
      const cls = db.classes.find((c) => c.code === e.classCode);
      return {
        'Mã ĐK': e.id,
        'Mã học viên': e.studentCode,
        'Tên học viên': st?.fullName || '',
        'Mã lớp': e.classCode,
        'Tên lớp': cls?.name || '',
        'Môn học': cls?.subject || '',
        'Ngày đăng ký': formatDateVN(e.enrollmentDate),
        'Ngày bắt đầu tính phí': formatDateVN(e.feeStartDate),
        'Ngày kết thúc/thôi học': e.endDate ? formatDateVN(e.endDate) : '',
        'Số buổi thực học (nếu nghỉ sớm)': e.actualAttendedSessions ?? '',
        'Đơn giá áp dụng (VNĐ/buổi)': e.appliedFeePerSession,
        'Miễn giảm (%)': e.discountPercent,
        'Miễn giảm tiền (VNĐ)': e.discountAmount,
        'Trạng thái ĐK': e.status,
      };
    });
    exportRowsToExcel(rows, 'Danh_Sach_Dang_Ky_Hoc_APLUS2.xlsx', 'Dang_Ky_Hoc');
  };

  const handleExportSelectedClassRoster = () => {
    if (classFilter === 'ALL') {
      exportAllClassesRosterWorkbook(db);
      notify('Đã xuất tệp Excel Danh sách Học sinh tất cả các Lớp gắn với Môn học & Giáo viên.');
      return;
    }
    const targetCls = db.classes.find((c) => c.code === classFilter);
    if (targetCls) {
      exportClassRosterWithTeacherToExcel(targetCls, db);
      const gv = db.teachers.find((t) => t.code === targetCls.teacherCode);
      notify(
        `Đã kết xuất Excel Danh sách học sinh lớp ${targetCls.name} (${targetCls.subject}) – GV: ${gv?.fullName || 'Đội ngũ GV'}.`
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">
            {mode === 'STUDENTS' ? 'QUẢN LÝ HỒ SƠ HỌC VIÊN' : 'QUẢN LÝ ĐĂNG KÝ HỌC'}
          </h2>
          <p className="text-sm text-[#173B2C]/80">
            {mode === 'STUDENTS'
              ? 'Mỗi học viên chỉ có 1 mã học viên duy nhất và 1 tài khoản dù đăng ký học nhiều môn, nhiều lớp. Cho phép lưu hồ sơ trước khi xếp lớp.'
              : 'Học sinh được phép tích chọn cùng lúc nhiều môn/lớp học; tự động đưa về danh sách các lớp và kết xuất Excel danh sách học sinh gắn với môn học & giáo viên dạy.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-[#D4E8DB] bg-[#F2FAF5] p-0.5 text-sm">
            <button
              onClick={() => setActiveModule('students')}
              className={`rounded px-3 py-1.5 font-bold ${
                mode === 'STUDENTS' ? 'bg-[#00543C] text-white' : 'text-[#173B2C]'
              }`}
            >
              Hồ sơ học viên ({db.students.length})
            </button>
            <button
              onClick={() => setActiveModule('enrollments')}
              className={`rounded px-3 py-1.5 font-bold ${
                mode === 'ENROLLMENTS' ? 'bg-[#00543C] text-white' : 'text-[#173B2C]'
              }`}
            >
              Đăng ký học ({db.enrollments.length})
            </button>
          </div>

          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Nhập Excel (.xlsx)
          </button>

          {mode === 'ENROLLMENTS' && (
            <button
              onClick={handleExportSelectedClassRoster}
              className="inline-flex items-center gap-1.5 rounded border border-[#00543C] bg-[#F2FAF5] px-3.5 py-2 text-sm font-bold text-[#00543C] hover:bg-[#D4E8DB]/60"
            >
              <Download className="h-4 w-4" />
              {classFilter === 'ALL'
                ? 'Xuất Excel DS Học sinh các Lớp & GV (.xlsx)'
                : `Xuất Excel Lớp ${classFilter} & GV dạy`}
            </button>
          )}

          <button
            onClick={mode === 'STUDENTS' ? handleExportStudents : handleExportEnrollments}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold text-[#173B2C] hover:bg-[#F2FAF5]"
          >
            <Download className="h-4 w-4" />
            Xuất Excel
          </button>

          {mode === 'STUDENTS' ? (
            <button
              onClick={handleOpenAddStudent}
              className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
            >
              <Plus className="h-4 w-4" />
              Thêm hồ sơ học viên
            </button>
          ) : (
            <button
              onClick={() => handleOpenAddEnroll()}
              className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
            >
              <CheckSquare className="h-4 w-4" />
              Đăng ký học (Tích chọn nhiều môn/lớp)
            </button>
          )}
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
            placeholder="Tìm theo mã học viên, họ tên, phụ huynh, SĐT, trường học..."
            className="w-full rounded border border-[#D4E8DB] py-1.5 pl-9 pr-3 text-sm focus:border-[#008653] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 text-sm font-bold"
          >
            <option value="ALL">Tất cả lớp học</option>
            {db.classes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} – {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 text-sm font-bold"
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="DANG_HOC">Đang học</option>
            {mode === 'STUDENTS' ? (
              <>
                <option value="TAM_NGHI">Tạm nghỉ</option>
                <option value="THOI_HOC">Thôi học</option>
              </>
            ) : (
              <>
                <option value="TAM_DUNG">Tạm dừng</option>
                <option value="DA_NGHI">Đã nghỉ</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Bảng dữ liệu theo mode */}
      {mode === 'STUDENTS' ? (
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Mã HV</th>
                <th className="p-3">Họ và tên</th>
                <th className="p-3">Ngày sinh / GT</th>
                <th className="p-3">Trường & Lớp</th>
                <th className="p-3">Phụ huynh & Điện thoại</th>
                <th className="p-3">Các lớp đang học</th>
                <th className="p-3 text-right">Công nợ / Tiền dư</th>
                <th className="p-3">Ngày tiếp nhận</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {filteredStudents.map((s) => {
                const stEnrolls = db.enrollments.filter(
                  (e) => e.studentCode === s.code && e.status === 'DANG_HOC'
                );
                const debt = db.receivables
                  .filter((r) => r.studentCode === s.code)
                  .reduce((sum, r) => sum + r.remainingDebt, 0);

                return (
                  <tr key={s.code} className="hover:bg-[#F2FAF5]/70">
                    <td className="p-3 font-bold text-[#00543C]">{s.code}</td>
                    <td className="p-3">
                      <div className="font-bold text-base">{s.fullName}</div>
                      {s.note && <div className="text-xs text-[#173B2C]/75">{s.note}</div>}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatDateVN(s.dob)} · {s.gender}
                    </td>
                    <td className="p-3">
                      <div>{s.school}</div>
                      <div className="text-xs text-[#173B2C]/75">Lớp {s.schoolClass}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold">{s.parentName}</div>
                      <div className="text-xs tabular-nums">{s.phone}</div>
                    </td>
                    <td className="p-3">
                      {stEnrolls.length === 0 ? (
                        <span className="text-xs italic text-amber-700">
                          Chưa đăng ký lớp (đã lưu hồ sơ)
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          {stEnrolls.map((e) => {
                            const cls = db.classes.find((c) => c.code === e.classCode);
                            return (
                              <div key={e.id} className="text-xs font-bold text-[#008653]">
                                • {e.classCode} ({cls?.subject})
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {debt > 0 ? (
                        <div className="font-bold text-red-600">Nợ: {formatCurrency(debt)}</div>
                      ) : (
                        <div className="font-bold text-[#008653]">0 đ</div>
                      )}
                      {s.creditBalance > 0 && (
                        <div className="text-xs font-bold text-[#00543C]">
                          Tiền dư: {formatCurrency(s.creditBalance)}
                        </div>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">{formatDateVN(s.admissionDate)}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setSelectedStudentCodeForDetail(s.code)}
                          title="Xem hồ sơ chi tiết toàn diện học viên"
                          className="inline-flex items-center gap-1 rounded border border-[#008653] px-2.5 py-1 text-xs font-bold text-[#008653] hover:bg-[#F2FAF5]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Hồ sơ
                        </button>
                        <button
                          onClick={() => handleOpenAddEnroll(s.code)}
                          title="Đăng ký thêm lớp học"
                          className="rounded border border-[#D4E8DB] p-1.5 text-[#008653] hover:bg-[#F2FAF5]"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditStudent(s)}
                          title="Sửa hồ sơ"
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
      ) : (
        <div className="space-y-4">
          {/* Thanh thông tin Lớp & Giáo viên phụ trách + Nút kết xuất Excel Danh sách lớp */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-[#008653] bg-[#F2FAF5] p-4 shadow-xs">
            <div>
              {classFilter === 'ALL' ? (
                <>
                  <div className="text-base font-bold text-[#00543C]">
                    Đang hiển thị tất cả đăng ký học ({filteredEnrollments.length} lượt đăng ký tại{' '}
                    {db.classes.length} lớp)
                  </div>
                  <div className="text-xs text-[#173B2C]/80">
                    Chọn một lớp cụ thể ở bộ lọc phía trên (VD: Toán 9A, Toán 6A, Tiếng Anh Kids...) để xem thông tin Lớp + Môn học + Giáo viên dạy và xuất file Excel danh sách lớp đó.
                  </div>
                </>
              ) : (
                (() => {
                  const selectedCls = db.classes.find((c) => c.code === classFilter);
                  const mainTeacher = db.teachers.find((t) => t.code === selectedCls?.teacherCode);
                  return (
                    <div>
                      <div className="text-lg font-bold text-[#00543C]">
                        LỚP: {selectedCls?.name} ({selectedCls?.code}) – MÔN:{' '}
                        <span className="text-[#008653]">{selectedCls?.subject}</span>
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-[#173B2C]">
                        Cô / Thầy giảng dạy:{' '}
                        <span className="text-[#008653]">
                          {mainTeacher
                            ? `${mainTeacher.fullName} (${mainTeacher.code} – ${mainTeacher.workplace})`
                            : 'Đội ngũ GV theo ca'}
                        </span>{' '}
                        · Đơn giá:{' '}
                        <span className="tabular-nums">
                          {formatCurrency(selectedCls?.feePerSession || 50000)}/buổi
                        </span>{' '}
                        · Sĩ số hiện tại: <strong>{filteredEnrollments.length} học sinh</strong>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {classFilter !== 'ALL' && (
                <button
                  onClick={handleExportSelectedClassRoster}
                  className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[#006B42]"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Kết xuất Excel DS Lớp {classFilter} & Giáo viên (.xlsx)
                </button>
              )}
              <button
                onClick={() => {
                  exportAllClassesRosterWorkbook(db);
                  notify(
                    'Đã kết xuất tệp Excel Danh sách học sinh của tất cả các lớp gắn với Môn học & Giáo viên.'
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded border border-[#00543C] bg-white px-3.5 py-2 text-sm font-bold text-[#00543C] hover:bg-[#D4E8DB]/40"
              >
                <Download className="h-4 w-4" />
                Kết xuất Excel tất cả các Lớp (Nhiều Sheet)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#00543C] text-white">
                  <th className="p-3">Mã HV</th>
                  <th className="p-3">Họ tên học viên</th>
                  <th className="p-3">Lớp đăng ký & Môn</th>
                  <th className="p-3">Giáo viên phụ trách</th>
                  <th className="p-3">Ngày đăng ký</th>
                  <th className="p-3">Tính phí từ / Ngày nghỉ</th>
                  <th className="p-3 text-right">Đơn giá áp dụng</th>
                  <th className="p-3 text-right">Miễn giảm</th>
                  <th className="p-3">Trạng thái ĐK</th>
                  <th className="p-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4E8DB]">
                {filteredEnrollments.map((enr) => {
                  const st = db.students.find((s) => s.code === enr.studentCode);
                  const cls = db.classes.find((c) => c.code === enr.classCode);
                  const gv = db.teachers.find((t) => t.code === cls?.teacherCode);
                  return (
                    <tr key={enr.id} className="hover:bg-[#F2FAF5]/70">
                      <td className="p-3 font-bold text-[#00543C]">{enr.studentCode}</td>
                      <td className="p-3">
                        <div className="font-bold">{st?.fullName}</div>
                        <div className="text-xs text-[#173B2C]/70">
                          PH: {st?.parentName} · {st?.phone}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-[#008653]">
                          {enr.classCode} – {cls?.name}
                        </div>
                        <div className="text-xs text-[#173B2C]/75">Môn {cls?.subject}</div>
                      </td>
                      <td className="p-3 font-bold text-[#173B2C]">{gv?.fullName}</td>
                      <td className="p-3 tabular-nums">{formatDateVN(enr.enrollmentDate)}</td>
                      <td className="p-3 tabular-nums">
                        <div className="font-bold">Từ: {formatDateVN(enr.feeStartDate)}</div>
                        {enr.endDate && (
                          <div className="text-xs font-bold text-red-600">
                            Nghỉ: {formatDateVN(enr.endDate)}
                            {enr.actualAttendedSessions !== undefined
                              ? ` (${enr.actualAttendedSessions} buổi)`
                              : ''}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold tabular-nums">
                        {formatCurrency(enr.appliedFeePerSession)}/buổi
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {enr.discountPercent > 0 ? `${enr.discountPercent}% ` : ''}
                        {enr.discountAmount > 0 ? formatCurrency(enr.discountAmount) : '0 đ'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                            enr.status === 'DANG_HOC'
                              ? 'bg-[#F2FAF5] text-[#008653]'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {enr.status === 'DANG_HOC'
                            ? 'Đang học'
                            : enr.status === 'DA_NGHI'
                              ? 'Đã nghỉ giữa khoá'
                              : 'Tạm dừng'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => openStopSettlementModal(enr)}
                            title="Học viên xin nghỉ bất ưng giữa khoá: Chốt số buổi học × Đơn giá"
                            className="inline-flex items-center gap-1 rounded border border-amber-600 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            Báo nghỉ / Tính tiền
                          </button>
                          <button
                            onClick={() => handleOpenEditEnroll(enr)}
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
        </div>
      )}

      {/* Modal Thêm / Sửa Hồ sơ học viên */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                {isEditStudent
                  ? `Cập nhật Hồ sơ Học viên: ${studentForm.code}`
                  : 'Tiếp nhận Hồ sơ Học viên mới'}
              </h3>
              <button onClick={() => setIsStudentModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleStudentSubmit} className="space-y-4 p-6">
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-xs text-[#173B2C]">
                Quy tắc nghiệp vụ: Cho phép lưu hồ sơ học viên trước khi chọn lớp. Một học viên học nhiều môn và nhiều lớp chỉ sử dụng <strong>một mã học viên duy nhất</strong> trong toàn trung tâm.
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold">Mã học viên duy nhất *</label>
                  <input
                    type="text"
                    required
                    disabled={isEditStudent}
                    value={studentForm.code}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, code: e.target.value.toUpperCase() })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Họ và tên học viên *</label>
                  <input
                    type="text"
                    required
                    value={studentForm.fullName}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, fullName: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Ngày sinh *</label>
                  <input
                    type="date"
                    required
                    value={studentForm.dob}
                    onChange={(e) => setStudentForm({ ...studentForm, dob: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Giới tính</label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) =>
                      setStudentForm({
                        ...studentForm,
                        gender: e.target.value as Student['gender'],
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold">Trường đang học *</label>
                  <input
                    type="text"
                    required
                    value={studentForm.school}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, school: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Lớp đang học tại trường *</label>
                  <input
                    type="text"
                    required
                    value={studentForm.schoolClass}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, schoolClass: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Họ tên phụ huynh *</label>
                  <input
                    type="text"
                    required
                    value={studentForm.parentName}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, parentName: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Điện thoại liên hệ *</label>
                  <input
                    type="text"
                    required
                    value={studentForm.phone}
                    onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Ngày tiếp nhận tại trung tâm *</label>
                  <input
                    type="date"
                    required
                    value={studentForm.admissionDate}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, admissionDate: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Trạng thái học viên</label>
                  <select
                    value={studentForm.status}
                    onChange={(e) =>
                      setStudentForm({
                        ...studentForm,
                        status: e.target.value as Student['status'],
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    <option value="DANG_HOC">Đang học</option>
                    <option value="TAM_NGHI">Tạm nghỉ</option>
                    <option value="THOI_HOC">Thôi học</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold">Ghi chú</label>
                <textarea
                  rows={2}
                  value={studentForm.note}
                  onChange={(e) => setStudentForm({ ...studentForm, note: e.target.value })}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsStudentModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  Lưu hồ sơ học viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Đăng ký học (Cho phép tích chọn cùng lúc nhiều môn/lớp) */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                {isEditEnroll
                  ? 'Cập nhật Đăng ký học'
                  : 'Đăng ký Học viên vào Lớp (Tích chọn 1 hoặc nhiều môn/lớp cùng lúc)'}
              </h3>
              <button onClick={() => setIsEnrollModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEnrollSubmit} className="space-y-4 p-6">
              <div>
                <label className="block text-sm font-bold">Chọn Học viên *</label>
                <select
                  required
                  disabled={isEditEnroll}
                  value={enrollForm.studentCode}
                  onChange={(e) =>
                    setEnrollForm({ ...enrollForm, studentCode: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                >
                  {db.students.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} – {s.fullName} (Trường {s.school} – Lớp {s.schoolClass})
                    </option>
                  ))}
                </select>
              </div>

              {isEditEnroll ? (
                <div>
                  <label className="block text-sm font-bold">Lớp học đang đăng ký *</label>
                  <select
                    required
                    disabled
                    value={enrollForm.classCode}
                    className="mt-1 w-full rounded border border-[#D4E8DB] bg-gray-100 px-3 py-2 font-bold"
                  >
                    {db.classes.map((c) => {
                      const gv = db.teachers.find((t) => t.code === c.teacherCode);
                      return (
                        <option key={c.code} value={c.code}>
                          {c.code} – {c.name} ({c.subject}) – GV: {gv ? gv.fullName : 'Theo ca'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-bold text-[#00543C]">
                      Tích chọn các Môn học / Lớp học muốn đăng ký cùng lúc (Đã chọn:{' '}
                      <span className="text-[#008653]">{selectedMultiClassCodes.length} lớp</span>) *
                    </label>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMultiClassCodes(db.classes.map((c) => c.code))
                        }
                        className="font-bold text-[#008653] underline"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMultiClassCodes([])}
                        className="font-bold text-red-600 underline"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded border border-[#D4E8DB] bg-[#F2FAF5]/60 p-2 space-y-1.5">
                    {db.classes.map((c) => {
                      const gv = db.teachers.find((t) => t.code === c.teacherCode);
                      const alreadyEnrolled = db.enrollments.some(
                        (e) =>
                          e.studentCode === enrollForm.studentCode &&
                          e.classCode === c.code &&
                          e.status === 'DANG_HOC'
                      );
                      const checked = selectedMultiClassCodes.includes(c.code);
                      return (
                        <label
                          key={c.code}
                          className={`flex cursor-pointer items-center justify-between rounded border p-2.5 text-sm transition ${
                            checked
                              ? 'border-[#008653] bg-white shadow-2xs'
                              : 'border-[#D4E8DB] bg-white/70 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleClassCheckbox(c.code)}
                              className="h-4 w-4 accent-[#008653]"
                            />
                            <div>
                              <div className="font-bold text-[#00543C]">
                                {c.code} – {c.name}{' '}
                                <span className="text-[#008653]">({c.subject})</span>
                              </div>
                              <div className="text-xs text-[#173B2C]/75">
                                Cô/Thầy: <strong>{gv ? gv.fullName : 'Đội ngũ GV theo ca'}</strong>{' '}
                                · Nhóm {c.group}
                                {alreadyEnrolled && (
                                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                                    Đã có trong lớp
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-bold text-[#008653] tabular-nums">
                            {formatCurrency(c.feePerSession)}/buổi
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-[#173B2C]/75">
                    Sau khi xác nhận thành công, học sinh sẽ tự động được đưa vào danh sách tất cả các lớp đã tích chọn và tạo khoản phải thu tương ứng.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold">Ngày đăng ký *</label>
                  <input
                    type="date"
                    required
                    value={enrollForm.enrollmentDate}
                    onChange={(e) =>
                      setEnrollForm({ ...enrollForm, enrollmentDate: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">
                    Ngày bắt đầu tính phí (Vào giữa kỳ tính từ ngày này) *
                  </label>
                  <input
                    type="date"
                    required
                    value={enrollForm.feeStartDate}
                    onChange={(e) =>
                      setEnrollForm({ ...enrollForm, feeStartDate: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                {isEditEnroll && (
                  <div>
                    <label className="block text-sm font-bold">Đơn giá áp dụng (VNĐ/buổi) *</label>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      required
                      value={enrollForm.appliedFeePerSession}
                      onChange={(e) =>
                        setEnrollForm({
                          ...enrollForm,
                          appliedFeePerSession: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold">Ngày kết thúc / thôi học (nếu có)</label>
                  <input
                    type="date"
                    value={enrollForm.endDate || ''}
                    onChange={(e) =>
                      setEnrollForm({ ...enrollForm, endDate: e.target.value || undefined })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Miễn giảm (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={enrollForm.discountPercent}
                    onChange={(e) =>
                      setEnrollForm({
                        ...enrollForm,
                        discountPercent: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Miễn giảm tiền cố định (VNĐ)</label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={enrollForm.discountAmount}
                    onChange={(e) =>
                      setEnrollForm({
                        ...enrollForm,
                        discountAmount: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold">Trạng thái đăng ký</label>
                <select
                  value={enrollForm.status}
                  onChange={(e) =>
                    setEnrollForm({
                      ...enrollForm,
                      status: e.target.value as Enrollment['status'],
                    })
                  }
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                >
                  <option value="DANG_HOC">Đang học</option>
                  <option value="TAM_DUNG">Tạm dừng</option>
                  <option value="DA_NGHI">Đã nghỉ</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsEnrollModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  {isEditEnroll
                    ? 'Lưu cập nhật'
                    : `Xác nhận đăng ký (${selectedMultiClassCodes.length} lớp)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <strong>{formatDateVN(stopEnrollTarget.feeStartDate)}</strong>) đến khi nghỉ ra{' '}
                <strong>Số buổi học × Đơn giá</strong> (50.000 đ/buổi cho nhóm VH hoặc đơn giá TATT).
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
                  <label className="block font-bold">Ngày nghỉ học *</label>
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
                  <label className="block font-bold">Đơn giá 1 buổi (VNĐ) *</label>
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
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>

              <div className="rounded-lg border-2 border-[#008653] bg-[#F2FAF5] p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[#173B2C]">
                    Tổng tiền chốt thu ({stopSessionCount} buổi × {formatCurrency(stopUnitPrice)}):
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

      {/* Modal Hồ sơ chi tiết toàn diện Học viên (hiển thị tất cả lớp, lịch học, chuyên cần, bài tập, kết quả và công nợ) */}
      {detailStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                HỒ SƠ TOÀN DIỆN HỌC VIÊN: {detailStudent.fullName} ({detailStudent.code})
              </h3>
              <button onClick={() => setSelectedStudentCodeForDetail(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 p-6 text-sm">
              {/* Thông tin hành chính */}
              <div className="grid grid-cols-2 gap-3 rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-[#173B2C]/70">Mã học viên duy nhất</div>
                  <div className="font-bold text-base text-[#00543C]">{detailStudent.code}</div>
                </div>
                <div>
                  <div className="text-xs text-[#173B2C]/70">Trường & Lớp</div>
                  <div className="font-bold">
                    {detailStudent.school} ({detailStudent.schoolClass})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#173B2C]/70">Phụ huynh & SĐT</div>
                  <div className="font-bold">
                    {detailStudent.parentName} – {detailStudent.phone}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#173B2C]/70">Tiền dư trả trước</div>
                  <div className="font-bold text-[#008653] tabular-nums">
                    {formatCurrency(detailStudent.creditBalance)}
                  </div>
                </div>
              </div>

              {/* 1. Tất cả các lớp đã đăng ký */}
              <div>
                <h4 className="mb-2 font-bold text-base text-[#00543C]">
                  1. Danh sách tất cả lớp học & Lịch học định kỳ
                </h4>
                <div className="overflow-x-auto rounded border border-[#D4E8DB]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2FAF5]">
                      <tr>
                        <th className="p-2.5">Mã lớp</th>
                        <th className="p-2.5">Tên lớp / Môn</th>
                        <th className="p-2.5">Giáo viên</th>
                        <th className="p-2.5">Tính phí từ ngày</th>
                        <th className="p-2.5 text-right">Đơn giá/buổi</th>
                        <th className="p-2.5">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4E8DB]">
                      {db.enrollments
                        .filter((e) => e.studentCode === detailStudent.code)
                        .map((e) => {
                          const cls = db.classes.find((c) => c.code === e.classCode);
                          const gv = db.teachers.find((t) => t.code === cls?.teacherCode);
                          return (
                            <tr key={e.id}>
                              <td className="p-2.5 font-bold">{e.classCode}</td>
                              <td className="p-2.5 font-bold">
                                {cls?.name} ({cls?.subject})
                              </td>
                              <td className="p-2.5">{gv?.fullName}</td>
                              <td className="p-2.5 tabular-nums">{formatDateVN(e.feeStartDate)}</td>
                              <td className="p-2.5 text-right tabular-nums">
                                {formatCurrency(e.appliedFeePerSession)}
                              </td>
                              <td className="p-2.5 font-bold text-[#008653]">{e.status}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Chuyên cần & Điểm danh */}
              <div>
                <h4 className="mb-2 font-bold text-base text-[#00543C]">
                  2. Lịch sử Điểm danh chuyên cần
                </h4>
                <div className="overflow-x-auto rounded border border-[#D4E8DB]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2FAF5]">
                      <tr>
                        <th className="p-2.5">Ngày học</th>
                        <th className="p-2.5">Lớp</th>
                        <th className="p-2.5">Trạng thái</th>
                        <th className="p-2.5">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4E8DB]">
                      {db.attendance
                        .filter((a) => a.studentCode === detailStudent.code)
                        .map((a) => (
                          <tr key={a.id}>
                            <td className="p-2.5 tabular-nums">{formatDateVN(a.date)}</td>
                            <td className="p-2.5 font-bold">{a.classCode}</td>
                            <td className="p-2.5 font-bold text-[#008653]">
                              {getAttendanceStatusLabel(a.status)}
                            </td>
                            <td className="p-2.5">{a.note}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Bài tập & Kết quả kiểm tra */}
              <div>
                <h4 className="mb-2 font-bold text-base text-[#00543C]">
                  3. Bài tập & Kết quả kiểm tra
                </h4>
                <div className="overflow-x-auto rounded border border-[#D4E8DB]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2FAF5]">
                      <tr>
                        <th className="p-2.5">Lớp</th>
                        <th className="p-2.5">Bài tập / Đề kiểm tra</th>
                        <th className="p-2.5">Hạn nộp</th>
                        <th className="p-2.5">Kết quả / Điểm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4E8DB]">
                      {db.assignments
                        .filter((asg) =>
                          db.enrollments.some(
                            (e) =>
                              e.studentCode === detailStudent.code &&
                              e.classCode === asg.classCode
                          )
                        )
                        .map((asg) => {
                          const sub = db.submissions.find(
                            (s) =>
                              s.assignmentId === asg.id &&
                              s.studentCode === detailStudent.code
                          );
                          return (
                            <tr key={asg.id}>
                              <td className="p-2.5 font-bold">{asg.classCode}</td>
                              <td className="p-2.5">{asg.title}</td>
                              <td className="p-2.5 tabular-nums">{formatDateVN(asg.dueDate)}</td>
                              <td className="p-2.5 font-bold">
                                {sub
                                  ? asg.scoresPublished
                                    ? `${sub.totalScore} điểm (${sub.teacherFeedback || 'Đã chấm'})`
                                    : 'Đã nộp (Chờ GV công bố điểm)'
                                  : 'Chưa nộp bài'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Học phí & Sổ công nợ */}
              <div>
                <h4 className="mb-2 font-bold text-base text-[#00543C]">
                  4. Học phí & Sổ công nợ chi tiết
                </h4>
                <div className="overflow-x-auto rounded border border-[#D4E8DB]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2FAF5]">
                      <tr>
                        <th className="p-2.5">Mã khoản thu</th>
                        <th className="p-2.5">Lớp / Kỳ thu</th>
                        <th className="p-2.5 text-right">Số buổi</th>
                        <th className="p-2.5 text-right">Phải thu</th>
                        <th className="p-2.5 text-right">Đã đóng</th>
                        <th className="p-2.5 text-right">Còn nợ</th>
                        <th className="p-2.5">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4E8DB]">
                      {db.receivables
                        .filter((r) => r.studentCode === detailStudent.code)
                        .map((r) => (
                          <tr key={r.id}>
                            <td className="p-2.5 font-bold">{r.code}</td>
                            <td className="p-2.5">
                              <strong>{r.classCode}</strong> – {r.cycleName}
                            </td>
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
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExcelImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        entityType={mode === 'STUDENTS' ? 'STUDENTS' : 'ENROLLMENTS'}
        title={
          mode === 'STUDENTS'
            ? 'Nhập danh sách Học viên từ tệp Excel (.xlsx)'
            : 'Nhập danh sách Đăng ký học từ tệp Excel (.xlsx)'
        }
      />
    </div>
  );
};
