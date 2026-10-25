import React, { useMemo, useState } from 'react';
import {
  Download,
  Edit2,
  Eye,
  EyeOff,
  History,
  ImagePlus,
  KeyRound,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BillingMethod, CenterSettings, UserAccount, UserRole } from '../types';
import {
  formatCurrency,
  formatDateTimeVN,
  formatDateVN,
  getGroupLabel,
  getRoleLabel,
  getTodayISO,
} from '../utils/formatters';
import { exportRowsToExcel } from '../utils/excelService';

export const ReportsAccountsSettingsView: React.FC<{
  mode: 'REPORTS' | 'ACCOUNTS' | 'SETTINGS';
}> = ({ mode }) => {
  const {
    db,
    currentAccount,
    switchAccount,
    saveSettings,
    saveUserAccount,
    syncWithSupabaseNow,
    supabaseProjectUrl,
    setActiveModule,
    notify,
  } = useApp();

  // State cho Báo cáo tháng
  const [reportMonth, setReportMonth] = useState('2026-10');

  // State cho Tài khoản & Phân quyền
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isEditAccount, setIsEditAccount] = useState(false);
  const [accForm, setAccForm] = useState<UserAccount>({
    id: '',
    username: '',
    password: '123456',
    fullName: '',
    role: 'ACADEMIC',
    status: 'ACTIVE',
    lastLogin: new Date().toISOString(),
  });

  // State cho Đổi mật khẩu
  const [passwordModalAccount, setPasswordModalAccount] = useState<UserAccount | null>(
    null
  );
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showPassFields, setShowPassFields] = useState(false);

  // State cho Cài đặt
  const [settingsForm, setSettingsForm] = useState<CenterSettings>(db.settings);

  // Tính toán Báo cáo tháng theo các buổi thực tế thuộc tháng đó
  const monthlyClassReport = useMemo(() => {
    return db.classes.map((cls) => {
      const gv = db.teachers.find((t) => t.code === cls.teacherCode);
      // Đếm đúng số buổi thuộc tháng đang chọn (không mặc định mọi tháng đều 8 buổi)
      const monthSessions = db.sessions.filter(
        (s) =>
          s.classCode === cls.code &&
          s.date.startsWith(reportMonth) &&
          s.status !== 'HUY' &&
          s.status !== 'NGHI' &&
          !s.makeupForSessionId
      );

      const activeEnrolls = db.enrollments.filter(
        (e) => e.classCode === cls.code && e.status === 'DANG_HOC'
      );

      // Học phí tương ứng các buổi thuộc tháng đó của tất cả học viên hợp lệ
      let monthlyEarnedTuition = 0;
      for (const ses of monthSessions) {
        for (const enr of activeEnrolls) {
          if (
            enr.feeStartDate <= ses.date &&
            (!enr.endDate || enr.endDate >= ses.date)
          ) {
            monthlyEarnedTuition += enr.appliedFeePerSession || cls.feePerSession;
          }
        }
      }

      const classRecs = db.receivables.filter((r) => r.classCode === cls.code);
      const totalCollectedForClass = classRecs.reduce((s, r) => s + r.paidAmount, 0);
      const totalDebtForClass = classRecs.reduce((s, r) => s + r.remainingDebt, 0);

      return {
        classCode: cls.code,
        className: cls.name,
        subject: cls.subject,
        group: cls.group,
        teacherName: gv?.fullName || '',
        studentCount: activeEnrolls.length,
        monthSessionCount: monthSessions.length,
        feePerSession: cls.feePerSession,
        perStudentMonthlyFee: monthSessions.length * cls.feePerSession,
        monthlyEarnedTuition,
        totalCollectedForClass,
        totalDebtForClass,
      };
    });
  }, [db, reportMonth]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSettingsForm((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoginBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSettingsForm((prev) => ({
          ...prev,
          loginBackgroundDataUrl: reader.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExportFullBackupJson = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sao_Luu_Toan_Bo_Du_Lieu_APLUS2_${getTodayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Đã tải xuống tệp sao lưu dữ liệu (phạm vi dữ liệu trên trình duyệt thiết bị này).');
  };

  // PHÂN HỆ 13: BÁO CÁO
  if (mode === 'REPORTS') {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div>
            <h2 className="text-2xl font-bold text-[#173B2C]">
              BÁO CÁO TỔNG HỢP HỌC VỤ & TÀI CHÍNH
            </h2>
            <p className="text-sm text-[#173B2C]/80">
              Báo cáo tháng tính theo đúng các buổi học thực tế thuộc tháng đó (VD: tháng có 8 buổi × 50.000đ = 400.000đ/HV; không mặc định mọi tháng đều 8 buổi).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="rounded border border-[#D4E8DB] px-3 py-2 text-sm font-bold"
            />
            <button
              onClick={() => {
                const rows = monthlyClassReport.map((r) => ({
                  'Mã lớp': r.classCode,
                  'Tên lớp': r.className,
                  'Môn học': r.subject,
                  'Giáo viên': r.teacherName,
                  'Sĩ số đang học': r.studentCount,
                  [`Số buổi thực tế trong tháng ${reportMonth}`]: r.monthSessionCount,
                  'Đơn giá/buổi (VNĐ)': r.feePerSession,
                  'Học phí tương ứng 1 HV trong tháng (VNĐ)': r.perStudentMonthlyFee,
                  'Tổng doanh thu học phí theo buổi trong tháng (VNĐ)': r.monthlyEarnedTuition,
                  'Tổng thực thu luỹ kế của lớp (VNĐ)': r.totalCollectedForClass,
                  'Công nợ còn lại (VNĐ)': r.totalDebtForClass,
                }));
                exportRowsToExcel(
                  rows,
                  `Bao_Cao_Thang_${reportMonth}_APLUS2.xlsx`,
                  'Bao_Cao_Thang'
                );
              }}
              className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
            >
              <Download className="h-4 w-4" />
              Xuất Excel Báo cáo tháng
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
            >
              <Printer className="h-4 w-4" />
              In báo cáo
            </button>
          </div>
        </div>

        {/* Bảng báo cáo tháng tính theo các buổi thuộc tháng đó */}
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <div className="border-b border-[#D4E8DB] bg-[#F2FAF5] px-5 py-3 font-bold text-[#00543C]">
            1. Báo cáo Học phí & Doanh thu theo số buổi thực tế thuộc tháng{' '}
            {reportMonth.split('-').reverse().join('/')}
          </div>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Mã lớp</th>
                <th className="p-3">Tên lớp / Giáo viên</th>
                <th className="p-3 text-center">Sĩ số</th>
                <th className="p-3 text-center">Số buổi thuộc tháng</th>
                <th className="p-3 text-right">Đơn giá/buổi</th>
                <th className="p-3 text-right">Học phí 1 HV trong tháng</th>
                <th className="p-3 text-right">Tổng học phí theo buổi tháng</th>
                <th className="p-3 text-right">Thực thu đã phân bổ</th>
                <th className="p-3 text-right">Công nợ còn lại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {monthlyClassReport.map((r) => (
                <tr key={r.classCode} className="hover:bg-[#F2FAF5]/70">
                  <td className="p-3 font-bold text-[#00543C]">{r.classCode}</td>
                  <td className="p-3">
                    <div className="font-bold">{r.className}</div>
                    <div className="text-xs text-[#173B2C]/75">GV: {r.teacherName}</div>
                  </td>
                  <td className="p-3 text-center font-bold tabular-nums">
                    {r.studentCount} HV
                  </td>
                  <td className="p-3 text-center font-bold text-[#008653] tabular-nums">
                    {r.monthSessionCount} buổi
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatCurrency(r.feePerSession)}
                  </td>
                  <td className="p-3 text-right font-bold tabular-nums">
                    {formatCurrency(r.perStudentMonthlyFee)}
                  </td>
                  <td className="p-3 text-right font-bold text-[#00543C] tabular-nums">
                    {formatCurrency(r.monthlyEarnedTuition)}
                  </td>
                  <td className="p-3 text-right font-bold text-[#008653] tabular-nums">
                    {formatCurrency(r.totalCollectedForClass)}
                  </td>
                  <td className="p-3 text-right font-bold text-red-600 tabular-nums">
                    {formatCurrency(r.totalDebtForClass)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // PHÂN HỆ 14: TÀI KHOẢN & PHÂN QUYỀN
  if (mode === 'ACCOUNTS') {
    const handleOpenAddAccount = () => {
      setAccForm({
        id: `ACC-${Date.now()}`,
        username: '',
        password: '123456',
        fullName: '',
        role: 'ACADEMIC',
        status: 'ACTIVE',
        lastLogin: new Date().toISOString(),
      });
      setIsEditAccount(false);
      setIsAccountModalOpen(true);
    };

    const handleOpenEditAccount = (acc: UserAccount) => {
      setAccForm({
        ...acc,
        password: acc.password || '123456',
      });
      setIsEditAccount(true);
      setIsAccountModalOpen(true);
    };

    const handleOpenChangePassword = (acc: UserAccount) => {
      setPasswordModalAccount(acc);
      setCurrentPasswordInput(acc.password || '123456');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setShowPassFields(false);
    };

    const handleChangePasswordSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!passwordModalAccount) return;

      const actualCurrentPass = passwordModalAccount.password || '123456';
      // Nếu không phải Giám đốc thì bắt buộc nhập đúng mật khẩu hiện tại
      if (
        currentAccount.role !== 'DIRECTOR' &&
        currentPasswordInput.trim() !== actualCurrentPass
      ) {
        notify('Mật khẩu hiện tại không chính xác.', 'ERROR');
        return;
      }

      if (newPasswordInput.trim().length < 4) {
        notify('Mật khẩu mới phải có tối thiểu 4 ký tự.', 'ERROR');
        return;
      }

      if (newPasswordInput.trim() !== confirmPasswordInput.trim()) {
        notify('Mật khẩu xác nhận không khớp với mật khẩu mới.', 'ERROR');
        return;
      }

      const updatedAcc: UserAccount = {
        ...passwordModalAccount,
        password: newPasswordInput.trim(),
      };
      if (saveUserAccount(updatedAcc, true)) {
        notify(
          `Đã đổi mật khẩu cho tài khoản "${passwordModalAccount.username}" thành công!`
        );
        setPasswordModalAccount(null);
      }
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div>
            <h2 className="text-2xl font-bold text-[#173B2C]">
              TÀI KHOẢN & PHÂN QUYỀN TRUY CẬP (RBAC)
            </h2>
            <p className="text-sm text-[#173B2C]/80">
              Quản lý 5 vai trò chuẩn: Giám đốc, Giáo vụ, Kế toán/Thu ngân, Giáo viên và Học viên/Phụ huynh. Cho phép sửa thông tin, phân quyền và đổi mật khẩu từng tài khoản.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenChangePassword(currentAccount)}
              className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-[#F2FAF5] px-3.5 py-2 text-sm font-bold text-[#00543C] hover:bg-[#D4E8DB]/60"
            >
              <KeyRound className="h-4 w-4 text-[#008653]" />
              Đổi mật khẩu của tôi ({currentAccount.username})
            </button>
            {currentAccount.role === 'DIRECTOR' && (
              <button
                onClick={handleOpenAddAccount}
                className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
              >
                <Plus className="h-4 w-4" />
                Cấp tài khoản nhân sự / học viên
              </button>
            )}
          </div>
        </div>

        {/* Ma trận phân quyền & Chuyển đổi nhanh vai trò để trải nghiệm */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center gap-2 font-bold text-base text-[#00543C]">
            <Shield className="h-5 w-5 text-[#008653]" />
            <span>
              Danh sách Tài khoản, Phân quyền & Đổi mật khẩu (Đang đăng nhập:{' '}
              <span className="text-[#008653]">
                {currentAccount.fullName} – {currentAccount.username}
              </span>
              )
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#00543C] text-white">
                  <th className="p-3">Tên đăng nhập</th>
                  <th className="p-3">Mật khẩu hiện tại</th>
                  <th className="p-3">Họ và tên</th>
                  <th className="p-3">Vai trò phân quyền</th>
                  <th className="p-3">Phạm vi dữ liệu được phép truy cập</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3 text-right">Thao tác (Sửa / Đổi MK / Chuyển)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4E8DB]">
                {db.accounts.map((acc) => {
                  const isCurrent = acc.id === currentAccount.id;
                  const canEditOrChangePass =
                    currentAccount.role === 'DIRECTOR' || isCurrent;
                  return (
                    <tr
                      key={acc.id}
                      className={isCurrent ? 'bg-[#F2FAF5]' : 'hover:bg-[#F2FAF5]/60'}
                    >
                      <td className="p-3 font-bold text-[#00543C]">{acc.username}</td>
                      <td className="p-3 font-mono font-bold text-[#008653]">
                        {acc.password || '123456'}
                      </td>
                      <td className="p-3 font-bold">{acc.fullName}</td>
                      <td className="p-3 font-bold text-[#008653]">
                        {getRoleLabel(acc.role)}
                      </td>
                      <td className="p-3 text-xs">
                        {acc.role === 'DIRECTOR' &&
                          'Toàn bộ 15 phân hệ, duyệt bảng lương, điều chỉnh tài chính và phân quyền.'}
                        {acc.role === 'ACADEMIC' &&
                          'Hồ sơ giáo viên, lớp học, học viên, đăng ký học, lịch học và điểm danh.'}
                        {acc.role === 'ACCOUNTANT' &&
                          'Học phí, lập phiếu thu, công nợ, nhắc phí, sổ thu–chi và lập bảng lương.'}
                        {acc.role === 'TEACHER' &&
                          `Chỉ lớp được phân công (${acc.linkedTeacherCode || 'Chưa gắn mã GV'}), điểm danh, giao/chấm bài và lương cá nhân.`}
                        {acc.role === 'STUDENT' &&
                          `Chỉ thông tin học tập, bài tập và học phí của mã học viên ${acc.linkedStudentCode || 'Chưa gắn mã HV'}.`}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                            acc.status === 'ACTIVE'
                              ? 'bg-[#F2FAF5] text-[#008653]'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {acc.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khoá'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {canEditOrChangePass && (
                            <>
                              <button
                                onClick={() => handleOpenEditAccount(acc)}
                                title="Sửa thông tin tài khoản & phân quyền"
                                className="inline-flex items-center gap-1 rounded border border-[#D4E8DB] bg-white px-2.5 py-1 text-xs font-bold text-[#173B2C] hover:bg-[#F2FAF5]"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-[#008653]" />
                                Sửa
                              </button>
                              <button
                                onClick={() => handleOpenChangePassword(acc)}
                                title="Đổi mật khẩu đăng nhập"
                                className="inline-flex items-center gap-1 rounded border border-amber-600 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
                              >
                                <KeyRound className="h-3.5 w-3.5 text-amber-700" />
                                Đổi mật khẩu
                              </button>
                            </>
                          )}
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 rounded bg-[#00543C] px-3 py-1 text-xs font-bold text-white">
                              <UserCheck className="h-3.5 w-3.5" />
                              Đang dùng
                            </span>
                          ) : (
                            <button
                              onClick={() => switchAccount(acc.id)}
                              className="rounded border border-[#008653] px-3 py-1 text-xs font-bold text-[#008653] hover:bg-[#008653] hover:text-white"
                            >
                              Chuyển vai trò
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nhật ký Kiểm toán (Audit Logs) */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center gap-2 font-bold text-base text-[#00543C]">
            <History className="h-5 w-5 text-[#008653]" />
            <span>Nhật ký thay đổi Tài chính, Học vụ & Phân quyền ({db.auditLogs.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#F2FAF5]">
                <tr>
                  <th className="p-2.5">Thời gian</th>
                  <th className="p-2.5">Người thực hiện</th>
                  <th className="p-2.5">Hành động</th>
                  <th className="p-2.5">Đối tượng</th>
                  <th className="p-2.5">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4E8DB]">
                {db.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="p-2.5 text-xs tabular-nums">
                      {formatDateTimeVN(log.timestamp)}
                    </td>
                    <td className="p-2.5 font-bold">{log.actorName}</td>
                    <td className="p-2.5 font-bold text-[#008653]">{log.action}</td>
                    <td className="p-2.5 font-bold">{log.target}</td>
                    <td className="p-2.5 text-xs">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Cấp mới hoặc Sửa Tài khoản & Phân quyền */}
        {isAccountModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
              <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
                <h3 className="text-xl font-bold">
                  {isEditAccount
                    ? `Sửa Tài khoản & Phân quyền: ${accForm.username}`
                    : 'Cấp Tài khoản & Phân quyền mới'}
                </h3>
                <button onClick={() => setIsAccountModalOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (saveUserAccount(accForm, isEditAccount)) {
                    setIsAccountModalOpen(false);
                  }
                }}
                className="space-y-4 p-6 text-sm"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-bold">Tên đăng nhập *</label>
                    <input
                      type="text"
                      required
                      disabled={currentAccount.role !== 'DIRECTOR' && isEditAccount}
                      value={accForm.username}
                      onChange={(e) => setAccForm({ ...accForm, username: e.target.value })}
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block font-bold">Mật khẩu đăng nhập *</label>
                    <input
                      type="text"
                      required
                      value={accForm.password || ''}
                      onChange={(e) => setAccForm({ ...accForm, password: e.target.value })}
                      placeholder="VD: 123456"
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-mono font-bold text-[#008653]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold">Họ và tên người dùng *</label>
                  <input
                    type="text"
                    required
                    value={accForm.fullName}
                    onChange={(e) => setAccForm({ ...accForm, fullName: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-bold">Vai trò phân quyền *</label>
                    <select
                      disabled={currentAccount.role !== 'DIRECTOR'}
                      value={accForm.role}
                      onChange={(e) =>
                        setAccForm({ ...accForm, role: e.target.value as UserRole })
                      }
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold disabled:bg-gray-100"
                    >
                      <option value="ACADEMIC">Giáo vụ</option>
                      <option value="ACCOUNTANT">Kế toán / Thu ngân</option>
                      <option value="TEACHER">Giáo viên</option>
                      <option value="STUDENT">Học viên / Phụ huynh</option>
                      <option value="DIRECTOR">Giám đốc</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold">Trạng thái tài khoản</label>
                    <select
                      disabled={currentAccount.role !== 'DIRECTOR'}
                      value={accForm.status}
                      onChange={(e) =>
                        setAccForm({
                          ...accForm,
                          status: e.target.value as UserAccount['status'],
                        })
                      }
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold disabled:bg-gray-100"
                    >
                      <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                      <option value="LOCKED">Khoá tạm thời (LOCKED)</option>
                    </select>
                  </div>
                </div>
                {accForm.role === 'TEACHER' && (
                  <div>
                    <label className="block font-bold">Liên kết Mã giáo viên *</label>
                    <select
                      value={accForm.linkedTeacherCode || ''}
                      onChange={(e) =>
                        setAccForm({ ...accForm, linkedTeacherCode: e.target.value })
                      }
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                    >
                      <option value="">-- Chọn giáo viên --</option>
                      {db.teachers.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.code} – {t.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {accForm.role === 'STUDENT' && (
                  <div>
                    <label className="block font-bold">Liên kết Mã học viên *</label>
                    <select
                      value={accForm.linkedStudentCode || ''}
                      onChange={(e) =>
                        setAccForm({ ...accForm, linkedStudentCode: e.target.value })
                      }
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                    >
                      <option value="">-- Chọn học viên --</option>
                      {db.students.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} – {s.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAccountModalOpen(false)}
                    className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                  >
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                  >
                    {isEditAccount ? 'Lưu cập nhật tài khoản' : 'Tạo tài khoản'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Đổi mật khẩu chuyên biệt */}
        {passwordModalAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
              <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  <h3 className="text-lg font-bold">
                    Đổi mật khẩu: {passwordModalAccount.username}
                  </h3>
                </div>
                <button onClick={() => setPasswordModalAccount(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleChangePasswordSubmit} className="space-y-4 p-6 text-sm">
                <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-xs">
                  <div>
                    Tài khoản: <strong>{passwordModalAccount.username}</strong> (
                    {passwordModalAccount.fullName})
                  </div>
                  <div className="mt-0.5 text-[#008653] font-bold">
                    Vai trò: {getRoleLabel(passwordModalAccount.role)}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block font-bold">Mật khẩu hiện tại *</label>
                    <button
                      type="button"
                      onClick={() => setShowPassFields(!showPassFields)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#008653]"
                    >
                      {showPassFields ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> Ẩn mật khẩu
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5" /> Hiện mật khẩu
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type={showPassFields ? 'text' : 'password'}
                    required
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold">Mật khẩu mới (tối thiểu 4 ký tự) *</label>
                  <input
                    type={showPassFields ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Nhập mật khẩu mới..."
                    className="mt-1 w-full rounded border border-[#008653] px-3 py-2 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold">Nhập lại mật khẩu mới *</label>
                  <input
                    type={showPassFields ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Xác nhận mật khẩu mới..."
                    className="mt-1 w-full rounded border border-[#008653] px-3 py-2 font-mono font-bold"
                  />
                </div>

                <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                  <button
                    type="button"
                    onClick={() => setPasswordModalAccount(null)}
                    className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                  >
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                  >
                    <Save className="h-4 w-4" />
                    Lưu mật khẩu mới
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PHÂN HỆ 15: CÀI ĐẶT HỆ THỐNG
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">
            CÀI ĐẶT TRUNG TÂM & SAO LƯU DỮ LIỆU
          </h2>
          <p className="text-sm text-[#173B2C]/80">
            Cấu hình thông tin trung tâm, Logo tròn, đơn giá học phí mặc định, kỳ thu, chính sách nghỉ/học bù, miễn giảm, tỷ lệ lương và thông tin chuyển khoản.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportFullBackupJson}
            className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            <Download className="h-4 w-4" />
            Xuất sao lưu trình duyệt (.json)
          </button>
          <button
            onClick={() => void syncWithSupabaseNow(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#00543C] bg-[#F2FAF5] px-3.5 py-2 text-sm font-bold text-[#00543C] hover:bg-[#D4E8DB]/60"
          >
            <RefreshCw className="h-4 w-4 text-[#008653]" />
            Đồng bộ & Lưu dữ liệu lên Supabase ngay
          </button>
          <button
            onClick={() => saveSettings(settingsForm)}
            className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-5 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            <Save className="h-4 w-4" />
            Lưu toàn bộ cài đặt
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cột 1: Logo tròn & Thông tin trung tâm */}
        <div className="space-y-4 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <h3 className="border-b border-[#D4E8DB] pb-2 text-lg font-bold text-[#00543C]">
            1. Logo tròn, Ảnh nền Đăng nhập & Định danh Trung tâm
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#008653] bg-[#00543C] text-white shadow-sm">
              {settingsForm.logoDataUrl ? (
                <img
                  src={settingsForm.logoDataUrl}
                  alt="Logo trung tâm"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-base font-bold tracking-wider">LOGO</span>
              )}
            </div>
            <div className="space-y-2 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-[#008653] px-3 py-1.5 font-bold text-white hover:bg-[#006B42]">
                <Upload className="h-3.5 w-3.5" />
                <span>Tải lên / Thay logo trung tâm</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              {settingsForm.logoDataUrl && (
                <button
                  type="button"
                  onClick={() => setSettingsForm({ ...settingsForm, logoDataUrl: '' })}
                  className="block text-red-600 underline"
                >
                  Xoá logo (Hiển thị vòng tròn chữ LOGO)
                </button>
              )}
            </div>
          </div>

          <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-xs space-y-2">
            <div className="font-bold text-[#00543C]">
              Hình nền cửa sổ Đăng nhập của Trung tâm:
            </div>
            {settingsForm.loginBackgroundDataUrl && (
              <div className="h-24 w-full overflow-hidden rounded border border-[#D4E8DB]">
                <img
                  src={settingsForm.loginBackgroundDataUrl}
                  alt="Hình nền đăng nhập"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#008653] bg-white px-3 py-1.5 font-bold text-[#008653] hover:bg-[#F2FAF5]">
                <ImagePlus className="h-3.5 w-3.5" />
                <span>Tải ảnh nền cửa sổ đăng nhập</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLoginBgUpload}
                  className="hidden"
                />
              </label>
              {settingsForm.loginBackgroundDataUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setSettingsForm({ ...settingsForm, loginBackgroundDataUrl: '' })
                  }
                  className="font-bold text-red-600 underline"
                >
                  Về nền mặc định
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block font-bold">Tên viết tắt trung tâm</label>
              <input
                type="text"
                value={settingsForm.centerShortName}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, centerShortName: e.target.value })
                }
                className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold">Tên đầy đủ trung tâm</label>
              <input
                type="text"
                value={settingsForm.centerFullName}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, centerFullName: e.target.value })
                }
                className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-bold">Địa chỉ</label>
              <input
                type="text"
                value={settingsForm.address}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, address: e.target.value })
                }
                className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-bold">Số điện thoại</label>
              <input
                type="text"
                value={settingsForm.phone}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, phone: e.target.value })
                }
                className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* Cột 2: Học phí, Kỳ thu, Tỷ lệ lương & Chuyển khoản */}
        <div className="space-y-4 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs text-sm">
          <h3 className="border-b border-[#D4E8DB] pb-2 text-lg font-bold text-[#00543C]">
            2. Định mức Học phí, Lương & Ngân hàng
          </h3>
          <div>
            <label className="block font-bold">Đơn giá học phí mặc định (VNĐ/buổi)</label>
            <input
              type="number"
              value={settingsForm.defaultFeePerSession}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  defaultFeePerSession: Number(e.target.value),
                })
              }
              className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
            />
          </div>
          <div>
            <label className="block font-bold">Kỳ thu mặc định</label>
            <select
              value={settingsForm.defaultBillingMethod}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  defaultBillingMethod: e.target.value as BillingMethod,
                })
              }
              className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
            >
              <option value="CYCLE_8_WEEKS">Kỳ thu 8 tuần theo lịch</option>
              <option value="PACKAGE_16_SESSIONS">Gói 16 buổi</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold">Tỷ lệ lương VH mặc định (%)</label>
              <input
                type="number"
                value={settingsForm.defaultVhSalaryPercent}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    defaultVhSalaryPercent: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block font-bold">Đơn giá ca TATT (VNĐ/ca)</label>
              <input
                type="number"
                value={settingsForm.defaultTattShiftRate}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    defaultTattShiftRate: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
              />
            </div>
          </div>

          <div className="border-t border-[#D4E8DB] pt-3 space-y-2">
            <div className="font-bold text-[#00543C]">Thông tin nhận chuyển khoản:</div>
            <input
              type="text"
              value={settingsForm.bankName}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, bankName: e.target.value })
              }
              placeholder="Tên ngân hàng"
              className="w-full rounded border border-[#D4E8DB] px-3 py-1.5"
            />
            <input
              type="text"
              value={settingsForm.bankAccountNumber}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  bankAccountNumber: e.target.value,
                })
              }
              placeholder="Số tài khoản"
              className="w-full rounded border border-[#D4E8DB] px-3 py-1.5 font-bold tabular-nums"
            />
            <input
              type="text"
              value={settingsForm.bankAccountHolder}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  bankAccountHolder: e.target.value,
                })
              }
              placeholder="Chủ tài khoản"
              className="w-full rounded border border-[#D4E8DB] px-3 py-1.5"
            />
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setActiveModule('schedule')}
              className="text-xs font-bold text-[#008653] underline"
            >
              → Mở chỉnh sửa chi tiết 6 Ca học & Phòng học
            </button>
          </div>
        </div>

        {/* Cột 3: Chính sách nghỉ, học bù, miễn giảm, mẫu nhắc phí & Hướng dẫn sao lưu/kết nối */}
        <div className="space-y-4 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs text-sm">
          <h3 className="border-b border-[#D4E8DB] pb-2 text-lg font-bold text-[#00543C]">
            3. Chính sách Học vụ, Mẫu nhắc phí & Sao lưu
          </h3>
          <div>
            <label className="block font-bold">Chính sách nghỉ và học bù</label>
            <textarea
              rows={3}
              value={settingsForm.absencePolicyNote}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, absencePolicyNote: e.target.value })
              }
              className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-bold">Chính sách miễn giảm học phí</label>
            <textarea
              rows={2}
              value={settingsForm.discountPolicyNote}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, discountPolicyNote: e.target.value })
              }
              className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-bold">Mẫu nội dung nhắc đóng học phí</label>
            <textarea
              rows={3}
              value={settingsForm.reminderTemplate}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, reminderTemplate: e.target.value })
              }
              className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 text-xs"
            />
          </div>
          <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-xs text-[#173B2C]">
            <div className="font-bold text-[#00543C]">Trạng thái kết nối Cơ sở dữ liệu Supabase:</div>
            <p className="mt-1">
              • Hệ thống đang kết nối và tự động lưu dữ liệu trực tiếp lên dự án Supabase:{' '}
              <strong>{supabaseProjectUrl}</strong>.
            </p>
            <p className="mt-1">
              • Mọi thao tác thêm/sửa Giáo viên, Lớp học, Học viên, Đăng ký học, Học phí, Lương giáo viên đều được đồng bộ tự động vào các bảng trên Supabase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
