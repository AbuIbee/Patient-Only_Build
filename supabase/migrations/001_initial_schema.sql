-- CareCompanion Initial Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('patient', 'caregiver', 'therapist')),
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'caregiver')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PATIENTS TABLE
-- ============================================
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    preferred_name TEXT,
    date_of_birth DATE,
    photo_url TEXT,
    location TEXT,
    address TEXT,
    affirmation TEXT DEFAULT 'You are safe. You are loved. You are at home.',
    diagnosis_date DATE,
    dementia_stage TEXT CHECK (dementia_stage IN ('early', 'middle', 'late')),
    
    -- Emergency Contact
    emergency_contact_name TEXT,
    emergency_contact_relationship TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_email TEXT,
    
    -- Preferences
    preferences_language TEXT DEFAULT 'en',
    preferences_font_size TEXT DEFAULT 'large' CHECK (preferences_font_size IN ('normal', 'large', 'extra-large')),
    preferences_high_contrast BOOLEAN DEFAULT false,
    preferences_audio_enabled BOOLEAN DEFAULT true,
    preferences_notifications_enabled BOOLEAN DEFAULT true,
    preferences_tone TEXT DEFAULT 'gentle' CHECK (preferences_tone IN ('gentle', 'professional', 'friendly')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- ROUND 5 / migration-chain fix: the four "patients" policies below
-- (originally placed here, immediately after this ALTER TABLE) all
-- reference caregiver_patients, which this file does not create until
-- further down. On every environment this migration had ALREADY been
-- applied to (staging, production), that was never hit — the tracked
-- file content here only matters to a FRESH install, and no fresh
-- install had ever actually been attempted against this file until
-- Round 4's local-stack work, which reproduced
-- "ERROR: relation \"caregiver_patients\" does not exist (SQLSTATE 42P01)"
-- verbatim. This edit is a PURE REORDERING — the exact same four
-- CREATE POLICY statements, byte-for-byte, simply moved to after
-- caregiver_patients is created below. No table, column, policy
-- definition, grant, or semantic behavior changes. Because Supabase's
-- migration history only tracks whether a given migration VERSION
-- (this file's timestamp-prefixed name) has already been applied —
-- never re-diffing or re-running file content against an
-- already-migrated database — this has zero effect on any environment
-- where 001 has already run; it only fixes the chain for a genuinely
-- fresh install (local dev, CI, a new environment), which is exactly
-- the "explicit, justified clean-install compatibility plan" this
-- change needs.

-- ============================================
-- CAREGIVER_PATIENTS TABLE (junction table)
-- ============================================
CREATE TABLE caregiver_patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caregiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    relationship TEXT DEFAULT 'Primary Caregiver',
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(caregiver_id, patient_id)
);

-- Enable RLS
ALTER TABLE caregiver_patients ENABLE ROW LEVEL SECURITY;

-- Caregiver_patients policies
CREATE POLICY "Caregivers can view their relationships"
    ON caregiver_patients FOR SELECT
    USING (caregiver_id = auth.uid());

CREATE POLICY "Caregivers can create relationships"
    ON caregiver_patients FOR INSERT
    WITH CHECK (caregiver_id = auth.uid());

CREATE POLICY "Caregivers can delete their relationships"
    ON caregiver_patients FOR DELETE
    USING (caregiver_id = auth.uid());

-- Patients policies (moved here from immediately after "ALTER TABLE
-- patients ENABLE ROW LEVEL SECURITY" above — see the Round 5 note
-- there; unchanged otherwise)
CREATE POLICY "Caregivers can view their patients"
    ON patients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = patients.id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can create patients"
    ON patients FOR INSERT
    WITH CHECK (true); -- Allow creation, relationship will be created separately

CREATE POLICY "Caregivers can update their patients"
    ON patients FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = patients.id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can delete their patients"
    ON patients FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = patients.id
            AND cp.caregiver_id = auth.uid()
            AND cp.is_primary = true
        )
    );

-- ============================================
-- PATIENT NOTES TABLE
-- ============================================
CREATE TABLE patient_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    caregiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    note_type TEXT DEFAULT 'general' CHECK (note_type IN ('general', 'medical', 'behavior', 'mood', 'activity')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE patient_notes ENABLE ROW LEVEL SECURITY;

-- Patient_notes policies
CREATE POLICY "Caregivers can view notes for their patients"
    ON patient_notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = patient_notes.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can create notes for their patients"
    ON patient_notes FOR INSERT
    WITH CHECK (
        caregiver_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = patient_notes.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can update their own notes"
    ON patient_notes FOR UPDATE
    USING (caregiver_id = auth.uid());

CREATE POLICY "Caregivers can delete their own notes"
    ON patient_notes FOR DELETE
    USING (caregiver_id = auth.uid());

-- ============================================
-- MEDICATIONS TABLE
-- ============================================
CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    generic_name TEXT,
    dosage TEXT NOT NULL,
    form TEXT CHECK (form IN ('pill', 'liquid', 'injection', 'patch', 'inhaler')),
    instructions TEXT NOT NULL,
    prescribed_by TEXT,
    prescription_date DATE,
    side_effects TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view medications for their patients"
    ON medications FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = medications.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can manage medications for their patients"
    ON medications FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = medications.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- MEDICATION SCHEDULES TABLE
-- ============================================
CREATE TABLE medication_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    days_of_week INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE medication_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view medication schedules"
    ON medication_schedules FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM medications m
            JOIN caregiver_patients cp ON m.patient_id = cp.patient_id
            WHERE m.id = medication_schedules.medication_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- MEDICATION LOGS TABLE
-- ============================================
CREATE TABLE medication_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    scheduled_time TEXT NOT NULL,
    taken_time TIMESTAMP WITH TIME ZONE,
    status TEXT CHECK (status IN ('taken', 'missed', 'pending', 'skipped')),
    notes TEXT,
    recorded_by TEXT NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view medication logs"
    ON medication_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = medication_logs.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can create medication logs"
    ON medication_logs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = medication_logs.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'check',
    time_of_day TEXT CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
    scheduled_time TEXT,
    days_of_week INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
    completed_at TIMESTAMP WITH TIME ZONE,
    is_recurring BOOLEAN DEFAULT true,
    difficulty TEXT CHECK (difficulty IN ('early', 'middle', 'late')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view tasks for their patients"
    ON tasks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = tasks.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can manage tasks for their patients"
    ON tasks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = tasks.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- MOOD ENTRIES TABLE
-- ============================================
CREATE TABLE mood_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    mood TEXT NOT NULL CHECK (mood IN ('happy', 'calm', 'sad', 'anxious', 'angry', 'confused', 'scared', 'worried')),
    intensity INTEGER NOT NULL CHECK (intensity >= 1 AND intensity <= 10),
    note TEXT,
    triggers TEXT[] DEFAULT '{}',
    time_of_day TEXT CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view mood entries"
    ON mood_entries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = mood_entries.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can create mood entries"
    ON mood_entries FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = mood_entries.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- MEMORIES TABLE
-- ============================================
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    photo_url TEXT,
    audio_url TEXT,
    date DATE,
    location TEXT,
    people TEXT[] DEFAULT '{}',
    category TEXT CHECK (category IN ('photo', 'audio', 'video', 'story')),
    tags TEXT[] DEFAULT '{}',
    is_favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view memories"
    ON memories FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = memories.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can manage memories"
    ON memories FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = memories.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- APPOINTMENTS TABLE
-- ============================================
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    location TEXT,
    date DATE NOT NULL,
    time TEXT NOT NULL,
    notes TEXT,
    reminder_set BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view appointments"
    ON appointments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = appointments.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can manage appointments"
    ON appointments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = appointments.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- CARE TEAM MEMBERS TABLE
-- ============================================
CREATE TABLE care_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    specialty TEXT,
    organization TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE care_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Caregivers can view care team"
    ON care_team_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = care_team_members.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

CREATE POLICY "Caregivers can manage care team"
    ON care_team_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM caregiver_patients cp
            WHERE cp.patient_id = care_team_members.patient_id
            AND cp.caregiver_id = auth.uid()
        )
    );

-- ============================================
-- CREATE VIEW FOR CAREGIVER PATIENT LIST
-- ============================================
CREATE VIEW caregiver_patient_list AS
SELECT 
    cp.caregiver_id,
    p.id as patient_id,
    p.first_name,
    p.last_name,
    p.preferred_name,
    p.photo_url,
    p.dementia_stage,
    p.location,
    cp.is_primary
FROM caregiver_patients cp
JOIN patients p ON cp.patient_id = p.id;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_caregiver_patients_caregiver_id ON caregiver_patients(caregiver_id);
CREATE INDEX idx_caregiver_patients_patient_id ON caregiver_patients(patient_id);
CREATE INDEX idx_patient_notes_patient_id ON patient_notes(patient_id);
CREATE INDEX idx_patient_notes_created_at ON patient_notes(created_at DESC);
CREATE INDEX idx_medications_patient_id ON medications(patient_id);
CREATE INDEX idx_tasks_patient_id ON tasks(patient_id);
CREATE INDEX idx_mood_entries_patient_id ON mood_entries(patient_id);
CREATE INDEX idx_memories_patient_id ON memories(patient_id);
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_care_team_patient_id ON care_team_members(patient_id);
CREATE INDEX idx_medication_logs_patient_id ON medication_logs(patient_id);
CREATE INDEX idx_medication_logs_date ON medication_logs(date);
