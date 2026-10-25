import React, { useState } from 'react';
import {
  BookOpen,
  CreditCard,
  Eye,
  EyeOff,
  GraduationCap,
  Image as ImageIcon,
  KeyRound,
  LogIn,
  RotateCcw,
  Shield,
  Upload,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface RoleOption {
  key: 'giamdoc' | 'giaovu' | 'ketoan' | 'giaovien';
  username: string;
  title: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    key: 'giamdoc',
    username: 'giamdoc',
    title: 'Giám đốc (giamdoc)',
    subtitle: 'Toàn quyền 15 phân hệ, duyệt lương & cấu hình',
    icon: Shield,
  },
  {
    key: 'giaovu',
    username: 'giaovu',
    title: 'Giáo vụ (giaovu)',
    subtitle: 'Giáo viên, Lớp học, Học viên, Đăng ký & Điểm danh',
    icon: BookOpen,
  },
  {
    key: 'ketoan',
    username: 'ketoan',
    title: 'Kế toán (ketoan)',
    subtitle: 'Học phí, Công nợ, Nhắc phí Zalo, Lương & Thu–Chi',
    icon: CreditCard,
  },
  {
    key: 'giaovien',
    username: 'giaovien',
    title: 'Giáo viên (giaovien)',
    subtitle: 'Lớp phụ trách, Điểm danh, Bài tập & Lương cá nhân',
    icon: GraduationCap,
  },
];

export const LoginWindow: React.FC<{ onCloseModal?: () => void }> = ({ onCloseModal }) => {
  const { db, loginWithCredentials, saveSettings, notify } = useApp();

  const [selectedRoleKey, setSelectedRoleKey] = useState<RoleOption['key']>('giamdoc');
  const [username, setUsername] = useState('giamdoc');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);

  const teacherAccounts = db.accounts.filter((a) => a.role === 'TEACHER');

  const handleSelectRoleCard = (opt: RoleOption) => {
    setSelectedRoleKey(opt.key);
    setUsername(opt.username);
    const matchedAcc = db.accounts.find((a) => a.username === opt.username);
    setPassword(matchedAcc?.password || '123456');
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        saveSettings({
          ...db.settings,
          loginBackgroundDataUrl: reader.result,
        });
        notify('Đã cập nhật hình nền cửa sổ đăng nhập của trung tâm!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetBackground = () => {
    saveSettings({
      ...db.settings,
      loginBackgroundDataUrl: '',
    });
    notify('Đã khôi phục nền mặc định của cửa sổ đăng nhập.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = loginWithCredentials(username, password);
    if (ok && onCloseModal) {
      onCloseModal();
    }
  };

  const hasCustomBg = Boolean(db.settings.loginBackgroundDataUrl);

  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center p-4"
      style={
        hasCustomBg
          ? {
              backgroundImage: `linear-gradient(rgba(0, 52, 37, 0.68), rgba(0, 52, 37, 0.78)), url(${db.settings.loginBackgroundDataUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : {
              background:
                'radial-gradient(circle at 20% 20%, #008653 0%, #00543C 55%, #0e291e 100%)',
            }
      }
    >
      {/* Thanh công cụ góc trên bên phải: Cho phép tự thay hình nền của trung tâm */}
      <div className="fixed right-4 top-4 z-20 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/30 bg-black/45 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-black/65">
          <ImageIcon className="h-4 w-4 text-[#7CE8B5]" />
          <span>Thay hình nền Trung tâm</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleBackgroundUpload}
            className="hidden"
          />
        </label>
        {hasCustomBg && (
          <button
            type="button"
            onClick={handleResetBackground}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/45 px-3 py-2 text-xs font-bold text-amber-200 backdrop-blur-sm transition hover:bg-black/65"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Mặc định
          </button>
        )}
        {onCloseModal && (
          <button
            type="button"
            onClick={onCloseModal}
            className="rounded-lg border border-white/30 bg-white/15 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm hover:bg-white/25"
          >
            Đóng cửa sổ
          </button>
        )}
      </div>

      {/* Khung đăng nhập chính */}
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-[#D4E8DB] bg-white shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Cột trái: Thương hiệu trung tâm & Chọn nhanh 4 nhóm vai trò */}
          <div className="flex flex-col justify-between bg-[#00543C] p-6 text-white lg:col-span-6 lg:p-8">
            <div>
              <div className="flex items-center gap-3.5">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#D4E8DB] bg-[#008653] text-white shadow-md">
                  {db.settings.logoDataUrl ? (
                    <img
                      src={db.settings.logoDataUrl}
                      alt="Logo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-base font-bold tracking-widest">LOGO</span>
                  )}
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-wide text-white">
                    {db.settings.centerShortName || 'APLUS 2'}
                  </div>
                  <div className="text-xs leading-snug text-[#D4E8DB]">
                    {db.settings.centerFullName ||
                      'TRUNG TÂM BỒI DƯỠNG VĂN HOÁ VÀ NGOẠI NGỮ QUỐC TẾ'}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-sm font-bold uppercase tracking-wider text-[#A7F3D0]">
                  1. Chọn vai trò đăng nhập hệ thống:
                </div>
                <p className="mt-0.5 text-xs text-[#D4E8DB]/90">
                  Nhấn vào từng nhóm vai trò bên dưới để điền tài khoản tương ứng:
                </p>

                <div className="mt-3 space-y-2.5">
                  {ROLE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = selectedRoleKey === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleSelectRoleCard(opt)}
                        className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${
                          isSelected
                            ? 'border-white bg-[#008653] text-white shadow-md'
                            : 'border-white/15 bg-white/5 text-white/90 hover:bg-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                              isSelected ? 'bg-white text-[#00543C]' : 'bg-white/10 text-white'
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-bold text-base leading-tight">{opt.title}</div>
                            <div className="mt-0.5 text-xs text-[#D4E8DB]">{opt.subtitle}</div>
                          </div>
                        </div>
                        {isSelected && <UserCheck className="h-5 w-5 shrink-0 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-white/15 pt-4 text-xs text-[#D4E8DB]">
              <div>Địa chỉ: {db.settings.address}</div>
              <div className="mt-0.5">
                Hotline: <strong>{db.settings.phone}</strong> · Mật khẩu mặc định:{' '}
                <strong className="text-amber-300">123456</strong>
              </div>
            </div>
          </div>

          {/* Cột phải: Biểu mẫu tài khoản & mật khẩu */}
          <div className="flex flex-col justify-between bg-white p-6 text-[#173B2C] lg:col-span-6 lg:p-8">
            <div>
              <h2 className="text-2xl font-bold text-[#00543C]">ĐĂNG NHẬP HỆ THỐNG</h2>
              <p className="mt-1 text-sm text-[#173B2C]/80">
                Đăng nhập theo phân quyền Giám đốc, Giáo vụ, Kế toán hoặc Giáo viên.
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[#173B2C]">
                    Tên đăng nhập (giamdoc / giaovu / ketoan / giaovien) *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nhập giamdoc, giaovu, ketoan hoặc giaovien..."
                    className="mt-1 w-full rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] px-3.5 py-2.5 font-bold text-[#00543C] focus:border-[#008653] focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Nếu chọn vai trò Giáo viên, cho phép chọn nhanh tài khoản GV cụ thể */}
                {selectedRoleKey === 'giaovien' && teacherAccounts.length > 0 && (
                  <div className="rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                    <label className="block text-xs font-bold text-[#00543C]">
                      Chọn Giáo viên cụ thể cần đăng nhập:
                    </label>
                    <select
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="mt-1 w-full rounded border border-[#D4E8DB] bg-white px-2.5 py-1.5 text-sm font-bold text-[#173B2C]"
                    >
                      {teacherAccounts.map((acc) => (
                        <option key={acc.id} value={acc.username}>
                          {acc.username} – {acc.fullName} (Mã GV: {acc.linkedTeacherCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold text-[#173B2C]">
                      Mật khẩu đăng nhập *
                    </label>
                    <button
                      type="button"
                      onClick={() => setPassword('123456')}
                      className="text-xs font-bold text-[#008653] hover:underline"
                    >
                      Điền mật khẩu mặc định (123456)
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-[#173B2C]/50" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] py-2.5 pl-9 pr-10 font-bold text-[#173B2C] focus:border-[#008653] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-[#173B2C]/60 hover:text-[#173B2C]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#008653] px-5 py-3 text-base font-bold text-white shadow-md transition hover:bg-[#006B42]"
                >
                  <LogIn className="h-5 w-5" />
                  Đăng nhập vào hệ thống APLUS 2
                </button>
              </form>
            </div>

            {/* Khung tuỳ chỉnh nhanh hình nền đăng nhập ngay trong biểu mẫu */}
            <div className="mt-6 rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-[#00543C]">
                    Cá nhân hoá hình nền cửa sổ đăng nhập Trung tâm
                  </div>
                  <div className="text-[#173B2C]/75">
                    Tải ảnh cơ sở vật chất hoặc banner của trung tâm làm hình nền đăng nhập.
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#008653] bg-white px-3 py-1.5 font-bold text-[#008653] hover:bg-[#008653] hover:text-white">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Chọn ảnh nền</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
