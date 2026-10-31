import React, { useMemo, useState } from 'react';
import {
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  Plus,
  Power,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TattTeacherType, Teacher, TeachingGroup } from '../types';
import { getClassAssignedTeacherCodes, getEffectiveTeacherRate } from '../services/businessLogic';
import {
  formatCurrency,
  formatDateVN,
  getGroupLabel,
  getPayrollStatusLabel,
  getTodayISO,
} from '../utils/formatters';
import { exportRowsToExcel } from '../utils/excelService';
import { ExcelImportModal } from '../components/ExcelImportModal';

export const TeachersView: React.FC = () => {
  const { db, saveTeacher, toggleTeacherActive } = useApp();
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | TeachingGroup>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [detailTeacher, setDetailTeacher] = useState<Teacher | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const emptyForm: Teacher = {
    code: '',
    fullName: '',
    workplace: '',
    specialty: '',
    qualification: 'Đại học',
    phone: '',
    email: '',
    group: 'VH',
    salaryMethod: 'PERCENTAGE_RECEIPT',
    percentageRate: db.settings.defaultVhSalaryPercent || 60,
    shiftRate: db.settings.defaultTattShiftRate || 300000,
    effectiveDate: getTodayISO(),
    status: 'ACTIVE',
    note: '',
    rateHistory: [],
  };

  const [form, setForm] = useState<Teacher>(emptyForm);

  const filteredTeachers = useMemo(() => {
    return db.teachers.filter((t) => {
      if (groupFilter !== 'ALL' && t.group !== groupFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          t.code.toLowerCase().includes(q) ||
          t.fullName.toLowerCase().includes(q) ||
          t.workplace.toLowerCase().includes(q) ||
          t.specialty.toLowerCase().includes(q) ||
          t.phone.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [db.teachers, groupFilter, statusFilter, search]);

  const handleOpenAdd = () => {
    const nextNum = db.teachers.length + 1;
    setForm({
      ...emptyForm,
      code: `VHGV${String(nextNum).padStart(3, '0')}`,
    });
    setIsEdit(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: Teacher) => {
    setForm({ ...t });
    setIsEdit(true);
    setIsModalOpen(true);
  };

  const handleGroupSwitch = (group: TeachingGroup) => {
    setForm((prev) => {
      const tattType: TattTeacherType = prev.tattTeacherType || 'GV_VIET';
      let nextCode = prev.code;
      if (!isEdit) {
        const prefix = group === 'VH' ? 'VHGV' : tattType === 'GV_NUOC_NGOAI' ? 'GVNN' : 'GVGV';
        nextCode = `${prefix}${String(db.teachers.length + 1).padStart(3, '0')}`;
      }
      return {
        ...prev,
        code: nextCode,
        group,
        tattTeacherType: group === 'TATT' ? tattType : undefined,
        salaryMethod: group === 'VH' ? 'PERCENTAGE_RECEIPT' : 'PER_SHIFT',
        percentageRate: group === 'VH' ? prev.percentageRate || 60 : 0,
        shiftRate:
          group === 'TATT'
            ? prev.shiftRate || (tattType === 'GV_NUOC_NGOAI' ? 800000 : 300000)
            : 0,
      };
    });
  };

  const handleTattTypeSwitch = (tattType: TattTeacherType) => {
    setForm((prev) => {
      let nextCode = prev.code;
      if (!isEdit) {
        const prefix = tattType === 'GV_NUOC_NGOAI' ? 'GVNN' : 'GVGV';
        nextCode = `${prefix}${String(db.teachers.length + 1).padStart(3, '0')}`;
      }
      return {
        ...prev,
        code: nextCode,
        tattTeacherType: tattType,
        shiftRate: tattType === 'GV_NUOC_NGOAI' ? 800000 : 300000,
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = saveTeacher(form, isEdit);
    if (ok) {
      setIsModalOpen(false);
    }
  };

  const handleExportExcel = () => {
    const rows = filteredTeachers.map((t) => ({
      'Mã giáo viên': t.code,
      'Họ và tên': t.fullName,
      'Trường đang công tác': t.workplace,
      'Chuyên môn': t.specialty,
      'Trình độ': t.qualification,
      'Số điện thoại': t.phone,
      Email: t.email,
      'Nhóm giảng dạy': getGroupLabel(t.group),
      'Phương thức tính lương':
        t.group === 'VH' ? 'Hưởng % học phí thực thu' : 'Đơn giá theo ca thực dạy',
      'Mức hưởng / Đơn giá':
        t.group === 'VH' ? `${t.percentageRate}%` : `${t.shiftRate} đ/ca`,
      'Ngày áp dụng': formatDateVN(t.effectiveDate),
      'Trạng thái': t.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động',
      'Ghi chú': t.note,
    }));
    exportRowsToExcel(rows, 'Danh_Sach_Giao_Vien_APLUS2.xlsx', 'Giao_Vien');
  };

  return (
    <div className="space-y-5">
      {/* Tiêu đề & Nút thao tác */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">QUẢN LÝ GIÁO VIÊN</h2>
          <p className="text-sm text-[#173B2C]/80">
            Quản lý hồ sơ giảng viên khối Văn hoá (VH – hưởng % học phí thực thu) và Ngoại ngữ (TATT – đơn giá theo ca).
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
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold text-[#173B2C] hover:bg-[#F2FAF5]"
          >
            <Download className="h-4 w-4" />
            Xuất Excel
          </button>
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            <Plus className="h-4 w-4" />
            Thêm giáo viên mới
          </button>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
        <div className="relative min-w-[260px] flex-1">
          <Search className=" absolute left-3 top-2.5 h-4 w-4 text-[#173B2C]/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã GV, họ tên, trường công tác, chuyên môn, SĐT..."
            className="w-full rounded border border-[#D4E8DB] py-1.5 pl-9 pr-3 text-sm focus:border-[#008653] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-[#D4E8DB] bg-[#F2FAF5] p-0.5 text-sm">
            <button
              onClick={() => setGroupFilter('ALL')}
              className={`rounded px-3 py-1 font-bold ${
                groupFilter === 'ALL' ? 'bg-[#008653] text-white' : 'text-[#173B2C]'
              }`}
            >
              Tất cả nhóm
            </button>
            <button
              onClick={() => setGroupFilter('VH')}
              className={`rounded px-3 py-1 font-bold ${
                groupFilter === 'VH' ? 'bg-[#008653] text-white' : 'text-[#173B2C]'
              }`}
            >
              Văn hoá (VH)
            </button>
            <button
              onClick={() => setGroupFilter('TATT')}
              className={`rounded px-3 py-1 font-bold ${
                groupFilter === 'TATT' ? 'bg-[#008653] text-white' : 'text-[#173B2C]'
              }`}
            >
              Ngoại ngữ (TATT)
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 text-sm font-bold"
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        </div>
      </div>

      {/* Bảng dữ liệu */}
      <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#00543C] text-white">
              <th className="p-3">Mã GV</th>
              <th className="p-3">Họ và tên</th>
              <th className="p-3">Trường đang công tác</th>
              <th className="p-3">Chuyên môn / Trình độ</th>
              <th className="p-3">Nhóm giảng dạy</th>
              <th className="p-3">Phương thức & Mức lương</th>
              <th className="p-3">Ngày áp dụng</th>
              <th className="p-3">Lớp phụ trách</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D4E8DB]">
            {filteredTeachers.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[#173B2C]/70">
                  Không tìm thấy giáo viên nào phù hợp bộ lọc.
                </td>
              </tr>
            ) : (
              filteredTeachers.map((t) => {
                const assignedClasses = db.classes.filter((c) =>
                  getClassAssignedTeacherCodes(c).includes(t.code)
                );
                return (
                  <tr key={t.code} className="hover:bg-[#F2FAF5]/70">
                    <td className="p-3 font-bold text-[#00543C]">{t.code}</td>
                    <td className="p-3">
                      <div className="font-bold text-base">{t.fullName}</div>
                      <div className="text-xs text-[#173B2C]/75">
                        {t.phone} {t.email ? `· ${t.email}` : ''}
                      </div>
                    </td>
                    <td className="p-3 font-bold">{t.workplace}</td>
                    <td className="p-3">
                      {t.specialty} · <span className="text-[#173B2C]/80">{t.qualification}</span>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-[#008653]">{getGroupLabel(t.group)}</div>
                      {t.group === 'TATT' && (
                        <div className="mt-0.5 text-xs font-bold text-[#00543C]">
                          {t.tattTeacherType === 'GV_NUOC_NGOAI'
                            ? '• GV Nước ngoài'
                            : '• GV Việt Nam'}
                        </div>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">
                      {t.group === 'VH' ? (
                        <div>
                          <span className="font-bold text-[#00543C]">{t.percentageRate}%</span> học phí thực thu
                        </div>
                      ) : (
                        <div>
                          <span className="font-bold text-[#00543C]">
                            {formatCurrency(t.shiftRate)}
                          </span>{' '}
                          / ca dạy
                        </div>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">{formatDateVN(t.effectiveDate)}</td>
                    <td className="p-3">
                      {assignedClasses.length > 0 ? (
                        <div className="space-y-0.5 text-xs">
                          {assignedClasses.map((c) => {
                            const co = (c.coTeacherAssignments || []).find(
                              (a) => a.teacherCode === t.code
                            );
                            return (
                              <div key={c.code}>
                                <span className="font-bold text-[#00543C]">{c.code}</span>
                                {co?.skillOrRole ? ` (${co.skillOrRole})` : ''}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        'Chưa phân lớp'
                      )}
                    </td>
                    <td className="p-3">
                      {t.status === 'ACTIVE' ? (
                        <span className="font-bold text-[#008653]">Đang công tác</span>
                      ) : (
                        <span className="font-bold text-amber-700">Ngừng hoạt động</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setDetailTeacher(t)}
                          title="Xem chi tiết & lịch sử mức lương"
                          className="rounded border border-[#D4E8DB] p-1.5 text-[#173B2C] hover:bg-[#F2FAF5]"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          title="Chỉnh sửa thông tin"
                          className="rounded border border-[#D4E8DB] p-1.5 text-[#008653] hover:bg-[#F2FAF5]"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleTeacherActive(t.code)}
                          title={
                            t.status === 'ACTIVE'
                              ? 'Ngừng hoạt động (không xoá mất lịch sử dạy/lương)'
                              : 'Kích hoạt lại'
                          }
                          className="rounded border border-[#D4E8DB] p-1.5 text-amber-700 hover:bg-amber-50"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm / Sửa Giáo viên */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                {isEdit ? `Cập nhật Giáo viên: ${form.code}` : 'Thêm Giáo viên mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {/* Nút chọn Nhóm giảng dạy: Văn hoá hoặc TATT */}
              <div>
                <label className="block text-sm font-bold text-[#173B2C]">
                  Nhóm giảng dạy (Chọn Văn hoá hoặc TATT) *
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleGroupSwitch('VH')}
                    className={`rounded-lg border p-3 text-left transition ${
                      form.group === 'VH'
                        ? 'border-[#008653] bg-[#008653] text-white font-bold shadow-xs'
                        : 'border-[#D4E8DB] bg-[#F2FAF5] text-[#173B2C]'
                    }`}
                  >
                    <div className="text-base font-bold">Nhóm Văn hoá (VH)</div>
                    <div className="text-xs opacity-90">
                      Tính lương theo % học phí thực thu của lớp dạy
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGroupSwitch('TATT')}
                    className={`rounded-lg border p-3 text-left transition ${
                      form.group === 'TATT'
                        ? 'border-[#008653] bg-[#008653] text-white font-bold shadow-xs'
                        : 'border-[#D4E8DB] bg-[#F2FAF5] text-[#173B2C]'
                    }`}
                  >
                    <div className="text-base font-bold">Nhóm Ngoại ngữ (TATT)</div>
                    <div className="text-xs opacity-90">
                      Tính lương theo đơn giá mỗi ca thực dạy
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold">Mã giáo viên duy nhất *</label>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 disabled:bg-gray-100"
                    placeholder="VD: VHGV001 hoặc GVGV003"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Họ và tên giáo viên *</label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                    placeholder="VD: Nguyễn Thị Mai"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Trường đang công tác *</label>
                  <input
                    type="text"
                    required
                    value={form.workplace}
                    onChange={(e) => setForm({ ...form, workplace: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                    placeholder="VD: THCS Bình An"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Chuyên môn giảng dạy *</label>
                  <input
                    type="text"
                    required
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                    placeholder="VD: Toán, Ngữ văn, Tiếng Anh"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Trình độ chuyên môn</label>
                  <select
                    value={form.qualification}
                    onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    <option value="Thạc sĩ">Thạc sĩ</option>
                    <option value="Đại học">Đại học</option>
                    <option value="Tiến sĩ">Tiến sĩ</option>
                    <option value="Cao đẳng">Cao đẳng</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                    placeholder="Giữ số 0 đầu, VD: 0903112233"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Email liên hệ</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Ngày áp dụng mức lương *</label>
                  <input
                    type="date"
                    required
                    value={form.effectiveDate}
                    onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
              </div>

              {/* Thiết lập mức lương theo nhóm */}
              <div className="rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] p-4">
                {form.group === 'VH' ? (
                  <div>
                    <label className="block text-sm font-bold text-[#00543C]">
                      Tỷ lệ hưởng % học phí thực thu của lớp dạy (Nhóm Văn hoá) *
                    </label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        required
                        value={form.percentageRate}
                        onChange={(e) =>
                          setForm({ ...form, percentageRate: Number(e.target.value) })
                        }
                        className="w-40 rounded border border-[#D4E8DB] bg-white px-3 py-2 font-bold tabular-nums"
                      />
                      <span className="text-sm font-bold">% học phí thực thu đã phân bổ (sau miễn giảm/hoàn phí)</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-bold text-[#00543C]">
                        Phân loại giáo viên Ngoại ngữ (TATT) – Mức đơn giá ca dạy khác nhau *
                      </label>
                      <div className="mt-1.5 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleTattTypeSwitch('GV_VIET')}
                          className={`rounded border p-2.5 text-left text-sm transition ${
                            (form.tattTeacherType || 'GV_VIET') === 'GV_VIET'
                              ? 'border-[#008653] bg-[#008653] text-white font-bold'
                              : 'border-[#D4E8DB] bg-white text-[#173B2C]'
                          }`}
                        >
                          <div>Giáo viên Việt Nam (GVGV)</div>
                          <div className="text-xs opacity-90">Đơn giá chuẩn: 300.000 – 400.000 đ/ca</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTattTypeSwitch('GV_NUOC_NGOAI')}
                          className={`rounded border p-2.5 text-left text-sm transition ${
                            form.tattTeacherType === 'GV_NUOC_NGOAI'
                              ? 'border-[#008653] bg-[#008653] text-white font-bold'
                              : 'border-[#D4E8DB] bg-white text-[#173B2C]'
                          }`}
                        >
                          <div>Giáo viên Nước ngoài (GVNN)</div>
                          <div className="text-xs opacity-90">Đơn giá chuẩn: 800.000 đ/ca</div>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-[#00543C]">
                        Đơn giá mỗi ca dạy (VNĐ/ca – Nhóm TATT) *
                      </label>
                      <div className="mt-1 flex items-center gap-3">
                        <input
                          type="number"
                          min={10000}
                          step={10000}
                          required
                          value={form.shiftRate}
                          onChange={(e) => setForm({ ...form, shiftRate: Number(e.target.value) })}
                          className="w-48 rounded border border-[#D4E8DB] bg-white px-3 py-2 font-bold tabular-nums"
                        />
                        <span className="text-sm font-bold">đồng / ca thực dạy được xác nhận</span>
                      </div>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-xs text-[#173B2C]/80">
                  Lưu ý: Việc thay đổi mức lương được lưu kèm ngày áp dụng ({formatDateVN(form.effectiveDate)}) và không làm thay đổi các bảng lương đã chốt trước đó.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold">Ghi chú</label>
                <textarea
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
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
                  Lưu thông tin giáo viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xem chi tiết giáo viên */}
      {detailTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                Hồ sơ Giáo viên: {detailTeacher.fullName} ({detailTeacher.code})
              </h3>
              <button onClick={() => setDetailTeacher(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 p-6 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-[#173B2C]/70">Trường công tác</div>
                  <div className="font-bold">{detailTeacher.workplace}</div>
                </div>
                <div>
                  <div className="text-xs text-[#173B2C]/70">Chuyên môn / Trình độ</div>
                  <div className="font-bold">
                    {detailTeacher.specialty} ({detailTeacher.qualification})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#173B2C]/70">Nhóm & Mức lương hiện tại</div>
                  <div className="font-bold text-[#008653]">
                    {detailTeacher.group === 'VH'
                      ? `VH – ${detailTeacher.percentageRate}% học phí`
                      : `TATT – ${formatCurrency(detailTeacher.shiftRate)}/ca`}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-bold text-base">Các lớp đang tham gia giảng dạy</h4>
                <div className="overflow-x-auto rounded border border-[#D4E8DB]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2FAF5]">
                      <tr>
                        <th className="p-2.5">Mã lớp</th>
                        <th className="p-2.5">Tên lớp</th>
                        <th className="p-2.5">Vai trò / Kỹ năng phụ trách</th>
                        <th className="p-2.5">Đơn giá học phí</th>
                        <th className="p-2.5">Mức lương áp dụng cho lớp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4E8DB]">
                      {db.classes
                        .filter((c) => getClassAssignedTeacherCodes(c).includes(detailTeacher.code))
                        .map((c) => {
                          const co = (c.coTeacherAssignments || []).find(
                            (a) => a.teacherCode === detailTeacher.code
                          );
                          const effectiveRate = getEffectiveTeacherRate(detailTeacher, c);
                          return (
                            <tr key={c.code}>
                              <td className="p-2.5 font-bold">{c.code}</td>
                              <td className="p-2.5">{c.name}</td>
                              <td className="p-2.5 font-bold text-[#00543C]">
                                {co?.skillOrRole || 'Giáo viên phụ trách chính'}
                              </td>
                              <td className="p-2.5 tabular-nums">{formatCurrency(c.feePerSession)}/buổi</td>
                              <td className="p-2.5 font-bold text-[#008653]">
                                {detailTeacher.group === 'VH'
                                  ? `${effectiveRate}% học phí thực thu`
                                  : `${formatCurrency(effectiveRate)}/ca thực dạy`}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-bold text-base">
                  Lịch sử hiệu lực mức lương (Không làm đổi bảng lương đã chốt)
                </h4>
                <div className="overflow-x-auto rounded border border-[#D4E8DB]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2FAF5]">
                      <tr>
                        <th className="p-2.5">Ngày hiệu lực</th>
                        <th className="p-2.5">Mức áp dụng</th>
                        <th className="p-2.5">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4E8DB]">
                      {(detailTeacher.rateHistory || []).map((rh) => (
                        <tr key={rh.id}>
                          <td className="p-2.5 font-bold tabular-nums">
                            {formatDateVN(rh.effectiveDate)}
                          </td>
                          <td className="p-2.5 font-bold text-[#008653]">
                            {rh.group === 'VH'
                              ? `${rh.percentageRate}% học phí thực thu`
                              : `${formatCurrency(rh.shiftRate)} / ca dạy`}
                          </td>
                          <td className="p-2.5">{rh.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-bold text-base">Lịch sử Bảng lương</h4>
                <div className="overflow-x-auto rounded border border-[#D4E8DB]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2FAF5]">
                      <tr>
                        <th className="p-2.5">Mã bảng lương</th>
                        <th className="p-2.5">Kỳ lương</th>
                        <th className="p-2.5 text-right">Tổng lương</th>
                        <th className="p-2.5">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4E8DB]">
                      {db.payrolls
                        .filter((p) => p.teacherCode === detailTeacher.code)
                        .map((p) => (
                          <tr key={p.id}>
                            <td className="p-2.5 font-bold">{p.code}</td>
                            <td className="p-2.5">{p.periodName}</td>
                            <td className="p-2.5 text-right font-bold tabular-nums">
                              {formatCurrency(p.finalSalary)}
                            </td>
                            <td className="p-2.5 font-bold text-[#008653]">
                              {getPayrollStatusLabel(p.status)}
                            </td>
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
        entityType="TEACHERS"
        title="Nhập danh sách Giáo viên từ tệp Excel (.xlsx)"
      />
    </div>
  );
};
