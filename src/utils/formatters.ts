import {
  AttendanceStatus,
  BillingMethod,
  CashflowCategory,
  ClassStatus,
  PayrollStatus,
  ReceivableStatus,
  SessionStatus,
  TeachingGroup,
  UserRole,
} from '../types';

export function formatCurrency(amount: number | undefined | null): string {
  const safe = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat('vi-VN').format(safe) + ' đ';
}

export function formatNumber(num: number | undefined | null): string {
  const safe = Math.round(Number(num) || 0);
  return new Intl.NumberFormat('vi-VN').format(safe);
}

/**
 * Định dạng YYYY-MM-DD hoặc ISO string sang dd/MM/yyyy theo múi giờ Asia/Ho_Chi_Minh
 */
export function formatDateVN(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const trimmed = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const dt = new Date(trimmed);
    if (isNaN(dt.getTime())) return trimmed;
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dt);
  } catch {
    return trimmed;
  }
}

export function formatDateTimeVN(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  try {
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return isoStr;
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return isoStr;
  }
}

/**
 * Chuyển đổi dd/MM/yyyy hoặc YYYY-MM-DD hoặc Excel serial number sang YYYY-MM-DD
 */
export function parseToISODate(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') {
    // Excel serial date
    const utcDays = Math.floor(input - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (isNaN(dateInfo.getTime())) return null;
    const y = dateInfo.getUTCFullYear();
    const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateInfo.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return str;
    }
    return null;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [dStr, mStr, yStr] = str.split('/');
    const d = Number(dStr);
    const m = Number(mStr);
    const y = Number(yStr);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }
  return null;
}

export function getTodayISO(): string {
  // Để phù hợp dữ liệu minh hoạ tháng 10/2026 và giờ hệ thống hiện tại
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '10';
  const d = parts.find((p) => p.type === 'day')?.value || '25';
  return `${y}-${m}-${d}`;
}

export function getDayOfWeekLabel(day: number): string {
  const map: Record<number, string> = {
    1: 'Thứ 2',
    2: 'Thứ 3',
    3: 'Thứ 4',
    4: 'Thứ 5',
    5: 'Thứ 6',
    6: 'Thứ 7',
    0: 'Chủ nhật',
  };
  return map[day] || 'Chưa rõ';
}

export function getGroupLabel(group: TeachingGroup): string {
  return group === 'VH' ? 'Văn hoá (VH)' : 'Tiếng Anh TT (TATT)';
}

export function getClassStatusLabel(status: ClassStatus): string {
  switch (status) {
    case 'SAP_MO':
      return 'Sắp mở';
    case 'DANG_HOC':
      return 'Đang học';
    case 'DA_KET_THUC':
      return 'Đã kết thúc';
    case 'TAM_DUNG':
      return 'Tạm dừng';
  }
}

export function getBillingMethodLabel(method: BillingMethod): string {
  return method === 'CYCLE_8_WEEKS' ? 'Kỳ thu 8 tuần theo lịch' : 'Gói 16 buổi';
}

export function getSessionStatusLabel(status: SessionStatus): string {
  switch (status) {
    case 'DU_KIEN':
      return 'Dự kiến';
    case 'DA_DAY':
      return 'Đã dạy';
    case 'NGHI':
      return 'Nghỉ';
    case 'HUY':
      return 'Huỷ';
    case 'HOC_BU':
      return 'Học bù';
  }
}

export function getAttendanceStatusLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'CO_MAT':
      return 'Có mặt';
    case 'VANG_CO_PHEP':
      return 'Vắng có phép';
    case 'VANG_KHONG_PHEP':
      return 'Vắng không phép';
    case 'DI_MUON':
      return 'Đi muộn';
    case 'HOC_BU':
      return 'Học bù';
  }
}

export function getReceivableStatusLabel(status: ReceivableStatus): string {
  switch (status) {
    case 'CHUA_DONG':
      return 'Chưa đóng';
    case 'DONG_MOT_PHAN':
      return 'Đóng một phần';
    case 'DA_DU':
      return 'Đã thanh toán đủ';
    case 'QUA_HAN':
      return 'Quá hạn';
  }
}

export function getPayrollStatusLabel(status: PayrollStatus): string {
  switch (status) {
    case 'NHAP':
      return 'Bản nháp';
    case 'CHO_DUYET':
      return 'Chờ duyệt';
    case 'DA_DUYET':
      return 'Đã duyệt';
    case 'DA_THANH_TOAN':
      return 'Đã thanh toán';
  }
}

export function getCashflowCategoryLabel(cat: CashflowCategory): string {
  switch (cat) {
    case 'THU_HOC_PHI':
      return 'Thu học phí';
    case 'THU_KHAC':
      return 'Thu khác';
    case 'HOAN_HOC_PHI':
      return 'Hoàn học phí';
    case 'CHI_LUONG':
      return 'Chi lương giáo viên';
    case 'THUE_DIA_DIEM':
      return 'Thuê địa điểm';
    case 'DIEN_NUOC_INTERNET':
      return 'Điện, nước, internet';
    case 'TAI_LIEU_THIET_BI':
      return 'Tài liệu và thiết bị';
    case 'CHI_PHI_KHAC':
      return 'Chi phí khác';
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'DIRECTOR':
      return 'Giám đốc trung tâm';
    case 'ACADEMIC':
      return 'Giáo vụ';
    case 'ACCOUNTANT':
      return 'Kế toán / Thu ngân';
    case 'TEACHER':
      return 'Giáo viên';
    case 'STUDENT':
      return 'Học viên / Phụ huynh';
  }
}
