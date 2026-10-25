import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Plus,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  Assignment,
  AssignmentQuestion,
  AssignmentSubmission,
  QuestionType,
} from '../types';
import { formatDateTimeVN, formatDateVN, getTodayISO } from '../utils/formatters';

export const AssignmentsView: React.FC = () => {
  const {
    db,
    currentAccount,
    saveAssignment,
    submitAssignment,
    gradeSubmission,
    notify,
  } = useApp();

  const [viewRoleMode, setViewRoleMode] = useState<'TEACHER' | 'STUDENT'>(
    currentAccount.role === 'STUDENT' ? 'STUDENT' : 'TEACHER'
  );

  const [selectedStudentForPortal, setSelectedStudentForPortal] = useState<string>(
    currentAccount.linkedStudentCode || db.students[0]?.code || 'HV001'
  );
  const [studentFilterTab, setStudentFilterTab] = useState<
    'ALL' | 'PENDING' | 'SUBMITTED' | 'OVERDUE'
  >('ALL');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [gradingAssignment, setGradingAssignment] = useState<Assignment | null>(null);
  const [takingAssignment, setTakingAssignment] = useState<Assignment | null>(null);

  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [studentAttachmentName, setStudentAttachmentName] = useState('');

  const emptyAssignment: Assignment = {
    id: '',
    code: '',
    title: '',
    subject: 'Toán',
    classCode: db.classes[0]?.code || 'TOAN6A',
    teacherCode: db.teachers[0]?.code || 'VHGV001',
    description: '',
    dueDate: '2026-10-30',
    durationMinutes: 45,
    assignedStudentCodes: [],
    scoresPublished: false,
    createdAt: getTodayISO(),
    questions: [
      {
        id: 'Q-1',
        type: 'MCQ',
        content: 'Câu hỏi trắc nghiệm 1 đáp án đúng mẫu?',
        options: ['A. Phương án 1', 'B. Phương án 2', 'C. Phương án 3', 'D. Phương án 4'],
        correctAnswer: 'A',
        points: 4,
      },
      {
        id: 'Q-2',
        type: 'TRUE_FALSE',
        content: 'Mệnh đề đúng/sai mẫu?',
        correctAnswer: 'TRUE',
        points: 2,
      },
      {
        id: 'Q-3',
        type: 'ESSAY',
        content: 'Câu hỏi tự luận trình bày lời giải chi tiết?',
        points: 4,
      },
    ],
  };

  const [form, setForm] = useState<Assignment>(emptyAssignment);

  // Tải mẫu đề kiểm tra Word (.doc) chuẩn để giáo viên soạn và import nhanh
  const handleDownloadWordTemplate = () => {
    const sampleContent = `MẪU ĐỀ KIỂM TRA NHẬP TỰ ĐỘNG APLUS 2 (ĐỊNH DẠNG WORD / TEXT)
Hướng dẫn: Giữ nguyên các từ khoá [TRAC_NGHIEM], [DUNG_SAI], [TU_LUAN], Đáp án:, Điểm: để hệ thống tự động tách câu hỏi.
-------------------------------------------------------------------

[TRAC_NGHIEM]
Câu: Kết quả của phép tính (-20) + 35 là bao nhiêu?
A. -55
B. 15
C. -15
D. 55
Đáp án: B
Điểm: 3

[DUNG_SAI]
Câu: Tổng của hai số nguyên đối nhau luôn bằng 0.
Đáp án: TRUE
Điểm: 3

[TU_LUAN]
Câu: Tìm số nguyên x biết: 3x + 9 = -12. Trình bày các bước giải rõ ràng.
Điểm: 4
`;
    const blob = new Blob([sampleContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mau_De_Kiem_Tra_Word_APLUS2.doc';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Đọc tệp đề kiểm tra Word (.doc / .txt / .docx dạng văn bản) và tách câu hỏi tự động
  const handleImportWordExam = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const blocks = text.split(/(?=\[TRAC_NGHIEM\]|\[DUNG_SAI\]|\[TU_LUAN\])/g);
      const parsedQuestions: AssignmentQuestion[] = [];

      blocks.forEach((b, idx) => {
        const trimmed = b.trim();
        if (trimmed.startsWith('[TRAC_NGHIEM]')) {
          const qMatch = trimmed.match(/Câu:\s*(.+)/i);
          const optA = trimmed.match(/^A\..+/m)?.[0] || 'A. Đáp án A';
          const optB = trimmed.match(/^B\..+/m)?.[0] || 'B. Đáp án B';
          const optC = trimmed.match(/^C\..+/m)?.[0] || 'C. Đáp án C';
          const optD = trimmed.match(/^D\..+/m)?.[0] || 'D. Đáp án D';
          const ansMatch = trimmed.match(/Đáp án:\s*([A-D])/i);
          const ptsMatch = trimmed.match(/Điểm:\s*(\d+(\.\d+)?)/i);
          if (qMatch) {
            parsedQuestions.push({
              id: `WQ-${Date.now()}-${idx}`,
              type: 'MCQ',
              content: qMatch[1].trim(),
              options: [optA.trim(), optB.trim(), optC.trim(), optD.trim()],
              correctAnswer: (ansMatch?.[1] || 'A').toUpperCase(),
              points: Number(ptsMatch?.[1] || 2),
            });
          }
        } else if (trimmed.startsWith('[DUNG_SAI]')) {
          const qMatch = trimmed.match(/Câu:\s*(.+)/i);
          const ansMatch = trimmed.match(/Đáp án:\s*(TRUE|FALSE|ĐÚNG|SAI)/i);
          const ptsMatch = trimmed.match(/Điểm:\s*(\d+(\.\d+)?)/i);
          if (qMatch) {
            const rawAns = (ansMatch?.[1] || 'TRUE').toUpperCase();
            parsedQuestions.push({
              id: `WQ-${Date.now()}-${idx}`,
              type: 'TRUE_FALSE',
              content: qMatch[1].trim(),
              correctAnswer: rawAns === 'SAI' || rawAns === 'FALSE' ? 'FALSE' : 'TRUE',
              points: Number(ptsMatch?.[1] || 2),
            });
          }
        } else if (trimmed.startsWith('[TU_LUAN]')) {
          const qMatch = trimmed.match(/Câu:\s*(.+)/i);
          const ptsMatch = trimmed.match(/Điểm:\s*(\d+(\.\d+)?)/i);
          if (qMatch) {
            parsedQuestions.push({
              id: `WQ-${Date.now()}-${idx}`,
              type: 'ESSAY',
              content: qMatch[1].trim(),
              points: Number(ptsMatch?.[1] || 4),
            });
          }
        }
      });

      if (parsedQuestions.length > 0) {
        setForm((prev) => ({
          ...prev,
          questions: parsedQuestions,
        }));
        notify(
          `Đã nhập thành công ${parsedQuestions.length} câu hỏi từ tệp đề kiểm tra Word!`,
          'SUCCESS'
        );
      } else {
        notify(
          'Không tìm thấy thẻ [TRAC_NGHIEM], [DUNG_SAI], [TU_LUAN] trong tệp. Hãy tải tệp Mẫu đề Word chuẩn.',
          'WARNING'
        );
      }
    } catch {
      notify('Không thể đọc tệp đề kiểm tra.', 'ERROR');
    }
  };

  // Danh sách bài tập của học viên đang chọn (xem bài của tất cả lớp đang học bằng 1 tài khoản duy nhất)
  const studentAssignmentsList = useMemo(() => {
    const enrolledClassCodes = new Set(
      db.enrollments
        .filter((e) => e.studentCode === selectedStudentForPortal && e.status === 'DANG_HOC')
        .map((e) => e.classCode)
    );

    const today = '2026-10-25';
    return db.assignments
      .filter((a) => {
        if (!enrolledClassCodes.has(a.classCode)) return false;
        if (
          a.assignedStudentCodes.length > 0 &&
          !a.assignedStudentCodes.includes(selectedStudentForPortal)
        ) {
          return false;
        }
        const sub = db.submissions.find(
          (s) => s.assignmentId === a.id && s.studentCode === selectedStudentForPortal
        );
        const isOverdue = !sub && a.dueDate < today;
        if (studentFilterTab === 'PENDING') return !sub && !isOverdue;
        if (studentFilterTab === 'SUBMITTED') return Boolean(sub);
        if (studentFilterTab === 'OVERDUE') return isOverdue;
        return true;
      })
      .map((a) => {
        const sub = db.submissions.find(
          (s) => s.assignmentId === a.id && s.studentCode === selectedStudentForPortal
        );
        return { assignment: a, submission: sub };
      });
  }, [db.assignments, db.enrollments, db.submissions, selectedStudentForPortal, studentFilterTab]);

  const handleOpenCreate = () => {
    const cls = db.classes[0];
    setForm({
      ...emptyAssignment,
      id: `ASG-${Date.now()}`,
      code: `BT-${cls?.code || 'LOP'}-${String(db.assignments.length + 1).padStart(2, '0')}`,
      classCode: cls?.code || 'TOAN6A',
      subject: cls?.subject || 'Toán',
      teacherCode: cls?.teacherCode || 'VHGV001',
    });
    setIsCreateModalOpen(true);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || form.questions.length === 0) {
      notify('Vui lòng nhập tiêu đề bài tập và ít nhất 1 câu hỏi.', 'ERROR');
      return;
    }
    saveAssignment(form, false);
    setIsCreateModalOpen(false);
  };

  const handleStartTakeAssignment = (asg: Assignment) => {
    const existingSub = db.submissions.find(
      (s) => s.assignmentId === asg.id && s.studentCode === selectedStudentForPortal
    );
    const initAns: Record<string, string> = {};
    if (existingSub) {
      existingSub.answers.forEach((a) => {
        initAns[a.questionId] = a.answerText;
      });
    }
    setStudentAnswers(initAns);
    setStudentAttachmentName(existingSub?.attachmentName || '');
    setTakingAssignment(asg);
  };

  const handleStudentSubmitWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!takingAssignment) return;

    let autoScore = 0;
    let hasEssay = false;

    const answers = takingAssignment.questions.map((q) => {
      const ans = (studentAnswers[q.id] || '').trim();
      let earned = 0;
      if (q.type === 'MCQ' || q.type === 'TRUE_FALSE') {
        if (ans.toUpperCase() === (q.correctAnswer || '').toUpperCase()) {
          earned = q.points;
          autoScore += earned;
        }
      } else {
        hasEssay = true;
      }
      return {
        questionId: q.id,
        answerText: ans,
        earnedPoints: earned,
      };
    });

    const sub: AssignmentSubmission = {
      id: `SUB-${takingAssignment.id}-${selectedStudentForPortal}`,
      assignmentId: takingAssignment.id,
      studentCode: selectedStudentForPortal,
      submittedAt: new Date().toISOString(),
      attachmentName: studentAttachmentName || undefined,
      answers,
      autoScore,
      essayScore: 0,
      totalScore: autoScore,
      graded: !hasEssay,
      teacherFeedback: hasEssay
        ? 'Đã chấm tự động phần trắc nghiệm. Đang chờ giáo viên chấm phần tự luận.'
        : 'Đã chấm tự động 100%.',
    };

    submitAssignment(sub);
    setTakingAssignment(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#173B2C]">BÀI TẬP & KIỂM TRA ĐỊNH KỲ</h2>
          <p className="text-sm text-[#173B2C]/80">
            Hỗ trợ câu hỏi Trắc nghiệm 1 đáp án, Đúng/Sai, Tự luận, nhập đề kiểm tra từ Word và cổng làm bài tập trung cho học viên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-[#D4E8DB] bg-[#F2FAF5] p-0.5 text-sm">
            <button
              onClick={() => setViewRoleMode('TEACHER')}
              className={`rounded px-3.5 py-1.5 font-bold ${
                viewRoleMode === 'TEACHER' ? 'bg-[#00543C] text-white' : 'text-[#173B2C]'
              }`}
            >
              Phân hệ Giáo viên (Giao & Chấm bài)
            </button>
            <button
              onClick={() => setViewRoleMode('STUDENT')}
              className={`rounded px-3.5 py-1.5 font-bold ${
                viewRoleMode === 'STUDENT' ? 'bg-[#00543C] text-white' : 'text-[#173B2C]'
              }`}
            >
              Cổng Học viên (Làm bài & Xem điểm)
            </button>
          </div>

          {viewRoleMode === 'TEACHER' && (
            <>
              <button
                onClick={handleDownloadWordTemplate}
                className="inline-flex items-center gap-1.5 rounded border border-[#008653] bg-white px-3.5 py-2 text-sm font-bold text-[#008653] hover:bg-[#F2FAF5]"
              >
                <Download className="h-4 w-4" />
                Tải mẫu đề Word (.doc)
              </button>
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
              >
                <Plus className="h-4 w-4" />
                Giao bài tập / Đề kiểm tra
              </button>
            </>
          )}
        </div>
      </div>

      {/* GIAO DIỆN GIÁO VIÊN */}
      {viewRoleMode === 'TEACHER' ? (
        <div className="overflow-x-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#00543C] text-white">
                <th className="p-3">Mã đề</th>
                <th className="p-3">Tiêu đề Bài tập / Kiểm tra</th>
                <th className="p-3">Lớp & Môn</th>
                <th className="p-3">Cấu trúc câu hỏi</th>
                <th className="p-3">Hạn nộp / Thời gian</th>
                <th className="p-3">Tiến độ nộp bài</th>
                <th className="p-3">Công bố điểm</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4E8DB]">
              {db.assignments.map((asg) => {
                const classStudentCount = db.enrollments.filter(
                  (e) => e.classCode === asg.classCode && e.status === 'DANG_HOC'
                ).length;
                const subs = db.submissions.filter((s) => s.assignmentId === asg.id);
                const mcqCount = asg.questions.filter((q) => q.type === 'MCQ').length;
                const tfCount = asg.questions.filter((q) => q.type === 'TRUE_FALSE').length;
                const essayCount = asg.questions.filter((q) => q.type === 'ESSAY').length;

                return (
                  <tr key={asg.id} className="hover:bg-[#F2FAF5]/70">
                    <td className="p-3 font-bold text-[#00543C]">{asg.code}</td>
                    <td className="p-3">
                      <div className="font-bold text-base">{asg.title}</div>
                      <div className="text-xs text-[#173B2C]/75">{asg.description}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-[#008653]">{asg.classCode}</div>
                      <div className="text-xs">Môn {asg.subject}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div>Tổng: <strong>{asg.questions.length} câu</strong></div>
                      <div className="text-[#173B2C]/75">
                        TN: {mcqCount} · Đ/S: {tfCount} · Tự luận: {essayCount}
                      </div>
                    </td>
                    <td className="p-3 tabular-nums">
                      <div className="font-bold">{formatDateVN(asg.dueDate)}</div>
                      <div className="text-xs">{asg.durationMinutes} phút</div>
                    </td>
                    <td className="p-3 font-bold tabular-nums">
                      {subs.length} / {classStudentCount} HV đã nộp
                    </td>
                    <td className="p-3">
                      {asg.scoresPublished ? (
                        <span className="font-bold text-[#008653]">Đã công bố kết quả</span>
                      ) : (
                        <span className="font-bold text-amber-700">Chưa công bố (Ẩn đáp án)</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setGradingAssignment(asg)}
                        className="inline-flex items-center gap-1 rounded bg-[#008653] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#006B42]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Tiến độ & Chấm bài ({subs.length})
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* CỔNG HỌC VIÊN: Đăng nhập 1 tài khoản xem bài của tất cả lớp đang học */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4E8DB] bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-[#00543C]">
                Tài khoản Học viên đang xem (Một mã HV xem tất cả các lớp đang học):
              </span>
              <select
                value={selectedStudentForPortal}
                disabled={currentAccount.role === 'STUDENT'}
                onChange={(e) => setSelectedStudentForPortal(e.target.value)}
                className="rounded border border-[#008653] bg-[#F2FAF5] px-3 py-1.5 text-sm font-bold text-[#00543C]"
              >
                {db.students.map((s) => {
                  const clsList = db.enrollments
                    .filter((e) => e.studentCode === s.code && e.status === 'DANG_HOC')
                    .map((e) => e.classCode)
                    .join(', ');
                  return (
                    <option key={s.code} value={s.code}>
                      {s.code} – {s.fullName} (Đang học: {clsList || 'Chưa ĐK'})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex rounded border border-[#D4E8DB] bg-[#F2FAF5] p-0.5 text-sm">
              {(
                [
                  ['ALL', 'Tất cả bài'],
                  ['PENDING', 'Chưa làm'],
                  ['SUBMITTED', 'Đã nộp'],
                  ['OVERDUE', 'Quá hạn'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setStudentFilterTab(k)}
                  className={`rounded px-3 py-1 font-bold ${
                    studentFilterTab === k ? 'bg-[#008653] text-white' : 'text-[#173B2C]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {studentAssignmentsList.map(({ assignment, submission }) => {
              const isOverdue = !submission && assignment.dueDate < '2026-10-25';
              return (
                <div
                  key={assignment.id}
                  className="flex flex-col justify-between rounded-lg border border-[#D4E8DB] bg-white p-5 shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-[#008653]">
                        Lớp {assignment.classCode} · Môn {assignment.subject}
                      </span>
                      <span
                        className={
                          submission
                            ? 'text-[#008653]'
                            : isOverdue
                              ? 'text-red-600'
                              : 'text-amber-700'
                        }
                      >
                        {submission
                          ? 'ĐÃ NỘP BÀI'
                          : isOverdue
                            ? 'QUÁ HẠN NỘP'
                            : 'CHƯA LÀM BÀI'}
                      </span>
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-[#173B2C]">{assignment.title}</h3>
                    <p className="mt-1 text-sm text-[#173B2C]/80">{assignment.description}</p>
                    <div className="mt-2 text-xs text-[#173B2C]/75">
                      Hạn nộp: <strong>{formatDateVN(assignment.dueDate)}</strong> · Thời gian làm
                      bài: <strong>{assignment.durationMinutes} phút</strong> · Số câu hỏi:{' '}
                      <strong>{assignment.questions.length} câu</strong>
                    </div>

                    {submission && (
                      <div className="mt-3 rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-sm">
                        {assignment.scoresPublished ? (
                          <div>
                            <div className="font-bold text-[#00543C]">
                              Điểm số công bố:{' '}
                              <span className="text-lg text-[#008653]">
                                {submission.totalScore} điểm
                              </span>{' '}
                              (Trắc nghiệm: {submission.autoScore}đ · Tự luận: {submission.essayScore}đ)
                            </div>
                            <div className="mt-1 text-xs">
                              <strong>Nhận xét của GV:</strong> {submission.teacherFeedback}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs font-bold text-amber-800">
                            Đã ghi nhận bài nộp lúc {formatDateTimeVN(submission.submittedAt)}. Điểm và đáp án đúng được bảo mật cho đến khi giáo viên công bố kết quả.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex justify-end border-t border-[#D4E8DB] pt-3">
                    <button
                      onClick={() => handleStartTakeAssignment(assignment)}
                      className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B42]"
                    >
                      <FileText className="h-4 w-4" />
                      {submission ? 'Xem lại / Nộp lại bài' : 'Bắt đầu làm bài'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Giáo viên Tạo bài tập & Import đề Word */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                Tạo Bài tập / Đề kiểm tra (Hỗ trợ Nhập đề từ Word)
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCreate} className="space-y-4 p-6">
              {/* Khung Import nhanh từ Word */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#008653] bg-[#F2FAF5] p-4">
                <div>
                  <div className="font-bold text-[#00543C]">
                    Nhập đề kiểm tra tự động từ tệp Word (.doc / .txt)
                  </div>
                  <p className="text-xs text-[#173B2C]/80">
                    Tải mẫu định dạng đề Word, soạn câu hỏi trắc nghiệm / đúng sai / tự luận rồi tải lên để tách câu hỏi tự động.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadWordTemplate}
                    className="inline-flex items-center gap-1 rounded border border-[#008653] bg-white px-3 py-1.5 text-xs font-bold text-[#008653]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải mẫu Word
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-[#008653] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#006B42]">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Chọn tệp đề Word để nhập</span>
                    <input
                      type="file"
                      accept=".doc,.docx,.txt"
                      onChange={handleImportWordExam}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-bold">Mã bài tập *</label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold">Tiêu đề bài tập / đề kiểm tra *</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Lớp học *</label>
                  <select
                    value={form.classCode}
                    onChange={(e) => {
                      const cls = db.classes.find((c) => c.code === e.target.value);
                      setForm({
                        ...form,
                        classCode: e.target.value,
                        subject: cls?.subject || form.subject,
                        teacherCode: cls?.teacherCode || form.teacherCode,
                      });
                    }}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 font-bold"
                  >
                    {db.classes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} – {c.name} ({c.subject})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold">Hạn nộp *</label>
                  <input
                    type="date"
                    required
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Thời gian làm bài (phút) *</label>
                  <input
                    type="number"
                    min={5}
                    required
                    value={form.durationMinutes}
                    onChange={(e) =>
                      setForm({ ...form, durationMinutes: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded border border-[#D4E8DB] px-3 py-2 tabular-nums"
                  />
                </div>
              </div>

              {/* Danh sách câu hỏi */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-base text-[#00543C]">
                    Danh sách câu hỏi ({form.questions.length} câu)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          questions: [
                            ...form.questions,
                            {
                              id: `Q-${Date.now()}`,
                              type: 'MCQ',
                              content: '',
                              options: ['A. ', 'B. ', 'C. ', 'D. '],
                              correctAnswer: 'A',
                              points: 2,
                            },
                          ],
                        })
                      }
                      className="rounded bg-[#008653] px-3 py-1 text-xs font-bold text-white"
                    >
                      + Câu Trắc nghiệm 1 đáp án
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          questions: [
                            ...form.questions,
                            {
                              id: `Q-${Date.now()}`,
                              type: 'TRUE_FALSE',
                              content: '',
                              correctAnswer: 'TRUE',
                              points: 2,
                            },
                          ],
                        })
                      }
                      className="rounded bg-[#00543C] px-3 py-1 text-xs font-bold text-white"
                    >
                      + Câu Đúng / Sai
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          questions: [
                            ...form.questions,
                            {
                              id: `Q-${Date.now()}`,
                              type: 'ESSAY',
                              content: '',
                              points: 4,
                            },
                          ],
                        })
                      }
                      className="rounded border border-[#008653] bg-white px-3 py-1 text-xs font-bold text-[#008653]"
                    >
                      + Câu Tự luận
                    </button>
                  </div>
                </div>

                {form.questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="space-y-2 rounded border border-[#D4E8DB] bg-[#F2FAF5]/60 p-4 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#00543C]">
                        Câu {idx + 1} (
                        {q.type === 'MCQ'
                          ? 'Trắc nghiệm 1 đáp án đúng'
                          : q.type === 'TRUE_FALSE'
                            ? 'Trắc nghiệm Đúng / Sai'
                            : 'Tự luận'}
                        )
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">Điểm:</span>
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={q.points}
                          onChange={(e) => {
                            const next = [...form.questions];
                            next[idx] = { ...q, points: Number(e.target.value) };
                            setForm({ ...form, questions: next });
                          }}
                          className="w-16 rounded border border-[#D4E8DB] bg-white px-2 py-0.5 text-center font-bold tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              questions: form.questions.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-red-600 hover:bg-red-50 p-1 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      required
                      value={q.content}
                      onChange={(e) => {
                        const next = [...form.questions];
                        next[idx] = { ...q, content: e.target.value };
                        setForm({ ...form, questions: next });
                      }}
                      placeholder="Nhập nội dung câu hỏi..."
                      className="w-full rounded border border-[#D4E8DB] bg-white px-3 py-1.5"
                    />

                    {q.type === 'MCQ' && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {(q.options || ['A. ', 'B. ', 'C. ', 'D. ']).map((opt, oIdx) => (
                          <input
                            key={oIdx}
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const nextOpts = [...(q.options || [])];
                              nextOpts[oIdx] = e.target.value;
                              const next = [...form.questions];
                              next[idx] = { ...q, options: nextOpts };
                              setForm({ ...form, questions: next });
                            }}
                            className="rounded border border-[#D4E8DB] bg-white px-2.5 py-1 text-xs"
                          />
                        ))}
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <span className="text-xs font-bold">Đáp án đúng:</span>
                          <select
                            value={q.correctAnswer || 'A'}
                            onChange={(e) => {
                              const next = [...form.questions];
                              next[idx] = { ...q, correctAnswer: e.target.value };
                              setForm({ ...form, questions: next });
                            }}
                            className="rounded border border-[#D4E8DB] bg-white px-2.5 py-1 text-xs font-bold"
                          >
                            <option value="A">Đáp án A</option>
                            <option value="B">Đáp án B</option>
                            <option value="C">Đáp án C</option>
                            <option value="D">Đáp án D</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {q.type === 'TRUE_FALSE' && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold">Đáp án đúng:</span>
                        <select
                          value={q.correctAnswer || 'TRUE'}
                          onChange={(e) => {
                            const next = [...form.questions];
                            next[idx] = { ...q, correctAnswer: e.target.value };
                            setForm({ ...form, questions: next });
                          }}
                          className="rounded border border-[#D4E8DB] bg-white px-3 py-1 text-xs font-bold"
                        >
                          <option value="TRUE">ĐÚNG (True)</option>
                          <option value="FALSE">SAI (False)</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  Giao bài tập cho lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Giáo viên xem tiến độ, chấm tự luận & công bố điểm */}
      {gradingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">
                Chấm bài & Công bố điểm: {gradingAssignment.title}
              </h3>
              <button onClick={() => setGradingAssignment(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-6 text-sm">
              <div className="flex items-center justify-between rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3">
                <div>
                  <span className="font-bold">Trạng thái công bố điểm cho học viên: </span>
                  <strong className="text-[#008653]">
                    {gradingAssignment.scoresPublished
                      ? 'Đã công bố (Học viên xem được điểm & đáp án)'
                      : 'Đang ẩn kết quả (Bảo mật đáp án đúng)'}
                  </strong>
                </div>
                <button
                  onClick={() => {
                    const nextPub = !gradingAssignment.scoresPublished;
                    const updated = { ...gradingAssignment, scoresPublished: nextPub };
                    saveAssignment(updated, true);
                    setGradingAssignment(updated);
                  }}
                  className="rounded bg-[#008653] px-4 py-1.5 text-xs font-bold text-white"
                >
                  {gradingAssignment.scoresPublished
                    ? 'Tạm ẩn kết quả'
                    : 'Công bố điểm cho học viên'}
                </button>
              </div>

              {db.submissions
                .filter((s) => s.assignmentId === gradingAssignment.id)
                .map((sub) => {
                  const st = db.students.find((s) => s.code === sub.studentCode);
                  return (
                    <div
                      key={sub.id}
                      className="space-y-3 rounded border border-[#D4E8DB] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D4E8DB] pb-2">
                        <div className="font-bold text-base">
                          Học viên: {st?.fullName} ({sub.studentCode})
                        </div>
                        <div className="font-bold text-[#008653] tabular-nums">
                          Điểm Trắc nghiệm tự động: {sub.autoScore}đ · Tự luận: {sub.essayScore}đ →{' '}
                          <span className="text-lg">Tổng: {sub.totalScore} điểm</span>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        {gradingAssignment.questions.map((q, qIdx) => {
                          const ansObj = sub.answers.find((a) => a.questionId === q.id);
                          return (
                            <div key={q.id} className="rounded bg-[#F2FAF5] p-2.5">
                              <div className="font-bold">
                                Câu {qIdx + 1} ({q.points}đ): {q.content}
                              </div>
                              <div className="mt-1">
                                Bài làm học viên: <strong>{ansObj?.answerText || '(Bỏ trống)'}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2">
                        <div>
                          <label className="block text-xs font-bold">Chấm điểm phần Tự luận</label>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={sub.essayScore}
                            onChange={(e) => {
                              const essayScore = Number(e.target.value);
                              gradeSubmission({
                                ...sub,
                                essayScore,
                                totalScore: sub.autoScore + essayScore,
                                graded: true,
                              });
                            }}
                            className="mt-1 w-full rounded border border-[#D4E8DB] px-2.5 py-1.5 font-bold tabular-nums"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold">Nhận xét của Giáo viên</label>
                          <input
                            type="text"
                            value={sub.teacherFeedback}
                            onChange={(e) =>
                              gradeSubmission({
                                ...sub,
                                teacherFeedback: e.target.value,
                                graded: true,
                              })
                            }
                            className="mt-1 w-full rounded border border-[#D4E8DB] px-2.5 py-1.5"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Modal Học viên làm bài tập / kiểm tra */}
      {takingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#D4E8DB] bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#00543C] px-6 py-4 text-white">
              <h3 className="text-xl font-bold">Làm bài: {takingAssignment.title}</h3>
              <button onClick={() => setTakingAssignment(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleStudentSubmitWork} className="space-y-4 p-6">
              {takingAssignment.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="space-y-2 rounded border border-[#D4E8DB] bg-[#F2FAF5]/50 p-4"
                >
                  <div className="font-bold">
                    Câu {idx + 1} ({q.points} điểm): {q.content}
                  </div>

                  {q.type === 'MCQ' && (
                    <div className="space-y-1.5">
                      {(q.options || []).map((opt, oIdx) => {
                        const letter = ['A', 'B', 'C', 'D'][oIdx] || 'A';
                        return (
                          <label
                            key={oIdx}
                            className="flex cursor-pointer items-center gap-2 rounded border border-[#D4E8DB] bg-white p-2 text-sm hover:bg-[#F2FAF5]"
                          >
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              checked={studentAnswers[q.id] === letter}
                              onChange={() =>
                                setStudentAnswers({ ...studentAnswers, [q.id]: letter })
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'TRUE_FALSE' && (
                    <div className="flex gap-4">
                      <label className="flex cursor-pointer items-center gap-2 rounded border border-[#D4E8DB] bg-white px-4 py-2 text-sm font-bold">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          checked={studentAnswers[q.id] === 'TRUE'}
                          onChange={() =>
                            setStudentAnswers({ ...studentAnswers, [q.id]: 'TRUE' })
                          }
                        />
                        <span>ĐÚNG (True)</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded border border-[#D4E8DB] bg-white px-4 py-2 text-sm font-bold">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          checked={studentAnswers[q.id] === 'FALSE'}
                          onChange={() =>
                            setStudentAnswers({ ...studentAnswers, [q.id]: 'FALSE' })
                          }
                        />
                        <span>SAI (False)</span>
                      </label>
                    </div>
                  )}

                  {q.type === 'ESSAY' && (
                    <textarea
                      rows={3}
                      value={studentAnswers[q.id] || ''}
                      onChange={(e) =>
                        setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })
                      }
                      placeholder="Nhập câu trả lời tự luận của em vào đây..."
                      className="w-full rounded border border-[#D4E8DB] bg-white p-2.5 text-sm"
                    />
                  )}
                </div>
              ))}

              <div className="rounded border border-[#D4E8DB] bg-[#F2FAF5] p-3 text-sm">
                <label className="block font-bold">Đính kèm tệp bài làm (nếu có):</label>
                <input
                  type="file"
                  onChange={(e) => setStudentAttachmentName(e.target.files?.[0]?.name || '')}
                  className="mt-1 text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-[#D4E8DB] pt-4">
                <button
                  type="button"
                  onClick={() => setTakingAssignment(null)}
                  className="rounded border border-[#D4E8DB] px-4 py-2 font-bold"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded bg-[#008653] px-5 py-2 font-bold text-white hover:bg-[#006B42]"
                >
                  <Send className="h-4 w-4" />
                  Nộp bài kiểm tra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
