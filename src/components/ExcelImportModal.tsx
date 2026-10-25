import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  downloadExcelTemplate,
  exportFailedImportRows,
  ImportEntityType,
  parseAndValidateExcelFile,
  ValidatedImportRow,
} from '../utils/excelService';
import { useApp } from '../context/AppContext';
import { ClassInfo, ClassSession, Enrollment, Student, Teacher } from '../types';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: ImportEntityType;
  title: string;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  entityType,
  title,
}) => {
  const { db, updateDb, notify } = useApp();
  const [rows, setRows] = useState<ValidatedImportRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [duplicateMode, setDuplicateMode] = useState<'SKIP' | 'UPDATE'>('UPDATE');
  const [importResult, setImportResult] = useState<{
    done: boolean;
    successCount: number;
    skippedCount: number;
    failedCount: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    try {
      const validated = await parseAndValidateExcelFile(file, entityType, db);
      setRows(validated);
    } catch {
      notify('Không thể đọc tệp Excel. Vui lòng chọn tệp định dạng .xlsx hợp lệ.', 'ERROR');
    }
  };

  const validRows = rows.filter((r) => r.isValid);
  const failedRows = rows.filter((r) => !r.isValid);

  const handleConfirmImport = () => {
    let successCount = 0;
    let skippedCount = 0;

    updateDb(
      (prev) => {
        const next = { ...prev };

        if (entityType === 'TEACHERS') {
          const list = [...next.teachers];
          for (const row of validRows) {
            const item = row.parsed as unknown as Teacher;
            const idx = list.findIndex((t) => t.code === item.code);
            if (idx >= 0) {
              if (duplicateMode === 'SKIP') {
                skippedCount++;
                continue;
              }
              list[idx] = { ...list[idx], ...item, rateHistory: list[idx].rateHistory };
              successCount++;
            } else {
              list.push(item);
              successCount++;
            }
          }
          next.teachers = list;
        } else if (entityType === 'CLASSES') {
          const list = [...next.classes];
          for (const row of validRows) {
            const item = row.parsed as unknown as ClassInfo;
            const idx = list.findIndex((c) => c.code === item.code);
            if (idx >= 0) {
              if (duplicateMode === 'SKIP') {
                skippedCount++;
                continue;
              }
              list[idx] = { ...list[idx], ...item };
              successCount++;
            } else {
              list.push(item);
              successCount++;
            }
          }
          next.classes = list;
        } else if (entityType === 'STUDENTS') {
          const list = [...next.students];
          for (const row of validRows) {
            const item = row.parsed as unknown as Student;
            const idx = list.findIndex((s) => s.code === item.code);
            if (idx >= 0) {
              if (duplicateMode === 'SKIP') {
                skippedCount++;
                continue;
              }
              list[idx] = { ...list[idx], ...item, creditBalance: list[idx].creditBalance };
              successCount++;
            } else {
              list.push(item);
              successCount++;
            }
          }
          next.students = list;
        } else if (entityType === 'ENROLLMENTS') {
          const list = [...next.enrollments];
          for (const row of validRows) {
            const item = row.parsed as unknown as Enrollment;
            list.unshift(item);
            successCount++;
          }
          next.enrollments = list;
        } else if (entityType === 'SESSIONS') {
          const list = [...next.sessions];
          for (const row of validRows) {
            const item = row.parsed as unknown as ClassSession;
            list.push(item);
            successCount++;
          }
          next.sessions = list;
        }

        return next;
      },
      {
        action: `NHẬP EXCEL (${entityType})`,
        target: fileName,
        detail: `Thành công: ${successCount} dòng, Bỏ qua: ${skippedCount} dòng, Lỗi: ${failedRows.length} dòng.`,
      }
    );

    setImportResult({
      done: true,
      successCount,
      skippedCount,
      failedCount: failedRows.length,
    });
    notify(
      `Nhập Excel hoàn tất: ${successCount} dòng thành công, ${failedRows.length} dòng lỗi.`,
      failedRows.length > 0 ? 'WARNING' : 'SUCCESS'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4E8DB] bg-[#00543C] px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            <h3 className="text-xl font-bold">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Bước 1 & 2 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] p-4">
              <div className="font-bold text-[#173B2C]">1. Tải tệp mẫu chuẩn (.xlsx)</div>
              <p className="mt-1 text-sm text-[#173B2C]/80">
                Tệp mẫu có sẵn tiêu đề tiếng Việt, dòng dữ liệu ví dụ và trang hướng dẫn quy tắc kiểm tra. Giữ nguyên số 0 đầu số điện thoại và liên kết bằng mã định danh.
              </p>
              <button
                onClick={() => downloadExcelTemplate(entityType)}
                className="mt-3 inline-flex items-center gap-2 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
              >
                <Download className="h-4 w-4" />
                Tải xuống mẫu Excel (.xlsx)
              </button>
            </div>

            <div className="rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] p-4">
              <div className="font-bold text-[#173B2C]">2. Chọn tệp Excel cần nhập & Tuỳ chọn trùng mã</div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="dupMode"
                    checked={duplicateMode === 'UPDATE'}
                    onChange={() => setDuplicateMode('UPDATE')}
                  />
                  <span>Cập nhật khi mã đã tồn tại</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="dupMode"
                    checked={duplicateMode === 'SKIP'}
                    onChange={() => setDuplicateMode('SKIP')}
                  />
                  <span>Bỏ qua khi mã đã tồn tại</span>
                </label>
              </div>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded border border-[#008653] bg-white px-4 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]">
                <Upload className="h-4 w-4" />
                <span>{fileName ? `Đã chọn: ${fileName}` : 'Chọn tệp .xlsx từ máy tính'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Kết quả sau xác nhận */}
          {importResult && (
            <div className="rounded-lg border border-[#008653] bg-[#F2FAF5] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#00543C]">Kết quả ghi nhận dữ liệu:</h4>
                  <p className="mt-1 text-sm">
                    Thành công: <strong className="text-[#008653]">{importResult.successCount} dòng</strong> ·
                    Bỏ qua: <strong>{importResult.skippedCount} dòng</strong> ·
                    Thất bại (lỗi): <strong className="text-red-600">{importResult.failedCount} dòng</strong>
                  </p>
                </div>
                {failedRows.length > 0 && (
                  <button
                    onClick={() => exportFailedImportRows(failedRows, entityType)}
                    className="inline-flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
                  >
                    <Download className="h-4 w-4" />
                    Xuất tệp các dòng lỗi (.xlsx)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bảng xem trước & kiểm tra từng dòng */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold">
                  Xem trước & kiểm tra từng dòng ({rows.length} dòng):{' '}
                  <span className="text-[#008653]">{validRows.length} hợp lệ</span> ·{' '}
                  <span className="text-red-600">{failedRows.length} lỗi</span>
                </div>
                {failedRows.length > 0 && (
                  <button
                    onClick={() => exportFailedImportRows(failedRows, entityType)}
                    className="inline-flex items-center gap-1.5 rounded border border-red-600 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải tệp dòng lỗi (.xlsx)
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-auto rounded border border-[#D4E8DB]">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-[#00543C] text-white">
                    <tr>
                      <th className="p-2.5">Dòng</th>
                      <th className="p-2.5">Trạng thái</th>
                      <th className="p-2.5">Dữ liệu đọc được</th>
                      <th className="p-2.5">Chi tiết kiểm tra / Cảnh báo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D4E8DB]">
                    {rows.map((r) => (
                      <tr key={r.rowIndex} className={r.isValid ? 'bg-white' : 'bg-red-50/70'}>
                        <td className="p-2.5 font-bold tabular-nums">#{r.rowIndex}</td>
                        <td className="p-2.5">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[#008653]">
                              <CheckCircle2 className="h-4 w-4" />
                              Hợp lệ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-red-600">
                              <XCircle className="h-4 w-4" />
                              Lỗi
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-xs">
                          {Object.entries(r.raw)
                            .slice(0, 5)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' | ')}
                        </td>
                        <td className="p-2.5 text-xs">
                          {r.errors.length > 0 && (
                            <div className="font-bold text-red-600">{r.errors.join('; ')}</div>
                          )}
                          {r.warnings.length > 0 && (
                            <div className="flex items-center gap-1 text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>{r.warnings.join('; ')}</span>
                            </div>
                          )}
                          {r.errors.length === 0 && r.warnings.length === 0 && (
                            <span className="text-[#008653]">Đạt tất cả điều kiện kiểm tra</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#D4E8DB] bg-[#F2FAF5] px-6 py-3">
          <button
            onClick={onClose}
            className="rounded border border-[#D4E8DB] bg-white px-4 py-2 font-bold text-[#173B2C] hover:bg-gray-50"
          >
            Đóng
          </button>
          <button
            disabled={validRows.length === 0 || Boolean(importResult?.done)}
            onClick={handleConfirmImport}
            className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Xác nhận nhập {validRows.length} dòng hợp lệ
          </button>
        </div>
      </div>
    </div>
  );
};
