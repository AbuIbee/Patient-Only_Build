import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Phone, PencilLine, Plus, RefreshCcw, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadHealthcareContacts, saveHealthcareContact,
  type HealthcareContact, type HealthcareContactInput,
} from '@/services/healthcareContactsService';

const CONTACT_CATEGORIES = [
  'Primary physician', 'Other treating physician', 'Preferred hospital',
  'Hospital', 'Physical therapist', 'Occupational therapist',
  'Mental health professional', 'Nutritionist', 'Other specialist',
  'Emergency contact',
];

const EMPTY_FORM: HealthcareContactInput = {
  name: '', role: 'Primary physician', phone: '', email: '', alternatePhone: '',
  practiceName: '', address: '', preferredContactMethod: '', notes: '',
  isPreferredHospital: false,
};

const fieldClass = 'w-full rounded-lg border border-ent-line bg-white px-3 py-2 text-sm text-ent-ink';

function dialable(phone: string): string {
  return phone.replace(/[^+\d]/g, '');
}

export default function HealthcareContacts({ patientId }: { patientId: string }) {
  const [contacts, setContacts] = useState<HealthcareContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<HealthcareContact | null>(null);
  const [form, setForm] = useState<HealthcareContactInput | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadHealthcareContacts(patientId);
    if (result.error) {
      setLoadError(result.error);
      // Do not misrepresent a failed read as an empty directory.
    } else {
      setContacts(result.data ?? []);
      setLoadError(null);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openEdit = (contact: HealthcareContact) => {
    setEditing(contact);
    setForm({
      name: contact.name, role: contact.role, phone: contact.phone,
      email: contact.email, alternatePhone: contact.alternatePhone,
      practiceName: contact.practiceName, address: contact.address,
      preferredContactMethod: contact.preferredContactMethod, notes: contact.notes,
      isPreferredHospital: contact.isPreferredHospital,
    });
  };

  const patch = (values: Partial<HealthcareContactInput>) => {
    setForm((previous) => previous ? { ...previous, ...values } : null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !form) return;
    setSaving(true);
    try {
      const result = await saveHealthcareContact(patientId, form, editing);
      if (result.error) {
        toast.error(result.error);
        if (result.error.toLowerCase().includes('changed since')) await refresh();
        return;
      }
      toast.success(editing ? 'Healthcare contact updated.' : 'Healthcare contact added.');
      setEditing(null);
      setForm(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Healthcare Providers & Emergency Contacts"
      className="space-y-4 rounded-2xl border border-ent-line bg-ent-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope aria-hidden="true" className="h-5 w-5 text-ent-bronze" />
          <h2 className="font-bold text-ent-ink">Healthcare Providers &amp; Emergency Contacts</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { void refresh(); }}
            aria-label="Refresh healthcare contacts" className="rounded-lg border border-ent-line px-3 py-2 text-sm">
            <RefreshCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM }); }}
            className="inline-flex items-center gap-1 rounded-lg bg-ent-bronze px-3 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Add contact
          </button>
        </div>
      </div>
      <p className="text-xs text-ent-muted">
        The same contact information is shared across authorized patient, caregiver, director, and specialist offices.
        Reported changes must be verified independently before being treated as confirmed.
      </p>

      {loadError && (
        <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">
          Contacts could not be verified: {loadError}. Retry before relying on this directory.
        </p>
      )}
      {loading ? (
        <div role="status" className="flex items-center gap-2 text-sm text-ent-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading healthcare contacts…
        </div>
      ) : !loadError && contacts.length === 0 ? (
        <p className="text-sm text-ent-muted">No provider contacts have been recorded yet.</p>
      ) : !loadError ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contacts.map((contact) => (
            <li key={contact.id} className="space-y-2 rounded-xl border border-ent-line bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ent-ink">{contact.name}</p>
                  <p className="text-xs text-ent-muted">{contact.role}{contact.isPreferredHospital ? ' · Preferred hospital' : ''}</p>
                  {contact.practiceName && <p className="text-xs text-ent-muted">{contact.practiceName}</p>}
                </div>
                <button type="button" onClick={() => openEdit(contact)}
                  aria-label={`Edit healthcare contact ${contact.name}`}
                  className="rounded-lg border border-ent-line p-2 text-ent-ink">
                  <PencilLine className="h-4 w-4" />
                </button>
              </div>
              {contact.phone && (
                <a href={`tel:${dialable(contact.phone)}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-ent-bronze">
                  <Phone className="h-4 w-4" /> {contact.phone}
                </a>
              )}
              {contact.alternatePhone && <p className="text-xs text-ent-muted">Alternate: {contact.alternatePhone}</p>}
              {contact.address && <p className="text-xs text-ent-muted">{contact.address}</p>}
              <p className="text-xs text-ent-muted">
                {contact.verificationStatus === 'verified' ? 'Verified' : 'Reported — verification pending'}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {form && (
        <form onSubmit={(event) => { void save(event); }}
          className="space-y-3 rounded-xl border border-ent-line bg-white p-4"
          aria-label={editing ? 'Edit healthcare contact' : 'Add healthcare contact'}>
          <h3 className="font-semibold text-ent-ink">{editing ? 'Edit healthcare contact' : 'Add healthcare contact'}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">Provider or hospital name *
              <input required maxLength={150} className={fieldClass} value={form.name}
                onChange={e => patch({ name: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Category *
              <select required className={fieldClass} value={form.role}
                onChange={e => patch({ role: e.target.value, isPreferredHospital: e.target.value.toLowerCase().includes('hospital') && form.isPreferredHospital })}>
                {[...new Set([...CONTACT_CATEGORIES, form.role])].map(role => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">Phone
              <input type="tel" maxLength={40} className={fieldClass} value={form.phone}
                onChange={e => patch({ phone: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Alternate phone
              <input type="tel" maxLength={40} className={fieldClass} value={form.alternatePhone}
                onChange={e => patch({ alternatePhone: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Practice / facility
              <input maxLength={200} className={fieldClass} value={form.practiceName}
                onChange={e => patch({ practiceName: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Email
              <input type="email" maxLength={254} className={fieldClass} value={form.email}
                onChange={e => patch({ email: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">Address
              <input maxLength={500} className={fieldClass} value={form.address}
                onChange={e => patch({ address: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Preferred contact method
              <input maxLength={100} className={fieldClass} value={form.preferredContactMethod}
                onChange={e => patch({ preferredContactMethod: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">Notes
              <textarea maxLength={1000} rows={2} className={fieldClass} value={form.notes}
                onChange={e => patch({ notes: e.target.value })} />
            </label>
          </div>
          {form.role.toLowerCase().includes('hospital') && (
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={form.isPreferredHospital}
                onChange={e => patch({ isPreferredHospital: e.target.checked })} />
              Mark as preferred hospital
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-ent-bronze px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save contact'}
            </button>
            <button type="button" disabled={saving} onClick={() => { setEditing(null); setForm(null); }}
              className="rounded-lg border border-ent-line px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
