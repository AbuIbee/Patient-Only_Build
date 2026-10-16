// REPAIR 008 / REPAIR A — bundled, obviously-fictional demonstration
// content for the Temporary (72-hour read-only demo) program.
//
// This module imports nothing from '@/lib/supabase' and nothing ever
// touches a network request. That is deliberate, not incidental: it is
// the structural guarantee behind requirement 8 ("do not introduce
// fictional records into production patient tables or storage buckets")
// — there is no code path in this file capable of writing anywhere, real
// or fictional. The three Temp-demo view components
// (src/pages/patient/temp-demo/) render exactly this data and nothing
// else; see those files for the matching "no supabase import" guarantee
// on the read side.
//
// Every name, dosage, and note below is deliberately marked "(Fictional)"
// or "EXAMPLE ONLY" in the visible text itself — not just in a comment —
// so the demonstration nature is obvious to the person viewing it, not
// only to a developer reading this file (requirement 1 and requirement 3).

export const DEMO_PATIENT_NAME = 'Sample Patient (Demo Account)';

export interface DemoMedication {
  id: string;
  name: string;
  genericName: string;
  dosage: string;
  form: 'pill' | 'liquid' | 'injection' | 'patch' | 'inhaler';
  instructions: string;
  prescribedBy: string;
  times: string[];
}

export const DEMO_MEDICATIONS: DemoMedication[] = [
  {
    id: 'demo-med-1',
    name: 'Sample Tablet A (Fictional)',
    genericName: 'demo-compound-a',
    dosage: '10mg — EXAMPLE ONLY',
    form: 'pill',
    instructions: 'Fictional sample instructions for demonstration purposes only — not a real prescription.',
    prescribedBy: 'Dr. Demo Example',
    times: ['08:00', '20:00'],
  },
  {
    id: 'demo-med-2',
    name: 'Sample Liquid B (Fictional)',
    genericName: 'demo-compound-b',
    dosage: '5ml — EXAMPLE ONLY',
    form: 'liquid',
    instructions: 'Fictional sample instructions for demonstration purposes only.',
    prescribedBy: 'Dr. Demo Example',
    times: ['12:00'],
  },
  {
    id: 'demo-med-3',
    name: 'Sample Patch C (Fictional)',
    genericName: 'demo-compound-c',
    dosage: '4.6mg/24h — EXAMPLE ONLY',
    form: 'patch',
    instructions: 'Demonstration-only entry; not a real medication record.',
    prescribedBy: 'Dr. Demo Example',
    times: ['09:00'],
  },
];

export interface DemoDocument {
  id: string;
  title: string;
  section: 'medical_docs' | 'medical_bills';
  note: string;
  uploadedAt: string;
}

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    id: 'demo-doc-1',
    title: 'Sample Visit Summary (Fictional)',
    section: 'medical_docs',
    note: 'Example content for demonstration only — not a real document.',
    uploadedAt: '2026-01-02',
  },
  {
    id: 'demo-doc-2',
    title: 'Sample Lab Results (Fictional)',
    section: 'medical_docs',
    note: 'Fictional sample content for demonstration only.',
    uploadedAt: '2026-01-10',
  },
  {
    id: 'demo-doc-3',
    title: 'Sample Billing Statement (Fictional)',
    section: 'medical_bills',
    note: 'Demonstration-only entry — not a real billing record.',
    uploadedAt: '2026-01-15',
  },
];

export interface DemoMediaItem {
  id: string;
  caption: string;
  fileType: 'photo' | 'video' | 'audio';
  uploadedBy: string;
}

export const DEMO_MEDIA: DemoMediaItem[] = [
  { id: 'demo-media-1', caption: 'Sample family gathering (fictional placeholder — no real photo is stored)', fileType: 'photo', uploadedBy: 'Demo Family Member' },
  { id: 'demo-media-2', caption: 'Sample birthday video (fictional placeholder — no real video is stored)', fileType: 'video', uploadedBy: 'Demo Family Member' },
  { id: 'demo-media-3', caption: 'Sample voice message (fictional placeholder — no real audio is stored)', fileType: 'audio', uploadedBy: 'Demo Family Member' },
];

export const DEMO_DISABLED_MESSAGE =
  'This is a demonstration account. Nothing can be added, changed, or removed, and everything shown here is fictional sample content — not real data.';
