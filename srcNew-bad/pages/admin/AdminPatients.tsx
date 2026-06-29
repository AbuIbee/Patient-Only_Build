import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { assertUniqueProfileIdentity, isUniqueConstraintError, normalizeEmail, uniqueIdentityMessage } from '@/lib/identity';
import {
  Search, User, UserPlus, X, Mail, Phone, Eye, EyeOff,
  Save, RotateCcw, Loader2, KeyRound, AlertCircle, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PatientRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
}

interface EditState {
  email:      string;
  first_name: string;
  last_name:  string;
  phone:      string;
}

interface NewPatientForm {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  password:  string;
}

interface FormErrors {
  firstName?: string;
  lastName?:  string;
  email?:     string;
  phone?:     string;
  password?:  string;
}

// ─── Validation ───────────────────────────────────────────────────────────────
const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX    = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.\/0-9]{6,14}$/;
const ONLY_LETTERS   = /^[A-Za-z\s\-']+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

// ─── Add Patient Modal ────────────────────────────────────────────────────────
function AddPatientModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form,    setFormState] = useState<NewPatientForm>({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [errors,  setErrors]   = useState<FormErrors>({});
  const [showPass, setShowPass] = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [touched,  setTouched] = useState<Record<string, boolean>>({});

  const validate = (f: NewPatientForm): FormErrors => {
    const e: FormErrors = {};
    if (!f.firstName.trim())                        e.firstName = 'Required';
    else if (!ONLY_LETTERS.test(f.firstName.trim())) e.firstName = 'Letters only';
    if (!f.lastName.trim())                         e.lastName = 'Required';
    else if (!ONLY_LETTERS.test(f.lastName.trim()))  e.lastName = 'Letters only';
    if (!f.email.trim())                            e.email = 'Required';
    else if (!EMAIL_REGEX.test(f.email.trim()))      e.email = 'Invalid email';
    if (f.phone.trim() && !PHONE_REGEX.test(f.phone.trim())) e.phone = 'Invalid phone number';
    if (!f.password)                                e.password = 'Required';
    else if (!PASSWORD_REGEX.test(f.password))       e.password = 'Min 8 chars, uppercase, lowercase, number, special char';
    return e;
  };

  const setField = (field: keyof NewPatientForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormState(prev => ({ ...prev, [field]: val }));
    if (touched[field]) setErrors(prev => ({ ...prev, [field]: validate({ ...form, [field]: val })[field] }));
  };

  const blur = (field: keyof NewPatientForm) => () => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(prev => ({ ...prev, [field]: validate(form)[field] }));
  };

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    let v = digits;
    if (digits.length >= 6)      v = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    else if (digits.length >= 3) v = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    setFormState(prev => ({ ...prev, phone: v }));
    if (touched.phone) setErrors(prev => ({ ...prev, phone: validate({ ...form, phone: v }).phone }));
  };

  const inputCls = (field: keyof NewPatientForm) =>
    `w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${
      errors[field]
        ? 'border-gentle-coral focus:ring-gentle-coral/20 bg-gentle-coral/5'
        : 'border-soft-taupe focus:ring-warm-bronze bg-white'
    }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(form).map(k => [k, true])));
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) { toast.error('Please fix the errors above'); return; }

    setSaving(true);
    try {
      const normalizedEmail = normalizeEmail(form.email);
      await assertUniqueProfileIdentity({ email: normalizedEmail, phone: form.phone });

      const { data, error } = await supabase.auth.signUp({
        email:    normalizedEmail,
        password: form.password,
        options:  {
          emailRedirectTo: undefined,
          data: {
            first_name: form.firstName.trim(),
            last_name:  form.lastName.trim(),
            role:       'patient',
            phone:      form.phone.trim() || null,
          },
        },
      });
      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          toast.error('Rate limit — wait a few minutes and try again'); return;
        }
        toast.error(isUniqueConstraintError(error) ? uniqueIdentityMessage(error) : error.message);
        return;
      }
      if (!data.user) throw new Error('No user returned from signup');

      await supabase.from('profiles').upsert({
        id:                  data.user.id,
        email:               normalizedEmail,
        first_name:          form.firstName.trim(),
        last_name:           form.lastName.trim(),
        role:                'patient',
        phone:               form.phone.trim() || null,
        must_change_password: true,
      });

      toast.success(`${form.firstName} ${form.lastName} added as a patient`);
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(isUniqueConstraintError(err) ? uniqueIdentityMessage(err) : 'Failed to add patient: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, required, icon: Icon, error, hint, children }: any) => (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-charcoal">
        {Icon && <Icon className="w-3.5 h-3.5 text-warm-bronze" />}
        {label}
        {required && <span className="text-gentle-coral">*</span>}
      </label>
      {children}
      {error && <p className="flex items-center gap-1.5 text-xs text-gentle-coral"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      {hint && !error && <p className="text-xs text-medium-gray">{hint}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe">
          <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-warm-bronze" /> Add New Patient
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe transition-colors">
            <X className="w-4 h-4 text-medium-gray" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" required icon={User} error={errors.firstName}>
              <input value={form.firstName} onChange={setField('firstName')} onBlur={blur('firstName')}
                placeholder="Eleanor" maxLength={50} className={inputCls('firstName')} />
            </Field>
            <Field label="Last Name" required icon={User} error={errors.lastName}>
              <input value={form.lastName} onChange={setField('lastName')} onBlur={blur('lastName')}
                placeholder="Thompson" maxLength={50} className={inputCls('lastName')} />
            </Field>
          </div>

          <Field label="Email Address" required icon={Mail} error={errors.email} hint="Used to log in to the patient portal">
            <input type="email" value={form.email} onChange={setField('email')} onBlur={blur('email')}
              placeholder="patient@example.com" className={inputCls('email')} />
          </Field>

          <Field label="Phone Number" icon={Phone} error={errors.phone} hint="Optional">
            <input type="tel" value={form.phone} onChange={handlePhone} onBlur={blur('phone')}
              placeholder="(555) 123-4567" className={inputCls('phone')} />
          </Field>

          <Field label="Temporary Password" required error={errors.password}
            hint="Min 8 chars — patient will be prompted to change on first login">
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={setField('password')} onBlur={blur('password')}
                placeholder="Min 8 characters" className={inputCls('password') + ' pr-10'} />
              <button type="button" onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {form.password && (
              <div className="flex gap-1 mt-1">
                {[form.password.length >= 8, /[A-Z]/.test(form.password), /[a-z]/.test(form.password), /\d/.test(form.password), /[!@#$%^&*]/.test(form.password)]
                  .map((met, i) => <div key={i} className={`flex-1 h-1 rounded-full ${met ? 'bg-green-500' : 'bg-soft-taupe'}`} />)}
              </div>
            )}
          </Field>

          <p className="text-xs text-medium-gray"><span className="text-gentle-coral">*</span> Required fields</p>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : <><UserPlus className="w-4 h-4" />Add Patient</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdminPatients() {
  const [patients,     setPatients]     = useState<PatientRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [editStates,   setEditStates]   = useState<Record<string, EditState>>({});
  const [saving,       setSaving]       = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { loadPatients(); }, []);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, phone, created_at')
        .eq('role', 'patient')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as PatientRow[];
      setPatients(rows);
      const states: Record<string, EditState> = {};
      rows.forEach(p => {
        states[p.id] = { email: p.email, first_name: p.first_name, last_name: p.last_name, phone: p.phone || '' };
      });
      setEditStates(states);
    } catch (err: any) {
      toast.error('Failed to load patients: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const setField = (id: string, field: keyof EditState, value: string) => {
    setEditStates(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const isDirty = (p: PatientRow) => {
    const e = editStates[p.id];
    if (!e) return false;
    return e.email !== p.email || e.first_name !== p.first_name ||
           e.last_name !== p.last_name || e.phone !== (p.phone || '');
  };

  const resetRow = (p: PatientRow) => {
    setEditStates(prev => ({ ...prev, [p.id]: { email: p.email, first_name: p.first_name, last_name: p.last_name, phone: p.phone || '' } }));
  };

  const saveRow = async (p: PatientRow) => {
    const e = editStates[p.id];
    if (!e || !isDirty(p)) return;
    if (!e.email.trim() || !EMAIL_REGEX.test(e.email.trim())) { toast.error('Invalid email address'); return; }
    if (!e.first_name.trim()) { toast.error('First name is required'); return; }
    if (!e.last_name.trim())  { toast.error('Last name is required'); return; }

    setSaving(p.id);
    try {
      const normalizedEmail = normalizeEmail(e.email);
      await assertUniqueProfileIdentity({ email: normalizedEmail, phone: e.phone, ignoreProfileId: p.id });

      const { error } = await supabase.from('profiles').update({
        email:      normalizedEmail,
        first_name: e.first_name.trim(),
        last_name:  e.last_name.trim(),
        phone:      e.phone.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', p.id);
      if (error) throw error;
      toast.success(`${e.first_name} ${e.last_name} updated`);
      await loadPatients();
    } catch (err: any) {
      toast.error(isUniqueConstraintError(err) ? uniqueIdentityMessage(err) : 'Failed to save: ' + err.message);
      resetRow(p);
    } finally {
      setSaving(null);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
  };

  const filtered = patients.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = 'w-full px-2 py-1.5 border border-soft-taupe rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white';

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">All Patients</h2>
          <p className="text-medium-gray text-sm mt-1">{patients.length} total patient{patients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
          <UserPlus className="w-4 h-4" /> Add Patient
        </button>
      </div>

      {/* Sync note */}
      <div className="flex items-start gap-3 p-4 bg-calm-blue/5 border border-calm-blue/20 rounded-xl text-sm text-blue-800">
        <CheckCircle className="w-4 h-4 text-calm-blue flex-shrink-0 mt-0.5" />
        <span>
          <strong>Inline editing enabled.</strong> Click any field to edit it directly, then press <strong>Save</strong>.
          Changes sync to Supabase automatically.
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
        <input type="text" placeholder="Search by name or email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-medium-gray">
            <User className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
            <p className="font-medium">{patients.length === 0 ? 'No patients yet' : 'No results match your search'}</p>
            {patients.length === 0 && <p className="text-sm mt-1">Use the Add Patient button to create the first one</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-soft-taupe/20">
                <tr>
                  {['First Name', 'Last Name', 'Email', 'Phone', 'Joined', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-soft-taupe/30">
                {filtered.map(p => {
                  const e        = editStates[p.id];
                  const dirty    = isDirty(p);
                  const isSaving = saving === p.id;
                  if (!e) return null;
                  return (
                    <tr key={p.id} className={`transition-colors ${dirty ? 'bg-warm-bronze/5' : 'hover:bg-soft-taupe/10'}`}>
                      <td className="px-4 py-2.5">
                        <input value={e.first_name} onChange={ev => setField(p.id, 'first_name', ev.target.value)}
                          className={inputCls} placeholder="First name" />
                      </td>
                      <td className="px-4 py-2.5">
                        <input value={e.last_name} onChange={ev => setField(p.id, 'last_name', ev.target.value)}
                          className={inputCls} placeholder="Last name" />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="email" value={e.email} onChange={ev => setField(p.id, 'email', ev.target.value)}
                          className={inputCls} placeholder="Email" />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="tel" value={e.phone} onChange={ev => setField(p.id, 'phone', ev.target.value)}
                          className={inputCls} placeholder="Phone" />
                      </td>
                      <td className="px-4 py-2.5 text-medium-gray text-xs whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => saveRow(p)} disabled={!dirty || isSaving}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              dirty && !isSaving ? 'bg-warm-bronze text-white hover:bg-deep-bronze' : 'bg-soft-taupe/30 text-medium-gray cursor-not-allowed'
                            }`}>
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {isSaving ? 'Saving' : 'Save'}
                          </button>
                          {dirty && (
                            <button onClick={() => resetRow(p)}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-medium-gray hover:bg-soft-taupe transition-colors"
                              title="Discard changes">
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                          <button onClick={() => handleResetPassword(p.email)}
                            title="Send password reset email"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-calm-blue/10 text-blue-700 hover:bg-calm-blue/20 transition-colors border border-calm-blue/20">
                            <KeyRound className="w-3 h-3" />Reset PW
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && <AddPatientModal onClose={() => setShowAddModal(false)} onAdded={loadPatients} />}
    </div>
  );
}
