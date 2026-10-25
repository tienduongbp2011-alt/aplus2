/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  Calendar,
  CheckSquare,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  FileBarChart,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { canRoleAccessModule } from './services/businessLogic';
import { SUPABASE_SETUP_SQL } from './services/supabaseClient';
import { formatCurrency, formatDateTimeVN, getRoleLabel } from './utils/formatters';
import { LoginWindow } from './components/LoginWindow';
import { DashboardView } from './modules/DashboardView';
import { TeachersView } from './modules/TeachersView';
import { ClassesView } from './modules/ClassesView';
import { StudentsAndEnrollmentsView } from './modules/StudentsAndEnrollmentsView';
import { ScheduleAndRoomsView } from './modules/ScheduleAndRoomsView';
import { AttendanceView } from './modules/AttendanceView';
import { AssignmentsView } from './modules/AssignmentsView';
import { TuitionAndRemindersView } from './modules/TuitionAndRemindersView';
import { PayrollAndFinanceView } from './modules/PayrollAndFinanceView';
import { ReportsAccountsSettingsView } from './modules/ReportsAccountsSettingsView';

interface NavMenuItem {
  id: string;
  number: number;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const MENU_ITEMS: NavMenuItem[] = [
  { id: 'dashboard', number: 1, label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'teachers', number: 2, label: 'Quản lý giáo viên', icon: GraduationCap },
  { id: 'classes', number: 3, label: 'Quản lý lớp học', icon: BookOpen },
  { id: 'students', number: 4, label: 'Quản lý học viên', icon: Users },
  { id: 'enrollments', number: 5, label: 'Đăng ký học', icon: UserPlus },
  { id: 'schedule', number: 6, label: 'Lịch học & phòng học', icon: Calendar },
  { id: 'attendance', number: 7, label: 'Điểm danh chuyên cần', icon: UserCheck },
  { id: 'assignments', number: 8, label: 'Bài tập & kiểm tra', icon: CheckSquare },
  { id: 'tuition', number: 9, label: 'Học phí & công nợ', icon: CreditCard },
  { id: 'reminders', number: 10, label: 'Nhắc đóng học phí', icon: Bell },
  { id: 'payroll', number: 11, label: 'Lương giáo viên', icon: Wallet },
  { id: 'cashflow', number: 12, label: 'Doanh thu & chi phí', icon: DollarSign },
  { id: 'reports', number: 13, label: 'Báo cáo', icon: FileBarChart },
  { id: 'accounts', number: 14, label: 'Tài khoản & phân quyền', icon: Shield },
  { id: 'settings', number: 15, label: 'Cài đặt', icon: Settings },
];

const MainWorkspace: React.FC = () => {
  const {
    db,
    isAuthenticated,
    logout,
    currentAccount,
    switchAccount,
    activeModule,
    setActiveModule,
    saveSettings,
    toasts,
    notify,
    dismissToast,
    setSelectedClassCodeForDetail,
    setSelectedStudentCodeForDetail,
    supabaseStatus,
    supabaseLastSync,
    supabaseError,
    supabaseProjectUrl,
    syncWithSupabaseNow,
  } = useApp();

  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  const handleQuickLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        saveSettings({
          ...db.settings,
          logoDataUrl: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Tìm kiếm nhanh toàn cục
  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    const items: { type: string; label: string; sub: string; onClick: () => void }[] = [];

    db.students.forEach((s) => {
      if (s.code.toLowerCase().includes(q) || s.fullName.toLowerCase().includes(q)) {
        items.push({
          type: 'Học viên',
          label: `${s.code} – ${s.fullName}`,
          sub: `Trường ${s.school} · SĐT: ${s.phone}`,
          onClick: () => {
            setSelectedStudentCodeForDetail(s.code);
            setActiveModule('students');
            setGlobalSearch('');
          },
        });
      }
    });

    db.classes.forEach((c) => {
      if (c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) {
        items.push({
          type: 'Lớp học',
          label: `${c.code} – ${c.name}`,
          sub: `Môn ${c.subject} · Phòng ${c.roomCode}`,
          onClick: () => {
            setSelectedClassCodeForDetail(c.code);
            setActiveModule('classes');
            setGlobalSearch('');
          },
        });
      }
    });

    db.teachers.forEach((t) => {
      if (t.code.toLowerCase().includes(q) || t.fullName.toLowerCase().includes(q)) {
        items.push({
          type: 'Giáo viên',
          label: `${t.code} – ${t.fullName}`,
          sub: `${t.workplace} · ${t.specialty}`,
          onClick: () => {
            setActiveModule('teachers');
            setGlobalSearch('');
          },
        });
      }
    });

    return items.slice(0, 6);
  }, [
    globalSearch,
    db.students,
    db.classes,
    db.teachers,
    setActiveModule,
    setSelectedClassCodeForDetail,
    setSelectedStudentCodeForDetail,
  ]);

  const overdueCount = db.receivables.filter((r) => r.remainingDebt > 0).length;
  const pendingPayrollCount = db.payrolls.filter((p) => p.status === 'CHO_DUYET').length;

  const hasAccess = canRoleAccessModule(currentAccount.role, activeModule);

  if (!isAuthenticated) {
    return (
      <>
        <LoginWindow />
        {toasts.length > 0 && (
          <div className="no-print fixed bottom-5 right-5 z-50 space-y-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-bold text-white shadow-lg ${
                  t.type === 'ERROR'
                    ? 'border-red-700 bg-red-600'
                    : t.type === 'WARNING'
                      ? 'border-amber-700 bg-amber-600'
                      : 'border-[#00543C] bg-[#008653]'
                }`}
              >
                <span>{t.text}</span>
                <button onClick={() => dismissToast(t.id)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F2FAF5] text-[#173B2C]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpenMobile && (
        <div
          onClick={() => setSidebarOpenMobile(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* SIDEBAR BÊN TRÁI (#00543C) */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#00543C] text-white transition-transform lg:static lg:translate-x-0 ${
          sidebarOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Đầu Sidebar: Logo tròn (tải lên, xem trước, thay logo; khi chưa có hiển thị chữ LOGO) */}
        <div className="flex flex-col items-center border-b border-white/15 px-4 py-5 text-center">
          <label
            title="Nhấn để tải lên, xem trước hoặc thay đổi Logo trung tâm"
            className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-[#D4E8DB] bg-[#008653] text-white shadow-md transition hover:scale-105"
          >
            {db.settings.logoDataUrl ? (
              <img
                src={db.settings.logoDataUrl}
                alt="Logo APLUS 2"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold tracking-widest">LOGO</span>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
              <Upload className="h-4 w-4" />
              <span className="text-[11px] font-bold">Đổi Logo</span>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleQuickLogoUpload}
              className="hidden"
            />
          </label>
          <div className="mt-2.5 text-xl font-bold tracking-wide text-white">
            {db.settings.centerShortName || 'APLUS 2'}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-[#D4E8DB]">
            Trung tâm Bồi dưỡng Văn hoá & Ngoại ngữ Quốc tế
          </div>
        </div>

        {/* Danh sách 15 phân hệ đầy đủ */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            const allowed = canRoleAccessModule(currentAccount.role, item.id);
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveModule(item.id);
                  setSelectedClassCodeForDetail(null);
                  setSidebarOpenMobile(false);
                }}
                className={`flex w-full items-center justify-between rounded-md px-3.5 py-2.5 text-left text-[16px] transition ${
                  isActive
                    ? 'bg-[#008653] font-bold text-white shadow-xs'
                    : allowed
                      ? 'text-white/90 hover:bg-white/10'
                      : 'text-white/45 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>
                    {item.number}. {item.label}
                  </span>
                </div>
                {!allowed && (
                  <span className="text-[11px] text-amber-300" title="Giới hạn theo vai trò">
                    Khóa
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Chân Sidebar: Trạng thái kết nối Supabase */}
        <div className="border-t border-white/15 bg-black/15 px-4 py-3 text-xs text-[#D4E8DB]">
          <div className="font-bold text-emerald-300">
            {supabaseStatus === 'CONNECTED'
              ? 'Đã kết nối & Đồng bộ đám mây Supabase'
              : 'Đã cấu hình Supabase (Nhấn nút Supabase trên đầu trang)'}
          </div>
          <div className="mt-0.5 opacity-85">
            Múi giờ: Asia/Ho_Chi_Minh · Tiền tệ: VNĐ
          </div>
        </div>
      </aside>

      {/* KHU VỰC NỘI DUNG CHÍNH */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* HEADER ĐẦU TRANG */}
        <header className="no-print sticky top-0 z-30 border-b border-[#D4E8DB] bg-white px-4 py-3 shadow-xs lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Tên APLUS 2 & Tên đầy đủ trung tâm */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpenMobile(true)}
                className="rounded border border-[#D4E8DB] p-2 text-[#173B2C] lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-[#00543C]">
                    {db.settings.centerShortName}
                  </span>
                  <span className="hidden text-sm font-bold text-[#173B2C] md:inline">
                    — {db.settings.centerFullName}
                  </span>
                </div>
                <div className="text-xs text-[#008653] font-bold">
                  {supabaseStatus === 'CONNECTED'
                    ? `Đang đồng bộ trực tiếp với Supabase (${supabaseProjectUrl})`
                    : `Dự án Supabase: ${supabaseProjectUrl}`}
                </div>
              </div>
            </div>

            {/* Tìm kiếm, Thông báo & Tài khoản */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Ô tìm kiếm nhanh */}
              <div className="relative w-64 sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#173B2C]/50" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Tìm nhanh mã HV, lớp, giáo viên..."
                  className="w-full rounded border border-[#D4E8DB] bg-[#F2FAF5] py-1.5 pl-9 pr-3 text-sm focus:border-[#008653] focus:bg-white focus:outline-none"
                />
                {globalSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-10 z-50 rounded-lg border border-[#D4E8DB] bg-white p-2 shadow-lg">
                    {globalSearchResults.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={item.onClick}
                        className="flex w-full flex-col rounded p-2 text-left text-xs hover:bg-[#F2FAF5]"
                      >
                        <span className="font-bold text-[#00543C]">
                          [{item.type}] {item.label}
                        </span>
                        <span className="text-[#173B2C]/75">{item.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nút Thông báo */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifPopover(!showNotifPopover)}
                  className="relative rounded border border-[#D4E8DB] bg-[#F2FAF5] p-2 text-[#173B2C] hover:bg-[#D4E8DB]/50"
                  title="Thông báo học phí đến hạn & lương chờ duyệt"
                >
                  <Bell className="h-5 w-5" />
                  {overdueCount + pendingPayrollCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
                      {overdueCount + pendingPayrollCount}
                    </span>
                  )}
                </button>

                {showNotifPopover && (
                  <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xl text-sm">
                    <div className="flex items-center justify-between border-b border-[#D4E8DB] pb-2 font-bold">
                      <span>Thông báo nghiệp vụ</span>
                      <button onClick={() => setShowNotifPopover(false)}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 space-y-2 text-xs">
                      <button
                        onClick={() => {
                          setActiveModule('reminders');
                          setShowNotifPopover(false);
                        }}
                        className="block w-full rounded border border-red-200 bg-red-50 p-2.5 text-left hover:bg-red-100"
                      >
                        <div className="font-bold text-red-700">
                          {overdueCount} khoản học phí cần thu / quá hạn
                        </div>
                        <div>Tổng công nợ: {formatCurrency(db.receivables.reduce((s, r) => s + r.remainingDebt, 0))}</div>
                      </button>
                      <button
                        onClick={() => {
                          setActiveModule('payroll');
                          setShowNotifPopover(false);
                        }}
                        className="block w-full rounded border border-amber-200 bg-amber-50 p-2.5 text-left hover:bg-amber-100"
                      >
                        <div className="font-bold text-amber-800">
                          {pendingPayrollCount} bảng lương giáo viên đang chờ duyệt
                        </div>
                        <div>Nhấn để mở phân hệ Lương giáo viên</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút Kết nối & Đồng bộ Supabase */}
              <button
                onClick={() => setIsSupabaseModalOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold transition ${
                  supabaseStatus === 'CONNECTED'
                    ? 'border-[#008653] bg-[#F2FAF5] text-[#00543C] hover:bg-[#D4E8DB]/60'
                    : supabaseStatus === 'TABLE_MISSING'
                      ? 'border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-[#D4E8DB] bg-white text-[#173B2C] hover:bg-[#F2FAF5]'
                }`}
                title="Quản lý kết nối & đồng bộ dữ liệu trên Supabase"
              >
                <Database className="h-3.5 w-3.5 text-[#008653]" />
                <span>
                  {supabaseStatus === 'CONNECTED'
                    ? 'Supabase: Đã kết nối'
                    : supabaseStatus === 'SYNCING' || supabaseStatus === 'CONNECTING'
                      ? 'Supabase: Đang lưu...'
                      : supabaseStatus === 'TABLE_MISSING'
                        ? 'Supabase: Cần tạo bảng SQL'
                        : 'Supabase Cloud'}
                </span>
              </button>

              {/* Nút Lưu dữ liệu lên Supabase ngay */}
              <button
                onClick={() => void syncWithSupabaseNow(true)}
                className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#006B42]"
                title="Lưu toàn bộ dữ liệu đã nhập trên màn hình lên cơ sở dữ liệu Supabase ngay lập tức"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Lưu lên Supabase ngay</span>
              </button>

              {/* Tài khoản & Cửa sổ đăng nhập theo vai trò */}
              <div className="flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-[#F2FAF5] px-2.5 py-1 text-sm">
                <span className="text-xs font-bold text-[#00543C]">Vai trò:</span>
                <select
                  value={currentAccount.id}
                  onChange={(e) => switchAccount(e.target.value)}
                  className="bg-transparent font-bold text-[#173B2C] focus:outline-none"
                >
                  {db.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.username} – {a.fullName} [{getRoleLabel(a.role)}]
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="ml-1 inline-flex items-center gap-1 rounded bg-[#00543C] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#008653]"
                  title="Mở cửa sổ đăng nhập với mật khẩu & hình nền trung tâm"
                >
                  <KeyRound className="h-3 w-3" />
                  <span>Cửa sổ Đăng nhập</span>
                </button>
                <button
                  onClick={logout}
                  className="rounded p-1 text-red-600 hover:bg-red-50"
                  title="Đăng xuất ra màn hình đăng nhập"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Modal Cửa sổ Đăng nhập (giamdoc, giaovu, ketoan, giaovien) */}
        {isLoginModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <LoginWindow onCloseModal={() => setIsLoginModalOpen(false)} />
          </div>
        )}

        {/* Modal Quản lý Kết nối & Đồng bộ Supabase */}
        {isSupabaseModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-2xl">
              <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  <h3 className="text-xl font-bold">
                    Kết nối Cơ sở dữ liệu Đám mây Supabase
                  </h3>
                </div>
                <button onClick={() => setIsSupabaseModalOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-6 text-sm text-[#173B2C]">
                <div className="rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#00543C]">
                      Project URL: <code className="text-[#008653]">{supabaseProjectUrl}</code>
                    </span>
                    <span
                      className={`rounded px-2.5 py-0.5 text-xs font-bold ${
                        supabaseStatus === 'CONNECTED'
                          ? 'bg-[#008653] text-white'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {supabaseStatus === 'CONNECTED'
                        ? 'ĐÃ KẾT NỐI & ĐỒNG BỘ TỰ ĐỘNG'
                        : supabaseStatus === 'TABLE_MISSING'
                          ? 'CHỜ TẠO BẢNG TRÊN SUPABASE SQL EDITOR'
                          : supabaseStatus}
                    </span>
                  </div>
                  {supabaseLastSync && (
                    <div className="text-xs text-[#173B2C]/80">
                      Lần đồng bộ gần nhất: <strong>{formatDateTimeVN(supabaseLastSync)}</strong>
                    </div>
                  )}
                  {supabaseError && (
                    <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs font-bold text-amber-900">
                      {supabaseError}
                    </div>
                  )}
                </div>

                {/* Hướng dẫn chạy lệnh SQL 1 lần duy nhất nếu chưa có bảng */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#00543C]">
                      Lệnh SQL chuẩn hoá bảng dữ liệu APLUS 2 trên Supabase:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(SUPABASE_SETUP_SQL);
                        notify(
                          'Đã sao chép lệnh SQL! Hãy mở mục SQL Editor trên Supabase, dán vào và bấm Run.'
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded bg-[#008653] px-3 py-1 text-xs font-bold text-white hover:bg-[#006B42]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Sao chép lệnh SQL
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded border border-[#D4E8DB] bg-gray-900 p-3 font-mono text-xs text-emerald-300">
                    {SUPABASE_SETUP_SQL}
                  </pre>
                  <div className="text-xs text-[#173B2C]/80">
                    Mở nhanh trang SQL Editor của dự án Supabase của bạn:{' '}
                    <a
                      href="https://supabase.com/dashboard/project/gdoxbonoiumnpiswqris/sql/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-[#008653] underline"
                    >
                      https://supabase.com/dashboard/project/gdoxbonoiumnpiswqris/sql/new
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-[#D4E8DB] pt-4">
                  <button
                    type="button"
                    onClick={() => setIsSupabaseModalOpen(false)}
                    className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncWithSupabaseNow(false)}
                    className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-4 py-2 font-bold text-[#008653] hover:bg-[#F2FAF5]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Tải dữ liệu từ Supabase về máy
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncWithSupabaseNow(true)}
                    className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                  >
                    <Database className="h-4 w-4" />
                    Đẩy dữ liệu hiện tại lên Supabase ngay
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* THÔNG BÁO TOAST */}
        {toasts.length > 0 && (
          <div className="no-print fixed bottom-5 right-5 z-50 space-y-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-bold text-white shadow-lg ${
                  t.type === 'ERROR'
                    ? 'border-red-700 bg-red-600'
                    : t.type === 'WARNING'
                      ? 'border-amber-700 bg-amber-600'
                      : 'border-[#00543C] bg-[#008653]'
                }`}
              >
                <span>{t.text}</span>
                <button onClick={() => dismissToast(t.id)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* NỘI DUNG PHÂN HỆ ĐANG CHỌN */}
        <main className="flex-1 p-4 lg:p-6">
          {!hasAccess ? (
            <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-white p-8 text-center shadow-xs">
              <Shield className="mx-auto h-12 w-12 text-red-600" />
              <h2 className="mt-3 text-2xl font-bold text-red-700">
                KHÔNG ĐỦ QUYỀN TRUY CẬP PHÂN HỆ NÀY
              </h2>
              <p className="mt-2 text-sm text-[#173B2C]/80">
                Tài khoản hiện tại (<strong>{currentAccount.fullName}</strong> – Vai trò:{' '}
                <strong>{getRoleLabel(currentAccount.role)}</strong>) không được cấp quyền truy cập vào phân hệ này. Quyền truy cập được kiểm tra nghiêm ngặt theo vai trò, không chỉ ẩn menu.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => setActiveModule('dashboard')}
                  className="rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white"
                >
                  Về trang Tổng quan
                </button>
                <button
                  onClick={() => switchAccount('ACC-001')}
                  className="rounded border border-[#00543C] px-4 py-2 text-sm font-bold text-[#00543C]"
                >
                  Chuyển sang vai trò Giám đốc để xem toàn quyền
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeModule === 'dashboard' && <DashboardView />}
              {activeModule === 'teachers' && <TeachersView />}
              {activeModule === 'classes' && <ClassesView />}
              {activeModule === 'students' && (
                <StudentsAndEnrollmentsView mode="STUDENTS" />
              )}
              {activeModule === 'enrollments' && (
                <StudentsAndEnrollmentsView mode="ENROLLMENTS" />
              )}
              {activeModule === 'schedule' && <ScheduleAndRoomsView />}
              {activeModule === 'attendance' && <AttendanceView />}
              {activeModule === 'assignments' && <AssignmentsView />}
              {activeModule === 'tuition' && (
                <TuitionAndRemindersView mode="TUITION" />
              )}
              {activeModule === 'reminders' && (
                <TuitionAndRemindersView mode="REMINDERS" />
              )}
              {activeModule === 'payroll' && (
                <PayrollAndFinanceView mode="PAYROLL" />
              )}
              {activeModule === 'cashflow' && (
                <PayrollAndFinanceView mode="CASHFLOW" />
              )}
              {activeModule === 'reports' && (
                <ReportsAccountsSettingsView mode="REPORTS" />
              )}
              {activeModule === 'accounts' && (
                <ReportsAccountsSettingsView mode="ACCOUNTS" />
              )}
              {activeModule === 'settings' && (
                <ReportsAccountsSettingsView mode="SETTINGS" />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainWorkspace />
    </AppProvider>
  );
}
