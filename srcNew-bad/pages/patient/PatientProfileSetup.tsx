import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  User, Stethoscope, Pill, Phone, MapPin, CheckCircle2,
  Loader2, Save, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTempUser } from '@/components/TempUserGuard';
import { isTempUser } from '@/types/subscription';
import type { DementiaStage } from '@/types/patientIntake';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC','PR','VI','GU','AS','MP',
];

interface ProfileForm {
  // Step 1 — Patient Info
  firstName:          string;
  lastName:           string;
  preferredName:      string;
  dateOfBirth:        string;
  phone:              string;
  diagnosisDate:      string;
  dementiaStage:      string;
  streetAddress:      string;
  city:               string;
  state:              string;
  zipCode:            string;
  // Step 2 — Medical
  preferredHospital:  string;
  doctorName:         string;
  doctorPhone:        string;
  // Step 3 — Caregiver & Meds
  caregiverName:      string;
  caregiverRelationship: string;
  caregiverPhone:     string;
  medications:        string;
  // Step 4 — Emergency Contact
  ecFullName:         string;
  ecPhone:            string;
  ecEmail:            string;
  ecRelationship:     string;
}

const EMPTY_FORM: ProfileForm = {
  firstName:'', lastName:'', preferredName:'', dateOfBirth:'', phone:'',
  diagnosisDate:'', dementiaStage:'', streetAddress:'', city:'', state:'', zipCode:'',
  preferredHospital:'', doctorName:'', doctorPhone:'',
  caregiverName:'', caregiverRelationship:'', caregiverPhone:'', medications:'',
  ecFullName:'', ecPhone:'', ecEmail:'', ecRelationship:'',
};

const STEPS = [
  { num: 1, label: 'My Information',    icon: User },
  { num: 2, label: 'My Doctor',         icon: Stethoscope },
  { num: 3, label: 'Care & Medications',icon: Pill },
  { num: 4, label: 'Emergency Contact', icon: Phone },
];

export default function PatientProfileSetup() {
  const { state } = useApp();
  const userId = state.currentUser?.id;

  const [step,    setStep]    = useState(1);
  const [form,    setForm]    = useState<ProfileForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const { blockIfReadOnly } = useTempUser();
  const [saved,   setSaved]   = useState(false);

  // ── Load existing data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: profile }, { data: patient }, { data: intake }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('patients').select('*').eq('id', userId).maybeSingle(),
          supabase.from('patient_intake').select('*').eq('patient_profile_id', userId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        ]);

        setForm({
          firstName:          profile?.first_name          || '',
          lastName:           profile?.last_name           || '',
          preferredName:      patient?.preferred_name      || '',
          dateOfBirth:        patient?.date_of_birth       || '',
          phone:              profile?.phone               || '',
          diagnosisDate:      patient?.diagnosis_date      || '',
          dementiaStage:      patient?.dementia_stage      || '',
          streetAddress:      intake?.patient_street_address || '',
          city:               intake?.patient_city          || '',
          state:              intake?.patient_state         || '',
          zipCode:            intake?.patient_zip_code      || '',
          preferredHospital:  intake?.preferred_hospital    || '',
          doctorName:         intake?.doctor_therapist_name || '',
          doctorPhone:        intake?.doctor_therapist_phone|| '',
          caregiverName:      intake?.caregiver_name        || '',
          caregiverRelationship: intake?.caregiver_relationship || '',
          caregiverPhone:     intake?.caregiver_phone       || '',
          medications:        intake?.medications_and_dosage || patient?.medications_summary || '',
          ecFullName:         intake?.emergency_contact_full_name || patient?.emergency_contact_name || '',
          ecPhone:            intake?.emergency_contact_phone || patient?.emergency_contact_phone || '',
          ecEmail:            intake?.emergency_contact_email || '',
          ecRelationship:     intake?.emergency_contact_relationship || patient?.emergency_contact_relationship || '',
        });
      } catch (err) {
        console.warn('Profile load:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const f = (field: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  // ── Save all steps to Supabase ─────────────────────────────────────────────
  const saveAll = async () => {
    // Double-check: verify directly from auth in case TempUserProvider hasn't resolved
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (blockIfReadOnly() || isTempUser(authUser?.email)) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('First and last name are required'); return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();

      // 1. Update profiles
      await supabase.from('profiles').update({
        first_name: form.firstName.trim(),
        last_name:  form.lastName.trim(),
        phone:      form.phone.trim() || null,
        updated_at: now,
      }).eq('id', userId);

      // 2. Upsert patients row
      await supabase.from('patients').upsert({
        id:                             userId,
        preferred_name:                 form.preferredName.trim()      || null,
        date_of_birth:                  form.dateOfBirth               || null,
        diagnosis_date:                 form.diagnosisDate             || null,
        dementia_stage:                 form.dementiaStage             || null,
        location:                       form.city.trim()               || null,
        address:                        [form.streetAddress, form.city, form.state, form.zipCode].filter(Boolean).join(', ') || null,
        emergency_contact_name:         form.ecFullName.trim()         || null,
        emergency_contact_phone:        form.ecPhone.trim()            || null,
        emergency_contact_relationship: form.ecRelationship.trim()     || null,
        emergency_contact_email:        form.ecEmail.trim()            || null,
        updated_at:                     now,
      }, { onConflict: 'id' });

      // 3. Upsert patient_intake record (linked to this patient's own profile)
      const intakePayload = {
        patient_profile_id:              userId,
        caregiver_profile_id:            null,
        created_by:                      userId,
        patient_first_name:              form.firstName.trim(),
        patient_last_name:               form.lastName.trim(),
        patient_preferred_name:          form.preferredName.trim()      || null,
        patient_date_of_birth:           form.dateOfBirth               || null,
        patient_diagnosis_date:          form.diagnosisDate             || null,
        patient_dementia_stage:          form.dementiaStage             || null,
        patient_street_address:          form.streetAddress.trim()      || null,
        patient_city:                    form.city.trim()               || null,
        patient_state:                   form.state                     || null,
        patient_zip_code:                form.zipCode.trim()            || null,
        patient_phone:                   form.phone.trim()              || null,
        patient_email:                   state.currentUser?.email       || null,
        preferred_hospital:              form.preferredHospital.trim()  || null,
        doctor_therapist_name:           form.doctorName.trim()         || null,
        doctor_therapist_phone:          form.doctorPhone.trim()        || null,
        caregiver_name:                  form.caregiverName.trim()      || null,
        caregiver_relationship:          form.caregiverRelationship.trim() || null,
        caregiver_phone:                 form.caregiverPhone.trim()     || null,
        medications_and_dosage:          form.medications.trim()        || null,
        emergency_contact_full_name:     form.ecFullName.trim()         || null,
        emergency_contact_phone:         form.ecPhone.trim()            || null,
        emergency_contact_email:         form.ecEmail.trim()            || null,
        emergency_contact_relationship:  form.ecRelationship.trim()     || null,
        updated_at:                      now,
      };

      // Try upsert by patient_profile_id; if constraint not set, insert fresh
      const { error: upsertErr } = await supabase.from('patient_intake')
        .upsert(intakePayload, { onConflict: 'patient_profile_id' });

      if (upsertErr) {
        // Fallback: just insert
        await supabase.from('patient_intake').insert(intakePayload);
      }

      setSaved(true);
      toast.success('Your information has been saved!');
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto pb-12 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-charcoal">My Profile</h1>
        <p className="text-medium-gray text-sm mt-1">
          Your personal information — fill in as much or as little as you like. All fields are optional except your name.
        </p>
      </div>

      {/* Step tabs */}
      <div className="flex gap-1 bg-soft-taupe/30 rounded-2xl p-1">
        {STEPS.map(s => {
          const Icon = s.icon;
          const isActive = step === s.num;
          return (
            <button key={s.num} onClick={() => setStep(s.num)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isActive ? 'bg-white shadow text-warm-bronze' : 'text-medium-gray hover:text-charcoal'
              }`}>
              <Icon className="w-4 h-4" />
              <span className="hidden sm:block">{s.label}</span>
              <span className="sm:hidden">{s.num}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }}>

          {/* ── STEP 1: Patient Info ───────────────────────────────────── */}
          {step === 1 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="w-5 h-5 text-warm-bronze" /> My Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input id="firstName" value={form.firstName} onChange={f('firstName')} placeholder="Your first name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input id="lastName" value={form.lastName} onChange={f('lastName')} placeholder="Your last name" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="preferredName">Preferred Name</Label>
                    <Input id="preferredName" value={form.preferredName} onChange={f('preferredName')} placeholder="What you like to be called" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" value={form.phone} onChange={f('phone')} placeholder="(555) 123-4567" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={f('dateOfBirth')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="diagnosisDate">Diagnosis Date</Label>
                    <Input id="diagnosisDate" type="date" value={form.diagnosisDate} onChange={f('diagnosisDate')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Dementia Stage</Label>
                  <Select value={form.dementiaStage} onValueChange={v => setForm(p => ({ ...p, dementiaStage: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select stage (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="early">Early Stage</SelectItem>
                      <SelectItem value="middle">Middle Stage</SelectItem>
                      <SelectItem value="late">Late Stage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><MapPin className="w-4 h-4 text-warm-bronze" /> Address</Label>
                  <Input value={form.streetAddress} onChange={f('streetAddress')} placeholder="Street address" />
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <Input value={form.city} onChange={f('city')} placeholder="City" />
                    </div>
                    <Select value={form.state} onValueChange={v => setForm(p => ({ ...p, state: v }))}>
                      <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={form.zipCode} onChange={f('zipCode')} placeholder="ZIP" maxLength={10} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── STEP 2: Doctor / Therapist ─────────────────────────────── */}
          {step === 2 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Stethoscope className="w-5 h-5 text-warm-bronze" /> My Doctor / Therapist
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="preferredHospital">Preferred Hospital / Clinic</Label>
                  <Input id="preferredHospital" value={form.preferredHospital} onChange={f('preferredHospital')} placeholder="e.g., Raleigh Medical Center" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="doctorName">Doctor / Therapist Name</Label>
                    <Input id="doctorName" value={form.doctorName} onChange={f('doctorName')} placeholder="Dr. Jane Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="doctorPhone">Doctor / Therapist Phone</Label>
                    <Input id="doctorPhone" type="tel" value={form.doctorPhone} onChange={f('doctorPhone')} placeholder="(555) 123-4567" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── STEP 3: Caregiver & Medications ────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="w-5 h-5 text-warm-bronze" /> My Care Partner
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="caregiverName">Care Partner's Name</Label>
                      <Input id="caregiverName" value={form.caregiverName} onChange={f('caregiverName')} placeholder="Their name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="caregiverRelationship">Relationship to Me</Label>
                      <Input id="caregiverRelationship" value={form.caregiverRelationship} onChange={f('caregiverRelationship')} placeholder="e.g., Daughter, Spouse" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="caregiverPhone">Care Partner's Phone</Label>
                    <Input id="caregiverPhone" type="tel" value={form.caregiverPhone} onChange={f('caregiverPhone')} placeholder="(555) 123-4567" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Pill className="w-5 h-5 text-warm-bronze" /> My Medications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    <Label htmlFor="medications">Current Medications & Dosage</Label>
                    <Textarea id="medications" value={form.medications} onChange={f('medications')}
                      placeholder="e.g., Donepezil 10mg daily, Memantine 5mg twice daily..."
                      rows={4} className="resize-none" />
                    <p className="text-xs text-medium-gray">List all medications and dosages in one place.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── STEP 4: Emergency Contact ───────────────────────────────── */}
          {step === 4 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Phone className="w-5 h-5 text-warm-bronze" /> Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ecFullName">Contact's Full Name</Label>
                  <Input id="ecFullName" value={form.ecFullName} onChange={f('ecFullName')} placeholder="Emergency contact name" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ecPhone">Contact's Phone Number</Label>
                    <Input id="ecPhone" type="tel" value={form.ecPhone} onChange={f('ecPhone')} placeholder="(555) 123-4567" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ecEmail">Contact's Email</Label>
                    <Input id="ecEmail" type="email" value={form.ecEmail} onChange={f('ecEmail')} placeholder="contact@example.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ecRelationship">Relationship to Me</Label>
                  <Input id="ecRelationship" value={form.ecRelationship} onChange={f('ecRelationship')} placeholder="e.g., Family friend, Neighbor, Son" />
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation + Save */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={() => setStep(p => Math.max(1, p - 1))} disabled={step === 1} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>

        <div className="flex items-center gap-3">
          {/* Always-visible Save button */}
          <Button onClick={saveAll} disabled={saving}
            className="bg-warm-bronze hover:bg-deep-bronze text-white gap-2 px-6">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              : saved
              ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
              : <><Save className="w-4 h-4" /> Save</>}
          </Button>

          {step < 4 && (
            <Button onClick={() => setStep(p => Math.min(4, p + 1))} className="bg-charcoal hover:bg-charcoal/90 text-white gap-2">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {STEPS.map(s => (
          <button key={s.num} onClick={() => setStep(s.num)}
            className={`w-2 h-2 rounded-full transition-all ${step === s.num ? 'bg-warm-bronze w-4' : 'bg-soft-taupe'}`} />
        ))}
      </div>
    </div>
  );
}
