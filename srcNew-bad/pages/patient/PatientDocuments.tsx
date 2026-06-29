import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { FileText, CalendarDays, CalendarRange, Calendar, Upload, Trash2, FileIcon, Edit2, Check, X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Care Partner Log types ───────────────────────────────────────────────────
type LogRow = {
  id: string;
  patient_id: string;
  report_date: string;
  submitted_at: string;
  mood: string | null;
  meals: string | null;
  hydration: string | null;
  medications: string | null;
  mobility: string | null;
  exercise: string | null;
  sleep_quality: string | null;
  pain_level: number | null;
  notes: string | null;
  answers: Record<string, unknown> | null;
};

type FilterMode = 'day' | 'week' | 'month';

// ─── User Document types (Supabase-backed) ───────────────────────────────────
interface UserDocument {
  id: string;           // Supabase DB row id
  name: string;         // original filename
  noteText: string;
  storagePath: string;  // path in Supabase Storage bucket
  fileType: string;
  uploadedAt: string;
  signedUrl?: string;   // generated at read time
  section: 'medical_docs' | 'medical_bills';
}

// ─── Care Partner personal notes ─────────────────────────────────────────────
interface CareNote {
  id: string;
  date: string;       // YYYY-MM-DD
  text: string;
  createdAt: string;
}

const NOTES_STORAGE_KEY = 'carePartnerPersonalNotes';
const DOC_BUCKET = 'patient-documents';
const MAX_DOC_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

// ─── Supabase document helpers ────────────────────────────────────────────────
async function signDocUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) return '';
  return data.signedUrl;
}

function loadCareNotes(): CareNote[] {
  try { return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveCareNotes(notes: CareNote[]) {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getWeekStart(dateString: string) {
  const date = new Date(dateString + 'T12:00:00');
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7);
}

function fileTypeIcon(fileType: string) {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType === 'application/pdf') return '📄';
  if (fileType.includes('word')) return '📝';
  if (fileType.includes('sheet') || fileType.includes('excel')) return '📊';
  return '📁';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PatientDocuments() {
  const { state } = useApp();
  const patientId = state.currentUser?.id || state.patient?.id || '';

  // Care Partner Papers state
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('day');

  // User Documents state (Supabase-backed)
  const [userDocs, setUserDocs] = useState<UserDocument[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Medical Bills state (Supabase-backed)
  const [bills, setBills] = useState<UserDocument[]>([]);
  const [billUploadError, setBillUploadError] = useState('');
  const [billsLoading, setBillsLoading] = useState(false);
  const [billUploading, setBillUploading] = useState(false);
  const billInputRef = useRef<HTMLInputElement>(null);

  // Care Partner personal notes state
  const [careNotes, setCareNotes] = useState<CareNote[]>(loadCareNotes);
  const [noteFilter, setNoteFilter] = useState<FilterMode>('day');
  const [selectedNoteDate, setSelectedNoteDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [noteInput, setNoteInput] = useState('');
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  // Calendar week/month state for notes
  const [calBase, setCalBase] = useState(new Date());

  useEffect(() => {
    if (!patientId) return;
    loadLogs();
    loadDocs('medical_docs');
    loadDocs('medical_bills');
  }, [patientId]);

  // ── Load documents from Supabase ──────────────────────────────────────────
  const loadDocs = async (section: UserDocument['section']) => {
    if (!patientId) return;
    const setter = section === 'medical_docs' ? setDocsLoading : setBillsLoading;
    setter(true);
    try {
      const { data, error } = await supabase
        .from('patient_document_uploads')
        .select('*')
        .eq('patient_id', patientId)
        .eq('section', section)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      const items = await Promise.all((data || []).map(async (row: any) => {
        const signedUrl = await signDocUrl(row.storage_path);
        return {
          id: row.id,
          name: row.file_name,
          noteText: row.note_text || '',
          storagePath: row.storage_path,
          fileType: row.file_type,
          uploadedAt: row.uploaded_at,
          signedUrl,
          section: row.section,
        } as UserDocument;
      }));
      if (section === 'medical_docs') setUserDocs(items);
      else setBills(items);
    } catch (err: any) {
      console.error('loadDocs error:', err);
    } finally {
      setter(false);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffDate = cutoff.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('care_partner_logs')
        .select('*')
        .eq('patient_id', patientId)
        .gte('report_date', cutoffDate)
        .order('report_date', { ascending: false });
      if (error) { console.error(error); setLogs([]); return; }
      setLogs((data || []) as LogRow[]);
    } finally {
      setLoading(false);
    }
  };

  const groupedLogs = useMemo(() => {
    if (filterMode === 'day') {
      const groups: Record<string, LogRow[]> = {};
      logs.forEach((log) => {
        if (!groups[log.report_date]) groups[log.report_date] = [];
        groups[log.report_date].push(log);
      });
      return Object.entries(groups);
    }
    if (filterMode === 'week') {
      const groups: Record<string, LogRow[]> = {};
      logs.forEach((log) => {
        const key = getWeekStart(log.report_date);
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
      });
      return Object.entries(groups);
    }
    const groups: Record<string, LogRow[]> = {};
    logs.forEach((log) => {
      const key = getMonthKey(log.report_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    });
    return Object.entries(groups);
  }, [logs, filterMode]);

  // ── Generic Supabase document upload ─────────────────────────────────────
  const uploadDoc = async (
    file: File,
    section: UserDocument['section'],
    setError: (e: string) => void,
    setUploadingFlag: (v: boolean) => void,
  ) => {
    if (!patientId) return;
    if (file.size > MAX_DOC_SIZE) {
      setError('File is too large (max 5 GB).');
      return;
    }
    setError('');
    setUploadingFlag(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const storagePath = `${patientId}/${section}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;

      const { error: upErr } = await supabase.storage
        .from(DOC_BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data: row, error: dbErr } = await supabase
        .from('patient_document_uploads')
        .insert({
          patient_id:   patientId,
          section,
          file_name:    file.name,
          file_type:    file.type,
          storage_path: storagePath,
          note_text:    '',
          uploaded_at:  new Date().toISOString(),
        })
        .select()
        .single();
      if (dbErr) throw dbErr;

      const signedUrl = await signDocUrl(storagePath);
      const doc: UserDocument = {
        id: row.id,
        name: file.name,
        noteText: '',
        storagePath,
        fileType: file.type,
        uploadedAt: row.uploaded_at,
        signedUrl,
        section,
      };
      if (section === 'medical_docs') setUserDocs(prev => [doc, ...prev]);
      else setBills(prev => [doc, ...prev]);
    } catch (err: any) {
      setError('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploadingFlag(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadDoc(file, 'medical_docs', setUploadError, setUploading);
    e.target.value = '';
  };

  const removeDoc = async (id: string, storagePath: string) => {
    await supabase.storage.from(DOC_BUCKET).remove([storagePath]);
    await supabase.from('patient_document_uploads').delete().eq('id', id);
    setUserDocs(prev => prev.filter(d => d.id !== id));
    if (editingDocId === id) setEditingDocId(null);
  };

  const startEditNote = (doc: UserDocument) => {
    setEditingDocId(doc.id);
    setEditNote(doc.noteText);
  };

  const saveNote = async (id: string) => {
    await supabase.from('patient_document_uploads').update({ note_text: editNote }).eq('id', id);
    setUserDocs(prev => prev.map(d => d.id === id ? { ...d, noteText: editNote } : d));
    setEditingDocId(null);
  };

  // ── Bills upload ──────────────────────────────────────────────────────────
  const handleBillUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadDoc(file, 'medical_bills', setBillUploadError, setBillUploading);
    e.target.value = '';
  };

  const removeBill = async (id: string, storagePath: string) => {
    await supabase.storage.from(DOC_BUCKET).remove([storagePath]);
    await supabase.from('patient_document_uploads').delete().eq('id', id);
    setBills(prev => prev.filter(d => d.id !== id));
  };

  // ── Care notes handlers ────────────────────────────────────────────────────
  const addCareNote = () => {
    if (!noteInput.trim()) return;
    const note: CareNote = {
      id: `cn_${Date.now()}`,
      date: selectedNoteDate,
      text: noteInput.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [note, ...careNotes];
    saveCareNotes(updated);
    setCareNotes(updated);
    setNoteInput('');
  };

  const deleteCareNote = (id: string) => {
    const updated = careNotes.filter(n => n.id !== id);
    saveCareNotes(updated);
    setCareNotes(updated);
  };

  const saveEditNote = (id: string) => {
    const updated = careNotes.map(n => n.id === id ? { ...n, text: editNoteText.trim() } : n);
    saveCareNotes(updated);
    setCareNotes(updated);
    setEditNoteId(null);
  };

  // Calendar helpers for notes
  const today = new Date().toISOString().slice(0, 10);
  const calWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calBase);
    d.setDate(d.getDate() - d.getDay() + i);
    return d.toISOString().slice(0, 10);
  });
  const calMonthDays = (() => {
    const y = calBase.getFullYear();
    const m = calBase.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const blanks = Array(first.getDay()).fill(null);
    const days = Array.from({ length: last.getDate() }, (_, i) => new Date(y, m, i + 1).toISOString().slice(0, 10));
    return [...blanks, ...days];
  })();

  const notesOnDate = (date: string) => careNotes.filter(n => n.date === date);

  const filterButtons = [
    { id: 'day'   as FilterMode, label: 'Day',   icon: CalendarDays  },
    { id: 'week'  as FilterMode, label: 'Week',  icon: CalendarRange },
    { id: 'month' as FilterMode, label: 'Month', icon: Calendar      },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">

      {/* ══ SECTION 2: Patient Medical Documents ════════════════════════════════ */}
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-calm-blue/10 flex items-center justify-center">
                <FileIcon className="w-6 h-6 text-calm-blue" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Patient Medical Documents</h1>
                <p className="text-medium-gray text-sm">Upload and manage your medical documents</p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 bg-calm-blue text-white text-sm font-semibold cursor-pointer hover:bg-calm-blue/90 transition-colors">
              <Plus className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload Document"}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {uploadError && (
            <div className="mt-3 px-4 py-3 bg-gentle-coral/10 border border-gentle-coral/30 rounded-xl text-sm text-gentle-coral">
              {uploadError}
            </div>
          )}
        </div>

        <div className="px-6 py-6 sm:px-8">
          {docsLoading ? (
            <p className="text-medium-gray text-sm">Loading documents…</p>
          ) : userDocs.length === 0 ? (
            <label className="flex flex-col items-center justify-center gap-4 py-14 border-2 border-dashed border-soft-taupe rounded-2xl cursor-pointer hover:border-calm-blue hover:bg-calm-blue/5 transition-all group">
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={handleFileUpload}
              />
              <div className="w-16 h-16 rounded-2xl bg-calm-blue/10 flex items-center justify-center group-hover:bg-calm-blue/20 transition-colors">
                <Upload className="w-8 h-8 text-calm-blue" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-charcoal">Upload your first document</p>
                <p className="text-sm text-medium-gray mt-1">PDF, images, Word docs, spreadsheets — up to 5 GB</p>
              </div>
            </label>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {userDocs.map((doc) => {
                  const isEditing = editingDocId === doc.id;
                  const isImage = doc.fileType.startsWith('image/');
                  return (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="rounded-2xl border border-soft-taupe bg-warm-ivory overflow-hidden"
                    >
                      <div className="flex items-start gap-4 p-4">
                        {/* Preview or icon */}
                        {isImage ? (
                          <img
                            src={doc.signedUrl || doc.storagePath}
                            alt={doc.name}
                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-soft-taupe"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-white border border-soft-taupe flex items-center justify-center text-2xl flex-shrink-0">
                            {fileTypeIcon(doc.fileType)}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-charcoal truncate">{doc.name}</p>
                          <p className="text-xs text-medium-gray mt-0.5">
                            Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>

                          {/* Note line */}
                          <div className="mt-2">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  value={editNote}
                                  onChange={e => setEditNote(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveNote(doc.id); if (e.key === 'Escape') setEditingDocId(null); }}
                                  placeholder="Add a note…"
                                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-soft-taupe focus:outline-none focus:ring-2 focus:ring-calm-blue/40 bg-white"
                                  autoFocus
                                />
                                <button onClick={() => saveNote(doc.id)} className="w-7 h-7 rounded-full bg-soft-sage/20 hover:bg-soft-sage/40 flex items-center justify-center">
                                  <Check className="w-3.5 h-3.5 text-soft-sage" />
                                </button>
                                <button onClick={() => setEditingDocId(null)} className="w-7 h-7 rounded-full hover:bg-soft-taupe/60 flex items-center justify-center">
                                  <X className="w-3.5 h-3.5 text-medium-gray" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditNote(doc)}
                                className="flex items-center gap-1.5 text-sm text-medium-gray hover:text-charcoal transition-colors group/note"
                              >
                                <Edit2 className="w-3 h-3 opacity-50 group-hover/note:opacity-100" />
                                <span className="italic">{doc.noteText || 'Add a note…'}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {isImage && (
                            <a
                              href={doc.signedUrl || doc.storagePath}
                              download={doc.name}
                              className="w-8 h-8 rounded-full bg-calm-blue/10 hover:bg-calm-blue/20 flex items-center justify-center transition-colors"
                              title="Download"
                            >
                              <Upload className="w-3.5 h-3.5 text-calm-blue rotate-180" />
                            </a>
                          )}
                          <button
                            onClick={() => removeDoc(doc.id, doc.storagePath)}
                            className="w-8 h-8 rounded-full hover:bg-gentle-coral/10 flex items-center justify-center transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-gentle-coral" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Add more button */}
              <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-calm-blue/30 hover:border-calm-blue rounded-2xl cursor-pointer text-calm-blue text-sm font-medium transition-all hover:bg-calm-blue/5">
                <Plus className="w-4 h-4" />
                Upload Another Document
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          )}
        </div>
      </div>
      {/* ══ SECTION 3: Patient Medical Bills ══════════════════════════════════ */}
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-warm-amber/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-warm-amber" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Patient Medical Bills</h1>
                <p className="text-medium-gray text-sm">Upload and store medical bills and statements</p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 bg-warm-amber text-white text-sm font-semibold cursor-pointer hover:bg-warm-amber/90 transition-colors">
              <Plus className="w-4 h-4" />
              Upload Bill
              <input ref={billInputRef} type="file" className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={handleBillUpload} />
            </label>
          </div>
          {billUploadError && (
            <div className="mt-3 px-4 py-3 bg-gentle-coral/10 border border-gentle-coral/30 rounded-xl text-sm text-gentle-coral">{billUploadError}</div>
          )}
        </div>

        <div className="px-6 py-6 sm:px-8">
          {bills.length === 0 ? (
            <label className="flex flex-col items-center justify-center gap-4 py-14 border-2 border-dashed border-soft-taupe rounded-2xl cursor-pointer hover:border-warm-amber hover:bg-warm-amber/5 transition-all group">
              <input type="file" className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={handleBillUpload} />
              <div className="w-16 h-16 rounded-2xl bg-warm-amber/10 flex items-center justify-center group-hover:bg-warm-amber/20 transition-colors">
                <Upload className="w-8 h-8 text-warm-amber" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-charcoal">Upload your first medical bill</p>
                <p className="text-sm text-medium-gray mt-1">PDF, images, Word docs, spreadsheets — up to 5 GB</p>
              </div>
            </label>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {bills.map(doc => {
                  const isImage = doc.fileType.startsWith('image/');
                  return (
                    <motion.div key={doc.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}
                      className="rounded-2xl border border-soft-taupe bg-warm-ivory overflow-hidden">
                      <div className="flex items-start gap-4 p-4">
                        {isImage ? (
                          <img src={doc.signedUrl || doc.storagePath} alt={doc.name}
                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-soft-taupe" />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-white border border-soft-taupe flex items-center justify-center text-2xl flex-shrink-0">
                            {fileTypeIcon(doc.fileType)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-charcoal truncate">{doc.name}</p>
                          <p className="text-xs text-medium-gray mt-0.5">Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {isImage && (
                            <a href={doc.signedUrl || doc.storagePath} download={doc.name}
                              className="w-8 h-8 rounded-full bg-warm-amber/10 hover:bg-warm-amber/20 flex items-center justify-center transition-colors" title="Download">
                              <Upload className="w-3.5 h-3.5 text-warm-amber rotate-180" />
                            </a>
                          )}
                          <button onClick={() => removeBill(doc.id, doc.storagePath)}
                            className="w-8 h-8 rounded-full hover:bg-gentle-coral/10 flex items-center justify-center transition-colors" title="Remove">
                            <Trash2 className="w-3.5 h-3.5 text-gentle-coral" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-warm-amber/30 hover:border-warm-amber rounded-2xl cursor-pointer text-warm-amber text-sm font-medium transition-all hover:bg-warm-amber/5">
                <Plus className="w-4 h-4" />
                Upload Another Bill
                <input type="file" className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={handleBillUpload} />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ══ SECTION 1: Care Partner Papers ══════════════════════════════════ */}
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-warm-bronze/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-warm-bronze" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Care Partner Notes</h1>
                <p className="text-medium-gray text-sm">Care partner logs and personal notes</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {filterButtons.map((button) => {
                const Icon = button.icon;
                const active = filterMode === button.id;
                return (
                  <button
                    key={button.id}
                    onClick={() => setFilterMode(button.id)}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                      active ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-charcoal hover:bg-soft-taupe'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {button.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          {loading ? (
            <p className="text-medium-gray">Loading saved care partner logs...</p>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl bg-warm-ivory p-6 text-medium-gray">
              No saved care partner logs yet. Submit one from the Care Partner page.
            </div>
          ) : (
            <div className="space-y-6">
              {groupedLogs.map(([groupKey, items]) => (
                <section key={groupKey} className="rounded-2xl border border-soft-taupe overflow-hidden">
                  <div className="bg-soft-taupe/25 px-5 py-4 border-b border-soft-taupe">
                    <h2 className="text-lg font-bold text-charcoal">
                      {filterMode === 'day'   && `Day: ${new Date(groupKey + 'T12:00:00').toLocaleDateString()}`}
                      {filterMode === 'week'  && `Week Starting: ${new Date(groupKey + 'T12:00:00').toLocaleDateString()}`}
                      {filterMode === 'month' && `Month: ${new Date(groupKey + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}
                    </h2>
                    <p className="text-sm text-medium-gray">{items.length} saved log{items.length !== 1 ? 's' : ''}</p>
                  </div>

                  <div className="divide-y divide-soft-taupe">
                    {items.map((log) => (
                      <div key={log.id} className="p-5 space-y-4 bg-white">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-charcoal">
                              Report Date: {new Date(log.report_date + 'T12:00:00').toLocaleDateString()}
                            </p>
                            <p className="text-sm text-medium-gray">
                              Submitted: {new Date(log.submitted_at).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                          <InfoCard label="Mood"         value={log.mood} />
                          <InfoCard label="Meals"        value={log.meals} />
                          <InfoCard label="Hydration"    value={log.hydration} />
                          <InfoCard label="Medications"  value={log.medications} />
                          <InfoCard label="Mobility"     value={log.mobility} />
                          <InfoCard label="Exercise"     value={log.exercise} />
                          <InfoCard label="Sleep Quality" value={log.sleep_quality} />
                          <InfoCard label="Pain Level"   value={log.pain_level === null ? '' : String(log.pain_level)} />
                        </div>

                        <div className="rounded-2xl bg-warm-ivory p-4">
                          <p className="text-sm font-semibold text-charcoal mb-2">Notes</p>
                          <p className="text-sm text-medium-gray whitespace-pre-wrap">
                            {log.notes?.trim() || 'No notes entered.'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Personal Notes Calendar ──────────────────────────────────────── */}
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-soft-sage/20 flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-soft-sage" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Personal Notes</h1>
                <p className="text-medium-gray text-sm">Add private notes to any day</p>
              </div>
            </div>
            <div className="flex gap-2">
              {(['day','week','month'] as FilterMode[]).map(m => (
                <button key={m} onClick={() => { setNoteFilter(m); setCalBase(new Date()); }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${noteFilter === m ? 'bg-soft-sage text-white' : 'bg-soft-taupe/40 text-charcoal hover:bg-soft-taupe'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8 space-y-5">

          {/* Day view */}
          {noteFilter === 'day' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => { const d = new Date(selectedNoteDate); d.setDate(d.getDate()-1); setSelectedNoteDate(d.toISOString().slice(0,10)); }}
                  className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                  <svg className="w-5 h-5 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <p className="font-semibold text-charcoal">
                  {selectedNoteDate === today ? 'Today — ' : ''}{new Date(selectedNoteDate + 'T12:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
                </p>
                <button onClick={() => { const d = new Date(selectedNoteDate); d.setDate(d.getDate()+1); setSelectedNoteDate(d.toISOString().slice(0,10)); }}
                  className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                  <svg className="w-5 h-5 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              {notesOnDate(selectedNoteDate).length === 0 && (
                <p className="text-sm text-medium-gray italic">No notes for this day yet.</p>
              )}
              <div className="space-y-2">
                {notesOnDate(selectedNoteDate).map(n => (
                  <div key={n.id} className="flex items-start gap-2 p-3 bg-soft-sage/8 border border-soft-sage/25 rounded-xl">
                    {editNoteId === n.id ? (
                      <>
                        <input value={editNoteText} onChange={e => setEditNoteText(e.target.value)}
                          onKeyDown={e => { if(e.key==='Enter') saveEditNote(n.id); if(e.key==='Escape') setEditNoteId(null); }}
                          className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-soft-taupe focus:outline-none focus:ring-2 focus:ring-soft-sage/40 bg-white" autoFocus />
                        <button onClick={() => saveEditNote(n.id)} className="text-xs px-2 py-1 bg-soft-sage text-white rounded-lg font-semibold">Save</button>
                        <button onClick={() => setEditNoteId(null)} className="text-xs px-2 py-1 text-medium-gray hover:text-charcoal">Cancel</button>
                      </>
                    ) : (
                      <>
                        <p className="flex-1 text-sm text-charcoal">{n.text}</p>
                        <button onClick={() => { setEditNoteId(n.id); setEditNoteText(n.text); }} className="text-xs text-medium-gray hover:text-charcoal px-1">✏️</button>
                        <button onClick={() => deleteCareNote(n.id)} className="text-xs text-gentle-coral hover:text-gentle-coral/80 px-1">✕</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={noteInput} onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter') addCareNote(); }}
                  placeholder="Add a note for this day…"
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-soft-taupe focus:outline-none focus:ring-2 focus:ring-soft-sage/40 bg-white" />
                <button onClick={addCareNote} disabled={!noteInput.trim()}
                  className="px-4 py-2 bg-soft-sage text-white rounded-xl text-sm font-semibold hover:bg-soft-sage/90 transition-colors disabled:opacity-40">
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Week view */}
          {noteFilter === 'week' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => { const d = new Date(calBase); d.setDate(d.getDate()-7); setCalBase(d); }}
                  className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                  <svg className="w-5 h-5 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <p className="font-semibold text-charcoal text-sm">
                  {new Date(calWeekDays[0]+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} – {new Date(calWeekDays[6]+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                </p>
                <button onClick={() => { const d = new Date(calBase); d.setDate(d.getDate()+7); setCalBase(d); }}
                  className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                  <svg className="w-5 h-5 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <p key={d} className="text-xs font-bold text-medium-gray">{d}</p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calWeekDays.map(d => {
                  const count = notesOnDate(d).length;
                  const isToday = d === today;
                  const isSelected = d === selectedNoteDate;
                  return (
                    <button key={d} onClick={() => { setSelectedNoteDate(d); setNoteFilter('day'); }}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105 border ${isSelected ? 'bg-soft-sage text-white border-soft-sage' : isToday ? 'border-warm-bronze bg-warm-bronze/5' : count > 0 ? 'bg-soft-sage/15 border-soft-sage/30' : 'bg-white border-stone-100'}`}>
                      <span className={`text-xs font-bold ${isSelected ? 'text-white' : isToday ? 'text-warm-bronze' : 'text-charcoal'}`}>{new Date(d+'T12:00').getDate()}</span>
                      {count > 0 && <span className={`text-[9px] font-semibold ${isSelected ? 'text-white/80' : 'text-soft-sage'}`}>{count}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-medium-gray text-center">Tap a day to view or add notes</p>
            </div>
          )}

          {/* Month view */}
          {noteFilter === 'month' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => { const d = new Date(calBase.getFullYear(), calBase.getMonth()-1, 1); setCalBase(d); }}
                  className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                  <svg className="w-5 h-5 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <p className="font-semibold text-charcoal">
                  {calBase.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
                </p>
                <button onClick={() => { const d = new Date(calBase.getFullYear(), calBase.getMonth()+1, 1); setCalBase(d); }}
                  className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                  <svg className="w-5 h-5 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                  <p key={d} className="text-xs font-bold text-medium-gray py-1">{d}</p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calMonthDays.map((d, i) => {
                  if (!d) return <div key={`blank-${i}`} />;
                  const count = notesOnDate(d).length;
                  const isToday = d === today;
                  const isSelected = d === selectedNoteDate;
                  return (
                    <button key={d} onClick={() => { setSelectedNoteDate(d); setNoteFilter('day'); }}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105 border text-xs font-bold ${isSelected ? 'bg-soft-sage text-white border-soft-sage' : isToday ? 'border-warm-bronze text-warm-bronze bg-warm-bronze/5' : count > 0 ? 'bg-soft-sage/15 border-soft-sage/30 text-charcoal' : 'bg-white border-stone-100 text-charcoal'}`}>
                      {new Date(d+'T12:00').getDate()}
                      {count > 0 && <span className={`text-[8px] font-semibold ${isSelected ? 'text-white/80' : 'text-soft-sage'}`}>{count}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-medium-gray text-center">Tap a day to view or add notes</p>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-soft-taupe bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-medium-gray mb-1">{label}</p>
      <p className="text-sm font-semibold text-charcoal">{value || '—'}</p>
    </div>
  );
}