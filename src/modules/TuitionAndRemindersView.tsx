import React, { useMemo, useState } from 'react';
import {
  Copy,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  MessageCircle,
  Plus,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  FinancialAdjustment,
  PaymentReceipt,
  ReceiptAllocation,
  TuitionReceivable,
} from '../types';
import {
  formatCurrency,
  formatDateTimeVN,
  formatDateVN,
  getBillingMethodLabel,
  getReceivableStatusLabel,
  getTodayISO,
} from '../utils/formatters';
import { buildTuitionReceivable } from '../services/businessLogic';
import {
  exportClassTuitionReminderZaloExcel,
  exportRowsToExcel,
} from '../utils/excelService';

type SubTab =
  | 'CLASS_EXCEL_LIST'
  | 'RECEIVABLES'
  | 'RECEIPTS'
  | 'STUDENT_LEDGER'
  | 'ADJUSTMENTS';

export const TuitionAndRemindersView: React.FC<{
  mode: 'TUITION' | 'REMINDERS';
}> = ({ mode }) => {
  const {
    db,
    currentAccount,
    createReceivablesBatch,
    createPaymentReceipt,
    createFinancialAdjustment,
    addReminderLog,
    notify,
    setActiveModule,
  } = useApp();

  const [subTab, setSubTab] = useState<SubTab>('CLASS_EXCEL_LIST');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Modal tạo đợt thu mới
  const [isGenCycleOpen, setIsGenCycleOpen] = useState(false);
  const [cycleName, setCycleName] = useState('Kỳ 2 (11/2026 - 12/2026)');
  const [cycleClassCode, setCycleClassCode] = useState('ALL');
  const [periodStart, setPeriodStart] = useState('2026-10-01');
  const [periodEnd, setPeriodEnd] = useState('2026-11-30');
  const [dueDate, setDueDate] = useState('2026-11-10');

  // Modal lập phiếu thu (phân bổ nhiều khoản phải thu, ưu tiên nợ cũ)
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptStudentCode, setReceiptStudentCode] = useState(
    db.students[1]?.code || 'HV002'
  );
  const [receiptDate, setReceiptDate] = useState(getTodayISO());
  const [receiptAmount, setReceiptAmount] = useState<number>(300000);
  const [receiptMethod, setReceiptMethod] = useState<'TM' | 'CK'>('CK');
  const [receiptContent, setReceiptContent] = useState(
    'Thu học phí bổ sung theo kỳ thu'
  );
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});

  // Modal xem & in Phiếu thu
  const [printableReceipt, setPrintableReceipt] = useState<PaymentReceipt | null>(null);

  // Modal xem chi tiết các buổi trong khoản phải thu
  const [detailReceivable, setDetailReceivable] = useState<TuitionReceivable | null>(null);

  // Modal Giao dịch điều chỉnh / hoàn phí
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjStudentCode, setAdjStudentCode] = useState(db.students[0]?.code || 'HV001');
  const [adjReceivableId, setAdjReceivableId] = useState(db.receivables[0]?.id || '');
  const [adjType, setAdjType] = useState<FinancialAdjustment['type']>('DIEU_CHINH_GIAM');
  const [adjAmount, setAdjAmount] = useState(50000);
  const [adjReason, setAdjReason] = useState('');

  // Sổ chi tiết công nợ học viên
  const [ledgerStudentCode, setLedgerStudentCode] = useState(
    db.students[1]?.code || 'HV002'
  );

  // Nhắc đóng học phí
  const [reminderFilter, setReminderFilter] = useState<
    'ALL_UNPAID' | 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'PAID'
  >('ALL_UNPAID');
  const [reminderClassFilter, setReminderClassFilter] = useState<string>('ALL');
  const [previewReminderRec, setPreviewReminderRec] = useState<TuitionReceivable | null>(
    null
  );

  // 1. Dữ liệu bảng Excel theo lựa chọn từng lớp học với đúng các cột yêu cầu:
  // + Mã HV, Tên học viên, Lớp đăng ký, Đã đóng tiền/Chưa đóng tiền, Số tiền đóng, Số buổi học, Ngày đóng tiền, Hình thức đóng (CK/TM), Ngày đăng ký học
  const classTuitionExcelRows = useMemo(() => {
    return db.enrollments
      .filter((enr) => {
        if (selectedClassFilter !== 'ALL' && enr.classCode !== selectedClassFilter)
          return false;
        if (
          currentAccount.role === 'STUDENT' &&
          currentAccount.linkedStudentCode &&
          enr.studentCode !== currentAccount.linkedStudentCode
        ) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          const st = db.students.find((s) => s.code === enr.studentCode);
          const match =
            enr.studentCode.toLowerCase().includes(q) ||
            enr.classCode.toLowerCase().includes(q) ||
            (st && st.fullName.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      })
      .map((enr) => {
        const st = db.students.find((s) => s.code === enr.studentCode);
        const cls = db.classes.find((c) => c.code === enr.classCode);
        const rec = db.receivables.find((r) => r.enrollmentId === enr.id);

        // Tìm phiếu thu gần nhất phân bổ cho khoản phải thu này
        let latestPaymentDate = '';
        let latestMethod = '';
        for (const pt of db.receipts) {
          const hasAlloc = pt.allocations.some(
            (a) =>
              (rec && a.receivableId === rec.id) ||
              (a.studentCode === enr.studentCode && a.classCode === enr.classCode)
          );
          if (hasAlloc) {
            latestPaymentDate = pt.paymentDate;
            latestMethod = pt.paymentMethod;
            break;
          }
        }

        const paidAmt = rec ? rec.paidAmount : 0;
        const netAmt = rec ? rec.netAmount : 0;
        const debtAmt = rec ? rec.remainingDebt : 0;
        const sessionCount = rec ? rec.sessionCount : 16;

        const paymentStatusText =
          paidAmt >= netAmt && netAmt > 0
            ? 'Đã đóng đủ tiền'
            : paidAmt > 0
              ? `Đóng một phần (Còn nợ ${formatCurrency(debtAmt)})`
              : 'Chưa đóng tiền';

        return {
          enrollmentId: enr.id,
          receivable: rec,
          studentCode: enr.studentCode,
          studentName: st?.fullName || enr.studentCode,
          classLabel: `${enr.classCode} – ${cls?.name || ''}`,
          classCode: enr.classCode,
          paymentStatusText,
          isPaidFull: paidAmt >= netAmt && netAmt > 0,
          paidAmount: paidAmt,
          netAmount: netAmt,
          remainingDebt: debtAmt,
          sessionCount,
          paymentDate: latestPaymentDate ? formatDateVN(latestPaymentDate) : '—',
          paymentMethod: latestMethod || '—',
          enrollmentDate: formatDateVN(enr.enrollmentDate),
          feeStartDate: formatDateVN(enr.feeStartDate),
        };
      });
  }, [db, selectedClassFilter, search, currentAccount]);

  const handleExportClassTuitionExcel = () => {
    const excelData = classTuitionExcelRows.map((r) => ({
      'Mã HV': r.studentCode,
      'Tên học viên': r.studentName,
      'Lớp đăng ký': r.classLabel,
      'Đã đóng tiền / Chưa đóng tiền': r.paymentStatusText,
      'Phải thu (VNĐ)': r.netAmount,
      'Số tiền đóng (VNĐ)': r.paidAmount,
      'Còn nợ (VNĐ)': r.remainingDebt,
      'Số buổi học': r.sessionCount,
      'Ngày đóng tiền': r.paymentDate,
      'Hình thức đóng (CK/TM)': r.paymentMethod,
      'Ngày đăng ký học': r.enrollmentDate,
    }));
    const suffix = selectedClassFilter === 'ALL' ? 'Tat_Ca_Lop' : selectedClassFilter;
    exportRowsToExcel(
      excelData,
      `Danh_Sach_Hoc_Phi_Theo_Lop_${suffix}_APLUS2.xlsx`,
      `Hoc_Phi_${suffix}`
    );
  };

  // Mở modal lập phiếu thu cho học viên và tự động phân bổ ưu tiên nợ cũ trước
  const openReceiptModalForStudent = (stCode: string, defaultAmount?: number) => {
    setReceiptStudentCode(stCode);
    const unpaidRecs = db.receivables
      .filter((r) => r.studentCode === stCode && r.remainingDebt > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const totalUnpaid = unpaidRecs.reduce((s, r) => s + r.remainingDebt, 0);
    const amt = defaultAmount !== undefined ? defaultAmount : totalUnpaid || 500000;
    setReceiptAmount(amt);

    let remainingToAllocate = amt;
    const allocMap: Record<string, number> = {};
    for (const r of unpaidRecs) {
      const alloc = Math.min(remainingToAllocate, r.remainingDebt);
      allocMap[r.id] = alloc;
      remainingToAllocate = Math.max(0, remainingToAllocate - alloc);
    }
    setManualAllocations(allocMap);
    setIsReceiptModalOpen(true);
  };

  const handleReceiptAmountChange = (newAmt: number) => {
    setReceiptAmount(newAmt);
    const unpaidRecs = db.receivables
      .filter((r) => r.studentCode === receiptStudentCode && r.remainingDebt > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    let rem = Math.max(0, newAmt);
    const allocMap: Record<string, number> = {};
    for (const r of unpaidRecs) {
      const alloc = Math.min(rem, r.remainingDebt);
      allocMap[r.id] = alloc;
      rem = Math.max(0, rem - alloc);
    }
    setManualAllocations(allocMap);
  };

  const handleSaveReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (receiptAmount <= 0) {
      notify('Số tiền thu phải lớn hơn 0.', 'ERROR');
      return;
    }

    const unpaidRecs = db.receivables.filter(
      (r) => r.studentCode === receiptStudentCode && r.remainingDebt > 0
    );

    const allocations: ReceiptAllocation[] = [];
    let allocatedTotal = 0;

    for (const r of unpaidRecs) {
      const val = Math.round(Number(manualAllocations[r.id] || 0));
      if (val > r.remainingDebt) {
        notify(
          `Số tiền phân bổ cho lớp ${r.classCode} (${formatCurrency(val)}) vượt quá số nợ còn lại (${formatCurrency(r.remainingDebt)}).`,
          'ERROR'
        );
        return;
      }
      if (val > 0) {
        allocatedTotal += val;
        allocations.push({
          id: `ALLOC-${Date.now()}-${r.id}`,
          receiptId: '',
          receivableId: r.id,
          studentCode: receiptStudentCode,
          classCode: r.classCode,
          cycleName: r.cycleName,
          allocatedAmount: val,
          allocationDate: receiptDate,
        });
      }
    }

    if (allocatedTotal > receiptAmount) {
      notify('Tổng số tiền phân bổ không được lớn hơn tổng số tiền thực thu.', 'ERROR');
      return;
    }

    const unallocatedCredit = Math.max(0, receiptAmount - allocatedTotal);
    const receiptId = `PT-${Date.now()}`;
    const receiptNumber = `PT-${receiptDate.slice(0, 7).replace('-', '')}-${String(
      db.receipts.length + 1
    ).padStart(3, '0')}`;

    const newReceipt: PaymentReceipt = {
      id: receiptId,
      receiptNumber,
      studentCode: receiptStudentCode,
      paymentDate: receiptDate,
      totalAmount: Math.round(receiptAmount),
      allocatedTotal,
      unallocatedCredit,
      paymentMethod: receiptMethod,
      collectorName: currentAccount.fullName,
      content: receiptContent,
      allocations: allocations.map((a) => ({ ...a, receiptId })),
      createdAt: new Date().toISOString(),
    };

    createPaymentReceipt(newReceipt);
    setIsReceiptModalOpen(false);
    setPrintableReceipt(newReceipt);
  };

  const handleGenerateCycleReceivables = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEnrollments = db.enrollments.filter(
      (enr) =>
        enr.status === 'DANG_HOC' &&
        (cycleClassCode === 'ALL' || enr.classCode === cycleClassCode)
    );

    const createdList: TuitionReceivable[] = [];
    let seq = db.receivables.length + 1;

    for (const enr of targetEnrollments) {
      const cls = db.classes.find((c) => c.code === enr.classCode);
      if (!cls) continue;
      const rec = buildTuitionReceivable({
        cycleName,
        periodStart,
        periodEnd,
        dueDate,
        enrollment: enr,
        cls,
        db,
        seqNumber: seq++,
      });
      if (rec) createdList.push(rec);
    }

    createReceivablesBatch(createdList);
    setIsGenCycleOpen(false);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjAmount <= 0 || !adjReason.trim()) {
      notify('Vui lòng nhập số tiền dương và lý do điều chỉnh/hoàn phí rõ ràng.', 'ERROR');
      return;
    }
    const adj: FinancialAdjustment = {
      id: `ADJ-${Date.now()}`,
      code: `DC-${String(db.adjustments.length + 1).padStart(3, '0')}`,
      date: getTodayISO(),
      studentCode: adjStudentCode,
      receivableId: adjReceivableId,
      type: adjType,
      amount: Math.round(adjAmount),
      reason: adjReason,
      approvedBy: currentAccount.fullName,
      createdAt: new Date().toISOString(),
    };
    createFinancialAdjustment(adj);
    setIsAdjustModalOpen(false);
    setAdjReason('');
  };

  // Tạo nội dung nhắc đóng học phí chuẩn xác
  const buildReminderMessage = (rec: TuitionReceivable): string => {
    const st = db.students.find((s) => s.code === rec.studentCode);
    const cls = db.classes.find((c) => c.code === rec.classCode);
    return (
      db.settings.reminderTemplate ||
      'Kính gửi Quý Phụ huynh học viên {TEN_HV} ({MA_HV}), Trung tâm APLUS 2 thông báo học phí lớp {TEN_LOP} ({KY_THU}): Nợ cũ: {NO_CU}, Phát sinh mới: {PHAT_SINH}, Đã đóng: {DA_DONG}, Còn phải đóng: {CON_NO}. Hạn đóng: {HAN_DONG}.'
    )
      .replace('{TEN_HV}', st?.fullName || rec.studentCode)
      .replace('{MA_HV}', rec.studentCode)
      .replace('{TEN_LOP}', `${rec.classCode} - ${cls?.name || ''}`)
      .replace('{KY_THU}', rec.cycleName)
      .replace('{NO_CU}', formatCurrency(rec.openingDebtReference))
      .replace('{PHAT_SINH}', formatCurrency(rec.netAmount))
      .replace('{DA_DONG}', formatCurrency(rec.paidAmount))
      .replace('{CON_NO}', formatCurrency(rec.remainingDebt))
      .replace('{HAN_DONG}', formatDateVN(rec.dueDate))
      .replace('{NGAN_HANG}', db.settings.bankName)
      .replace('{SO_TK}', db.settings.bankAccountNumber)
      .replace('{CHU_TK}', db.settings.bankAccountHolder);
  };

  // Nếu đang ở Phân hệ 10: NHẮC ĐÓNG HỌC PHÍ
  if (mode === 'REMINDERS') {
    const today = '2026-10-25';
    const filteredReminderRecs = db.receivables.filter((r) => {
      if (reminderClassFilter !== 'ALL' && r.classCode !== reminderClassFilter) return false;
      if (reminderFilter === 'PAID') return r.remainingDebt === 0;
      if (r.remainingDebt <= 0) return false; // Không nhắc khoản đã thanh toán đủ
      if (reminderFilter === 'OVERDUE') return r.dueDate < today;
      if (reminderFilter === 'DUE_TODAY') return r.dueDate === today;
      if (reminderFilter === 'UPCOMING') return r.dueDate > today;
      return true;
    });

    const selectedRemClass = db.classes.find((c) => c.code === reminderClassFilter);
    const selectedRemTeacher = db.teachers.find(
      (t) => t.code === selectedRemClass?.teacherCode
    );

    const handleExportReminderZaloExcel = () => {
      if (reminderClassFilter !== 'ALL' && selectedRemClass) {
        exportClassTuitionReminderZaloExcel(selectedRemClass, filteredReminderRecs, db);
        notify(
          `Đã kết xuất tệp Excel Nhắc đóng học phí Lớp ${selectedRemClass.code} (${selectedRemClass.name}) để gửi vào nhóm Zalo của lớp.`
        );
        return;
      }
      // Nếu đang chọn tất cả các lớp
      const rows = filteredReminderRecs.map((rec, idx) => {
        const st = db.students.find((s) => s.code === rec.studentCode);
        const cls = db.classes.find((c) => c.code === rec.classCode);
        const gv = db.teachers.find((t) => t.code === cls?.teacherCode);
        const cleanPhone = (st?.phone || '').replace(/[^0-9]/g, '');
        return {
          STT: idx + 1,
          'Mã lớp': rec.classCode,
          'Tên lớp': cls?.name || '',
          'Giáo viên': gv?.fullName || '',
          'Mã HV': rec.studentCode,
          'Họ và tên học viên': st?.fullName || '',
          'Họ tên phụ huynh': st?.parentName || '',
          'SĐT Zalo liên hệ': st?.phone || '',
          'Kỳ thu': rec.cycleName,
          'Số buổi': rec.sessionCount,
          'Phải thu (VNĐ)': rec.netAmount,
          'Đã đóng (VNĐ)': rec.paidAmount,
          'Còn nợ phải đóng (VNĐ)': rec.remainingDebt,
          'Hạn đóng': formatDateVN(rec.dueDate),
          'Link Zalo liên hệ': cleanPhone ? `https://zalo.me/${cleanPhone}` : '',
        };
      });
      exportRowsToExcel(
        rows,
        'Danh_Sach_Nhac_Hoc_Phi_Gui_Zalo_Tat_Ca_Lop_APLUS2.xlsx',
        'Nhac_Hoc_Phi_Zalo'
      );
      notify('Đã xuất tệp Excel Nhắc đóng học phí tổng hợp tất cả các lớp.');
    };

    const handleCopyClassGroupZaloSummary = () => {
      const targetList = filteredReminderRecs.filter((r) => r.remainingDebt > 0);
      if (targetList.length === 0) {
        notify('Không có học viên nào còn nợ trong danh sách đang chọn.', 'WARNING');
        return;
      }
      const headerLine = selectedRemClass
        ? `THÔNG BÁO HỌC PHÍ LỚP ${selectedRemClass.name.toUpperCase()} (${selectedRemClass.code}) – MÔN ${selectedRemClass.subject.toUpperCase()} (GV: ${selectedRemTeacher?.fullName || 'Đội ngũ GV'})`
        : `THÔNG BÁO TỔNG HỢP HỌC PHÍ CẦN ĐÓNG – TRUNG TÂM APLUS 2`;

      const lines = targetList.map((r, i) => {
        const st = db.students.find((s) => s.code === r.studentCode);
        return `${i + 1}. HV ${st?.fullName} (${r.studentCode}) - Lớp ${r.classCode}: Còn phải đóng ${formatCurrency(r.remainingDebt)} (${r.sessionCount} buổi, hạn ${formatDateVN(r.dueDate)})`;
      });

      const fullGroupMsg = [
        headerLine,
        'Kính gửi Quý Phụ huynh và các em học viên, Trung tâm APLUS 2 trân trọng gửi danh sách học phí kỳ này:',
        ...lines,
        `Thông tin chuyển khoản: ${db.settings.bankName} - STK: ${db.settings.bankAccountNumber} - Chủ TK: ${db.settings.bankAccountHolder}.`,
        'Nội dung CK: [Mã HV] [Họ tên HV] [Mã lớp]. Trân trọng cảm ơn Quý Phụ huynh!',
      ].join('\n');

      navigator.clipboard?.writeText(fullGroupMsg);
      notify(
        'Đã sao chép bản tin tổng hợp của Lớp! Người phụ trách có thể dán trực tiếp kèm file Excel vào Nhóm Zalo của lớp.'
      );
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div>
            <h2 className="text-2xl font-bold text-[#173B2C]">
              NHẮC ĐÓNG HỌC PHÍ THEO LỚP & LIÊN HỆ ZALO PHỤ HUYNH / HỌC VIÊN
            </h2>
            <p className="text-sm text-[#173B2C]/80">
              Hiển thị danh sách nhắc đóng học phí theo từng lớp để người phụ trách xuất file Excel gửi vào Nhóm Zalo của lớp, hoặc bấm liên hệ trực tiếp vào Zalo cá nhân của Phụ huynh / Học viên.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportReminderZaloExcel}
              className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[#006B42]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {reminderClassFilter === 'ALL'
                ? 'Xuất file Excel gửi Nhóm Zalo (Tất cả lớp)'
                : `Xuất file Excel gửi Nhóm Zalo Lớp ${reminderClassFilter}`}
            </button>
            <button
              onClick={handleCopyClassGroupZaloSummary}
              className="inline-flex items-center gap-1.5 rounded border border-[#00543C] bg-[#F2FAF5] px-3.5 py-2 text-sm font-bold text-[#00543C] hover:bg-[#D4E8DB]/60"
            >
              <Copy className="h-4 w-4" />
              Sao chép thông báo gửi Nhóm Zalo Lớp
            </button>
            <button
              onClick={() => setActiveModule('tuition')}
              className="rounded border border-[#008653] bg-white px-4 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
            >
              Chuyển sang Học phí & Công nợ
            </button>
          </div>
        </div>

        {/* Bộ lọc chọn Lớp để gửi vào Nhóm Zalo Lớp */}
        <div className="rounded-lg border-2 border-[#008653] bg-[#F2FAF5] p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold text-[#00543C]">
              1. Chọn Lớp học để lọc danh sách & Xuất file Excel gửi vào Nhóm Zalo Lớp:
            </div>
            {selectedRemClass && (
              <div className="text-xs font-bold text-[#008653]">
                Đang chọn: {selectedRemClass.code} – {selectedRemClass.name} (Môn{' '}
                {selectedRemClass.subject} · GV: {selectedRemTeacher?.fullName || 'Theo ca'})
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setReminderClassFilter('ALL')}
              className={`rounded px-3.5 py-1.5 text-sm font-bold transition ${
                reminderClassFilter === 'ALL'
                  ? 'bg-[#00543C] text-white shadow-2xs'
                  : 'border border-[#D4E8DB] bg-white text-[#173B2C] hover:bg-[#D4E8DB]/40'
              }`}
            >
              Tất cả các lớp ({db.classes.length})
            </button>
            {db.classes.map((c) => {
              const unpaidCount = db.receivables.filter(
                (r) => r.classCode === c.code && r.remainingDebt > 0
              ).length;
              return (
                <button
                  key={c.code}
                  onClick={() => setReminderClassFilter(c.code)}
                  className={`rounded px-3.5 py-1.5 text-sm font-bold transition ${
                    reminderClassFilter === c.code
                      ? 'bg-[#008653] text-white shadow-2xs'
                      : 'border border-[#D4E8DB] bg-white text-[#173B2C] hover:bg-[#D4E8DB]/40'
                  }`}
                >
                  {c.code} – {c.name} ({unpaidCount} HV nợ)
                </button>
              );
            })}
          </div>
        </div>

        {/* Bộ lọc phân loại hạn đóng */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D4E8DB] bg-white p-3 shadow-xs">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['ALL_UNPAID', 'Tất cả khoản cần nhắc (Còn nợ)'],
                ['UPCOMING', 'Sắp đến hạn'],
                ['DUE_TODAY', 'Đến hạn hôm nay'],
                ['OVERDUE', 'Quá hạn'],
                ['PAID', 'Đã thanh toán đủ (Không nhắc)'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setReminderFilter(k)}
                className={`rounded px-3.5 py-1.5 text-sm font-bold ${
                  reminderFilter === k
                    ? 'bg-[#00543C] text-white'
                    : 'bg-[#F2FAF5] text-[#173B2C] hover:bg-[#D4E8DB]/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-xs font-bold text-[#173B2C]/80">
            Tổng cộng: <span className="text-[#008653]">{filteredReminderRecs.length}</span> khoản
          </div>
        </div>

        {/* Bảng danh sách nhắc phí theo lớp + Liên hệ Zalo trực tiếp */}
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Học viên & Phụ huynh (SĐT Zalo)</th>
                <th className="p-3">Lớp & Giáo viên</th>
                <th className="p-3 text-center">Số buổi</th>
                <th className="p-3 text-right">Phát sinh kỳ này</th>
                <th className="p-3 text-right">Đã đóng</th>
                <th className="p-3 text-right">Còn phải đóng</th>
                <th className="p-3">Hạn đóng</th>
                <th className="p-3 text-right">Liên hệ Zalo Phụ huynh / Học viên</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {filteredReminderRecs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[#173B2C]/70">
                    Không có khoản học phí nào cần nhắc trong bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredReminderRecs.map((rec) => {
                  const st = db.students.find((s) => s.code === rec.studentCode);
                  const cls = db.classes.find((c) => c.code === rec.classCode);
                  const gv = db.teachers.find((t) => t.code === cls?.teacherCode);
                  const msg = buildReminderMessage(rec);
                  const cleanPhone = (st?.phone || '').replace(/[^0-9]/g, '');
                  const zaloDirectUrl = cleanPhone ? `https://zalo.me/${cleanPhone}` : 'https://chat.zalo.me';

                  return (
                    <tr key={rec.id} className="hover:bg-[#F2FAF5]/70">
                      <td className="p-3">
                        <div className="font-bold text-[#00543C]">
                          {st?.fullName} ({rec.studentCode})
                        </div>
                        <div className="text-xs text-[#173B2C]/80">
                          PH: <strong>{st?.parentName}</strong> · SĐT Zalo:{' '}
                          <strong className="text-[#008653] tabular-nums">{st?.phone}</strong>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-[#008653]">
                          {rec.classCode} – {cls?.name}
                        </div>
                        <div className="text-xs text-[#173B2C]/75">
                          GV: {gv?.fullName || 'Đội ngũ GV'} · {rec.cycleName}
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold tabular-nums">
                        {rec.sessionCount} buổi
                      </td>
                      <td className="p-3 text-right font-bold tabular-nums">
                        {formatCurrency(rec.netAmount)}
                      </td>
                      <td className="p-3 text-right text-[#008653] tabular-nums">
                        {formatCurrency(rec.paidAmount)}
                      </td>
                      <td className="p-3 text-right font-bold text-red-600 tabular-nums">
                        {formatCurrency(rec.remainingDebt)}
                      </td>
                      <td className="p-3 font-bold tabular-nums">{formatDateVN(rec.dueDate)}</td>
                      <td className="p-3 text-right">
                        {rec.remainingDebt > 0 ? (
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <a
                              href={zaloDirectUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                navigator.clipboard?.writeText(msg);
                                addReminderLog({
                                  id: `REM-${Date.now()}`,
                                  studentCode: rec.studentCode,
                                  classCode: rec.classCode,
                                  cycleName: rec.cycleName,
                                  createdAt: new Date().toISOString(),
                                  channel: 'ZALO',
                                  deliveryStatus: 'PREPARED_COPIED',
                                  messageContent: msg,
                                  createdBy: currentAccount.fullName,
                                });
                                notify(
                                  `Đã tự động sao chép tin nhắn nhắc phí của HV ${st?.fullName} và mở Zalo (${st?.phone})! Bạn chỉ cần nhấn Dán (Ctrl+V) để gửi.`
                                );
                              }}
                              className="inline-flex items-center gap-1 rounded bg-[#0068FF] px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#0052CC]"
                              title="Tự động sao chép nội dung nhắc học phí và mở cửa sổ chat Zalo với số điện thoại phụ huynh/học viên"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              Nhắn Zalo PH/HV ({st?.phone})
                            </a>
                            <button
                              onClick={() => setPreviewReminderRec(rec)}
                              className="inline-flex items-center gap-1 rounded border border-[#008653] px-2.5 py-1.5 text-xs font-bold text-[#008653] hover:bg-[#F2FAF5]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Xem
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(msg);
                                addReminderLog({
                                  id: `REM-${Date.now()}`,
                                  studentCode: rec.studentCode,
                                  classCode: rec.classCode,
                                  cycleName: rec.cycleName,
                                  createdAt: new Date().toISOString(),
                                  channel: 'COPY_MANUAL',
                                  deliveryStatus: 'PREPARED_COPIED',
                                  messageContent: msg,
                                  createdBy: currentAccount.fullName,
                                });
                                notify(
                                  `Đã sao chép nội dung nhắc phí của HV ${st?.fullName} và lưu vào lịch sử nhắc phí.`
                                );
                              }}
                              className="inline-flex items-center gap-1 rounded bg-[#008653] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#006B42]"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Sao chép
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-[#008653]">
                            Đã đóng đủ – Không nhắc
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Lịch sử nhắc học phí */}
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center gap-2 font-bold text-base text-[#00543C]">
            <History className="h-5 w-5 text-[#008653]" />
            <span>Nhật ký Lịch sử Nhắc đóng học phí ({db.reminders.length})</span>
          </div>
          <div className="space-y-2 text-sm">
            {db.reminders.map((rem) => (
              <div
                key={rem.id}
                className="rounded border border-[#D4E8DB] bg-[#F2FAF5]/60 p-3"
              >
                <div className="flex flex-wrap items-center justify-between text-xs font-bold">
                  <span className="text-[#00543C]">
                    HV {rem.studentCode} – Lớp {rem.classCode} ({rem.cycleName}) · Kênh:{' '}
                    {rem.channel === 'ZALO' ? 'Liên hệ Zalo PH/HV' : 'Sao chép thủ công'}
                  </span>
                  <span className="text-[#008653]">
                    Trạng thái: Đã sao chép & mở liên hệ ({formatDateTimeVN(rem.createdAt)} bởi{' '}
                    {rem.createdBy})
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#173B2C]">{rem.messageContent}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Xem trước nội dung nhắc phí */}
        {previewReminderRec && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xl rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
              <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
                <h3 className="text-xl font-bold">Xem trước Nội dung Nhắc đóng học phí</h3>
                <button onClick={() => setPreviewReminderRec(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-6 text-sm">
                <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4 leading-relaxed">
                  {buildReminderMessage(previewReminderRec)}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => setPreviewReminderRec(null)}
                    className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                  >
                    Đóng
                  </button>
                  {(() => {
                    const st = db.students.find(
                      (s) => s.code === previewReminderRec.studentCode
                    );
                    const cleanPhone = (st?.phone || '').replace(/[^0-9]/g, '');
                    return (
                      <a
                        href={cleanPhone ? `https://zalo.me/${cleanPhone}` : 'https://chat.zalo.me'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          const msg = buildReminderMessage(previewReminderRec);
                          navigator.clipboard?.writeText(msg);
                          addReminderLog({
                            id: `REM-${Date.now()}`,
                            studentCode: previewReminderRec.studentCode,
                            classCode: previewReminderRec.classCode,
                            cycleName: previewReminderRec.cycleName,
                            createdAt: new Date().toISOString(),
                            channel: 'ZALO',
                            deliveryStatus: 'PREPARED_COPIED',
                            messageContent: msg,
                            createdBy: currentAccount.fullName,
                          });
                          notify('Đã sao chép nội dung và mở Zalo của Phụ huynh / Học viên.');
                          setPreviewReminderRec(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded bg-[#0068FF] px-4 py-2 font-bold text-white hover:bg-[#0052CC]"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Sao chép & Mở Zalo Phụ huynh ({st?.phone})
                      </a>
                    );
                  })()}
                  <button
                    onClick={() => {
                      const msg = buildReminderMessage(previewReminderRec);
                      navigator.clipboard?.writeText(msg);
                      addReminderLog({
                        id: `REM-${Date.now()}`,
                        studentCode: previewReminderRec.studentCode,
                        classCode: previewReminderRec.classCode,
                        cycleName: previewReminderRec.cycleName,
                        createdAt: new Date().toISOString(),
                        channel: 'COPY_MANUAL',
                        deliveryStatus: 'PREPARED_COPIED',
                        messageContent: msg,
                        createdBy: currentAccount.fullName,
                      });
                      notify('Đã sao chép nội dung thông báo và ghi nhận lịch sử.');
                      setPreviewReminderRec(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-5 py-2 font-bold text-white"
                  >
                    <Copy className="h-4 w-4" />
                    Sao chép nội dung & Ghi lịch sử
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Phân hệ 9: Học phí & Công nợ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">QUẢN LÝ HỌC PHÍ & CÔNG NỢ</h2>
          <p className="text-sm text-[#173B2C]/80">
            Đơn giá chuẩn 50.000 đ/buổi (16 buổi = 800.000 đ; vào giữa kỳ 8 buổi = 400.000 đ). Hỗ trợ đóng một phần, tiền dư trả trước, điều chỉnh có lịch sử và xuất Excel theo từng lớp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsGenCycleOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            <RefreshCw className="h-4 w-4" />
            Tạo đợt phải thu học phí
          </button>
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold text-[#173B2C] hover:bg-[#F2FAF5]"
          >
            <Plus className="h-4 w-4" />
            Điều chỉnh / Hoàn phí
          </button>
          <button
            onClick={() => openReceiptModalForStudent('HV002', 300000)}
            className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            <CreditCard className="h-4 w-4" />
            Lập phiếu thu tiền
          </button>
        </div>
      </div>

      {/* Các Tab con của Học phí & Công nợ */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-[#D4E8DB] bg-white p-1.5 shadow-xs">
        {(
          [
            ['CLASS_EXCEL_LIST', '1. Bảng Excel Học phí theo từng Lớp học'],
            ['RECEIVABLES', `2. Khoản phải thu & Chi tiết buổi (${db.receivables.length})`],
            ['RECEIPTS', `3. Phiếu thu & In phiếu (${db.receipts.length})`],
            ['STUDENT_LEDGER', '4. Sổ chi tiết công nợ Học viên'],
            ['ADJUSTMENTS', `5. Lịch sử Điều chỉnh / Hoàn phí (${db.adjustments.length})`],
          ] as [SubTab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSubTab(k)}
            className={`rounded px-4 py-2 text-sm font-bold transition ${
              subTab === k
                ? 'bg-[#00543C] text-white'
                : 'text-[#173B2C] hover:bg-[#F2FAF5]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bộ lọc chọn Lớp & Tìm kiếm */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#00543C]">Lựa chọn từng Lớp học:</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedClassFilter('ALL')}
              className={`rounded px-3 py-1.5 text-sm font-bold ${
                selectedClassFilter === 'ALL'
                  ? 'bg-[#008653] text-white'
                  : 'border border-[#D4E8DB] bg-[#F2FAF5] text-[#173B2C]'
              }`}
            >
              Tất cả các lớp
            </button>
            {db.classes.map((c) => (
              <button
                key={c.code}
                onClick={() => setSelectedClassFilter(c.code)}
                className={`rounded px-3 py-1.5 text-sm font-bold ${
                  selectedClassFilter === c.code
                    ? 'bg-[#008653] text-white'
                    : 'border border-[#D4E8DB] bg-[#F2FAF5] text-[#173B2C]'
                }`}
              >
                {c.code} – {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#173B2C]/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã HV, tên học viên..."
              className="rounded border border-[#D4E8DB] py-1.5 pl-9 pr-3 text-sm"
            />
          </div>
          <button
            onClick={handleExportClassTuitionExcel}
            className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-3.5 py-1.5 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Xuất Excel danh sách lớp đang chọn (.xlsx)
          </button>
        </div>
      </div>

      {/* TAB 1: BẢNG EXCEL HỌC PHÍ THEO LỰA CHỌN TỪNG LỚP HỌC */}
      {subTab === 'CLASS_EXCEL_LIST' && (
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Mã HV</th>
                <th className="p-3">Tên học viên</th>
                <th className="p-3">Lớp đăng ký</th>
                <th className="p-3">Đã đóng tiền / Chưa đóng tiền</th>
                <th className="p-3 text-right">Số tiền đóng</th>
                <th className="p-3 text-center">Số buổi học</th>
                <th className="p-3">Ngày đóng tiền</th>
                <th className="p-3 text-center">Hình thức đóng (CK/TM)</th>
                <th className="p-3">Ngày đăng ký học</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {classTuitionExcelRows.map((row) => (
                <tr key={row.enrollmentId} className="hover:bg-[#F2FAF5]/70">
                  <td className="p-3 font-bold text-[#00543C]">{row.studentCode}</td>
                  <td className="p-3 font-bold">{row.studentName}</td>
                  <td className="p-3 font-bold text-[#008653]">{row.classLabel}</td>
                  <td className="p-3">
                    <span
                      className={`font-bold ${
                        row.isPaidFull
                          ? 'text-[#008653]'
                          : row.paidAmount > 0
                            ? 'text-amber-700'
                            : 'text-red-600'
                      }`}
                    >
                      {row.paymentStatusText}
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold tabular-nums">
                    {formatCurrency(row.paidAmount)}
                    <div className="text-xs font-normal text-[#173B2C]/70">
                      / Phải thu: {formatCurrency(row.netAmount)}
                    </div>
                  </td>
                  <td className="p-3 text-center font-bold tabular-nums">
                    {row.sessionCount} buổi
                  </td>
                  <td className="p-3 tabular-nums">{row.paymentDate}</td>
                  <td className="p-3 text-center font-bold">{row.paymentMethod}</td>
                  <td className="p-3 tabular-nums">
                    <div>{row.enrollmentDate}</div>
                    <div className="text-xs text-[#173B2C]/70">
                      Tính phí: {row.feeStartDate}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {row.remainingDebt > 0 ? (
                      <button
                        onClick={() =>
                          openReceiptModalForStudent(row.studentCode, row.remainingDebt)
                        }
                        className="rounded bg-[#008653] px-3 py-1 text-xs font-bold text-white hover:bg-[#006B42]"
                      >
                        Thu tiền ({formatCurrency(row.remainingDebt)})
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-[#008653]">Hoàn tất</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: DANH SÁCH KHOẢN PHẢI THU CHI TIẾT */}
      {subTab === 'RECEIVABLES' && (
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Mã khoản thu</th>
                <th className="p-3">Học viên & Lớp</th>
                <th className="p-3">Đợt thu / Loại kỳ</th>
                <th className="p-3 text-center">Số buổi × Đơn giá</th>
                <th className="p-3 text-right">Nợ đầu kỳ (Tham chiếu)</th>
                <th className="p-3 text-right">Phải thu kỳ này</th>
                <th className="p-3 text-right">Đã đóng</th>
                <th className="p-3 text-right">Còn nợ</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3 text-right">Chi tiết buổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {db.receivables
                .filter(
                  (r) =>
                    selectedClassFilter === 'ALL' || r.classCode === selectedClassFilter
                )
                .map((r) => {
                  const st = db.students.find((s) => s.code === r.studentCode);
                  return (
                    <tr key={r.id} className="hover:bg-[#F2FAF5]/70">
                      <td className="p-3 font-bold text-[#00543C]">{r.code}</td>
                      <td className="p-3">
                        <div className="font-bold">
                          {st?.fullName} ({r.studentCode})
                        </div>
                        <div className="text-xs font-bold text-[#008653]">Lớp {r.classCode}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold">{r.cycleName}</div>
                        <div className="text-xs text-[#173B2C]/75">
                          {getBillingMethodLabel(r.billingMethod)} · Hạn: {formatDateVN(r.dueDate)}
                        </div>
                      </td>
                      <td className="p-3 text-center tabular-nums">
                        <strong>{r.sessionCount} buổi</strong> × {formatCurrency(r.unitPrice)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-[#173B2C]/75">
                        {formatCurrency(r.openingDebtReference)}
                      </td>
                      <td className="p-3 text-right font-bold tabular-nums">
                        {formatCurrency(r.netAmount)}
                      </td>
                      <td className="p-3 text-right font-bold text-[#008653] tabular-nums">
                        {formatCurrency(r.paidAmount)}
                      </td>
                      <td className="p-3 text-right font-bold text-red-600 tabular-nums">
                        {formatCurrency(r.remainingDebt)}
                      </td>
                      <td className="p-3 font-bold">{getReceivableStatusLabel(r.status)}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setDetailReceivable(r)}
                          className="inline-flex items-center gap-1 rounded border border-[#008653] px-2.5 py-1 text-xs font-bold text-[#008653] hover:bg-[#F2FAF5]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {r.sessionCount} buổi
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: DANH SÁCH PHIẾU THU & IN PHIẾU THU */}
      {subTab === 'RECEIPTS' && (
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Số phiếu thu</th>
                <th className="p-3">Ngày thu</th>
                <th className="p-3">Học viên</th>
                <th className="p-3 text-right">Tổng tiền thu</th>
                <th className="p-3 text-right">Phân bổ học phí</th>
                <th className="p-3 text-right">Tiền dư trả trước</th>
                <th className="p-3">Phương thức / Người thu</th>
                <th className="p-3">Nội dung & Phân bổ lớp</th>
                <th className="p-3 text-right">In phiếu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {db.receipts.map((pt) => {
                const st = db.students.find((s) => s.code === pt.studentCode);
                return (
                  <tr key={pt.id} className="hover:bg-[#F2FAF5]/70">
                    <td className="p-3 font-bold text-[#00543C]">{pt.receiptNumber}</td>
                    <td className="p-3 tabular-nums">{formatDateVN(pt.paymentDate)}</td>
                    <td className="p-3 font-bold">
                      {st?.fullName} ({pt.studentCode})
                    </td>
                    <td className="p-3 text-right font-bold text-[#008653] tabular-nums">
                      {formatCurrency(pt.totalAmount)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatCurrency(pt.allocatedTotal)}
                    </td>
                    <td className="p-3 text-right font-bold text-[#00543C] tabular-nums">
                      {formatCurrency(pt.unallocatedCredit)}
                    </td>
                    <td className="p-3">
                      <div className="font-bold">
                        {pt.paymentMethod === 'CK' ? 'Chuyển khoản (CK)' : 'Tiền mặt (TM)'}
                      </div>
                      <div className="text-xs text-[#173B2C]/75">{pt.collectorName}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div>{pt.content}</div>
                      <div className="mt-1 font-bold text-[#008653]">
                        {pt.allocations
                          .map((a) => `${a.classCode}: ${formatCurrency(a.allocatedAmount)}`)
                          .join(' | ')}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setPrintableReceipt(pt)}
                        className="inline-flex items-center gap-1 rounded bg-[#008653] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#006B42]"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Xem / In phiếu
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: SỔ CHI TIẾT CÔNG NỢ HỌC VIÊN */}
      {subTab === 'STUDENT_LEDGER' && (
        <div className="space-y-4 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4E8DB] pb-4">
            <div className="flex items-center gap-3">
              <span className="font-bold text-[#00543C]">Chọn Học viên xem Sổ công nợ:</span>
              <select
                value={ledgerStudentCode}
                onChange={(e) => setLedgerStudentCode(e.target.value)}
                className="rounded border border-[#008653] bg-[#F2FAF5] px-3 py-1.5 font-bold"
              >
                {db.students.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} – {s.fullName}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded border border-[#008653] px-3.5 py-1.5 text-sm font-bold text-[#008653]"
            >
              <Printer className="h-4 w-4" />
              In Sổ chi tiết công nợ
            </button>
          </div>

          {(() => {
            const st = db.students.find((s) => s.code === ledgerStudentCode);
            const stRecs = db.receivables.filter((r) => r.studentCode === ledgerStudentCode);
            const stReceipts = db.receipts.filter((r) => r.studentCode === ledgerStudentCode);
            const totalPhaiThu = stRecs.reduce((s, r) => s + r.netAmount, 0);
            const totalDaDong = stRecs.reduce((s, r) => s + r.paidAmount, 0);
            const totalConNo = stRecs.reduce((s, r) => s + r.remainingDebt, 0);

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                    <div className="text-xs text-[#173B2C]/70">Tổng phải thu các lớp</div>
                    <div className="text-xl font-bold tabular-nums">
                      {formatCurrency(totalPhaiThu)}
                    </div>
                  </div>
                  <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                    <div className="text-xs text-[#173B2C]/70">Đã đóng phân bổ</div>
                    <div className="text-xl font-bold text-[#008653] tabular-nums">
                      {formatCurrency(totalDaDong)}
                    </div>
                  </div>
                  <div className="rounded border border-red-200 bg-red-50 p-3">
                    <div className="text-xs text-red-700">Tổng nợ còn lại</div>
                    <div className="text-xl font-bold text-red-600 tabular-nums">
                      {formatCurrency(totalConNo)}
                    </div>
                  </div>
                  <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                    <div className="text-xs text-[#173B2C]/70">Số dư tiền thừa trả trước</div>
                    <div className="text-xl font-bold text-[#00543C] tabular-nums">
                      {formatCurrency(st?.creditBalance || 0)}
                    </div>
                  </div>
                </div>

                <h4 className="font-bold text-[#00543C]">
                  A. Chi tiết các khoản phải thu theo lớp và kỳ học:
                </h4>
                <table className="w-full border-collapse border border-[#D4E8DB] text-left text-sm">
                  <thead className="bg-[#F2FAF5]">
                    <tr>
                      <th className="border border-[#D4E8DB] p-2.5">Mã khoản thu</th>
                      <th className="border border-[#D4E8DB] p-2.5">Lớp & Kỳ thu</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-center">Số buổi</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-right">Phải thu</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-right">Đã đóng</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-right">Còn nợ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stRecs.map((r) => (
                      <tr key={r.id}>
                        <td className="border border-[#D4E8DB] p-2.5 font-bold">{r.code}</td>
                        <td className="border border-[#D4E8DB] p-2.5">
                          <strong>{r.classCode}</strong> – {r.cycleName}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 text-center tabular-nums">
                          {r.sessionCount} buổi × {formatCurrency(r.unitPrice)}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 text-right font-bold tabular-nums">
                          {formatCurrency(r.netAmount)}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 text-right font-bold text-[#008653] tabular-nums">
                          {formatCurrency(r.paidAmount)}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 text-right font-bold text-red-600 tabular-nums">
                          {formatCurrency(r.remainingDebt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 className="font-bold text-[#00543C]">
                  B. Lịch sử các phiếu thu đã nộp ({stReceipts.length} phiếu):
                </h4>
                <table className="w-full border-collapse border border-[#D4E8DB] text-left text-sm">
                  <thead className="bg-[#F2FAF5]">
                    <tr>
                      <th className="border border-[#D4E8DB] p-2.5">Số phiếu</th>
                      <th className="border border-[#D4E8DB] p-2.5">Ngày nộp</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-right">Số tiền nộp</th>
                      <th className="border border-[#D4E8DB] p-2.5">Phương thức</th>
                      <th className="border border-[#D4E8DB] p-2.5">Nội dung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stReceipts.map((pt) => (
                      <tr key={pt.id}>
                        <td className="border border-[#D4E8DB] p-2.5 font-bold">
                          {pt.receiptNumber}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 tabular-nums">
                          {formatDateVN(pt.paymentDate)}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 text-right font-bold text-[#008653] tabular-nums">
                          {formatCurrency(pt.totalAmount)}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 font-bold">
                          {pt.paymentMethod}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5">{pt.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 5: LỊCH SỬ GIAO DỊCH ĐIỀU CHỈNH / HOÀN PHÍ */}
      {subTab === 'ADJUSTMENTS' && (
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Mã phiếu ĐC</th>
                <th className="p-3">Ngày lập</th>
                <th className="p-3">Học viên</th>
                <th className="p-3">Loại giao dịch</th>
                <th className="p-3 text-right">Số tiền</th>
                <th className="p-3">Lý do điều chỉnh / hoàn phí</th>
                <th className="p-3">Người duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {db.adjustments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#173B2C]/70">
                    Chưa có giao dịch điều chỉnh hoặc hoàn phí nào. Hệ thống không tự ý xoá giao dịch đã chốt mà lưu toàn bộ điều chỉnh tại đây.
                  </td>
                </tr>
              ) : (
                db.adjustments.map((adj) => (
                  <tr key={adj.id}>
                    <td className="p-3 font-bold text-[#00543C]">{adj.code}</td>
                    <td className="p-3 tabular-nums">{formatDateVN(adj.date)}</td>
                    <td className="p-3 font-bold">{adj.studentCode}</td>
                    <td className="p-3 font-bold text-amber-700">{adj.type}</td>
                    <td className="p-3 text-right font-bold tabular-nums">
                      {formatCurrency(adj.amount)}
                    </td>
                    <td className="p-3">{adj.reason}</td>
                    <td className="p-3">{adj.approvedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Xem danh sách buổi học cụ thể của Khoản phải thu */}
      {detailReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                Chi tiết {detailReceivable.sessionCount} buổi học tính phí ({detailReceivable.code})
              </h3>
              <button onClick={() => setDetailReceivable(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-6 text-sm">
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                <div>
                  Học viên: <strong>{detailReceivable.studentCode}</strong> · Lớp:{' '}
                  <strong>{detailReceivable.classCode}</strong> · Kỳ:{' '}
                  <strong>{detailReceivable.cycleName}</strong>
                </div>
                <div className="mt-1">
                  Công thức kiểm tra:{' '}
                  <strong>
                    {detailReceivable.sessionCount} buổi hợp lệ ×{' '}
                    {formatCurrency(detailReceivable.unitPrice)} ={' '}
                    {formatCurrency(detailReceivable.grossAmount)}
                  </strong>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {detailReceivable.sessionDates.map((dt, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-[#D4E8DB] p-2 text-center tabular-nums"
                  >
                    <div className="text-xs text-[#173B2C]/70">Buổi #{idx + 1}</div>
                    <div className="font-bold text-[#00543C]">{formatDateVN(dt)}</div>
                    <div className="text-xs text-[#008653]">
                      {formatCurrency(detailReceivable.unitPrice)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lập Phiếu thu Học phí (Hỗ trợ phân bổ nhiều khoản phải thu, đóng 1 phần, tiền dư) */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">Lập Phiếu thu Học phí & Phân bổ Công nợ</h3>
              <button onClick={() => setIsReceiptModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveReceipt} className="space-y-4 p-6 text-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-bold">Chọn Học viên nộp tiền *</label>
                  <select
                    value={receiptStudentCode}
                    onChange={(e) => openReceiptModalForStudent(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    {db.students.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} – {s.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold">Ngày thu tiền *</label>
                  <input
                    type="date"
                    required
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold">Tổng số tiền thực thu (VNĐ) *</label>
                  <input
                    type="number"
                    min={1000}
                    step={10000}
                    required
                    value={receiptAmount}
                    onChange={(e) => handleReceiptAmountChange(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[#008653] bg-[#F2FAF5] px-3 py-2 text-lg font-bold text-[#00543C] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold">Hình thức đóng (CK / TM) *</label>
                  <select
                    value={receiptMethod}
                    onChange={(e) => setReceiptMethod(e.target.value as 'TM' | 'CK')}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    <option value="CK">Chuyển khoản (CK)</option>
                    <option value="TM">Tiền mặt (TM)</option>
                  </select>
                </div>
              </div>

              {/* Phân bổ cho các khoản phải thu còn nợ (ưu tiên nợ cũ) */}
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-4">
                <div className="mb-2 font-bold text-[#00543C]">
                  Phân bổ cho các lớp và kỳ thu của học viên (Ưu tiên nợ cũ, cho phép điều chỉnh):
                </div>
                <div className="space-y-2">
                  {db.receivables
                    .filter((r) => r.studentCode === receiptStudentCode && r.remainingDebt > 0)
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#D4E8DB] bg-white p-2.5"
                      >
                        <div>
                          <div className="font-bold">
                            Lớp {r.classCode} – {r.cycleName} ({r.code})
                          </div>
                          <div className="text-xs text-[#173B2C]/75">
                            Phải thu: {formatCurrency(r.netAmount)} · Đã đóng:{' '}
                            {formatCurrency(r.paidAmount)} · Còn nợ:{' '}
                            <strong className="text-red-600">
                              {formatCurrency(r.remainingDebt)}
                            </strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">Phân bổ:</span>
                          <input
                            type="number"
                            min={0}
                            max={r.remainingDebt}
                            step={10000}
                            value={manualAllocations[r.id] || 0}
                            onChange={(e) =>
                              setManualAllocations({
                                ...manualAllocations,
                                [r.id]: Number(e.target.value),
                              })
                            }
                            className="w-36 rounded border border-[#D4E8DB] px-2.5 py-1 text-right font-bold tabular-nums"
                          />
                        </div>
                      </div>
                    ))}
                </div>

                {(() => {
                  const sumAlloc = Object.values(manualAllocations).reduce(
                    (s, v) => s + Number(v || 0),
                    0
                  );
                  const excess = Math.max(0, receiptAmount - sumAlloc);
                  return (
                    <div className="mt-3 flex flex-wrap justify-between border-t border-[#D4E8DB] pt-2 text-xs font-bold">
                      <span>
                        Tổng phân bổ vào công nợ:{' '}
                        <strong className="text-[#008653]">{formatCurrency(sumAlloc)}</strong>
                      </span>
                      <span>
                        Tiền dư chuyển vào tài khoản trả trước của HV:{' '}
                        <strong className="text-[#00543C]">{formatCurrency(excess)}</strong>
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block font-bold">Nội dung phiếu thu *</label>
                <input
                  type="text"
                  required
                  value={receiptContent}
                  onChange={(e) => setReceiptContent(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  Lưu & Xuất Phiếu thu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal In Phiếu thu Học phí chuẩn */}
      {printableReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-[#D4E8DB] bg-white p-8 shadow-xl">
            <div className="border-b-2 border-[#00543C] pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-[#00543C]">
                    {db.settings.centerFullName}
                  </div>
                  <div className="text-xs">Địa chỉ: {db.settings.address}</div>
                  <div className="text-xs">Điện thoại: {db.settings.phone}</div>
                </div>
                <div className="text-right text-xs tabular-nums">
                  <div className="font-bold">Số phiếu: {printableReceipt.receiptNumber}</div>
                  <div>Ngày: {formatDateVN(printableReceipt.paymentDate)}</div>
                </div>
              </div>
              <h2 className="mt-4 text-center text-2xl font-bold text-[#173B2C]">
                PHIẾU THU HỌC PHÍ
              </h2>
            </div>

            {(() => {
              const st = db.students.find((s) => s.code === printableReceipt.studentCode);
              return (
                <div className="my-5 space-y-2.5 text-sm">
                  <div>
                    Họ và tên học viên: <strong>{st?.fullName}</strong> (Mã HV:{' '}
                    <strong>{printableReceipt.studentCode}</strong>)
                  </div>
                  <div>
                    Họ tên phụ huynh: <strong>{st?.parentName}</strong> – SĐT:{' '}
                    <strong>{st?.phone}</strong>
                  </div>
                  <div>
                    Nội dung thu: <strong>{printableReceipt.content}</strong>
                  </div>
                  <div>
                    Hình thức thanh toán:{' '}
                    <strong>
                      {printableReceipt.paymentMethod === 'CK'
                        ? 'Chuyển khoản ngân hàng (CK)'
                        : 'Tiền mặt (TM)'}
                    </strong>
                  </div>
                  <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                    <div className="font-bold">Chi tiết phân bổ lớp & kỳ thu:</div>
                    {printableReceipt.allocations.map((a) => (
                      <div key={a.id} className="flex justify-between text-xs mt-1">
                        <span>
                          • Lớp {a.classCode} ({a.cycleName})
                        </span>
                        <strong className="tabular-nums">
                          {formatCurrency(a.allocatedAmount)}
                        </strong>
                      </div>
                    ))}
                    {printableReceipt.unallocatedCredit > 0 && (
                      <div className="mt-1 flex justify-between border-t border-[#D4E8DB] pt-1 text-xs font-bold text-[#00543C]">
                        <span>• Tiền dư ghi nhận trả trước kỳ sau:</span>
                        <span>{formatCurrency(printableReceipt.unallocatedCredit)}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 text-lg font-bold text-[#00543C]">
                    TỔNG SỐ TIỀN ĐÃ THU: {formatCurrency(printableReceipt.totalAmount)}
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 grid grid-cols-2 text-center text-sm">
              <div>
                <div className="font-bold">Người nộp tiền</div>
                <div className="mt-12 text-xs italic">(Ký, ghi rõ họ tên)</div>
              </div>
              <div>
                <div className="font-bold">Người lập phiếu thu</div>
                <div className="mt-12 font-bold">{printableReceipt.collectorName}</div>
              </div>
            </div>

            <div className="no-print mt-6 flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
              <button
                onClick={() => setPrintableReceipt(null)}
                className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
              >
                Đóng
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-5 py-2 font-bold text-white"
              >
                <Printer className="h-4 w-4" />
                In phiếu thu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tạo đợt phải thu học phí */}
      {isGenCycleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">Lập Đợt Phải thu Học phí mới</h3>
              <button onClick={() => setIsGenCycleOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleGenerateCycleReceivables} className="space-y-4 p-6 text-sm">
              <div>
                <label className="block font-bold">Tên đợt thu / Kỳ thu *</label>
                <input
                  type="text"
                  required
                  value={cycleName}
                  onChange={(e) => setCycleName(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold">Áp dụng cho Lớp</label>
                <select
                  value={cycleClassCode}
                  onChange={(e) => setCycleClassCode(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                >
                  <option value="ALL">Tất cả các lớp đang học</option>
                  {db.classes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} – {c.name} ({getBillingMethodLabel(c.billingMethod)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold">Từ ngày *</label>
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold">Đến ngày *</label>
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold">Hạn đóng học phí *</label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>
              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-xs">
                Hệ thống tự động lọc các buổi học chưa lập kỳ thu của từng đăng ký hợp lệ (học viên vào giữa kỳ chỉ tính từ ngày bắt đầu tính phí; nợ kỳ cũ chỉ hiển thị ở cột Số dư nợ đầu kỳ tham chiếu, không tạo lại khoản phải thu cũ tránh nhân đôi nợ).
              </div>
              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsGenCycleOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white"
                >
                  Tính & Lập khoản phải thu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Giao dịch Điều chỉnh / Hoàn phí */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">Lập Giao dịch Điều chỉnh / Hoàn học phí</h3>
              <button onClick={() => setIsAdjustModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAdjustment} className="space-y-4 p-6 text-sm">
              <div>
                <label className="block font-bold">Chọn Khoản phải thu cần điều chỉnh *</label>
                <select
                  value={adjReceivableId}
                  onChange={(e) => {
                    const rec = db.receivables.find((r) => r.id === e.target.value);
                    setAdjReceivableId(e.target.value);
                    if (rec) setAdjStudentCode(rec.studentCode);
                  }}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                >
                  {db.receivables.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} – HV {r.studentCode} – Lớp {r.classCode} (Phải thu:{' '}
                      {formatCurrency(r.netAmount)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold">Loại điều chỉnh *</label>
                <select
                  value={adjType}
                  onChange={(e) =>
                    setAdjType(e.target.value as FinancialAdjustment['type'])
                  }
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                >
                  <option value="DIEU_CHINH_GIAM">Điều chỉnh giảm phải thu (Miễn giảm bổ sung)</option>
                  <option value="DIEU_CHINH_TANG">Điều chỉnh tăng phải thu</option>
                  <option value="HOAN_PHI">Hoàn trả học phí cho học viên</option>
                </select>
              </div>
              <div>
                <label className="block font-bold">Số tiền điều chỉnh / hoàn phí (VNĐ) *</label>
                <input
                  type="number"
                  min={1000}
                  step={10000}
                  required
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold">Lý do điều chỉnh (Lưu lịch sử kiểm toán) *</label>
                <textarea
                  rows={2}
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  placeholder="Nhập rõ lý do duyệt điều chỉnh hoặc hoàn phí..."
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white"
                >
                  Xác nhận giao dịch điều chỉnh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
