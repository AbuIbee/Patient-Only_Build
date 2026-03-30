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

// ─── User Document types ──────────────────────────────────────────────────────
interface UserDocument {
  id: string;
  name: string;
  noteText: string;
  dataUrl: string;
  fileType: string;
  uploadedAt: string;
}

const DOC_STORAGE_KEY = 'patientUserDocuments';

function loadUserDocs(): UserDocument[] {
  try { return JSON.parse(localStorage.getItem(DOC_STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveUserDocs(docs: UserDocument[]) {
  localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(docs));
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

  // User Documents state
  const [userDocs, setUserDocs] = useState<UserDocument[]>(loadUserDocs);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!patientId) return;
    loadLogs();
  }, [patientId]);

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

  // ── Document upload ────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');

    // 10 MB cap to avoid localStorage overflow
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large (max 10 MB). Please choose a smaller file.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const doc: UserDocument = {
        id: `doc_${Date.now()}`,
        name: file.name,
        noteText: '',
        dataUrl,
        fileType: file.type,
        uploadedAt: new Date().toISOString(),
      };
      const updated = [doc, ...userDocs];
      try {
        saveUserDocs(updated);
        setUserDocs(updated);
      } catch {
        setUploadError('Storage is full. Please remove some documents before adding new ones.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeDoc = (id: string) => {
    const updated = userDocs.filter(d => d.id !== id);
    saveUserDocs(updated);
    setUserDocs(updated);
    if (editingDocId === id) setEditingDocId(null);
  };

  const startEditNote = (doc: UserDocument) => {
    setEditingDocId(doc.id);
    setEditNote(doc.noteText);
  };

  const saveNote = (id: string) => {
    const updated = userDocs.map(d => d.id === id ? { ...d, noteText: editNote } : d);
    saveUserDocs(updated);
    setUserDocs(updated);
    setEditingDocId(null);
  };

  const filterButtons = [
    { id: 'day'   as FilterMode, label: 'Day',   icon: CalendarDays  },
    { id: 'week'  as FilterMode, label: 'Week',  icon: CalendarRange },
    { id: 'month' as FilterMode, label: 'Month', icon: Calendar      },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">

      {/* ══ SECTION 1: Care Partner Papers ══════════════════════════════════ */}
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-warm-bronze/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-warm-bronze" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Care Partner Papers</h1>
                <p className="text-medium-gray text-sm">Care partner logs saved from the last 30 days</p>
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

      {/* ══ SECTION 2: Documents ════════════════════════════════════════════ */}
      <div className="rounded-3xl bg-white shadow-card overflow-hidden">
        <div className="border-b border-soft-taupe px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-calm-blue/10 flex items-center justify-center">
                <FileIcon className="w-6 h-6 text-calm-blue" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Documents</h1>
                <p className="text-medium-gray text-sm">Upload and manage your personal documents</p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 bg-calm-blue text-white text-sm font-semibold cursor-pointer hover:bg-calm-blue/90 transition-colors">
              <Plus className="w-4 h-4" />
              Upload Document
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
          {userDocs.length === 0 ? (
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
                <p className="text-sm text-medium-gray mt-1">PDF, images, Word docs, spreadsheets — up to 10 MB</p>
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
                            src={doc.dataUrl}
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
                              href={doc.dataUrl}
                              download={doc.name}
                              className="w-8 h-8 rounded-full bg-calm-blue/10 hover:bg-calm-blue/20 flex items-center justify-center transition-colors"
                              title="Download"
                            >
                              <Upload className="w-3.5 h-3.5 text-calm-blue rotate-180" />
                            </a>
                          )}
                          <button
                            onClick={() => removeDoc(doc.id)}
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
