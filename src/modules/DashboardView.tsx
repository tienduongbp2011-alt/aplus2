import React, { useMemo } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckSquare,
  ClipboardList,
  CreditCard,
  DollarSign,
  GraduationCap,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatCurrency,
  formatDateVN,
  getAttendanceStatusLabel,
  getGroupLabel,
  getPayrollStatusLabel,
  getReceivableStatusLabel,
  getSessionStatusLabel,
} from '../utils/formatters';

export const DashboardView: React.FC = () => {
  const {
    db,
    setActiveModule,
    setSelectedClassCodeForDetail,
    setSelectedStudentCodeForDetail,
  } = useApp();

  // Tính toán trực tiếp từ dữ liệu thực của ứng dụng
  const stats = useMemo(() => {
    const activeStudents = db.students.filter((s) => s.status === 'DANG_HOC');
    const openClasses = db.classes.filter((c) => c.status === 'DANG_HOC' || c.status === 'SAP_MO');

    // Tháng hiện tại (2026-10)
    const currentMonth = '2026-10';
    const monthlyCollected = db.receipts
      .filter((r) => r.paymentDate.startsWith(currentMonth))
      .reduce((sum, r) => sum + r.totalAmount, 0);

    const totalDebt = db.receivables.reduce((sum, r) => sum + r.remainingDebt, 0);

    const todayISO = '2026-10-25';
    const todaySessions = db.sessions
      .filter((s) => s.date === todayISO)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const dueReceivables = db.receivables.filter((r) => r.remainingDebt > 0);
    const pendingPayrolls = db.payrolls.filter(
      (p) => p.status === 'CHO_DUYET' || p.status === 'NHAP'
    );

    // Bài tập chưa nộp theo từng đăng ký đang học
    const unsubmittedItems: {
      assignmentTitle: string;
      classCode: string;
      studentCode: string;
      studentName: string;
      dueDate: string;
    }[] = [];

    for (const asg of db.assignments) {
      const targetEnrollments = db.enrollments.filter(
        (e) => e.classCode === asg.classCode && e.status === 'DANG_HOC'
      );
      for (const enr of targetEnrollments) {
        if (
          asg.assignedStudentCodes.length > 0 &&
          !asg.assignedStudentCodes.includes(enr.studentCode)
        ) {
          continue;
        }
        const hasSub = db.submissions.some(
          (sub) => sub.assignmentId === asg.id && sub.studentCode === enr.studentCode
        );
        if (!hasSub) {
          const st = db.students.find((s) => s.code === enr.studentCode);
          unsubmittedItems.push({
            assignmentTitle: asg.title,
            classCode: asg.classCode,
            studentCode: enr.studentCode,
            studentName: st?.fullName || enr.studentCode,
            dueDate: asg.dueDate,
          });
        }
      }
    }

    // Thống kê điểm danh
    const presentCount = db.attendance.filter((a) => a.status === 'CO_MAT').length;
    const lateCount = db.attendance.filter((a) => a.status === 'DI_MUON').length;
    const excusedCount = db.attendance.filter((a) => a.status === 'VANG_CO_PHEP').length;
    const unexcusedCount = db.attendance.filter((a) => a.status === 'VANG_KHONG_PHEP').length;

    // Biểu đồ thu chi theo các tháng gần đây
    const months = ['2026-08', '2026-09', '2026-10'];
    const monthlyChart = months.map((m) => {
      const thu = db.cashflows
        .filter((c) => c.type === 'THU' && c.date.startsWith(m))
        .reduce((s, c) => s + c.amount, 0);
      const chi = db.cashflows
        .filter((c) => c.type === 'CHI' && c.date.startsWith(m))
        .reduce((s, c) => s + c.amount, 0);
      return { month: m.split('-').reverse().join('/'), thu, chi };
    });

    return {
      activeStudents,
      openClasses,
      monthlyCollected,
      totalDebt,
      todaySessions,
      dueReceivables,
      pendingPayrolls,
      unsubmittedItems,
      presentCount,
      lateCount,
      excusedCount,
      unexcusedCount,
      monthlyChart,
    };
  }, [db]);

  const maxChartVal = Math.max(
    1000000,
    ...stats.monthlyChart.map((m) => Math.max(m.thu, m.chi))
  );

  return (
    <div className="space-y-6">
      {/* Banner thông tin dữ liệu minh hoạ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white px-5 py-3.5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">
            BẢNG ĐIỀU KHIỂN TỔNG QUAN – TRUNG TÂM APLUS 2
          </h2>
          <p className="text-sm text-[#173B2C]/80">
            Số liệu tổng hợp thời gian thực từ các phân hệ Giáo viên, Lớp học, Học viên, Điểm danh và Tài chính (Bộ dữ liệu minh hoạ chuẩn).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveModule('enrollments')}
            className="rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            + Đăng ký học viên mới
          </button>
          <button
            onClick={() => setActiveModule('tuition')}
            className="rounded border border-[#008653] bg-white px-4 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            Lập phiếu thu học phí
          </button>
        </div>
      </div>

      {/* 4 Thẻ thống kê chính – Nhấn vào để mở danh sách liên quan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          onClick={() => setActiveModule('students')}
          className="group flex items-center justify-between rounded-lg border border-[#D4E8DB] bg-white p-5 text-left shadow-xs transition hover:border-[#008653] hover:shadow-md"
        >
          <div>
            <div className="text-sm font-bold text-[#173B2C]/75">TỔNG HỌC VIÊN ĐANG HỌC</div>
            <div className="mt-1 text-3xl font-bold text-[#173B2C] tabular-nums">
              {stats.activeStudents.length} <span className="text-base font-normal">học viên</span>
            </div>
            <div className="mt-1.5 text-xs font-bold text-[#008653] group-hover:underline">
              Xem danh sách học viên →
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F2FAF5] text-[#008653]">
            <Users className="h-6 w-6" />
          </div>
        </button>

        <button
          onClick={() => setActiveModule('classes')}
          className="group flex items-center justify-between rounded-lg border border-[#D4E8DB] bg-white p-5 text-left shadow-xs transition hover:border-[#008653] hover:shadow-md"
        >
          <div>
            <div className="text-sm font-bold text-[#173B2C]/75">SỐ LỚP ĐANG MỞ</div>
            <div className="mt-1 text-3xl font-bold text-[#173B2C] tabular-nums">
              {stats.openClasses.length} <span className="text-base font-normal">lớp học</span>
            </div>
            <div className="mt-1.5 text-xs font-bold text-[#008653] group-hover:underline">
              Quản lý lớp học ({db.enrollments.filter((e) => e.status === 'DANG_HOC').length} lượt ĐK) →
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F2FAF5] text-[#008653]">
            <BookOpen className="h-6 w-6" />
          </div>
        </button>

        <button
          onClick={() => setActiveModule('cashflow')}
          className="group flex items-center justify-between rounded-lg border border-[#D4E8DB] bg-white p-5 text-left shadow-xs transition hover:border-[#008653] hover:shadow-md"
        >
          <div>
            <div className="text-sm font-bold text-[#173B2C]/75">THỰC THU TRONG THÁNG (10/2026)</div>
            <div className="mt-1 text-2xl font-bold text-[#008653] tabular-nums">
              {formatCurrency(stats.monthlyCollected)}
            </div>
            <div className="mt-1.5 text-xs font-bold text-[#008653] group-hover:underline">
              Xem sổ thu & phiếu thu ({db.receipts.length} phiếu) →
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F2FAF5] text-[#008653]">
            <DollarSign className="h-6 w-6" />
          </div>
        </button>

        <button
          onClick={() => setActiveModule('tuition')}
          className="group flex items-center justify-between rounded-lg border border-[#D4E8DB] bg-white p-5 text-left shadow-xs transition hover:border-red-600 hover:shadow-md"
        >
          <div>
            <div className="text-sm font-bold text-[#173B2C]/75">TỔNG CÔNG NỢ HIỆN TẠI</div>
            <div className="mt-1 text-2xl font-bold text-red-600 tabular-nums">
              {formatCurrency(stats.totalDebt)}
            </div>
            <div className="mt-1.5 text-xs font-bold text-red-600 group-hover:underline">
              Xem {stats.dueReceivables.length} khoản còn nợ →
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <CreditCard className="h-6 w-6" />
          </div>
        </button>
      </div>

      {/* Hàng 2: Danh sách Giáo viên & Danh sách Lớp học */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Danh sách giáo viên có họ tên và trường đang dạy */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-[#008653]" />
              <h3 className="text-lg font-bold text-[#173B2C]">
                Danh sách Giáo viên & Trường công tác
              </h3>
            </div>
            <button
              onClick={() => setActiveModule('teachers')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Xem tất cả ({db.teachers.length})
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#F2FAF5] text-[#173B2C]">
                  <th className="p-2.5">Mã GV</th>
                  <th className="p-2.5">Họ và tên</th>
                  <th className="p-2.5">Trường đang dạy</th>
                  <th className="p-2.5">Chuyên môn / Nhóm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4E8DB]">
                {db.teachers.map((t) => (
                  <tr key={t.code} className="hover:bg-[#F2FAF5]/60">
                    <td className="p-2.5 font-bold text-[#00543C]">{t.code}</td>
                    <td className="p-2.5 font-bold">{t.fullName}</td>
                    <td className="p-2.5">{t.workplace}</td>
                    <td className="p-2.5">
                      {t.specialty} · <span className="text-[#008653]">{getGroupLabel(t.group)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Danh sách lớp và giáo viên phụ trách */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#008653]" />
              <h3 className="text-lg font-bold text-[#173B2C]">
                Danh sách Lớp học & Giáo viên phụ trách
              </h3>
            </div>
            <button
              onClick={() => setActiveModule('classes')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Quản lý lớp ({db.classes.length})
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#F2FAF5] text-[#173B2C]">
                  <th className="p-2.5">Mã lớp</th>
                  <th className="p-2.5">Tên lớp</th>
                  <th className="p-2.5">Giáo viên phụ trách</th>
                  <th className="p-2.5 text-right">Sĩ số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4E8DB]">
                {db.classes.map((c) => {
                  const teacher = db.teachers.find((t) => t.code === c.teacherCode);
                  const count = db.enrollments.filter(
                    (e) => e.classCode === c.code && e.status === 'DANG_HOC'
                  ).length;
                  const coList = c.coTeacherAssignments || [];
                  return (
                    <tr
                      key={c.code}
                      onClick={() => {
                        setSelectedClassCodeForDetail(c.code);
                        setActiveModule('classes');
                      }}
                      className="cursor-pointer hover:bg-[#F2FAF5]"
                    >
                      <td className="p-2.5 font-bold text-[#00543C]">{c.code}</td>
                      <td className="p-2.5 font-bold">{c.name}</td>
                      <td className="p-2.5">
                        {coList.length > 0 ? (
                          <div className="text-xs">
                            <span className="font-bold text-[#008653]">
                              {coList.length} GV ({coList.map((a) => a.teacherCode).join(', ')})
                            </span>
                          </div>
                        ) : teacher ? (
                          teacher.fullName
                        ) : (
                          'Chưa phân công'
                        )}
                      </td>
                      <td className="p-2.5 text-right font-bold tabular-nums">
                        {count}/{c.maxStudents} HV
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Hàng 3: Lịch học hôm nay, Tình hình điểm danh, Học viên mới */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lịch học hôm nay */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#008653]" />
              <h3 className="text-lg font-bold">Lịch học hôm nay (25/10/2026)</h3>
            </div>
            <button
              onClick={() => setActiveModule('schedule')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Lịch tuần
            </button>
          </div>
          {stats.todaySessions.length === 0 ? (
            <p className="py-4 text-sm text-[#173B2C]/70">Hôm nay không có ca học nào.</p>
          ) : (
            <div className="space-y-3">
              {stats.todaySessions.map((s) => {
                const cls = db.classes.find((c) => c.code === s.classCode);
                const gv = db.teachers.find((t) => t.code === s.actualTeacherCode);
                return (
                  <div
                    key={s.id}
                    className="rounded border border-[#D4E8DB] bg-[#F2FAF5]/60 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-[#00543C]">
                        {cls?.name || s.classCode} ({s.startTime}–{s.endTime})
                      </span>
                      <span className="text-xs text-[#008653]">
                        {getSessionStatusLabel(s.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#173B2C]/80">
                      Phòng: <strong>{s.roomCode}</strong> · GV: <strong>{gv?.fullName}</strong>
                    </div>
                    {s.topic && <div className="mt-1 text-xs italic">{s.topic}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tình hình điểm danh */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#008653]" />
              <h3 className="text-lg font-bold">Tình hình Điểm danh chuyên cần</h3>
            </div>
            <button
              onClick={() => setActiveModule('attendance')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Điểm danh
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
              <div className="text-xs text-[#173B2C]/70">Có mặt đúng giờ</div>
              <div className="mt-1 text-2xl font-bold text-[#008653] tabular-nums">
                {stats.presentCount} lượt
              </div>
            </div>
            <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
              <div className="text-xs text-[#173B2C]/70">Đi muộn</div>
              <div className="mt-1 text-2xl font-bold text-amber-600 tabular-nums">
                {stats.lateCount} lượt
              </div>
            </div>
            <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
              <div className="text-xs text-[#173B2C]/70">Vắng có phép</div>
              <div className="mt-1 text-2xl font-bold text-[#173B2C] tabular-nums">
                {stats.excusedCount} lượt
              </div>
            </div>
            <div className="rounded border border-red-200 bg-red-50/60 p-3">
              <div className="text-xs text-red-700">Vắng không phép</div>
              <div className="mt-1 text-2xl font-bold text-red-600 tabular-nums">
                {stats.unexcusedCount} lượt
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="font-bold text-[#173B2C]">Cập nhật gần nhất:</div>
            {db.attendance.slice(0, 3).map((a) => {
              const st = db.students.find((s) => s.code === a.studentCode);
              return (
                <div key={a.id} className="flex items-center justify-between border-t border-[#D4E8DB]/60 pt-1">
                  <span>
                    {st?.fullName} ({a.classCode} - {formatDateVN(a.date)})
                  </span>
                  <span className="font-bold">{getAttendanceStatusLabel(a.status)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Học viên mới */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#008653]" />
              <h3 className="text-lg font-bold">Học viên mới tiếp nhận</h3>
            </div>
            <button
              onClick={() => setActiveModule('students')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Hồ sơ HV
            </button>
          </div>
          <div className="space-y-2.5">
            {[...db.students]
              .sort((a, b) => b.admissionDate.localeCompare(a.admissionDate))
              .slice(0, 5)
              .map((s) => {
                const stClasses = db.enrollments
                  .filter((e) => e.studentCode === s.code && e.status === 'DANG_HOC')
                  .map((e) => e.classCode)
                  .join(', ');
                return (
                  <div
                    key={s.code}
                    onClick={() => {
                      setSelectedStudentCodeForDetail(s.code);
                      setActiveModule('students');
                    }}
                    className="flex cursor-pointer items-center justify-between rounded border border-[#D4E8DB] p-2.5 text-sm hover:bg-[#F2FAF5]"
                  >
                    <div>
                      <div className="font-bold text-[#173B2C]">
                        {s.fullName} <span className="text-xs text-[#008653]">({s.code})</span>
                      </div>
                      <div className="text-xs text-[#173B2C]/75">
                        {s.school} · Lớp ĐK: <strong>{stClasses || 'Chưa xếp lớp'}</strong>
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums">
                      <div>Tiếp nhận</div>
                      <div className="font-bold">{formatDateVN(s.admissionDate)}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Hàng 4: Học phí đến hạn, Lương chờ duyệt, Bài tập chưa nộp */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Học phí đến hạn / quá hạn */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-bold">Học phí đến hạn & Quá hạn</h3>
            </div>
            <button
              onClick={() => setActiveModule('reminders')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Nhắc phí ({stats.dueReceivables.length})
            </button>
          </div>
          <div className="space-y-2.5">
            {stats.dueReceivables.map((r) => {
              const st = db.students.find((s) => s.code === r.studentCode);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded border border-[#D4E8DB] p-2.5 text-sm"
                >
                  <div>
                    <div className="font-bold">
                      {st?.fullName} ({r.classCode})
                    </div>
                    <div className="text-xs text-[#173B2C]/75">
                      Hạn: {formatDateVN(r.dueDate)} · {getReceivableStatusLabel(r.status)}
                    </div>
                  </div>
                  <div className="text-right font-bold text-red-600 tabular-nums">
                    {formatCurrency(r.remainingDebt)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lương chờ duyệt */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <h3 className="text-lg font-bold">Bảng lương chờ duyệt</h3>
            </div>
            <button
              onClick={() => setActiveModule('payroll')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Duyệt lương ({stats.pendingPayrolls.length})
            </button>
          </div>
          <div className="space-y-2.5">
            {stats.pendingPayrolls.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-[#D4E8DB] p-2.5 text-sm"
              >
                <div>
                  <div className="font-bold">
                    {p.teacherName} ({p.group})
                  </div>
                  <div className="text-xs text-[#173B2C]/75">
                    {p.code} · <span className="text-amber-700 font-bold">{getPayrollStatusLabel(p.status)}</span>
                  </div>
                </div>
                <div className="text-right font-bold text-[#00543C] tabular-nums">
                  {formatCurrency(p.finalSalary)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bài tập chưa nộp */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[#D4E8DB] pb-2.5">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-[#008653]" />
              <h3 className="text-lg font-bold">Bài tập học viên chưa nộp</h3>
            </div>
            <button
              onClick={() => setActiveModule('assignments')}
              className="text-sm font-bold text-[#008653] hover:underline"
            >
              Xem bài tập ({stats.unsubmittedItems.length})
            </button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {stats.unsubmittedItems.slice(0, 6).map((item, idx) => (
              <div
                key={`${item.studentCode}-${item.classCode}-${idx}`}
                className="flex items-center justify-between rounded border border-[#D4E8DB] p-2 text-xs"
              >
                <div>
                  <div className="font-bold text-sm">
                    {item.studentName} ({item.classCode})
                  </div>
                  <div className="text-[#173B2C]/75">{item.assignmentTitle}</div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-[#173B2C]/70">Hạn nộp</div>
                  <div
                    className={`font-bold ${
                      item.dueDate < '2026-10-25' ? 'text-red-600' : 'text-[#008653]'
                    }`}
                  >
                    {formatDateVN(item.dueDate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hàng 5: Biểu đồ Thu và Chi theo tháng */}
      <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#D4E8DB] pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#008653]" />
            <h3 className="text-lg font-bold">Biểu đồ Thu – Chi theo tháng (VNĐ)</h3>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-[#008653]"></span>
              Tổng thực thu
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-amber-600"></span>
              Tổng thực chi
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {stats.monthlyChart.map((m) => {
            const thuPct = Math.round((m.thu / maxChartVal) * 100);
            const chiPct = Math.round((m.chi / maxChartVal) * 100);
            const diff = m.thu - m.chi;
            return (
              <div key={m.month} className="rounded border border-[#D4E8DB] bg-[#F2FAF5]/50 p-4">
                <div className="flex items-center justify-between font-bold">
                  <span>Tháng {m.month}</span>
                  <span className="text-xs text-[#173B2C]/75">
                    Chênh lệch thu–chi:{' '}
                    <strong className={diff >= 0 ? 'text-[#008653]' : 'text-red-600'}>
                      {formatCurrency(diff)}
                    </strong>
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <div className="flex justify-between text-xs">
                      <span>Thực thu</span>
                      <strong className="text-[#008653] tabular-nums">{formatCurrency(m.thu)}</strong>
                    </div>
                    <div className="mt-1 h-3 w-full overflow-hidden rounded bg-[#D4E8DB]">
                      <div
                        className="h-full bg-[#008653]"
                        style={{ width: `${Math.max(4, thuPct)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs">
                      <span>Thực chi</span>
                      <strong className="text-amber-700 tabular-nums">{formatCurrency(m.chi)}</strong>
                    </div>
                    <div className="mt-1 h-3 w-full overflow-hidden rounded bg-[#D4E8DB]">
                      <div
                        className="h-full bg-amber-600"
                        style={{ width: `${Math.max(4, chiPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
