export type TeachingGroup = 'VH' | 'TATT'; // Văn hoá | Tiếng Anh tăng cường / Ngoại ngữ

export type TattTeacherType = 'GV_VIET' | 'GV_NUOC_NGOAI'; // Giáo viên Việt Nam | Giáo viên Nước ngoài

export type UserRole = 'DIRECTOR' | 'ACADEMIC' | 'ACCOUNTANT' | 'TEACHER' | 'STUDENT';

export interface SalaryRateHistoryItem {
  id: string;
  effectiveDate: string; // YYYY-MM-DD
  group: TeachingGroup;
  percentageRate?: number; // % học phí thực thu cho VH (VD: 60)
  shiftRate?: number; // VNĐ/ca cho TATT (VD: 300000 hoặc 800000)
  classCode?: string; // Nếu thiết lập riêng theo phân công lớp
  note?: string;
}

export interface Teacher {
  code: string; // VHGV001, VHGV002, GVGV003, GVNN004...
  fullName: string;
  workplace: string; // Trường / Quốc tịch / Đơn vị công tác
  specialty: string; // Chuyên môn: Toán, Ngữ văn, Tiếng Anh Kids, IELTS 4 kỹ năng...
  qualification: string; // Trình độ: Thạc sĩ, Đại học, CELTA/TESOL...
  phone: string;
  email: string;
  group: TeachingGroup;
  tattTeacherType?: TattTeacherType; // Phân biệt GV Việt Nam và GV Nước ngoài cho nhóm TATT
  salaryMethod: 'PERCENTAGE_RECEIPT' | 'PER_SHIFT';
  percentageRate: number; // % cho VH
  shiftRate: number; // VNĐ/ca cho TATT (GV Việt và GV Nước ngoài có đơn giá khác nhau)
  effectiveDate: string; // YYYY-MM-DD
  status: 'ACTIVE' | 'INACTIVE';
  note: string;
  rateHistory: SalaryRateHistoryItem[];
}

export type ClassStatus = 'SAP_MO' | 'DANG_HOC' | 'DA_KET_THUC' | 'TAM_DUNG';
export type BillingMethod = 'CYCLE_8_WEEKS' | 'PACKAGE_16_SESSIONS';

export interface ClassTeacherAssignment {
  teacherCode: string;
  skillOrRole: string; // VD: "GV Việt Nam (Ngữ pháp)", "GV Nước ngoài (Giao tiếp)", "Listening", "Speaking", "Reading", "Writing"
  customShiftRate?: number; // Đơn giá ca áp dụng riêng cho GV này tại lớp (nếu khác đơn giá gốc trên hồ sơ GV)
}

export interface RecurringScheduleItem {
  dayOfWeek: number; // 1 = Thứ 2 ... 6 = Thứ 7, 0 = Chủ nhật
  shiftId: string;
  roomCode: string;
  teacherCode?: string; // Mã giáo viên phụ trách buổi học định kỳ này trong tuần
  skillNote?: string; // Kỹ năng / Phân môn của buổi học này (VD: Listening / Speaking / GV Nước ngoài)
}

export interface ClassInfo {
  code: string; // TOAN6A, VAN6A, ANH5A, IELTS65A
  name: string;
  subject: string;
  group: TeachingGroup;
  grade: string; // Khối 5, Khối 6, Kids, IELTS...
  teacherCode: string; // Giáo viên phụ trách chính / chủ nhiệm lớp
  coTeacherAssignments?: ClassTeacherAssignment[]; // Danh sách các giáo viên cùng tham gia giảng dạy lớp (Kids 2 GV, IELTS 4 GV...)
  teacherCustomRate?: number; // Tỷ lệ % hoặc đơn giá ca riêng theo lớp nếu có
  teacherRateEffectiveDate?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  feePerSession: number; // Mặc định 50000
  billingMethod: BillingMethod;
  maxStudents: number;
  roomCode: string;
  recurringSchedule: RecurringScheduleItem[];
  status: ClassStatus;
  note?: string;
}

export interface Student {
  code: string; // HV001...
  fullName: string;
  dob: string; // YYYY-MM-DD
  gender: 'Nam' | 'Nữ' | 'Khác';
  school: string;
  schoolClass: string;
  parentName: string;
  phone: string;
  admissionDate: string; // YYYY-MM-DD
  status: 'DANG_HOC' | 'TAM_NGHI' | 'THOI_HOC';
  creditBalance: number; // Tiền dư trả trước chưa phân bổ (VNĐ)
  note: string;
}

export interface Enrollment {
  id: string;
  studentCode: string;
  classCode: string;
  enrollmentDate: string; // YYYY-MM-DD
  feeStartDate: string; // Ngày bắt đầu tính phí YYYY-MM-DD
  endDate?: string; // Ngày kết thúc hoặc xin nghỉ học YYYY-MM-DD
  actualAttendedSessions?: number; // Số buổi thực học chốt từ lúc tham gia đến khi nghỉ
  stopReason?: string; // Lý do nghỉ giữa chừng
  appliedFeePerSession: number; // Đơn giá áp dụng (VNĐ/buổi: 50.000đ cho VH hoặc giá TATT)
  discountPercent: number; // % miễn giảm
  discountAmount: number; // Số tiền miễn giảm cố định/kỳ (VNĐ)
  discountReason?: string;
  status: 'DANG_HOC' | 'TAM_DUNG' | 'DA_NGHI';
}

export interface ShiftConfig {
  id: string;
  name: string; // Sáng 1, Sáng 2...
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface Room {
  code: string;
  name: string;
  capacity: number;
  status: 'HOAT_DONG' | 'BAO_TRI' | 'NGUNG_SU_DUNG';
}

export type SessionStatus = 'DU_KIEN' | 'DA_DAY' | 'NGHI' | 'HUY' | 'HOC_BU';

export interface ClassSession {
  id: string;
  classCode: string;
  date: string; // YYYY-MM-DD
  shiftId: string;
  startTime: string;
  endTime: string;
  roomCode: string;
  actualTeacherCode: string; // Giáo viên thực dạy buổi đó (theo lịch phân công từng buổi hoặc dạy thay)
  skillNote?: string; // Kỹ năng / Phân môn của buổi học
  status: SessionStatus;
  makeupForSessionId?: string; // Nếu là buổi học bù, liên kết buổi gốc (không tính phí 2 lần)
  topic?: string;
  note?: string;
  payrollLocked?: boolean; // Đánh dấu ca TATT đã chốt lương
  payrollId?: string;
}

export type AttendanceStatus = 'CO_MAT' | 'VANG_CO_PHEP' | 'VANG_KHONG_PHEP' | 'DI_MUON' | 'HOC_BU';

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  classCode: string;
  date: string; // YYYY-MM-DD
  studentCode: string;
  status: AttendanceStatus;
  feeWaivedForAbsence?: boolean; // Chỉ miễn phí buổi vắng khi được duyệt rõ ràng
  note: string;
  updatedBy: string;
  updatedAt: string; // ISO string
}

export type QuestionType = 'MCQ' | 'TRUE_FALSE' | 'ESSAY';

export interface AssignmentQuestion {
  id: string;
  type: QuestionType;
  content: string;
  options?: string[]; // Cho MCQ (A, B, C, D)
  correctAnswer?: string; // 'A'|'B'|'C'|'D' cho MCQ, 'TRUE'|'FALSE' cho TRUE_FALSE
  points: number;
}

export interface Assignment {
  id: string;
  code: string;
  title: string;
  subject: string;
  classCode: string;
  teacherCode: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  durationMinutes: number;
  assignedStudentCodes: string[]; // Rỗng = tất cả học viên đang học lớp đó
  attachmentName?: string;
  attachmentDataUrl?: string;
  questions: AssignmentQuestion[];
  scoresPublished: boolean; // Khi công bố điểm học viên mới xem được kết quả & đáp án
  createdAt: string;
}

export interface SubmissionAnswer {
  questionId: string;
  answerText: string;
  earnedPoints?: number;
  teacherComment?: string;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentCode: string;
  submittedAt: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  answers: SubmissionAnswer[];
  autoScore: number;
  essayScore: number;
  totalScore: number;
  graded: boolean;
  teacherFeedback: string;
}

export type ReceivableStatus = 'CHUA_DONG' | 'DONG_MOT_PHAN' | 'DA_DU' | 'QUA_HAN';

export interface TuitionReceivable {
  id: string;
  code: string; // KPT-202610-001
  cycleName: string; // Đợt 1 (09/2026 - 10/2026)
  studentCode: string;
  classCode: string;
  enrollmentId: string;
  createdAt: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  billingMethod: BillingMethod;
  sessionIds: string[]; // Danh sách buổi tính phí cụ thể
  sessionDates: string[]; // Danh sách ngày học cụ thể
  sessionCount: number;
  unitPrice: number; // VNĐ/buổi
  grossAmount: number; // sessionCount * unitPrice
  discountAmount: number; // Miễn giảm
  adjustmentAmount: number; // Điều chỉnh tăng/giảm có lịch sử
  netAmount: number; // Phải thu kỳ này = grossAmount - discountAmount + adjustmentAmount
  openingDebtReference: number; // Nợ kỳ trước hiển thị tham chiếu (không cộng trùng vào grossAmount)
  paidAmount: number; // Đã phân bổ thanh toán cho khoản phải thu này
  remainingDebt: number; // Còn nợ = max(0, netAmount - paidAmount)
  status: ReceivableStatus;
  note?: string;
}

export interface ReceiptAllocation {
  id: string;
  receiptId: string;
  receivableId: string;
  studentCode: string;
  classCode: string;
  cycleName: string;
  allocatedAmount: number; // Số tiền phân bổ (VNĐ)
  allocationDate: string; // YYYY-MM-DD
  includedInPayrollId?: string; // Theo dõi đã tính lương giáo viên VH chưa để tránh tính 2 lần
}

export interface PaymentReceipt {
  id: string;
  receiptNumber: string; // PT-202610-001
  studentCode: string;
  paymentDate: string; // YYYY-MM-DD
  totalAmount: number; // Tổng tiền học viên nộp (VNĐ)
  allocatedTotal: number; // Tổng tiền đã phân bổ vào các khoản phải thu
  unallocatedCredit: number; // Tiền dư chuyển vào tài khoản trả trước của học viên
  paymentMethod: 'TM' | 'CK'; // Tiền mặt | Chuyển khoản
  collectorName: string;
  content: string;
  allocations: ReceiptAllocation[];
  createdAt: string;
}

export interface FinancialAdjustment {
  id: string;
  code: string;
  date: string; // YYYY-MM-DD
  studentCode: string;
  receivableId?: string;
  receiptId?: string;
  type: 'DIEU_CHINH_GIAM' | 'DIEU_CHINH_TANG' | 'HOAN_PHI';
  amount: number; // VNĐ
  reason: string;
  approvedBy: string;
  createdAt: string;
}

export interface TuitionReminderLog {
  id: string;
  studentCode: string;
  classCode: string;
  cycleName: string;
  createdAt: string;
  channel: 'COPY_MANUAL' | 'ZALO' | 'SMS' | 'EMAIL';
  deliveryStatus: 'PREPARED_COPIED' | 'SENT_CONFIRMED' | 'FAILED';
  messageContent: string;
  createdBy: string;
}

export type PayrollStatus = 'NHAP' | 'CHO_DUYET' | 'DA_DUYET' | 'DA_THANH_TOAN';

export interface PayrollLineItem {
  id: string;
  classCode: string;
  className: string;
  description: string;
  basisAmountOrShifts: number; // Tổng học phí thực thu phân bổ (VH) hoặc Số ca đã dạy (TATT)
  rateApplied: number; // % (VH) hoặc Đơn giá ca (TATT)
  calculatedSalary: number; // Lương tính được (VNĐ)
  sourceAllocationIds?: string[]; // Các khoản phân bổ phiếu thu đã tính (VH)
  sourceSessionIds?: string[]; // Các buổi dạy thực tế đã tính (TATT)
  isSupplementalDebtCollection?: boolean; // Đánh dấu lương bổ sung từ học phí nợ thu sau
}

export interface PayrollRecord {
  id: string;
  code: string; // BL-202610-001
  periodName: string; // Kỳ lương Tháng 10/2026
  periodMonth: string; // YYYY-MM
  teacherCode: string;
  teacherName: string;
  group: TeachingGroup;
  createdAt: string;
  lockedAt?: string;
  approvedBy?: string;
  status: PayrollStatus;
  lineItems: PayrollLineItem[];
  baseSalaryTotal: number;
  adjustmentAmount: number;
  adjustmentNote: string;
  finalSalary: number;
  paidAmount: number;
  remainingPayable: number;
}

export type CashflowCategory =
  | 'THU_HOC_PHI'
  | 'THU_KHAC'
  | 'HOAN_HOC_PHI'
  | 'CHI_LUONG'
  | 'THUE_DIA_DIEM'
  | 'DIEN_NUOC_INTERNET'
  | 'TAI_LIEU_THIET_BI'
  | 'CHI_PHI_KHAC';

export interface CashflowTransaction {
  id: string;
  code: string;
  date: string; // YYYY-MM-DD
  type: 'THU' | 'CHI';
  category: CashflowCategory;
  amount: number; // VNĐ
  subject?: string;
  classCode?: string;
  teacherCode?: string;
  studentCode?: string;
  linkedReceiptId?: string; // Nếu tự động đồng bộ từ Phiếu thu (tránh nhập 2 lần)
  linkedPayrollId?: string; // Nếu tự động đồng bộ từ Chi lương (tránh nhập 2 lần)
  linkedAdjustmentId?: string;
  paymentMethod: 'TM' | 'CK';
  description: string;
  createdBy: string;
}

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: UserRole;
  linkedTeacherCode?: string;
  linkedStudentCode?: string;
  status: 'ACTIVE' | 'LOCKED';
  lastLogin: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  target: string;
  detail: string;
}

export interface CenterSettings {
  centerShortName: string;
  centerFullName: string;
  logoDataUrl: string; // Rỗng sẽ hiển thị vòng tròn chữ LOGO
  loginBackgroundDataUrl?: string; // Hình nền cửa sổ đăng nhập của trung tâm
  address: string;
  phone: string;
  email: string;
  defaultFeePerSession: number; // 50000
  defaultBillingMethod: BillingMethod;
  absenceChargePolicy: 'CHARGE_BY_DEFAULT_UNLESS_APPROVED_WAIVER' | 'CREDIT_MAKEUP_ALLOWED';
  absencePolicyNote: string;
  discountPolicyNote: string;
  defaultVhSalaryPercent: number; // 60
  defaultTattShiftRate: number; // 300000
  reminderTemplate: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}

export interface AppDatabase {
  settings: CenterSettings;
  shifts: ShiftConfig[];
  rooms: Room[];
  teachers: Teacher[];
  classes: ClassInfo[];
  students: Student[];
  enrollments: Enrollment[];
  sessions: ClassSession[];
  attendance: AttendanceRecord[];
  assignments: Assignment[];
  submissions: AssignmentSubmission[];
  receivables: TuitionReceivable[];
  receipts: PaymentReceipt[];
  adjustments: FinancialAdjustment[];
  reminders: TuitionReminderLog[];
  payrolls: PayrollRecord[];
  cashflows: CashflowTransaction[];
  accounts: UserAccount[];
  auditLogs: AuditLogItem[];
}
