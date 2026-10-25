import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Download,
  Edit2,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ClassSession, Room, SessionStatus, ShiftConfig } from '../types';
import {
  formatDateVN,
  getDayOfWeekLabel,
  getSessionStatusLabel,
  getTodayISO,
} from '../utils/formatters';
import {
  detectSessionConflicts,
  generateSessionsFromSchedule,
} from '../services/businessLogic';
import { exportRowsToExcel } from '../utils/excelService';
import { ExcelImportModal } from '../components/ExcelImportModal';

type CalendarMode = 'DAY' | 'WEEK' | 'MONTH';

export const ScheduleAndRoomsView: React.FC = () => {
  const { db, saveSession, saveBulkSessions, saveShiftsAndRooms, notify } = useApp();

  const [calendarMode, setCalendarMode] = useState<CalendarMode>('MONTH');
  const [selectedDate, setSelectedDate] = useState('2026-10-25');
  const [selectedMonth, setSelectedMonth] = useState('2026-10');

  const [classFilter, setClassFilter] = useState('ALL');
  const [teacherFilter, setTeacherFilter] = useState('ALL');
  const [roomFilter, setRoomFilter] = useState('ALL');

  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isEditSession, setIsEditSession] = useState(false);

  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [genClassCode, setGenClassCode] = useState(db.classes[0]?.code || 'TOAN6A');
  const [genFromDate, setGenFromDate] = useState('2026-11-01');
  const [genToDate, setGenToDate] = useState('2026-11-30');

  const [isRoomsShiftsModalOpen, setIsRoomsShiftsModalOpen] = useState(false);
  const [shiftsDraft, setShiftsDraft] = useState<ShiftConfig[]>(db.shifts);
  const [roomsDraft, setRoomsDraft] = useState<Room[]>(db.rooms);

  const [isImportOpen, setIsImportOpen] = useState(false);

  const emptySession: ClassSession = {
    id: '',
    classCode: db.classes[0]?.code || 'TOAN6A',
    date: getTodayISO(),
    shiftId: 'CHIEU_3',
    startTime: '17:20',
    endTime: '18:50',
    roomCode: 'P101',
    actualTeacherCode: db.classes[0]?.teacherCode || 'VHGV001',
    status: 'DU_KIEN',
    makeupForSessionId: '',
    topic: '',
    note: '',
  };

  const [sessionForm, setSessionForm] = useState<ClassSession>(emptySession);

  // Phát hiện xung đột trực tiếp khi người dùng chỉnh sửa form buổi học
  const liveConflicts = useMemo(() => {
    if (!isSessionModalOpen) return [];
    return detectSessionConflicts(sessionForm, db);
  }, [isSessionModalOpen, sessionForm, db]);

  const filteredSessions = useMemo(() => {
    return db.sessions
      .filter((s) => {
        if (classFilter !== 'ALL' && s.classCode !== classFilter) return false;
        if (teacherFilter !== 'ALL' && s.actualTeacherCode !== teacherFilter) return false;
        if (roomFilter !== 'ALL' && s.roomCode !== roomFilter) return false;

        if (calendarMode === 'DAY') {
          return s.date === selectedDate;
        }
        if (calendarMode === 'WEEK') {
          const d = new Date(selectedDate + 'T00:00:00');
          const day = d.getDay();
          const diffToMonday = day === 0 ? -6 : 1 - day;
          const mon = new Date(d);
          mon.setDate(d.getDate() + diffToMonday);
          const sun = new Date(mon);
          sun.setDate(mon.getDate() + 6);
          const monISO = mon.toISOString().slice(0, 10);
          const sunISO = sun.toISOString().slice(0, 10);
          return s.date >= monISO && s.date <= sunISO;
        }
        return s.date.startsWith(selectedMonth);
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [
    db.sessions,
    classFilter,
    teacherFilter,
    roomFilter,
    calendarMode,
    selectedDate,
    selectedMonth,
  ]);

  const handleOpenAddSession = () => {
    const cls = db.classes[0];
    const shift = db.shifts.find((s) => s.id === 'CHIEU_3') || db.shifts[0];
    setSessionForm({
      ...emptySession,
      id: `SES-${Date.now()}`,
      classCode: cls?.code || '',
      roomCode: cls?.roomCode || 'P101',
      actualTeacherCode: cls?.teacherCode || '',
      shiftId: shift?.id || 'CHIEU_3',
      startTime: shift?.startTime || '17:20',
      endTime: shift?.endTime || '18:50',
      date: selectedDate,
    });
    setIsEditSession(false);
    setIsSessionModalOpen(true);
  };

  const handleOpenEditSession = (ses: ClassSession) => {
    setSessionForm({ ...ses });
    setIsEditSession(true);
    setIsSessionModalOpen(true);
  };

  const handleSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const blockingErrors = liveConflicts.filter((c) => c.severity === 'ERROR');
    if (blockingErrors.length > 0) {
      notify(blockingErrors[0].message, 'ERROR');
      return;
    }
    if (sessionForm.status === 'HOC_BU' && !sessionForm.makeupForSessionId) {
      notify('Buổi học bù cần chọn liên kết với buổi học gốc để không bị tính học phí 2 lần.', 'ERROR');
      return;
    }
    saveSession(sessionForm, isEditSession);
    setIsSessionModalOpen(false);
  };

  const handleGenerateRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    const cls = db.classes.find((c) => c.code === genClassCode);
    if (!cls) return;
    const generated = generateSessionsFromSchedule(
      cls,
      genFromDate,
      genToDate,
      db.shifts,
      db.sessions
    );
    saveBulkSessions(generated);
    setIsGenModalOpen(false);
  };

  const handleExportExcel = () => {
    const rows = filteredSessions.map((s) => {
      const cls = db.classes.find((c) => c.code === s.classCode);
      const gv = db.teachers.find((t) => t.code === s.actualTeacherCode);
      return {
        'Mã buổi': s.id,
        'Ngày học': formatDateVN(s.date),
        'Mã lớp': s.classCode,
        'Tên lớp': cls?.name || '',
        'Ca học': s.shiftId,
        'Giờ bắt đầu': s.startTime,
        'Giờ kết thúc': s.endTime,
        'Phòng học': s.roomCode,
        'Mã GV thực dạy': s.actualTeacherCode,
        'Tên GV thực dạy': gv?.fullName || '',
        'Trạng thái buổi': getSessionStatusLabel(s.status),
        'Liên kết buổi gốc (nếu học bù)': s.makeupForSessionId || '',
        'Chuyên đề / Ghi chú': s.topic || '',
      };
    });
    exportRowsToExcel(rows, 'Lich_Hoc_APLUS2.xlsx', 'Lich_Hoc');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">QUẢN LÝ LỊCH HỌC & PHÒNG HỌC</h2>
          <p className="text-sm text-[#173B2C]/80">
            Quản lý 6 ca học chuẩn, phòng học, sinh buổi học từ lịch định kỳ, phát hiện xung đột thời gian thực và quản lý học bù.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setShiftsDraft([...db.shifts]);
              setRoomsDraft([...db.rooms]);
              setIsRoomsShiftsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold text-[#173B2C] hover:bg-[#F2FAF5]"
          >
            <Settings className="h-4 w-4" />
            Cấu hình Ca & Phòng ({db.rooms.length})
          </button>
          <button
            onClick={() => setIsGenModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            <RefreshCw className="h-4 w-4" />
            Sinh lịch từ định kỳ
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Nhập Excel
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4E8DB] bg-white px-3.5 py-2 text-sm font-bold text-[#173B2C] hover:bg-[#F2FAF5]"
          >
            <Download className="h-4 w-4" />
            Xuất Excel
          </button>
          <button
            onClick={handleOpenAddSession}
            className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
          >
            <Plus className="h-4 w-4" />
            Thêm buổi học / Học bù
          </button>
        </div>
      </div>

      {/* Thẻ tóm tắt 6 ca học & Phòng học */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
          <div className="mb-2 text-sm font-bold text-[#00543C]">
            Khung 6 Ca học tiêu chuẩn của Trung tâm (Có thể chỉnh sửa):
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
            {db.shifts.map((s) => (
              <div
                key={s.id}
                className="rounded border border-[#D4E8DB] bg-[#F2FAF5] px-3 py-2"
              >
                <div className="font-bold text-[#173B2C]">{s.name}</div>
                <div className="font-bold text-[#008653] tabular-nums">
                  {s.startTime} – {s.endTime}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
          <div className="mb-2 text-sm font-bold text-[#00543C]">
            Danh sách Phòng học & Sức chứa:
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
            {db.rooms.map((r) => (
              <div
                key={r.code}
                className="rounded border border-[#D4E8DB] bg-[#F2FAF5] px-3 py-2"
              >
                <div className="font-bold text-[#00543C]">{r.code}</div>
                <div className="truncate">{r.name}</div>
                <div className="mt-0.5 font-bold text-[#008653] tabular-nums">
                  Sức chứa: {r.capacity} HV
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bộ lọc Lịch Ngày / Tuần / Tháng & Giáo viên / Lớp / Phòng */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded border border-[#D4E8DB] bg-[#F2FAF5] p-0.5 text-sm">
            <button
              onClick={() => setCalendarMode('DAY')}
              className={`rounded px-3 py-1 font-bold ${
                calendarMode === 'DAY' ? 'bg-[#00543C] text-white' : 'text-[#173B2C]'
              }`}
            >
              Lịch Ngày
            </button>
            <button
              onClick={() => setCalendarMode('WEEK')}
              className={`rounded px-3 py-1 font-bold ${
                calendarMode === 'WEEK' ? 'bg-[#00543C] text-white' : 'text-[#173B2C]'
              }`}
            >
              Lịch Tuần
            </button>
            <button
              onClick={() => setCalendarMode('MONTH')}
              className={`rounded px-3 py-1 font-bold ${
                calendarMode === 'MONTH' ? 'bg-[#00543C] text-white' : 'text-[#173B2C]'
              }`}
            >
              Lịch Tháng
            </button>
          </div>

          {calendarMode === 'MONTH' ? (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded border border-[#D4E8DB] px-3 py-1.5 text-sm font-bold"
            />
          ) : (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded border border-[#D4E8DB] px-3 py-1.5 text-sm font-bold"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
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
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 font-bold"
          >
            <option value="ALL">Mọi giáo viên</option>
            {db.teachers.map((t) => (
              <option key={t.code} value={t.code}>
                GV {t.fullName} ({t.code})
              </option>
            ))}
          </select>

          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="rounded border border-[#D4E8DB] bg-white px-3 py-1.5 font-bold"
          >
            <option value="ALL">Mọi phòng học</option>
            {db.rooms.map((r) => (
              <option key={r.code} value={r.code}>
                Phòng {r.code} ({r.capacity} chỗ)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bảng danh sách buổi học */}
      <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#00543C] text-white">
              <th className="p-3">Ngày học / Thứ</th>
              <th className="p-3">Ca & Giờ học</th>
              <th className="p-3">Lớp học</th>
              <th className="p-3">Phòng học</th>
              <th className="p-3">Giáo viên thực dạy</th>
              <th className="p-3">Chuyên đề / Liên kết học bù</th>
              <th className="p-3">Trạng thái buổi</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D4E8DB]">
            {filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[#173B2C]/70">
                  Không có buổi học nào trong khoảng thời gian và bộ lọc đã chọn.
                </td>
              </tr>
            ) : (
              filteredSessions.map((s) => {
                const cls = db.classes.find((c) => c.code === s.classCode);
                const gv = db.teachers.find((t) => t.code === s.actualTeacherCode);
                const shift = db.shifts.find((sh) => sh.id === s.shiftId);
                const dayNum = new Date(s.date + 'T00:00:00').getDay();
                const isSubstitute = cls && cls.teacherCode !== s.actualTeacherCode;

                return (
                  <tr key={s.id} className="hover:bg-[#F2FAF5]/70">
                    <td className="p-3 tabular-nums">
                      <div className="font-bold">{formatDateVN(s.date)}</div>
                      <div className="text-xs text-[#173B2C]/70">{getDayOfWeekLabel(dayNum)}</div>
                    </td>
                    <td className="p-3 tabular-nums">
                      <div className="font-bold text-[#00543C]">{shift?.name || s.shiftId}</div>
                      <div className="text-xs">
                        {s.startTime} – {s.endTime}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold">
                        {s.classCode} – {cls?.name}
                      </div>
                      <div className="text-xs text-[#173B2C]/75">Môn {cls?.subject}</div>
                    </td>
                    <td className="p-3 font-bold">{s.roomCode}</td>
                    <td className="p-3">
                      <div className="font-bold">{gv?.fullName || s.actualTeacherCode}</div>
                      {isSubstitute && (
                        <span className="text-xs font-bold text-amber-700">
                          (Dạy thay cho GV {cls?.teacherCode})
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{s.topic}</div>
                      {s.status === 'HOC_BU' && s.makeupForSessionId && (
                        <div className="mt-0.5 font-bold text-[#008653]">
                          Bù cho buổi: {s.makeupForSessionId} (Không tính học phí 2 lần)
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-bold ${
                          s.status === 'DA_DAY'
                            ? 'text-[#008653]'
                            : s.status === 'HOC_BU'
                              ? 'text-[#00543C]'
                              : s.status === 'HUY' || s.status === 'NGHI'
                                ? 'text-red-600'
                                : 'text-amber-700'
                        }`}
                      >
                        {getSessionStatusLabel(s.status)}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleOpenEditSession(s)}
                        className="inline-flex items-center gap-1 rounded border border-[#D4E8DB] px-2.5 py-1 text-xs font-bold hover:bg-[#F2FAF5]"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Sửa buổi
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm / Sửa 1 buổi học (có kiểm tra xung đột thời gian thực) */}
      {isSessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                {isEditSession ? 'Chỉnh sửa Buổi học cụ thể' : 'Thêm Buổi học / Xếp buổi Học bù'}
              </h3>
              <button onClick={() => setIsSessionModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSessionSubmit} className="space-y-4 p-6">
              {/* Cảnh báo xung đột trực tiếp */}
              {liveConflicts.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-red-300 bg-red-50 p-3.5 text-sm">
                  <div className="flex items-center gap-1.5 font-bold text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Phát hiện xung đột lịch học theo thời gian thực:
                  </div>
                  {liveConflicts.map((c, i) => (
                    <div
                      key={i}
                      className={`text-xs font-bold ${
                        c.severity === 'ERROR' ? 'text-red-600' : 'text-amber-800'
                      }`}
                    >
                      • {c.message}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold">Lớp học *</label>
                  <select
                    value={sessionForm.classCode}
                    onChange={(e) => {
                      const cls = db.classes.find((c) => c.code === e.target.value);
                      setSessionForm({
                        ...sessionForm,
                        classCode: e.target.value,
                        roomCode: cls?.roomCode || sessionForm.roomCode,
                        actualTeacherCode: cls?.teacherCode || sessionForm.actualTeacherCode,
                      });
                    }}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    {db.classes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} – {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold">Ngày học *</label>
                  <input
                    type="date"
                    required
                    value={sessionForm.date}
                    onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold">Chọn Ca học *</label>
                  <select
                    value={sessionForm.shiftId}
                    onChange={(e) => {
                      const sh = db.shifts.find((s) => s.id === e.target.value);
                      setSessionForm({
                        ...sessionForm,
                        shiftId: e.target.value,
                        startTime: sh?.startTime || sessionForm.startTime,
                        endTime: sh?.endTime || sessionForm.endTime,
                      });
                    }}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    {db.shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime}–{s.endTime})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-bold">Giờ bắt đầu</label>
                    <input
                      type="time"
                      value={sessionForm.startTime}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, startTime: e.target.value })
                      }
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-2.5 py-2 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">Giờ kết thúc</label>
                    <input
                      type="time"
                      value={sessionForm.endTime}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, endTime: e.target.value })
                      }
                      className="mt-1 w-full rounded border border-[#D4E8DB] px-2.5 py-2 tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold">Phòng học *</label>
                  <select
                    value={sessionForm.roomCode}
                    onChange={(e) => setSessionForm({ ...sessionForm, roomCode: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    {db.rooms.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} – {r.name} (Sức chứa {r.capacity} HV)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold">
                    Giáo viên thực dạy (Hỗ trợ dạy thay) *
                  </label>
                  <select
                    value={sessionForm.actualTeacherCode}
                    onChange={(e) =>
                      setSessionForm({ ...sessionForm, actualTeacherCode: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  >
                    {db.teachers.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code} – {t.fullName} ({t.specialty})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold">Trạng thái buổi học *</label>
                  <select
                    value={sessionForm.status}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        status: e.target.value as SessionStatus,
                      })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    <option value="DU_KIEN">Dự kiến</option>
                    <option value="DA_DAY">Đã dạy</option>
                    <option value="NGHI">Nghỉ</option>
                    <option value="HUY">Huỷ</option>
                    <option value="HOC_BU">Học bù (Liên kết buổi gốc)</option>
                  </select>
                </div>

                {sessionForm.status === 'HOC_BU' && (
                  <div>
                    <label className="block text-sm font-bold text-[#00543C]">
                      Liên kết buổi gốc (Không tính học phí 2 lần) *
                    </label>
                    <select
                      required
                      value={sessionForm.makeupForSessionId || ''}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, makeupForSessionId: e.target.value })
                      }
                      className="mt-1 w-full rounded border border-[#008653] bg-[#F2FAF5] px-3 py-2 font-bold"
                    >
                      <option value="">-- Chọn buổi học gốc của lớp {sessionForm.classCode} --</option>
                      {db.sessions
                        .filter(
                          (s) =>
                            s.classCode === sessionForm.classCode && s.id !== sessionForm.id
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.id} – Ngày {formatDateVN(s.date)} ({getSessionStatusLabel(s.status)})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold">Chuyên đề / Nội dung buổi học</label>
                <input
                  type="text"
                  value={sessionForm.topic || ''}
                  onChange={(e) => setSessionForm({ ...sessionForm, topic: e.target.value })}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsSessionModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  Lưu buổi học
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sinh các buổi học từ lịch định kỳ */}
      {isGenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">Sinh buổi học tự động từ lịch định kỳ</h3>
              <button onClick={() => setIsGenModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleGenerateRecurring} className="space-y-4 p-6">
              <div>
                <label className="block text-sm font-bold">Chọn Lớp học *</label>
                <select
                  value={genClassCode}
                  onChange={(e) => setGenClassCode(e.target.value)}
                  className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                >
                  {db.classes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} – {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold">Từ ngày *</label>
                  <input
                    type="date"
                    required
                    value={genFromDate}
                    onChange={(e) => setGenFromDate(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Đến ngày *</label>
                  <input
                    type="date"
                    required
                    value={genToDate}
                    onChange={(e) => setGenToDate(e.target.value)}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsGenModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  Tạo các buổi học
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cấu hình Ca học & Phòng học */}
      {isRoomsShiftsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">Cấu hình Khung Ca học & Quản lý Phòng học</h3>
              <button onClick={() => setIsRoomsShiftsModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 p-6 text-sm">
              <div>
                <h4 className="mb-2 font-bold text-base text-[#00543C]">
                  1. Khung 6 ca học mặc định (Có thể chỉnh sửa giờ bắt đầu/kết thúc)
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {shiftsDraft.map((sh, idx) => (
                    <div
                      key={sh.id}
                      className="flex items-center justify-between gap-2 rounded border border-[#D4E8DB] bg-[#F2FAF5] p-2.5"
                    >
                      <span className="w-24 font-bold">{sh.name}</span>
                      <input
                        type="time"
                        value={sh.startTime}
                        onChange={(e) => {
                          const next = [...shiftsDraft];
                          next[idx] = { ...sh, startTime: e.target.value };
                          setShiftsDraft(next);
                        }}
                        className="rounded border border-[#D4E8DB] bg-white px-2 py-1 tabular-nums"
                      />
                      <span>–</span>
                      <input
                        type="time"
                        value={sh.endTime}
                        onChange={(e) => {
                          const next = [...shiftsDraft];
                          next[idx] = { ...sh, endTime: e.target.value };
                          setShiftsDraft(next);
                        }}
                        className="rounded border border-[#D4E8DB] bg-white px-2 py-1 tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-bold text-base text-[#00543C]">2. Danh sách Phòng học</h4>
                  <button
                    type="button"
                    onClick={() =>
                      setRoomsDraft([
                        ...roomsDraft,
                        {
                          code: `P${roomsDraft.length + 1}01`,
                          name: `Phòng mới ${roomsDraft.length + 1}`,
                          capacity: 25,
                          status: 'HOAT_DONG',
                        },
                      ])
                    }
                    className="rounded bg-[#008653] px-3 py-1 text-xs font-bold text-white"
                  >
                    + Thêm phòng học
                  </button>
                </div>
                <div className="space-y-2">
                  {roomsDraft.map((r, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={r.code}
                        onChange={(e) => {
                          const next = [...roomsDraft];
                          next[idx] = { ...r, code: e.target.value.toUpperCase() };
                          setRoomsDraft(next);
                        }}
                        className="rounded border border-[#D4E8DB] px-2.5 py-1.5 font-bold"
                        placeholder="Mã phòng"
                      />
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => {
                          const next = [...roomsDraft];
                          next[idx] = { ...r, name: e.target.value };
                          setRoomsDraft(next);
                        }}
                        className="rounded border border-[#D4E8DB] px-2.5 py-1.5"
                        placeholder="Tên phòng"
                      />
                      <input
                        type="number"
                        value={r.capacity}
                        onChange={(e) => {
                          const next = [...roomsDraft];
                          next[idx] = { ...r, capacity: Number(e.target.value) };
                          setRoomsDraft(next);
                        }}
                        className="rounded border border-[#D4E8DB] px-2.5 py-1.5 tabular-nums"
                        placeholder="Sức chứa"
                      />
                      <select
                        value={r.status}
                        onChange={(e) => {
                          const next = [...roomsDraft];
                          next[idx] = { ...r, status: e.target.value as Room['status'] };
                          setRoomsDraft(next);
                        }}
                        className="rounded border border-[#D4E8DB] px-2.5 py-1.5"
                      >
                        <option value="HOAT_DONG">Hoạt động</option>
                        <option value="BAO_TRI">Bảo trì</option>
                        <option value="NGUNG_SU_DUNG">Ngừng sử dụng</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsRoomsShiftsModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveShiftsAndRooms(shiftsDraft, roomsDraft);
                    setIsRoomsShiftsModalOpen(false);
                  }}
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  Lưu cấu hình Ca & Phòng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExcelImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        entityType="SESSIONS"
        title="Nhập Lịch học từ tệp Excel (.xlsx)"
      />
    </div>
  );
};
