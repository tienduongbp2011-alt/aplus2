import * as XLSX from 'xlsx';
import {
  AppDatabase,
  ClassInfo,
  ClassSession,
  Enrollment,
  Student,
  Teacher,
} from '../types';
import { formatCurrency, formatDateVN, getDayOfWeekLabel, parseToISODate } from './formatters';
import { detectSessionConflicts } from '../services/businessLogic';

export type ImportEntityType = 'TEACHERS' | 'CLASSES' | 'STUDENTS' | 'ENROLLMENTS' | 'SESSIONS';

export interface ValidatedImportRow<T = Record<string, unknown>> {
  rowIndex: number;
  raw: Record<string, unknown>;
  parsed?: T;
  isValid: boolean;
  isExistingCode: boolean;
  errors: string[];
  warnings: string[];
}

function normalizePhone(val: unknown): string {
  if (val === null || val === undefined) return '';
  let s = String(val).trim().replace(/\s+/g, '');
  if (/^\d{9}$/.test(s) && !s.startsWith('0')) {
    s = '0' + s;
  }
  return s;
}

export function downloadExcelTemplate(entityType: ImportEntityType): void {
  const wb = XLSX.utils.book_new();
  let sampleData: Record<string, unknown>[] = [];
  let instructions: Record<string, string>[] = [];
  let fileName = 'Mau_Nhap_Du_Lieu.xlsx';

  switch (entityType) {
    case 'TEACHERS':
      fileName = 'Mau_Nhap_Giao_Vien_APLUS2.xlsx';
      sampleData = [
        {
          'Mã giáo viên (*)': 'VHGV004',
          'Họ và tên (*)': 'Phạm Quốc Bảo',
          'Trường đang công tác': 'THCS Chu Văn An',
          'Chuyên môn (*)': 'Toán',
          'Trình độ': 'Thạc sĩ',
          'Số điện thoại (*)': '0912345678',
          Email: 'baopq@aplus2.edu.vn',
          'Nhóm giảng dạy (VH/TATT) (*)': 'VH',
          'Tỷ lệ % lương VH hoặc Đơn giá ca TATT (*)': 60,
          'Ngày áp dụng (dd/MM/yyyy) (*)': '01/10/2026',
          'Ghi chú': 'Giáo viên bồi dưỡng Toán 7',
        },
        {
          'Mã giáo viên (*)': 'GVGV005',
          'Họ và tên (*)': 'Đặng Thu Hà',
          'Trường đang công tác': 'THCS Bình An',
          'Chuyên môn (*)': 'Tiếng Anh',
          'Trình độ': 'Đại học',
          'Số điện thoại (*)': '0987654321',
          Email: 'hadt@aplus2.edu.vn',
          'Nhóm giảng dạy (VH/TATT) (*)': 'TATT',
          'Tỷ lệ % lương VH hoặc Đơn giá ca TATT (*)': 320000,
          'Ngày áp dụng (dd/MM/yyyy) (*)': '01/10/2026',
          'Ghi chú': 'Giáo viên Tiếng Anh giao tiếp',
        },
      ];
      instructions = [
        { Cột: 'Mã giáo viên (*)', 'Quy tắc': 'Bắt buộc, duy nhất (VD: VHGV004). Liên kết bằng mã.' },
        { Cột: 'Số điện thoại (*)', 'Quy tắc': 'Giữ nguyên số 0 ở đầu (định dạng Text hoặc nhập 10 chữ số).' },
        { Cột: 'Nhóm giảng dạy (VH/TATT) (*)', 'Quy tắc': 'Nhập VH (Văn hoá) hoặc TATT (Tiếng Anh TT).' },
        { Cột: 'Tỷ lệ % lương VH hoặc Đơn giá ca TATT (*)', 'Quy tắc': 'Số dương: 1-100 nếu là VH (%), hoặc số tiền VNĐ/ca nếu là TATT.' },
      ];
      break;

    case 'CLASSES':
      fileName = 'Mau_Nhap_Lop_Hoc_APLUS2.xlsx';
      sampleData = [
        {
          'Mã lớp (*)': 'TOAN7A',
          'Tên lớp (*)': 'Toán 7 Nâng Cao A',
          'Môn học (*)': 'Toán',
          'Nhóm (VH/TATT) (*)': 'VH',
          'Khối lớp (*)': 'Khối 7',
          'Mã giáo viên (*)': 'VHGV001',
          'Ngày bắt đầu (dd/MM/yyyy) (*)': '01/09/2026',
          'Ngày kết thúc (dd/MM/yyyy) (*)': '30/12/2026',
          'Học phí mỗi buổi (VNĐ) (*)': 50000,
          'Cách tính kỳ thu (8_TUAN/16_BUOI) (*)': '8_TUAN',
          'Sĩ số tối đa (*)': 25,
          'Mã phòng (*)': 'P101',
          'Trạng thái (SAP_MO/DANG_HOC)': 'DANG_HOC',
        },
      ];
      instructions = [
        { Cột: 'Mã lớp (*)', 'Quy tắc': 'Mã duy nhất toàn trung tâm (VD: TOAN7A).' },
        { Cột: 'Mã giáo viên (*)', 'Quy tắc': 'Phải tồn tại trong danh sách giáo viên đang hoạt động.' },
        { Cột: 'Học phí mỗi buổi (VNĐ) (*)', 'Quy tắc': 'Số nguyên không âm, mặc định 50000.' },
      ];
      break;

    case 'STUDENTS':
      fileName = 'Mau_Nhap_Hoc_Vien_APLUS2.xlsx';
      sampleData = [
        {
          'Mã học viên (*)': 'HV015',
          'Họ và tên (*)': 'Nguyễn Minh Khôi',
          'Ngày sinh (dd/MM/yyyy) (*)': '15/05/2014',
          'Giới tính (Nam/Nữ)': 'Nam',
          'Trường đang học': 'THCS Bình An',
          'Lớp tại trường': '6A1',
          'Họ tên phụ huynh (*)': 'Nguyễn Văn Hùng',
          'Điện thoại liên hệ (*)': '0909123456',
          'Ngày tiếp nhận (dd/MM/yyyy) (*)': '01/09/2026',
          'Ghi chú': 'Học viên mới đăng ký',
        },
      ];
      instructions = [
        { Cột: 'Mã học viên (*)', 'Quy tắc': 'Duy nhất toàn trung tâm. Một học viên học nhiều lớp dùng chung 1 mã.' },
        { Cột: 'Điện thoại liên hệ (*)', 'Quy tắc': 'Số điện thoại phụ huynh, giữ số 0 ở đầu.' },
      ];
      break;

    case 'ENROLLMENTS':
      fileName = 'Mau_Nhap_Dang_Ky_Hoc_APLUS2.xlsx';
      sampleData = [
        {
          'Mã học viên (*)': 'HV001',
          'Mã lớp (*)': 'ANH5A',
          'Ngày đăng ký (dd/MM/yyyy) (*)': '01/09/2026',
          'Ngày bắt đầu tính phí (dd/MM/yyyy) (*)': '05/09/2026',
          'Đơn giá áp dụng (VNĐ/buổi) (*)': 50000,
          'Miễn giảm (%)': 0,
          'Miễn giảm tiền (VNĐ)': 0,
          'Lý do miễn giảm': '',
        },
      ];
      instructions = [
        { Cột: 'Mã học viên (*)', 'Quy tắc': 'Phải tồn tại trong danh sách học viên.' },
        { Cột: 'Mã lớp (*)', 'Quy tắc': 'Phải tồn tại và đã có giáo viên phụ trách. Không cho đăng ký trùng đang hoạt động.' },
      ];
      break;

    case 'SESSIONS':
      fileName = 'Mau_Nhap_Lich_Hoc_APLUS2.xlsx';
      sampleData = [
        {
          'Mã lớp (*)': 'TOAN6A',
          'Ngày học (dd/MM/yyyy) (*)': '28/10/2026',
          'Mã ca (SANG_1/SANG_2/CHIEU_1/CHIEU_2/CHIEU_3/TOI) (*)': 'CHIEU_3',
          'Mã phòng (*)': 'P101',
          'Mã giáo viên thực dạy (*)': 'VHGV001',
          'Trạng thái (DU_KIEN/DA_DAY/NGHI/HUY/HOC_BU)': 'DU_KIEN',
          'Chuyên đề / Ghi chú': 'Ôn tập số nguyên',
        },
      ];
      instructions = [
        { Cột: 'Mã lớp (*)', 'Quy tắc': 'Phải tồn tại trong danh sách lớp học.' },
        { Cột: 'Kiểm tra xung đột', 'Quy tắc': 'Hệ thống tự động kiểm tra trùng giáo viên, trùng phòng, trùng giờ học viên.' },
      ];
      break;
  }

  const wsData = XLSX.utils.json_to_sheet(sampleData);
  const wsGuide = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsData, 'Du_Lieu_Mau');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan');
  XLSX.writeFile(wb, fileName);
}

export async function parseAndValidateExcelFile(
  file: File,
  entityType: ImportEntityType,
  db: AppDatabase
): Promise<ValidatedImportRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const results: ValidatedImportRow[] = [];
  const seenCodesInFile = new Set<string>();
  const seenEnrollmentKeysInFile = new Set<string>();

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    let isExistingCode = false;
    let parsed: Record<string, unknown> | undefined;

    if (entityType === 'TEACHERS') {
      const code = String(raw['Mã giáo viên (*)'] || raw['Mã giáo viên'] || '').trim().toUpperCase();
      const fullName = String(raw['Họ và tên (*)'] || raw['Họ và tên'] || '').trim();
      const workplace = String(raw['Trường đang công tác'] || '').trim();
      const specialty = String(raw['Chuyên môn (*)'] || raw['Chuyên môn'] || '').trim();
      const qualification = String(raw['Trình độ'] || 'Đại học').trim();
      const phone = normalizePhone(raw['Số điện thoại (*)'] || raw['Số điện thoại']);
      const email = String(raw['Email'] || '').trim();
      const groupRaw = String(raw['Nhóm giảng dạy (VH/TATT) (*)'] || raw['Nhóm giảng dạy'] || 'VH')
        .trim()
        .toUpperCase();
      const rateVal = Number(
        String(raw['Tỷ lệ % lương VH hoặc Đơn giá ca TATT (*)'] || raw['Mức lương'] || '0').replace(/[^\d.-]/g, '')
      );
      const effDate = parseToISODate(raw['Ngày áp dụng (dd/MM/yyyy) (*)'] || raw['Ngày áp dụng'] || '01/09/2026');
      const note = String(raw['Ghi chú'] || '').trim();

      if (!code) errors.push('Thiếu Mã giáo viên.');
      if (!fullName) errors.push('Thiếu Họ và tên giáo viên.');
      if (!specialty) errors.push('Thiếu Chuyên môn.');
      if (!phone) errors.push('Thiếu Số điện thoại.');
      if (groupRaw !== 'VH' && groupRaw !== 'TATT') errors.push('Nhóm giảng dạy phải là VH hoặc TATT.');
      if (isNaN(rateVal) || rateVal <= 0) errors.push('Mức lương/Tỷ lệ hưởng phải là số dương.');
      if (groupRaw === 'VH' && rateVal > 100) errors.push('Tỷ lệ hưởng nhóm Văn hoá không vượt quá 100%.');
      if (!effDate) errors.push('Ngày áp dụng không hợp lệ (định dạng dd/MM/yyyy).');

      if (code) {
        if (seenCodesInFile.has(code)) {
          errors.push(`Trùng mã giáo viên "${code}" ngay trong tệp Excel.`);
        }
        seenCodesInFile.add(code);
        isExistingCode = db.teachers.some((t) => t.code === code);
        if (isExistingCode) {
          warnings.push(`Mã giáo viên "${code}" đã tồn tại trên hệ thống.`);
        }
      }

      if (errors.length === 0 && effDate) {
        const group = groupRaw as 'VH' | 'TATT';
        const teacherObj: Teacher = {
          code,
          fullName,
          workplace: workplace || 'Chưa cập nhật',
          specialty,
          qualification,
          phone,
          email,
          group,
          salaryMethod: group === 'VH' ? 'PERCENTAGE_RECEIPT' : 'PER_SHIFT',
          percentageRate: group === 'VH' ? rateVal : 0,
          shiftRate: group === 'TATT' ? Math.round(rateVal) : 0,
          effectiveDate: effDate,
          status: 'ACTIVE',
          note,
          rateHistory: [
            {
              id: `RH-${code}-${Date.now()}`,
              effectiveDate: effDate,
              group,
              percentageRate: group === 'VH' ? rateVal : undefined,
              shiftRate: group === 'TATT' ? Math.round(rateVal) : undefined,
              note: 'Nhập từ Excel',
            },
          ],
        };
        parsed = teacherObj as unknown as Record<string, unknown>;
      }
    } else if (entityType === 'CLASSES') {
      const code = String(raw['Mã lớp (*)'] || raw['Mã lớp'] || '').trim().toUpperCase();
      const name = String(raw['Tên lớp (*)'] || raw['Tên lớp'] || '').trim();
      const subject = String(raw['Môn học (*)'] || raw['Môn học'] || '').trim();
      const groupRaw = String(raw['Nhóm (VH/TATT) (*)'] || raw['Nhóm'] || 'VH').trim().toUpperCase();
      const grade = String(raw['Khối lớp (*)'] || raw['Khối lớp'] || 'Khối 6').trim();
      const teacherCode = String(raw['Mã giáo viên (*)'] || raw['Mã giáo viên'] || '').trim().toUpperCase();
      const startDate = parseToISODate(raw['Ngày bắt đầu (dd/MM/yyyy) (*)'] || raw['Ngày bắt đầu']);
      const endDate = parseToISODate(raw['Ngày kết thúc (dd/MM/yyyy) (*)'] || raw['Ngày kết thúc']);
      const feePerSession = Number(
        String(raw['Học phí mỗi buổi (VNĐ) (*)'] || raw['Học phí mỗi buổi'] || '50000').replace(/[^\d.-]/g, '')
      );
      const billingRaw = String(
        raw['Cách tính kỳ thu (8_TUAN/16_BUOI) (*)'] || raw['Cách tính kỳ thu'] || '8_TUAN'
      )
        .trim()
        .toUpperCase();
      const maxStudents = Number(raw['Sĩ số tối đa (*)'] || raw['Sĩ số tối đa'] || 25);
      const roomCode = String(raw['Mã phòng (*)'] || raw['Mã phòng'] || 'P101').trim().toUpperCase();
      const statusRaw = String(raw['Trạng thái (SAP_MO/DANG_HOC)'] || 'DANG_HOC').trim().toUpperCase();

      if (!code) errors.push('Thiếu Mã lớp.');
      if (!name) errors.push('Thiếu Tên lớp.');
      if (!subject) errors.push('Thiếu Môn học.');
      if (groupRaw !== 'VH' && groupRaw !== 'TATT') errors.push('Nhóm phải là VH hoặc TATT.');
      if (!teacherCode) {
        errors.push('Thiếu Mã giáo viên phụ trách.');
      } else if (!db.teachers.some((t) => t.code === teacherCode && t.status === 'ACTIVE')) {
        errors.push(`Mã giáo viên "${teacherCode}" không tồn tại hoặc đã ngừng hoạt động.`);
      }
      if (!startDate) errors.push('Ngày bắt đầu không hợp lệ.');
      if (startDate && endDate && startDate > endDate) errors.push('Ngày bắt đầu phải trước ngày kết thúc.');
      if (isNaN(feePerSession) || feePerSession < 0) errors.push('Đơn giá học phí mỗi buổi không được âm.');
      if (isNaN(maxStudents) || maxStudents <= 0) errors.push('Sĩ số tối đa phải lớn hơn 0.');
      if (!db.rooms.some((r) => r.code === roomCode)) {
        errors.push(`Mã phòng "${roomCode}" không tồn tại.`);
      }

      if (code) {
        if (seenCodesInFile.has(code)) errors.push(`Trùng mã lớp "${code}" trong tệp Excel.`);
        seenCodesInFile.add(code);
        isExistingCode = db.classes.some((c) => c.code === code);
        if (isExistingCode) warnings.push(`Mã lớp "${code}" đã tồn tại.`);
      }

      if (errors.length === 0 && startDate) {
        const clsObj: ClassInfo = {
          code,
          name,
          subject,
          group: groupRaw as 'VH' | 'TATT',
          grade,
          teacherCode,
          startDate,
          endDate: endDate || '',
          feePerSession: Math.round(feePerSession),
          billingMethod: billingRaw.includes('16') ? 'PACKAGE_16_SESSIONS' : 'CYCLE_8_WEEKS',
          maxStudents: Math.round(maxStudents),
          roomCode,
          recurringSchedule: [{ dayOfWeek: 1, shiftId: 'CHIEU_3', roomCode }],
          status:
            statusRaw === 'SAP_MO' || statusRaw === 'DA_KET_THUC' || statusRaw === 'TAM_DUNG'
              ? statusRaw
              : 'DANG_HOC',
        };
        parsed = clsObj as unknown as Record<string, unknown>;
      }
    } else if (entityType === 'STUDENTS') {
      const code = String(raw['Mã học viên (*)'] || raw['Mã học viên'] || '').trim().toUpperCase();
      const fullName = String(raw['Họ và tên (*)'] || raw['Họ và tên'] || '').trim();
      const dob = parseToISODate(raw['Ngày sinh (dd/MM/yyyy) (*)'] || raw['Ngày sinh']);
      const genderRaw = String(raw['Giới tính (Nam/Nữ)'] || 'Nam').trim();
      const school = String(raw['Trường đang học'] || '').trim();
      const schoolClass = String(raw['Lớp tại trường'] || '').trim();
      const parentName = String(raw['Họ tên phụ huynh (*)'] || raw['Họ tên phụ huynh'] || '').trim();
      const phone = normalizePhone(raw['Điện thoại liên hệ (*)'] || raw['Điện thoại liên hệ']);
      const admissionDate = parseToISODate(
        raw['Ngày tiếp nhận (dd/MM/yyyy) (*)'] || raw['Ngày tiếp nhận'] || '01/09/2026'
      );
      const note = String(raw['Ghi chú'] || '').trim();

      if (!code) errors.push('Thiếu Mã học viên.');
      if (!fullName) errors.push('Thiếu Họ và tên học viên.');
      if (!dob) errors.push('Ngày sinh không hợp lệ (dd/MM/yyyy).');
      if (!parentName) errors.push('Thiếu Họ tên phụ huynh.');
      if (!phone) errors.push('Thiếu Điện thoại liên hệ.');
      if (!admissionDate) errors.push('Ngày tiếp nhận không hợp lệ.');

      if (code) {
        if (seenCodesInFile.has(code)) errors.push(`Trùng mã học viên "${code}" trong tệp Excel.`);
        seenCodesInFile.add(code);
        isExistingCode = db.students.some((s) => s.code === code);
        if (isExistingCode) warnings.push(`Mã học viên "${code}" đã tồn tại.`);
      }

      if (errors.length === 0 && dob && admissionDate) {
        const studentObj: Student = {
          code,
          fullName,
          dob,
          gender: genderRaw === 'Nữ' ? 'Nữ' : genderRaw === 'Khác' ? 'Khác' : 'Nam',
          school: school || 'THCS Bình An',
          schoolClass: schoolClass || '6A',
          parentName,
          phone,
          admissionDate,
          status: 'DANG_HOC',
          creditBalance: 0,
          note,
        };
        parsed = studentObj as unknown as Record<string, unknown>;
      }
    } else if (entityType === 'ENROLLMENTS') {
      const studentCode = String(raw['Mã học viên (*)'] || raw['Mã học viên'] || '').trim().toUpperCase();
      const classCode = String(raw['Mã lớp (*)'] || raw['Mã lớp'] || '').trim().toUpperCase();
      const enrollmentDate = parseToISODate(raw['Ngày đăng ký (dd/MM/yyyy) (*)'] || raw['Ngày đăng ký']);
      const feeStartDate = parseToISODate(
        raw['Ngày bắt đầu tính phí (dd/MM/yyyy) (*)'] || raw['Ngày bắt đầu tính phí']
      );
      const appliedFeePerSession = Number(
        String(raw['Đơn giá áp dụng (VNĐ/buổi) (*)'] || raw['Đơn giá áp dụng'] || '50000').replace(
          /[^\d.-]/g,
          ''
        )
      );
      const discountPercent = Number(raw['Miễn giảm (%)'] || 0);
      const discountAmount = Number(raw['Miễn giảm tiền (VNĐ)'] || 0);
      const discountReason = String(raw['Lý do miễn giảm'] || '').trim();

      if (!studentCode) {
        errors.push('Thiếu Mã học viên.');
      } else if (!db.students.some((s) => s.code === studentCode)) {
        errors.push(`Mã học viên "${studentCode}" không tồn tại.`);
      }

      const targetClass = db.classes.find((c) => c.code === classCode);
      if (!classCode) {
        errors.push('Thiếu Mã lớp.');
      } else if (!targetClass) {
        errors.push(`Mã lớp "${classCode}" không tồn tại.`);
      } else if (!targetClass.teacherCode) {
        errors.push(`Lớp "${classCode}" chưa có giáo viên phụ trách, không thể đăng ký.`);
      }

      if (!enrollmentDate) errors.push('Ngày đăng ký không hợp lệ.');
      if (!feeStartDate) errors.push('Ngày bắt đầu tính phí không hợp lệ.');
      if (isNaN(appliedFeePerSession) || appliedFeePerSession < 0) {
        errors.push('Đơn giá áp dụng không được âm.');
      }
      if (discountPercent < 0 || discountPercent > 100 || discountAmount < 0) {
        errors.push('Giá trị miễn giảm không hợp lệ.');
      }

      const pairKey = `${studentCode}__${classCode}`;
      if (studentCode && classCode) {
        if (seenEnrollmentKeysInFile.has(pairKey)) {
          errors.push(`Trùng đăng ký học viên ${studentCode} vào lớp ${classCode} trong tệp.`);
        }
        seenEnrollmentKeysInFile.add(pairKey);

        const existingActive = db.enrollments.some(
          (e) => e.studentCode === studentCode && e.classCode === classCode && e.status === 'DANG_HOC'
        );
        if (existingActive) {
          errors.push(`Học viên ${studentCode} đã có đăng ký đang hoạt động tại lớp ${classCode}.`);
        }
      }

      if (errors.length === 0 && enrollmentDate && feeStartDate) {
        const enrollObj: Enrollment = {
          id: `ENR-${studentCode}-${classCode}-${Date.now()}-${rowNumber}`,
          studentCode,
          classCode,
          enrollmentDate,
          feeStartDate,
          appliedFeePerSession: Math.round(appliedFeePerSession),
          discountPercent: Math.round(discountPercent),
          discountAmount: Math.round(discountAmount),
          discountReason,
          status: 'DANG_HOC',
        };
        parsed = enrollObj as unknown as Record<string, unknown>;
      }
    } else if (entityType === 'SESSIONS') {
      const classCode = String(raw['Mã lớp (*)'] || raw['Mã lớp'] || '').trim().toUpperCase();
      const date = parseToISODate(raw['Ngày học (dd/MM/yyyy) (*)'] || raw['Ngày học']);
      const shiftId = String(
        raw['Mã ca (SANG_1/SANG_2/CHIEU_1/CHIEU_2/CHIEU_3/TOI) (*)'] || raw['Mã ca'] || 'CHIEU_3'
      )
        .trim()
        .toUpperCase();
      const roomCode = String(raw['Mã phòng (*)'] || raw['Mã phòng'] || '').trim().toUpperCase();
      const actualTeacherCode = String(
        raw['Mã giáo viên thực dạy (*)'] || raw['Mã giáo viên thực dạy'] || ''
      )
        .trim()
        .toUpperCase();
      const statusRaw = String(
        raw['Trạng thái (DU_KIEN/DA_DAY/NGHI/HUY/HOC_BU)'] || 'DU_KIEN'
      )
        .trim()
        .toUpperCase();
      const topic = String(raw['Chuyên đề / Ghi chú'] || '').trim();

      const cls = db.classes.find((c) => c.code === classCode);
      const shift = db.shifts.find((s) => s.id === shiftId);
      const room = db.rooms.find((r) => r.code === roomCode);
      const teacher = db.teachers.find((t) => t.code === actualTeacherCode);

      if (!cls) errors.push(`Mã lớp "${classCode}" không tồn tại.`);
      if (!date) errors.push('Ngày học không hợp lệ (dd/MM/yyyy).');
      if (!shift) errors.push(`Mã ca "${shiftId}" không hợp lệ.`);
      if (!room) errors.push(`Mã phòng "${roomCode}" không tồn tại.`);
      if (!teacher) errors.push(`Mã giáo viên "${actualTeacherCode}" không tồn tại.`);

      if (cls && date && shift && room && teacher) {
        const candidate: Omit<ClassSession, 'id'> = {
          classCode,
          date,
          shiftId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          roomCode,
          actualTeacherCode,
          status:
            statusRaw === 'DA_DAY' ||
            statusRaw === 'NGHI' ||
            statusRaw === 'HUY' ||
            statusRaw === 'HOC_BU'
              ? statusRaw
              : 'DU_KIEN',
          topic,
        };
        const conflicts = detectSessionConflicts(candidate, db);
        conflicts.forEach((c) => {
          if (c.severity === 'ERROR') errors.push(c.message);
          else warnings.push(c.message);
        });

        if (errors.length === 0) {
          const sesObj: ClassSession = {
            id: `SES-${classCode}-${date.replace(/-/g, '')}-${shiftId}-${Date.now()}-${rowNumber}`,
            ...candidate,
          };
          parsed = sesObj as unknown as Record<string, unknown>;
        }
      }
    }

    results.push({
      rowIndex: rowNumber,
      raw,
      parsed,
      isValid: errors.length === 0,
      isExistingCode,
      errors,
      warnings,
    });
  });

  return results;
}

export function exportRowsToExcel(rows: Record<string, unknown>[], fileName: string, sheetName = 'Du_Lieu'): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

export function exportFailedImportRows(failedRows: ValidatedImportRow[], entityType: ImportEntityType): void {
  const data = failedRows.map((r) => ({
    'Dòng số': r.rowIndex,
    ...r.raw,
    'Chi tiết lỗi kiểm tra': r.errors.join(' | '),
  }));
  exportRowsToExcel(data, `Danh_Sach_Dong_Loi_${entityType}_${formatDateVN(new Date().toISOString()).replace(/\//g, '-')}.xlsx`, 'Dong_Loi');
}

function buildClassRosterSheet(cls: ClassInfo, db: AppDatabase): XLSX.WorkSheet {
  const gv = db.teachers.find((t) => t.code === cls.teacherCode);
  const coList = cls.coTeacherAssignments || [];
  const teacherDesc =
    coList.length > 0
      ? coList
          .map((co) => {
            const t = db.teachers.find((x) => x.code === co.teacherCode);
            return `${t?.fullName || co.teacherCode} (${co.teacherCode} - ${co.skillOrRole})`;
          })
          .join(' | ')
      : gv
        ? `Thầy/Cô ${gv.fullName} (Mã GV: ${gv.code} – Đơn vị: ${gv.workplace})`
        : 'Chưa phân công';

  const schedText = cls.recurringSchedule
    .map((r) => {
      const sh = db.shifts.find((s) => s.id === r.shiftId);
      const rGv = db.teachers.find((t) => t.code === (r.teacherCode || cls.teacherCode));
      return `${getDayOfWeekLabel(r.dayOfWeek)} (${sh?.name || r.shiftId}${rGv ? ` - GV: ${rGv.fullName}` : ''})`;
    })
    .join('; ');

  const classEnrollments = db.enrollments.filter((e) => e.classCode === cls.code);

  const aoa: unknown[][] = [
    [db.settings.centerFullName || 'APLUS 2 – TRUNG TÂM BỒI DƯỠNG VĂN HOÁ VÀ NGOẠI NGỮ QUỐC TẾ'],
    [`DANH SÁCH HỌC SINH LỚP: ${cls.name.toUpperCase()} (${cls.code}) – MÔN HỌC: ${cls.subject.toUpperCase()}`],
    [`Giáo viên giảng dạy: ${teacherDesc}`],
    [
      `Nhóm: ${cls.group === 'VH' ? 'Văn hoá (VH)' : 'Ngoại ngữ (TATT)'} | Khối: ${cls.grade} | Phòng học: ${cls.roomCode} | Đơn giá: ${formatCurrency(cls.feePerSession)}/buổi`,
    ],
    [
      `Ngày bắt đầu lớp: ${formatDateVN(cls.startDate)} | Ngày kết thúc lớp: ${
        cls.endDate ? formatDateVN(cls.endDate) : 'Đang mở (Trung tâm tự nhập khi kết thúc)'
      } | Lịch học: ${schedText}`,
    ],
    [],
    [
      'STT',
      'Mã HV',
      'Họ và tên học sinh',
      'Ngày sinh',
      'Trường đang học',
      'Lớp tại trường',
      'Họ tên Phụ huynh',
      'SĐT / Zalo liên hệ',
      'Lớp & Môn đăng ký',
      'Giáo viên dạy',
      'Ngày bắt đầu tính phí',
      'Ngày nghỉ (nếu nghỉ ngang)',
      'Số buổi thực học',
      'Đơn giá / buổi (VNĐ)',
      'Thành tiền học phí (VNĐ)',
      'Trạng thái học',
    ],
  ];

  classEnrollments.forEach((enr, index) => {
    const st = db.students.find((s) => s.code === enr.studentCode);
    const rec = db.receivables.find((r) => r.enrollmentId === enr.id);
    const sessionCount =
      enr.actualAttendedSessions !== undefined
        ? enr.actualAttendedSessions
        : rec
          ? rec.sessionCount
          : 16;
    const totalAmt = rec ? rec.netAmount : sessionCount * enr.appliedFeePerSession;
    const statusLabel =
      enr.status === 'DANG_HOC'
        ? 'Đang học'
        : enr.status === 'DA_NGHI'
          ? `Đã nghỉ (${enr.stopReason || 'Chốt đến ngày nghỉ'})`
          : 'Tạm dừng';

    aoa.push([
      index + 1,
      enr.studentCode,
      st?.fullName || enr.studentCode,
      st?.dob ? formatDateVN(st.dob) : '',
      st?.school || '',
      st?.schoolClass || '',
      st?.parentName || '',
      st?.phone || '',
      `${cls.name} (${cls.subject})`,
      gv?.fullName || cls.teacherCode,
      formatDateVN(enr.feeStartDate),
      enr.endDate ? formatDateVN(enr.endDate) : 'Đang theo học',
      sessionCount,
      enr.appliedFeePerSession,
      totalAmt,
      statusLabel,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 24 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
  ];
  return ws;
}

export function exportClassRosterWithTeacherToExcel(cls: ClassInfo, db: AppDatabase): void {
  const wb = XLSX.utils.book_new();
  const ws = buildClassRosterSheet(cls, db);
  const safeSheetName = `Lop_${cls.code}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  const gv = db.teachers.find((t) => t.code === cls.teacherCode);
  const gvSlug = gv ? `_${gv.fullName.replace(/\s+/g, '_')}` : '';
  XLSX.writeFile(wb, `Danh_Sach_Lop_${cls.code}_${cls.subject}${gvSlug}_APLUS2.xlsx`);
}

export function exportAllClassesRosterWorkbook(db: AppDatabase): void {
  const wb = XLSX.utils.book_new();
  if (db.classes.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['Chưa có lớp học nào trên hệ thống']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Lop');
  } else {
    db.classes.forEach((cls) => {
      const ws = buildClassRosterSheet(cls, db);
      const safeName = `${cls.code}_${cls.subject}`.replace(/[\\/?*[\]:]/g, '').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeName || cls.code);
    });
  }
  XLSX.writeFile(wb, `Danh_Sach_Hoc_Sinh_Tat_Ca_Cac_Lop_Va_Giao_Vien_APLUS2.xlsx`);
}

export function exportClassTuitionReminderZaloExcel(
  cls: ClassInfo | null,
  remindersList: TuitionReceivable[],
  db: AppDatabase
): void {
  const wb = XLSX.utils.book_new();
  const gv = cls ? db.teachers.find((t) => t.code === cls.teacherCode) : null;
  const titleLine = cls
    ? `THÔNG BÁO HỌC PHÍ LỚP ${cls.name.toUpperCase()} (${cls.code}) – MÔN ${cls.subject.toUpperCase()} – GV: ${gv?.fullName || cls.teacherCode}`
    : 'DANH SÁCH TỔNG HỢP NHẮC ĐÓNG HỌC PHÍ TẤT CẢ CÁC LỚP';

  const aoa: unknown[][] = [
    [db.settings.centerFullName || 'APLUS 2 – TRUNG TÂM BỒI DƯỠNG VĂN HOÁ VÀ NGOẠI NGỮ QUỐC TẾ'],
    [titleLine],
    [
      `Thông tin chuyển khoản đóng học phí: Ngân hàng ${db.settings.bankName} – Số TK: ${db.settings.bankAccountNumber} – Chủ TK: ${db.settings.bankAccountHolder}`,
    ],
    [
      'Nội dung chuyển khoản: [Mã HV] - [Họ tên học sinh] - [Mã lớp] (Ví dụ: HV001 Nguyen Hoang Gia Bao TOAN6A)',
    ],
    [],
    [
      'STT',
      'Mã HV',
      'Họ và tên học sinh',
      'Phụ huynh',
      'SĐT Zalo liên hệ',
      'Lớp & Môn học',
      'Giáo viên phụ trách',
      'Kỳ thu / Đợt thu',
      'Số buổi học',
      'Đơn giá / buổi (VNĐ)',
      'Tổng phải thu (VNĐ)',
      'Đã đóng (VNĐ)',
      'Số tiền còn phải đóng (VNĐ)',
      'Hạn thanh toán',
    ],
  ];

  remindersList.forEach((rec, idx) => {
    const st = db.students.find((s) => s.code === rec.studentCode);
    const cObj = db.classes.find((c) => c.code === rec.classCode);
    const tObj = db.teachers.find((t) => t.code === cObj?.teacherCode);
    aoa.push([
      idx + 1,
      rec.studentCode,
      st?.fullName || rec.studentCode,
      st?.parentName || '',
      st?.phone || '',
      `${rec.classCode} – ${cObj?.name || ''}`,
      tObj?.fullName || cObj?.teacherCode || '',
      rec.cycleName,
      rec.sessionCount,
      rec.unitPrice,
      rec.netAmount,
      rec.paidAmount,
      rec.remainingDebt,
      formatDateVN(rec.dueDate),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 12 },
    { wch: 15 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 15 },
  ];
  const sheetName = cls ? `HocPhi_${cls.code}`.slice(0, 31) : 'Nhac_Hoc_Phi_Zalo';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fileCode = cls ? `Lop_${cls.code}_${cls.subject}` : 'Tat_Ca_Lop';
  XLSX.writeFile(wb, `Thong_Bao_Hoc_Phi_Gui_Nhom_Zalo_${fileCode}_APLUS2.xlsx`);
}
