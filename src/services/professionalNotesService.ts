// FINAL INTEGRATION CORRECTIONS item 3 — Therapist "care goals and
// documentation" / Medical Professional "clinical observations." Thin
// wrapper around patient_notes (migration 044) using the new
// 'therapist_session' / 'clinical_observation' note types. RLS (not this
// file) is what actually enforces that only the assigned therapist or
// medical professional for a given patient can write these, and that
// writing one never implies any clinical ordering/prescribing authority —
// it is a free-text note, the same shape every other note_type uses.
import { supabase } from '@/lib/supabase';

export interface ProfessionalNote {
  id: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export async function getProfessionalNotes(
  patientId: string, noteType: 'therapist_session' | 'clinical_observation',
): Promise<ProfessionalNote[]> {
  const { data, error } = await supabase
    .from('patient_notes')
    .select('id, note, created_at, updated_at')
    .eq('patient_id', patientId)
    .eq('note_type', noteType)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function addProfessionalNote(
  patientId: string, noteType: 'therapist_session' | 'clinical_observation', note: string,
): Promise<{ error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const authorId = userData?.user?.id;
  if (!authorId) return { error: 'Not signed in.' };
  const { error } = await supabase.from('patient_notes').insert({
    patient_id: patientId, author_id: authorId, note: note.trim(), note_type: noteType,
  });
  return { error: error ? error.message : null };
}
