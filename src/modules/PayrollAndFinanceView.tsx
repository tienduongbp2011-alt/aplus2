import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  CashflowCategory,
  CashflowTransaction,
  PayrollRecord,
} from '../types';
import {
  formatCurrency,
  formatDateVN,
  getCashflowCategoryLabel,
  getGroupLabel,
  getPayrollStatusLabel,
  getTodayISO,
} from '../utils/formatters';
import { calculateTeacherPayrollDraft } from '../services/businessLogic';
import { exportRowsToExcel } from '../utils/excelService';

export const PayrollAndFinanceView: React.FC<{
  mode: 'PAYROLL' | 'CASHFLOW';
}> = ({ mode }) => {
  const {
    db,
    currentAccount,
    savePayrollRecord,
    updatePayrollStatus,
    saveCashflow,
    notify,
  } = useApp();

  // State cho Lương giáo viên
  const [selectedPeriodMonth, setSelectedPeriodMonth] = useState('2026-10');
  const [selectedTeacherForCalc, setSelectedTeacherForCalc] = useState(
    db.teachers[0]?.code || 'VHGV001'
  );
  const [adjAmountDraft, setAdjAmountDraft] = useState(0);
  const [adjNoteDraft, setAdjNoteDraft] = useState('');
  const [detailPayroll, setDetailPayroll] = useState<PayrollRecord | null>(null);

  // State cho Doanh thu & Chi phí
  const [cfMonthFilter, setCfMonthFilter] = useState('2026-10');
  const [cfCategoryFilter, setCfCategoryFilter] = useState<'ALL' | CashflowCategory>('ALL');
  const [cfClassFilter, setCfClassFilter] = useState('ALL');
  const [cfTeacherFilter, setCfTeacherFilter] = useState('ALL');

  const [isAddCfOpen, setIsAddCfOpen] = useState(false);
  const [cfType, setCfType] = useState<'THU' | 'CHI'>('CHI');
  const [cfCategory, setCfCategory] = useState<CashflowCategory>('CHI_PHI_KHAC');
  const [cfDate, setCfDate] = useState(getTodayISO());
  const [cfAmount, setCfAmount] = useState(500000);
  const [cfMethod, setCfMethod] = useState<'TM' | 'CK'>('CK');
  const [cfDesc, setCfDesc] = useState('');

  // Dự thảo tính lương trực tiếp cho giáo viên đang chọn
  const teacherObj = db.teachers.find((t) => t.code === selectedTeacherForCalc);
  const draftLineItems = useMemo(() => {
    if (!teacherObj) return [];
    return calculateTeacherPayrollDraft(teacherObj, selectedPeriodMonth, db);
  }, [teacherObj, selectedPeriodMonth, db]);

  const draftBaseTotal = draftLineItems.reduce((s, li) => s + li.calculatedSalary, 0);
  const draftFinalTotal = Math.max(0, draftBaseTotal + Number(adjAmountDraft || 0));

  const handleCreatePayrollFromDraft = () => {
    if (!teacherObj) return;
    if (draftLineItems.length === 0) {
      notify(
        'Không có khoản thu phân bổ mới (VH) hoặc ca dạy mới (TATT) chưa tính lương trong kỳ này (ngăn tính lương 2 lần).',
        'WARNING'
      );
      return;
    }

    const code = `BL-${selectedPeriodMonth.replace('-', '')}-${String(
      db.payrolls.length + 1
    ).padStart(3, '0')}`;

    const newPayroll: PayrollRecord = {
      id: `PR-${Date.now()}`,
      code,
      periodName: `Kỳ lương bổ sung – Tháng ${selectedPeriodMonth.split('-').reverse().join('/')}`,
      periodMonth: selectedPeriodMonth,
      teacherCode: teacherObj.code,
      teacherName: teacherObj.fullName,
      group: teacherObj.group,
      createdAt: getTodayISO(),
      status: 'NHAP',
      lineItems: draftLineItems,
      baseSalaryTotal: draftBaseTotal,
      adjustmentAmount: Number(adjAmountDraft || 0),
      adjustmentNote: adjNoteDraft,
      finalSalary: draftFinalTotal,
      paidAmount: 0,
      remainingPayable: draftFinalTotal,
    };

    savePayrollRecord(newPayroll, false);
    setAdjAmountDraft(0);
    setAdjNoteDraft('');
  };

  // Tính toán 5 chỉ số tài chính chuẩn xác cho Phân hệ 12 (Doanh thu & Chi phí)
  const financeMetrics = useMemo(() => {
    const filteredCfs = db.cashflows.filter((c) => {
      if (cfMonthFilter && !c.date.startsWith(cfMonthFilter)) return false;
      if (cfCategoryFilter !== 'ALL' && c.category !== cfCategoryFilter) return false;
      if (cfClassFilter !== 'ALL' && c.classCode !== cfClassFilter) return false;
      if (cfTeacherFilter !== 'ALL' && c.teacherCode !== cfTeacherFilter) return false;
      return true;
    });

    const totalCashIn = filteredCfs
      .filter((c) => c.type === 'THU')
      .reduce((s, c) => s + c.amount, 0);
    const totalCashOut = filteredCfs
      .filter((c) => c.type === 'CHI')
      .reduce((s, c) => s + c.amount, 0);
    const cashDifference = totalCashIn - totalCashOut; // Chênh lệch thu–chi

    // Doanh thu học phí tương ứng các buổi đã thực hiện trong tháng đang chọn
    // (Nếu tháng có 8 buổi đã dạy thì học phí tương ứng 8 × 50.000 = 400.000đ/HV, không coi toàn bộ 800.000đ đóng trước là doanh thu 1 tháng!)
    const taughtSessionsInMonth = db.sessions.filter(
      (s) =>
        s.date.startsWith(cfMonthFilter) &&
        s.status === 'DA_DAY' &&
        !s.makeupForSessionId &&
        (cfClassFilter === 'ALL' || s.classCode === cfClassFilter)
    );

    let earnedRevenueFromTaughtSessions = 0;
    for (const ses of taughtSessionsInMonth) {
      const validEnrolls = db.enrollments.filter(
        (e) =>
          e.classCode === ses.classCode &&
          e.status === 'DANG_HOC' &&
          e.feeStartDate <= ses.date &&
          (!e.endDate || e.endDate >= ses.date)
      );
      for (const enr of validEnrolls) {
        const waived = db.attendance.some(
          (a) =>
            a.sessionId === ses.id &&
            a.studentCode === enr.studentCode &&
            a.feeWaivedForAbsence
        );
        if (!waived) {
          earnedRevenueFromTaughtSessions += enr.appliedFeePerSession || 50000;
        }
      }
    }

    // Tiền học viên trả trước (gồm creditBalance + phần tiền đã đóng vượt doanh thu buổi đã học)
    const studentCreditTotal = db.students.reduce(
      (s, st) => s + (st.creditBalance || 0),
      0
    );
    const unearnedTuitionFromAdvance = Math.max(
      0,
      db.receivables.reduce((s, r) => s + r.paidAmount, 0) - earnedRevenueFromTaughtSessions
    );
    const totalPrepaidAndUnearned = studentCreditTotal + unearnedTuitionFromAdvance;

    const totalReceivableDebt = db.receivables.reduce(
      (s, r) => s + r.remainingDebt,
      0
    );

    const salaryPaidTotal = db.payrolls.reduce((s, p) => s + p.paidAmount, 0);
    const salaryPayableRemaining = db.payrolls.reduce(
      (s, p) => s + p.remainingPayable,
      0
    );

    return {
      filteredCfs,
      totalCashIn,
      totalCashOut,
      cashDifference,
      taughtSessionCount: taughtSessionsInMonth.length,
      earnedRevenueFromTaughtSessions,
      totalPrepaidAndUnearned,
      studentCreditTotal,
      totalReceivableDebt,
      salaryPaidTotal,
      salaryPayableRemaining,
    };
  }, [
    db,
    cfMonthFilter,
    cfCategoryFilter,
    cfClassFilter,
    cfTeacherFilter,
  ]);

  const handleSaveManualCashflow = (e: React.FormEvent) => {
    e.preventDefault();
    if (cfAmount <= 0 || !cfDesc.trim()) {
      notify('Vui lòng nhập số tiền dương và nội dung giao dịch.', 'ERROR');
      return;
    }
    if (cfCategory === 'THU_HOC_PHI' || cfCategory === 'CHI_LUONG') {
      notify(
        'Khoản Thu học phí và Chi lương được tự động đồng bộ từ Phiếu thu và Bảng lương để tránh ghi nhận 2 lần.',
        'WARNING'
      );
      return;
    }
    const tx: CashflowTransaction = {
      id: `CF-MAN-${Date.now()}`,
      code: `TC-${cfType}-${String(db.cashflows.length + 1).padStart(3, '0')}`,
      date: cfDate,
      type: cfType,
      category: cfCategory,
      amount: Math.round(cfAmount),
      paymentMethod: cfMethod,
      description: cfDesc,
      createdBy: currentAccount.fullName,
    };
    saveCashflow(tx);
    setIsAddCfOpen(false);
    setCfDesc('');
  };

  // PHÂN HỆ 11: LƯƠNG GIÁO VIÊN
  if (mode === 'PAYROLL') {
    const visiblePayrolls = db.payrolls.filter((p) => {
      if (
        currentAccount.role === 'TEACHER' &&
        currentAccount.linkedTeacherCode &&
        p.teacherCode !== currentAccount.linkedTeacherCode
      ) {
        return false;
      }
      return true;
    });

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
          <div>
            <h2 className="text-2xl font-bold text-[#173B2C]">QUẢN LÝ LƯƠNG GIÁO VIÊN</h2>
            <p className="text-sm text-[#173B2C]/80">
              Văn hoá (VH): Học phí thực thu đã phân bổ × Tỷ lệ hưởng (có tính lương bổ sung khi thu nợ sau). Ngoại ngữ (TATT): Số ca thực dạy xác nhận × Đơn giá ca hiệu lực.
            </p>
          </div>
          <button
            onClick={() => {
              const rows = visiblePayrolls.map((p) => ({
                'Mã bảng lương': p.code,
                'Kỳ lương': p.periodName,
                'Mã GV': p.teacherCode,
                'Họ tên GV': p.teacherName,
                Nhóm: getGroupLabel(p.group),
                'Lương cơ sở (VNĐ)': p.baseSalaryTotal,
                'Điều chỉnh (VNĐ)': p.adjustmentAmount,
                'Tổng thực lĩnh (VNĐ)': p.finalSalary,
                'Đã trả (VNĐ)': p.paidAmount,
                'Còn phải trả (VNĐ)': p.remainingPayable,
                'Trạng thái': getPayrollStatusLabel(p.status),
              }));
              exportRowsToExcel(rows, 'Bang_Luong_Giao_Vien_APLUS2.xlsx', 'Bang_Luong');
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold hover:bg-[#F2FAF5]"
          >
            <Download className="h-4 w-4" />
            Xuất Excel Bảng lương
          </button>
        </div>

        {/* Khung lập bảng lương mới (Tự động quét các khoản phân bổ chưa tính lương hoặc ca dạy chưa chốt) */}
        {currentAccount.role !== 'TEACHER' && (
          <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs space-y-4">
            <h3 className="text-lg font-bold text-[#00543C]">
              Công cụ Tính & Lập Bảng lương tự động (Chống tính trùng 2 lần)
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4 text-sm">
              <div>
                <label className="block font-bold">Kỳ tháng tính lương</label>
                <input
                  type="month"
                  value={selectedPeriodMonth}
                  onChange={(e) => setSelectedPeriodMonth(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold">Chọn Giáo viên</label>
                <select
                  value={selectedTeacherForCalc}
                  onChange={(e) => setSelectedTeacherForCalc(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                >
                  {db.teachers.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.code} – {t.fullName} ({t.group})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold">Điều chỉnh cộng/trừ (VNĐ)</label>
                <input
                  type="number"
                  step={50000}
                  value={adjAmountDraft}
                  onChange={(e) => setAdjAmountDraft(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold">Ghi chú điều chỉnh</label>
                <input
                  type="text"
                  value={adjNoteDraft}
                  onChange={(e) => setAdjNoteDraft(e.target.value)}
                  placeholder="Thưởng chuyên cần / phụ cấp..."
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>
            </div>

            <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-sm">
              <div className="font-bold text-[#00543C]">
                Xem trước nguồn dữ liệu chưa chốt lương của GV {teacherObj?.fullName}:
              </div>
              {draftLineItems.length === 0 ? (
                <p className="mt-1 text-xs text-[#173B2C]/80">
                  Tất cả các khoản thu phân bổ / các ca dạy trong kỳ của giáo viên này đã được đưa vào bảng lương (hệ thống tự động chặn tính lương 2 lần). Nếu thu thêm nợ học phí của học viên (VD: thu nốt 300.000đ của HV002), khoản thu mới sẽ xuất hiện tại đây để tính lương bổ sung!
                </p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {draftLineItems.map((li) => (
                    <div
                      key={li.id}
                      className="flex items-center justify-between rounded bg-white p-2 text-xs"
                    >
                      <span>
                        <strong>Lớp {li.classCode}:</strong> {li.description}
                      </span>
                      <strong className="text-[#008653] tabular-nums">
                        {formatCurrency(li.calculatedSalary)}
                      </strong>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-[#D4E8DB] pt-2 font-bold">
                    <span>Tổng dự tính (Gồm điều chỉnh):</span>
                    <span className="text-lg text-[#00543C] tabular-nums">
                      {formatCurrency(draftFinalTotal)}
                    </span>
                  </div>
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleCreatePayrollFromDraft}
                  className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-xs font-bold text-white hover:bg-[#006B42]"
                >
                  <Plus className="h-4 w-4" />
                  Tạo bảng lương Nháp từ nguồn trên
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bảng danh sách Bảng lương & Quy trình Nháp -> Chờ duyệt -> Đã duyệt -> Đã thanh toán */}
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Mã bảng lương</th>
                <th className="p-3">Kỳ lương</th>
                <th className="p-3">Giáo viên & Nhóm</th>
                <th className="p-3">Chi tiết nguồn tính</th>
                <th className="p-3 text-right">Tổng lương</th>
                <th className="p-3 text-right">Đã trả</th>
                <th className="p-3 text-right">Còn phải trả</th>
                <th className="p-3">Quy trình trạng thái</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {visiblePayrolls.map((p) => (
                <tr key={p.id} className="hover:bg-[#F2FAF5]/70">
                  <td className="p-3 font-bold text-[#00543C]">{p.code}</td>
                  <td className="p-3">
                    <div className="font-bold">{p.periodName}</div>
                    {p.lockedAt && (
                      <div className="text-xs text-[#173B2C]/70">
                        Chốt ngày: {formatDateVN(p.lockedAt)}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-bold">{p.teacherName}</div>
                    <div className="text-xs font-bold text-[#008653]">
                      {p.teacherCode} · {getGroupLabel(p.group)}
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {p.lineItems.map((li) => (
                      <div key={li.id}>• {li.description}</div>
                    ))}
                  </td>
                  <td className="p-3 text-right font-bold text-[#00543C] tabular-nums">
                    {formatCurrency(p.finalSalary)}
                  </td>
                  <td className="p-3 text-right font-bold text-[#008653] tabular-nums">
                    {formatCurrency(p.paidAmount)}
                  </td>
                  <td className="p-3 text-right font-bold text-red-600 tabular-nums">
                    {formatCurrency(p.remainingPayable)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`font-bold ${
                        p.status === 'DA_THANH_TOAN'
                          ? 'text-[#008653]'
                          : p.status === 'DA_DUYET'
                            ? 'text-[#00543C]'
                            : 'text-amber-700'
                      }`}
                    >
                      {getPayrollStatusLabel(p.status)}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1">
                      <button
                        onClick={() => setDetailPayroll(p)}
                        className="rounded border border-[#D4E8DB] px-2 py-1 text-xs font-bold hover:bg-[#F2FAF5]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {p.status === 'NHAP' && (
                        <button
                          onClick={() => updatePayrollStatus(p.id, 'CHO_DUYET')}
                          className="rounded bg-amber-600 px-2.5 py-1 text-xs font-bold text-white"
                        >
                          Gửi duyệt
                        </button>
                      )}
                      {p.status === 'CHO_DUYET' && (
                        <button
                          onClick={() => updatePayrollStatus(p.id, 'DA_DUYET')}
                          className="rounded bg-[#00543C] px-2.5 py-1 text-xs font-bold text-white"
                        >
                          Duyệt lương
                        </button>
                      )}
                      {p.status === 'DA_DUYET' && (
                        <button
                          onClick={() => updatePayrollStatus(p.id, 'DA_THANH_TOAN')}
                          className="rounded bg-[#008653] px-2.5 py-1 text-xs font-bold text-white"
                        >
                          Chi thanh toán
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Chi tiết phiếu lương */}
        {detailPayroll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
              <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
                <h3 className="text-xl font-bold">
                  Chi tiết Bảng lương: {detailPayroll.code} ({detailPayroll.teacherName})
                </h3>
                <button onClick={() => setDetailPayroll(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-6 text-sm">
                <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                  <div>
                    Giáo viên: <strong>{detailPayroll.teacherName}</strong> ({detailPayroll.teacherCode}) · Nhóm:{' '}
                    <strong>{getGroupLabel(detailPayroll.group)}</strong>
                  </div>
                  <div>
                    Kỳ lương: <strong>{detailPayroll.periodName}</strong> · Trạng thái:{' '}
                    <strong className="text-[#008653]">
                      {getPayrollStatusLabel(detailPayroll.status)}
                    </strong>
                  </div>
                </div>
                <table className="w-full border-collapse border border-[#D4E8DB] text-sm">
                  <thead className="bg-[#F2FAF5]">
                    <tr>
                      <th className="border border-[#D4E8DB] p-2.5">Lớp</th>
                      <th className="border border-[#D4E8DB] p-2.5">Diễn giải nguồn tính</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-right">Cơ sở tính</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-right">Mức hưởng</th>
                      <th className="border border-[#D4E8DB] p-2.5 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailPayroll.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td className="border border-[#D4E8DB] p-2.5 font-bold">
                          {li.classCode}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5">{li.description}</td>
                        <td className="border border-[#D4E8DB] p-2.5 text-right tabular-nums">
                          {detailPayroll.group === 'VH'
                            ? formatCurrency(li.basisAmountOrShifts)
                            : `${li.basisAmountOrShifts} ca`}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 text-right tabular-nums">
                          {detailPayroll.group === 'VH'
                            ? `${li.rateApplied}%`
                            : formatCurrency(li.rateApplied)}
                        </td>
                        <td className="border border-[#D4E8DB] p-2.5 text-right font-bold text-[#008653] tabular-nums">
                          {formatCurrency(li.calculatedSalary)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PHÂN HỆ 12: DOANH THU & CHI PHÍ
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">QUẢN LÝ DOANH THU & CHI PHÍ</h2>
          <p className="text-sm text-[#173B2C]/80">
            Phân biệt rõ Tiền thực thu/thực chi theo ngày giao dịch, Doanh thu học phí theo buổi đã thực hiện, Tiền học viên trả trước, Công nợ và Lương phải trả.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const rows = financeMetrics.filteredCfs.map((c) => ({
                'Mã GD': c.code,
                'Ngày GD': formatDateVN(c.date),
                'Loại': c.type === 'THU' ? 'Thu' : 'Chi',
                'Khoản mục': getCashflowCategoryLabel(c.category),
                'Số tiền (VNĐ)': c.amount,
                'Phương thức': c.paymentMethod,
                'Lớp liên quan': c.classCode || '',
                'Diễn giải': c.description,
                'Người lập': c.createdBy,
              }));
              exportRowsToExcel(rows, 'So_Thu_Chi_APLUS2.xlsx', 'Thu_Chi');
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold"
          >
            <Download className="h-4 w-4" />
            Xuất Excel Sổ Thu–Chi
          </button>
          <button
            onClick={() => setIsAddCfOpen(true)}
            className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            <Plus className="h-4 w-4" />
            Ghi nhận Thu khác / Chi phí vận hành
          </button>
        </div>
      </div>

      {/* 5 Thẻ phân biệt rõ các chỉ số tài chính theo đúng yêu cầu mục 14 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
          <div className="text-xs font-bold text-[#173B2C]/70">
            1. THỰC THU / THỰC CHI ({cfMonthFilter})
          </div>
          <div className="mt-1 text-lg font-bold text-[#008653] tabular-nums">
            Thu: {formatCurrency(financeMetrics.totalCashIn)}
          </div>
          <div className="text-sm font-bold text-amber-700 tabular-nums">
            Chi: {formatCurrency(financeMetrics.totalCashOut)}
          </div>
          <div className="mt-1 border-t border-[#D4E8DB] pt-1 text-xs font-bold">
            Chênh lệch thu–chi:{' '}
            <span className="text-[#00543C]">
              {formatCurrency(financeMetrics.cashDifference)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
          <div className="text-xs font-bold text-[#173B2C]/70">
            2. DOANH THU HỌC PHÍ THEO BUỔI ĐÃ DẠY
          </div>
          <div className="mt-1 text-xl font-bold text-[#00543C] tabular-nums">
            {formatCurrency(financeMetrics.earnedRevenueFromTaughtSessions)}
          </div>
          <div className="mt-1 text-xs text-[#173B2C]/75">
            Tính trên {financeMetrics.taughtSessionCount} buổi đã thực hiện trong tháng (VD: 8 buổi = 400.000đ/HV).
          </div>
        </div>

        <div className="rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
          <div className="text-xs font-bold text-[#173B2C]/70">
            3. TIỀN HỌC VIÊN TRẢ TRƯỚC & CHƯA SỬ DỤNG
          </div>
          <div className="mt-1 text-xl font-bold text-[#008653] tabular-nums">
            {formatCurrency(financeMetrics.totalPrepaidAndUnearned)}
          </div>
          <div className="mt-1 text-xs text-[#173B2C]/75">
            Gồm tiền dư trả trước ({formatCurrency(financeMetrics.studentCreditTotal)}) + học phí đóng trước các buổi chưa học.
          </div>
        </div>

        <div className="rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
          <div className="text-xs font-bold text-[#173B2C]/70">
            4. TỔNG CÔNG NỢ HỌC PHÍ PHẢI THU
          </div>
          <div className="mt-1 text-xl font-bold text-red-600 tabular-nums">
            {formatCurrency(financeMetrics.totalReceivableDebt)}
          </div>
          <div className="mt-1 text-xs text-[#173B2C]/75">
            Các khoản phải thu học viên chưa đóng hoặc đóng một phần.
          </div>
        </div>

        <div className="rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
          <div className="text-xs font-bold text-[#173B2C]/70">
            5. LƯƠNG PHẢI TRẢ & ĐÃ TRẢ
          </div>
          <div className="mt-1 text-base font-bold text-[#008653] tabular-nums">
            Đã trả: {formatCurrency(financeMetrics.salaryPaidTotal)}
          </div>
          <div className="text-base font-bold text-amber-700 tabular-nums">
            Còn phải trả: {formatCurrency(financeMetrics.salaryPayableRemaining)}
          </div>
        </div>
      </div>

      {/* Bộ lọc Thời gian, Khoản mục, Lớp, Giáo viên */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="mr-2 font-bold">Tháng giao dịch:</span>
            <input
              type="month"
              value={cfMonthFilter}
              onChange={(e) => setCfMonthFilter(e.target.value)}
              className="rounded border border-[#D4E8DB] px-3 py-1.5 font-bold"
            />
          </div>

          <select
            value={cfCategoryFilter}
            onChange={(e) =>
              setCfCategoryFilter(e.target.value as 'ALL' | CashflowCategory)
            }
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 font-bold"
          >
            <option value="ALL">Tất cả loại khoản mục</option>
            <option value="THU_HOC_PHI">Thu học phí</option>
            <option value="THU_KHAC">Thu khác</option>
            <option value="HOAN_HOC_PHI">Hoàn học phí</option>
            <option value="CHI_LUONG">Chi lương</option>
            <option value="THUE_DIA_DIEM">Thuê địa điểm</option>
            <option value="DIEN_NUOC_INTERNET">Điện, nước, internet</option>
            <option value="TAI_LIEU_THIET_BI">Tài liệu và thiết bị</option>
            <option value="CHI_PHI_KHAC">Chi phí khác</option>
          </select>

          <select
            value={cfClassFilter}
            onChange={(e) => setCfClassFilter(e.target.value)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 font-bold"
          >
            <option value="ALL">Mọi lớp học</option>
            {db.classes.map((c) => (
              <option key={c.code} value={c.code}>
                Lớp {c.code} – {c.name}
              </option>
            ))}
          </select>

          <select
            value={cfTeacherFilter}
            onChange={(e) => setCfTeacherFilter(e.target.value)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 font-bold"
          >
            <option value="ALL">Mọi giáo viên</option>
            {db.teachers.map((t) => (
              <option key={t.code} value={t.code}>
                GV {t.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="font-bold text-[#00543C]">
          Chênh lệch thu–chi kỳ lọc:{' '}
          <span
            className={
              financeMetrics.cashDifference >= 0 ? 'text-[#008653]' : 'text-red-600'
            }
          >
            {formatCurrency(financeMetrics.cashDifference)}
          </span>
        </div>
      </div>

      {/* Bảng sổ giao dịch Thu - Chi */}
      <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#00543C] text-white">
              <th className="p-3">Mã giao dịch</th>
              <th className="p-3">Ngày giao dịch</th>
              <th className="p-3">Loại</th>
              <th className="p-3">Khoản mục</th>
              <th className="p-3 text-right">Số tiền (VNĐ)</th>
              <th className="p-3">Phương thức</th>
              <th className="p-3">Diễn giải & Liên kết nguồn</th>
              <th className="p-3">Người thực hiện</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D4E8DB]">
            {financeMetrics.filteredCfs.map((c) => (
              <tr key={c.id} className="hover:bg-[#F2FAF5]/70">
                <td className="p-3 font-bold text-[#00543C]">{c.code}</td>
                <td className="p-3 tabular-nums">{formatDateVN(c.date)}</td>
                <td className="p-3">
                  <span
                    className={`font-bold ${
                      c.type === 'THU' ? 'text-[#008653]' : 'text-amber-700'
                    }`}
                  >
                    {c.type === 'THU' ? 'THU TIỀN' : 'CHI TIỀN'}
                  </span>
                </td>
                <td className="p-3 font-bold">{getCashflowCategoryLabel(c.category)}</td>
                <td
                  className={`p-3 text-right font-bold tabular-nums ${
                    c.type === 'THU' ? 'text-[#008653]' : 'text-amber-700'
                  }`}
                >
                  {c.type === 'THU' ? '+' : '-'}
                  {formatCurrency(c.amount)}
                </td>
                <td className="p-3 font-bold">{c.paymentMethod}</td>
                <td className="p-3 text-xs">
                  <div>{c.description}</div>
                  {c.linkedReceiptId && (
                    <span className="text-[#008653] font-bold">
                      [Đồng bộ tự động từ Phiếu thu – Không ghi trùng]
                    </span>
                  )}
                  {c.linkedPayrollId && (
                    <span className="text-[#00543C] font-bold">
                      [Đồng bộ tự động từ Bảng lương – Không ghi trùng]
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs">{c.createdBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm giao dịch Thu khác / Chi phí vận hành */}
      {isAddCfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">Ghi nhận Khoản Thu khác / Chi phí vận hành</h3>
              <button onClick={() => setIsAddCfOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveManualCashflow} className="space-y-4 p-6 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold">Loại giao dịch *</label>
                  <select
                    value={cfType}
                    onChange={(e) => {
                      const t = e.target.value as 'THU' | 'CHI';
                      setCfType(t);
                      setCfCategory(t === 'THU' ? 'THU_KHAC' : 'THUE_DIA_DIEM');
                    }}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    <option value="CHI">Khoản Chi</option>
                    <option value="THU">Khoản Thu khác</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold">Khoản mục *</label>
                  <select
                    value={cfCategory}
                    onChange={(e) => setCfCategory(e.target.value as CashflowCategory)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    {cfType === 'THU' ? (
                      <option value="THU_KHAC">Thu khác (Giáo trình, lệ phí...)</option>
                    ) : (
                      <>
                        <option value="THUE_DIA_DIEM">Thuê địa điểm</option>
                        <option value="DIEN_NUOC_INTERNET">Điện, nước, internet</option>
                        <option value="TAI_LIEU_THIET_BI">Tài liệu và thiết bị</option>
                        <option value="CHI_PHI_KHAC">Chi phí khác</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-bold">Ngày giao dịch *</label>
                  <input
                    type="date"
                    required
                    value={cfDate}
                    onChange={(e) => setCfDate(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold">Số tiền (VNĐ) *</label>
                  <input
                    type="number"
                    min={1000}
                    step={10000}
                    required
                    value={cfAmount}
                    onChange={(e) => setCfAmount(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold">Hình thức thanh toán</label>
                <select
                  value={cfMethod}
                  onChange={(e) => setCfMethod(e.target.value as 'TM' | 'CK')}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                >
                  <option value="CK">Chuyển khoản (CK)</option>
                  <option value="TM">Tiền mặt (TM)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold">Nội dung chi tiết *</label>
                <input
                  type="text"
                  required
                  value={cfDesc}
                  onChange={(e) => setCfDesc(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddCfOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white"
                >
                  Lưu giao dịch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
