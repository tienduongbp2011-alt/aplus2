import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info, Save, UserCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AttendanceRecord, AttendanceStatus } from '../types';
import {
  formatDateTimeVN,
  formatDateVN,
  getAttendanceStatusLabel,
  getSessionStatusLabel,
} from '../utils/formatters';

export const AttendanceView: React.FC = () => {
  const { db, currentAccount, saveAttendanceBatch } = useApp();

  const [selectedClassCode, setSelectedClassCode] = useState(
    db.classes[0]?.code || 'TOAN6A'
  );

  const classSessions = useMemo(() => {
    return db.sessions
      .filter((s) => s.classCode === selectedClassCode)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db.sessions, selectedClassCode]);

  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    () => classSessions[0]?.id || ''
  );

  useEffect(() => {
    if (classSessions.length > 0 && !classSessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(classSessions[0].id);
    }
  }, [classSessions, selectedSessionId]);

  const currentSession = classSessions.find((s) => s.id === selectedSessionId) || null;

  // Chỉ hiện học viên có đăng ký hợp lệ vào ngày học đó (feeStartDate <= session.date && (!endDate || endDate >= session.date))
  const validEnrolledStudents = useMemo(() => {
    if (!currentSession) return [];
    return db.enrollments
      .filter(
        (e) =>
          e.classCode === selectedClassCode &&
          e.status === 'DANG_HOC' &&
          e.feeStartDate <= currentSession.date &&
          (!e.endDate || e.endDate >= currentSession.date)
      )
      .map((e) => {
        const st = db.students.find((s) => s.code === e.studentCode);
        return {
          enrollment: e,
          student: st,
        };
      })
      .filter((x) => Boolean(x.student));
  }, [db.enrollments, db.students, selectedClassCode, currentSession]);

  const [draftMap, setDraftMap] = useState<
    Record<
      string,
      {
        status: AttendanceStatus;
        note: string;
        feeWaivedForAbsence: boolean;
        updatedBy?: string;
        updatedAt?: string;
      }
    >
  >({});

  useEffect(() => {
    if (!currentSession) return;
    const next: typeof draftMap = {};
    for (const item of validEnrolledStudents) {
      const code = item.enrollment.studentCode;
      const existing = db.attendance.find(
        (a) => a.sessionId === currentSession.id && a.studentCode === code
      );
      next[code] = {
        status: existing?.status || 'CO_MAT',
        note: existing?.note || '',
        feeWaivedForAbsence: Boolean(existing?.feeWaivedForAbsence),
        updatedBy: existing?.updatedBy,
        updatedAt: existing?.updatedAt,
      };
    }
    setDraftMap(next);
  }, [currentSession, validEnrolledStudents, db.attendance]);

  const handleSave = () => {
    if (!currentSession) return;
    const nowISO = new Date().toISOString();
    const records: AttendanceRecord[] = validEnrolledStudents.map((item) => {
      const code = item.enrollment.studentCode;
      const d = draftMap[code] || {
        status: 'CO_MAT',
        note: '',
        feeWaivedForAbsence: false,
      };
      return {
        id: `ATT-${currentSession.id}-${code}`,
        sessionId: currentSession.id,
        classCode: selectedClassCode,
        date: currentSession.date,
        studentCode: code,
        status: d.status,
        feeWaivedForAbsence: d.feeWaivedForAbsence,
        note: d.note,
        updatedBy: currentAccount.fullName,
        updatedAt: nowISO,
      };
    });
    saveAttendanceBatch(records);
  };

  // Thống kê chuyên cần toàn lớp
  const classStats = useMemo(() => {
    const records = db.attendance.filter((a) => a.classCode === selectedClassCode);
    return {
      total: records.length,
      present: records.filter((r) => r.status === 'CO_MAT').length,
      excused: records.filter((r) => r.status === 'VANG_CO_PHEP').length,
      unexcused: records.filter((r) => r.status === 'VANG_KHONG_PHEP').length,
      late: records.filter((r) => r.status === 'DI_MUON').length,
      makeup: records.filter((r) => r.status === 'HOC_BU').length,
    };
  }, [db.attendance, selectedClassCode]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">ĐIỂM DANH CHUYÊN CẦN</h2>
          <p className="text-sm text-[#173B2C]/80">
            Chỉ hiển thị học viên có đăng ký hợp lệ vào ngày học được chọn. Lưu người thực hiện, thời gian cập nhật và chính sách học phí khi vắng.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!currentSession || validEnrolledStudents.length === 0}
          className="inline-flex items-center gap-2 rounded bg-[#008653] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#006B42] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          Lưu bảng điểm danh buổi học
        </button>
      </div>

      {/* Chính sách tính học phí khi vắng */}
      <div className="flex items-start gap-3 rounded-lg border border-[#D4E8DB] bg-[#F2FAF5] p-4 text-sm">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#008653]" />
        <div>
          <span className="font-bold text-[#00543C]">
            Chính sách tính học phí khi vắng mặt:
          </span>{' '}
          {db.settings.absencePolicyNote}
        </div>
      </div>

      {/* Bộ chọn Lớp & Ngày học */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs md:grid-cols-3">
        <div>
          <label className="block text-sm font-bold text-[#173B2C]">1. Chọn Lớp học</label>
          <select
            value={selectedClassCode}
            onChange={(e) => setSelectedClassCode(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4E8DB] bg-white px-3 py-2 font-bold"
          >
            {db.classes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} – {c.name} ({c.subject})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-bold text-[#173B2C]">
            2. Chọn Buổi học / Ngày học của lớp {selectedClassCode}
          </label>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="mt-1 w-full rounded border border-[#D4E8DB] bg-white px-3 py-2 font-bold"
          >
            {classSessions.map((s) => (
              <option key={s.id} value={s.id}>
                Ngày {formatDateVN(s.date)} ({s.startTime}–{s.endTime}) – Phòng {s.roomCode} –{' '}
                {getSessionStatusLabel(s.status)} – {s.topic || s.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bảng điểm danh */}
      <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D4E8DB] bg-[#F2FAF5] px-4 py-3 text-sm">
          <div className="font-bold text-[#00543C]">
            Danh sách học viên có đăng ký hợp lệ vào ngày{' '}
            {currentSession ? formatDateVN(currentSession.date) : '—'} (
            {validEnrolledStudents.length} học viên)
          </div>
          <button
            type="button"
            onClick={() => {
              const next = { ...draftMap };
              Object.keys(next).forEach((k) => {
                next[k] = { ...next[k], status: 'CO_MAT' };
              });
              setDraftMap(next);
            }}
            className="inline-flex items-center gap-1 rounded border border-[#008653] bg-white px-3 py-1 text-xs font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đánh dấu tất cả Có mặt
          </button>
        </div>

        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#00543C] text-white">
              <th className="p-3">Mã HV</th>
              <th className="p-3">Họ và tên học viên</th>
              <th className="p-3">Ngày bắt đầu tính phí</th>
              <th className="p-3">Trạng thái điểm danh</th>
              <th className="p-3">Chính sách phí buổi vắng</th>
              <th className="p-3">Ghi chú chuyên cần</th>
              <th className="p-3">Người thực hiện / Cập nhật</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D4E8DB]">
            {validEnrolledStudents.map(({ enrollment, student }) => {
              if (!student) return null;
              const d = draftMap[student.code] || {
                status: 'CO_MAT' as AttendanceStatus,
                note: '',
                feeWaivedForAbsence: false,
              };
              const isAbsent =
                d.status === 'VANG_CO_PHEP' || d.status === 'VANG_KHONG_PHEP';

              return (
                <tr key={student.code} className="hover:bg-[#F2FAF5]/60">
                  <td className="p-3 font-bold text-[#00543C]">{student.code}</td>
                  <td className="p-3">
                    <div className="font-bold text-base">{student.fullName}</div>
                    <div className="text-xs text-[#173B2C]/75">
                      PH: {student.parentName} ({student.phone})
                    </div>
                  </td>
                  <td className="p-3 tabular-nums">{formatDateVN(enrollment.feeStartDate)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['CO_MAT', 'Có mặt'],
                          ['VANG_CO_PHEP', 'Vắng có phép'],
                          ['VANG_KHONG_PHEP', 'Vắng không phép'],
                          ['DI_MUON', 'Đi muộn'],
                          ['HOC_BU', 'Học bù'],
                        ] as [AttendanceStatus, string][]
                      ).map(([stKey, stLabel]) => (
                        <button
                          key={stKey}
                          type="button"
                          onClick={() =>
                            setDraftMap({
                              ...draftMap,
                              [student.code]: { ...d, status: stKey },
                            })
                          }
                          className={`rounded border px-2.5 py-1 text-xs font-bold transition ${
                            d.status === stKey
                              ? stKey === 'VANG_KHONG_PHEP'
                                ? 'border-red-600 bg-red-600 text-white'
                                : stKey === 'VANG_CO_PHEP' || stKey === 'DI_MUON'
                                  ? 'border-amber-600 bg-amber-600 text-white'
                                  : 'border-[#008653] bg-[#008653] text-white'
                              : 'border-[#D4E8DB] bg-white text-[#173B2C] hover:bg-[#F2FAF5]'
                          }`}
                        >
                          {stLabel}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {isAbsent ? (
                      <label className="flex items-center gap-1.5 font-bold text-amber-800">
                        <input
                          type="checkbox"
                          checked={d.feeWaivedForAbsence}
                          onChange={(e) =>
                            setDraftMap({
                              ...draftMap,
                              [student.code]: {
                                ...d,
                                feeWaivedForAbsence: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>Duyệt miễn phí buổi vắng này</span>
                      </label>
                    ) : (
                      <span className="text-[#173B2C]/70">Tính phí bình thường</span>
                    )}
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={d.note}
                      onChange={(e) =>
                        setDraftMap({
                          ...draftMap,
                          [student.code]: { ...d, note: e.target.value },
                        })
                      }
                      placeholder="Ghi chú lý do vắng / nhận xét..."
                      className="w-full rounded border border-[#D4E8DB] px-2.5 py-1 text-xs"
                    />
                  </td>
                  <td className="p-3 text-xs text-[#173B2C]/80">
                    {d.updatedBy ? (
                      <div>
                        <div className="font-bold">{d.updatedBy}</div>
                        <div className="tabular-nums">{formatDateTimeVN(d.updatedAt)}</div>
                      </div>
                    ) : (
                      <span>Chưa lưu</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Thống kê chuyên cần toàn lớp & theo học viên */}
      <div className="rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center gap-2 font-bold text-base text-[#00543C]">
          <UserCheck className="h-5 w-5 text-[#008653]" />
          <span>Thống kê chuyên cần tích luỹ của lớp {selectedClassCode}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm">
          <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
            <div className="text-xs text-[#173B2C]/70">Có mặt</div>
            <div className="text-xl font-bold text-[#008653] tabular-nums">
              {classStats.present} lượt
            </div>
          </div>
          <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
            <div className="text-xs text-[#173B2C]/70">Vắng có phép</div>
            <div className="text-xl font-bold text-[#173B2C] tabular-nums">
              {classStats.excused} lượt
            </div>
          </div>
          <div className="rounded border border-red-200 bg-red-50 p-3">
            <div className="text-xs text-red-700">Vắng không phép</div>
            <div className="text-xl font-bold text-red-600 tabular-nums">
              {classStats.unexcused} lượt
            </div>
          </div>
          <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
            <div className="text-xs text-[#173B2C]/70">Đi muộn</div>
            <div className="text-xl font-bold text-amber-700 tabular-nums">
              {classStats.late} lượt
            </div>
          </div>
          <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
            <div className="text-xs text-[#173B2C]/70">Học bù</div>
            <div className="text-xl font-bold text-[#00543C] tabular-nums">
              {classStats.makeup} lượt
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
