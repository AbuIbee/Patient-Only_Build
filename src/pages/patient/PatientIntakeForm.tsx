/**
 * PatientIntakeForm.tsx
 *
 * Self-service intake form for patients.
 * - Pre-fills from signup data (profiles + patients + patient_intake)
 * - On save: upserts profiles, patients, AND patient_intake simultaneously
 * - Admin Center reads from the same patient_intake table → always in sync
 * - Tracks completion via patient_intake.intake_completed (boolean)
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import {
  Save, CheckCircle2, AlertCircle, Loader2, User,
  MapPin, Phone, Heart, Stethoscope, Shield, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
interface IntakeForm {
  // My Information
  firstName: string; lastName: string; preferredName: string;
  dateOfBirth: string; phone: string; email: string;
  streetAddress: string; city: string; state: string; zipCode: string;
  dementiaStage: string; diagnosisDate: string;
  // Doctor / Hospital
  doctorName: string; doctorPhone: string; preferredHospital: string;
  // Caregiver
  caregiverName: string; caregiverRelationship: string; caregiverPhone: string;
  // Medications
  medications: string;
  // Closest Relative Contact
  crFullName: string; crPhone: string; crEmail: string; crRelationship: string;
}

const EMPTY: IntakeForm = {
  firstName: '', lastName: '', preferredName: '',
  dateOfBirth: '', phone: '', email: '',
  streetAddress: '', city: '', state: '', zipCode: '',
  dementiaStage: '', diagnosisDate: '',
  doctorName: '', doctorPhone: '', preferredHospital: '',
  caregiverName: '', caregiverRelationship: '', caregiverPhone: '',
  medications: '',
  crFullName: '', crPhone: '', crEmail: '', crRelationship: '',
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
  'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

// ─── Field helper ─────────────────────────────────────────────────────────────
function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-charcoal">
        {label}{required && <span className="text-gentle-coral ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-gentle-coral">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

const inp = (err?: string) =>
  `w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${
    err ? 'border-gentle-coral focus:ring-gentle-coral/20 bg-gentle-coral/5'
        : 'border-soft-taupe focus:ring-warm-bronze bg-white'
  }`;

// ─── Section header ───────────────────────────────────────────────────────────
function Section({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className={`flex items-center gap-3 py-3 border-b border-soft-taupe mb-4`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="font-semibold text-charcoal text-base">{title}</h3>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PatientIntakeForm({ onCompleted }: { onCompleted?: () => void }) {
  const { state } = useApp();
  const userId    = state.currentUser?.id || '';

  const [form,    setForm]    = useState<IntakeForm>(EMPTY);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [intakeId, setIntakeId] = useState<string | null>(null);

  // ── Load existing data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: profile }, { data: patient }, { data: intake }] = await Promise.all([
          supabase.from('profiles').select('first_name, last_name, phone, email').eq('id', userId).maybeSingle(),
          supabase.from('patients').select('preferred_name, date_of_birth, dementia_stage, diagnosis_date, location').eq('id', userId).maybeSingle(),
          supabase.from('patient_intake').select('id, patient_first_name, patient_last_name, patient_preferred_name, patient_date_of_birth, patient_phone, patient_email, patient_street_address, patient_city, patient_state, patient_zip_code, patient_dementia_stage, patient_diagnosis_date, doctor_therapist_name, doctor_therapist_phone, preferred_hospital, caregiver_name, caregiver_relationship, caregiver_phone, medications_and_dosage, emergency_contact_full_name, emergency_contact_phone, emergency_contact_email, emergency_contact_relationship').eq('patient_profile_id', userId).maybeSingle(),
        ]);

        setForm({
          firstName:          intake?.patient_first_name  || profile?.first_name    || '',
          lastName:           intake?.patient_last_name   || profile?.last_name     || '',
          preferredName:      intake?.patient_preferred_name || patient?.preferred_name || '',
          dateOfBirth:        intake?.patient_date_of_birth || patient?.date_of_birth || '',
          phone:              intake?.patient_phone        || profile?.phone         || '',
          email:              intake?.patient_email        || profile?.email         || '',
          streetAddress:      intake?.patient_street_address || '',
          city:               intake?.patient_city         || patient?.location      || '',
          state:              intake?.patient_state        || '',
          zipCode:            intake?.patient_zip_code     || '',
          dementiaStage:      intake?.patient_dementia_stage || patient?.dementia_stage || '',
          diagnosisDate:      intake?.patient_diagnosis_date || patient?.diagnosis_date || '',
          doctorName:         intake?.doctor_therapist_name  || '',
          doctorPhone:        intake?.doctor_therapist_phone || '',
          preferredHospital:  intake?.preferred_hospital    || '',
          caregiverName:      intake?.caregiver_name         || '',
          caregiverRelationship: intake?.caregiver_relationship || '',
          caregiverPhone:     intake?.caregiver_phone        || '',
          medications:        intake?.medications_and_dosage || '',
          crFullName:         intake?.emergency_contact_full_name    || '',
          crPhone:            intake?.emergency_contact_phone        || '',
          crEmail:            intake?.emergency_contact_email        || '',
          crRelationship:     intake?.emergency_contact_relationship || '',
        });

        if (intake?.id) setIntakeId(intake.id);
      } catch (err: any) {
        toast.error('Failed to load your information: ' + err.message);
      } finally { setLoading(false); }
    };
    load();
  }, [userId]);

  const set = (field: keyof IntakeForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [field]: e.target.value }));

  // ── Validate ──────────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim())     e.firstName     = 'Required';
    if (!form.lastName.trim())      e.lastName      = 'Required';
    if (!form.email.trim())         e.email         = 'Required';
    if (!form.phone.trim())         e.phone         = 'Required';
    if (!form.streetAddress.trim()) e.streetAddress = 'Required';
    if (!form.city.trim())          e.city          = 'Required';
    if (!form.state)                e.state         = 'Required';
    if (!form.zipCode.trim())       e.zipCode       = 'Required';
    return e;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please fill in all required fields');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();

      // 1. Update profiles
      const { error: profileErr } = await supabase.from('profiles').update({
        first_name: form.firstName.trim(), last_name: form.lastName.trim(),
        phone: form.phone.trim() || null, email: form.email.trim().toLowerCase(),
        updated_at: now,
      }).eq('id', userId);
      if (profileErr) {
        toast.error('Failed to save profile: ' + profileErr.message);
        return;
      }

      // 2. Upsert patients — column names match the actual patients table schema
      const { error: patientErr } = await supabase.from('patients').upsert({
        id: userId,
        first_name:                     form.firstName.trim(),
        last_name:                       form.lastName.trim(),
        preferred_name:                  form.preferredName.trim() || null,
        date_of_birth:                   form.dateOfBirth || null,
        diagnosis_date:                  form.diagnosisDate || null,
        dementia_stage:                  form.dementiaStage || null,
        location:                        form.city.trim() || null,
        address:                         [form.streetAddress, form.city, form.state, form.zipCode].filter(Boolean).join(', ') || null,
        emergency_contact_name:          form.crFullName.trim() || null,
        emergency_contact_phone:         form.crPhone.trim() || null,
        emergency_contact_relationship:  form.crRelationship.trim() || null,
        emergency_contact_email:         form.crEmail.trim() || null,
        updated_at: now,
      }, { onConflict: 'id' });
      if (patientErr) {
        toast.error('Failed to save patient record: ' + patientErr.message);
        return;
      }

      // 3. Upsert patient_intake — this is what Admin Center reads
      // NOTE: closest_relative_* column names in patient_intake are intentionally
      // unchanged here pending live schema confirmation (see audit finding WI-probable).
      const intakePayload = {
        patient_profile_id:             userId,
        caregiver_profile_id:           null,
        created_by:                     userId,
        patient_first_name:             form.firstName.trim(),
        patient_last_name:              form.lastName.trim(),
        patient_preferred_name:         form.preferredName.trim() || null,
        patient_date_of_birth:          form.dateOfBirth || null,
        patient_diagnosis_date:         form.diagnosisDate || null,
        patient_dementia_stage:         form.dementiaStage || null,
        patient_street_address:         form.streetAddress.trim() || null,
        patient_city:                   form.city.trim() || null,
        patient_state:                  form.state || null,
        patient_zip_code:               form.zipCode.trim() || null,
        patient_phone:                  form.phone.trim() || null,
        patient_email:                  form.email.trim().toLowerCase() || null,
        preferred_hospital:             form.preferredHospital.trim() || null,
        doctor_therapist_name:          form.doctorName.trim() || null,
        doctor_therapist_phone:         form.doctorPhone.trim() || null,
        caregiver_name:                 form.caregiverName.trim() || null,
        caregiver_relationship:         form.caregiverRelationship.trim() || null,
        caregiver_phone:                form.caregiverPhone.trim() || null,
        medications_and_dosage:         form.medications.trim() || null,
        emergency_contact_full_name:     form.crFullName.trim() || null,
        emergency_contact_phone:         form.crPhone.trim() || null,
        emergency_contact_email:         form.crEmail.trim() || null,
        emergency_contact_relationship:  form.crRelationship.trim() || null,
        intake_completed:               true,
        updated_at:                     now,
      };

      if (intakeId) {
        const { error: intakeErr } = await supabase
          .from('patient_intake').update(intakePayload).eq('id', intakeId);
        if (intakeErr) {
          toast.error('Failed to save intake record: ' + intakeErr.message);
          return;
        }
      } else {
        const { data: newIntake, error: intakeErr } = await supabase
          .from('patient_intake')
          .upsert(intakePayload, { onConflict: 'patient_profile_id' })
          .select('id').maybeSingle();
        if (intakeErr) {
          toast.error('Failed to save intake record: ' + intakeErr.message);
          return;
        }
        if (newIntake?.id) setIntakeId(newIntake.id);
      }

      setSaved(true);
      toast.success('Your information has been saved and synced to your care team!');
      setTimeout(() => setSaved(false), 3000);
      onCompleted?.();
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-charcoal">Patient Intake Form</h1>
        <p className="text-medium-gray text-sm mt-1">
          This information is shared with your care team and kept private. Fields marked <span className="text-gentle-coral">*</span> are required.
        </p>
      </div>

      {/* Section 1: My Information */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm p-6">
        <Section icon={User} title="My Information" color="bg-soft-sage" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" error={errors.firstName} required>
              <input value={form.firstName} onChange={set('firstName')} className={inp(errors.firstName)} />
            </Field>
            <Field label="Last Name" error={errors.lastName} required>
              <input value={form.lastName} onChange={set('lastName')} className={inp(errors.lastName)} />
            </Field>
          </div>
          <Field label="Preferred Name">
            <input value={form.preferredName} onChange={set('preferredName')} placeholder="What do you like to be called?" className={inp()} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of Birth">
              <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className={inp()} />
            </Field>
            <Field label="Phone Number" error={errors.phone} required>
              <input type="tel" value={form.phone} onChange={set('phone')} className={inp(errors.phone)} />
            </Field>
          </div>
          <Field label="Email Address" error={errors.email} required>
            <input type="email" value={form.email} onChange={set('email')} className={inp(errors.email)} />
          </Field>
        </div>
      </div>

      {/* Section 2: Home Address */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm p-6">
        <Section icon={MapPin} title="Home Address" color="bg-warm-bronze" />
        <div className="space-y-4">
          <Field label="Street Address" error={errors.streetAddress} required>
            <input value={form.streetAddress} onChange={set('streetAddress')} className={inp(errors.streetAddress)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" error={errors.city} required>
              <input value={form.city} onChange={set('city')} className={inp(errors.city)} />
            </Field>
            <Field label="State" error={errors.state} required>
              <select value={form.state} onChange={set('state')} className={inp(errors.state)}>
                <option value="">Select…</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="ZIP Code" error={errors.zipCode} required>
            <input value={form.zipCode} onChange={set('zipCode')} maxLength={10} className={inp(errors.zipCode)} />
          </Field>
        </div>
      </div>

      {/* Section 3: Medical */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm p-6">
        <Section icon={Stethoscope} title="Doctor & Medical" color="bg-calm-blue" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Dementia Stage">
              <select value={form.dementiaStage} onChange={set('dementiaStage')} className={inp()}>
                <option value="">Select…</option>
                <option value="early">Early Stage</option>
                <option value="middle">Middle Stage</option>
                <option value="late">Late Stage</option>
              </select>
            </Field>
            <Field label="Diagnosis Date">
              <input type="date" value={form.diagnosisDate} onChange={set('diagnosisDate')} className={inp()} />
            </Field>
          </div>
          <Field label="Doctor / Therapist Name">
            <input value={form.doctorName} onChange={set('doctorName')} className={inp()} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Doctor's Phone">
              <input type="tel" value={form.doctorPhone} onChange={set('doctorPhone')} className={inp()} />
            </Field>
            <Field label="Preferred Hospital">
              <input value={form.preferredHospital} onChange={set('preferredHospital')} className={inp()} />
            </Field>
          </div>
        </div>
      </div>

      {/* Section 4: Medications */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm p-6">
        <Section icon={FileText} title="Medications & Dosage" color="bg-deep-bronze" />
        <Field label="List all current medications and dosages">
          <textarea value={form.medications} onChange={set('medications')}
            rows={4} placeholder="e.g. Aricept 10mg daily, Namenda 10mg twice daily..."
            className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white resize-none" />
        </Field>
      </div>

      {/* Section 5: Caregiver */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm p-6">
        <Section icon={Heart} title="Primary Caregiver" color="bg-gentle-coral" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Caregiver Name">
              <input value={form.caregiverName} onChange={set('caregiverName')} className={inp()} />
            </Field>
            <Field label="Relationship">
              <input value={form.caregiverRelationship} onChange={set('caregiverRelationship')} placeholder="e.g. Daughter, Son" className={inp()} />
            </Field>
          </div>
          <Field label="Caregiver Phone">
            <input type="tel" value={form.caregiverPhone} onChange={set('caregiverPhone')} className={inp()} />
          </Field>
        </div>
      </div>

      {/* Section 6: Closest Relative Contact */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm p-6">
        <Section icon={Shield} title="Closest Relative Contact" color="bg-amber-500" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name">
              <input value={form.crFullName} onChange={set('crFullName')} className={inp()} />
            </Field>
            <Field label="Relationship">
              <input value={form.crRelationship} onChange={set('crRelationship')} className={inp()} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <input type="tel" value={form.crPhone} onChange={set('crPhone')} className={inp()} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.crEmail} onChange={set('crEmail')} className={inp()} />
            </Field>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="sticky bottom-4">
        <button onClick={handleSave} disabled={saving}
          className={`w-full py-4 rounded-2xl font-semibold text-white text-lg transition-all shadow-lg flex items-center justify-center gap-3 ${
            saved   ? 'bg-green-500' :
            saving  ? 'bg-warm-bronze/70 cursor-not-allowed' :
                      'bg-warm-bronze hover:bg-deep-bronze'
          }`}>
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" />Saving…</>
          ) : saved ? (
            <><CheckCircle2 className="w-5 h-5" />Saved & Synced!</>
          ) : (
            <><Save className="w-5 h-5" />Save My Information</>
          )}
        </button>
        <p className="text-center text-xs text-medium-gray mt-2">
          Your information automatically syncs with your care team.
        </p>
      </div>
    </div>
  );
}
