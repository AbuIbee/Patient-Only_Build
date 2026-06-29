import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import {
  Phone, Mail, Heart, User, Briefcase, GraduationCap,
  Save, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Stethoscope,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTempUser } from '@/components/TempUserGuard';
import { isTempUser } from '@/types/subscription';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CarePartnerInfo {
  full_name:           string;
  email:               string;
  phone:               string;
  relationship:        string;
  education_level:     string;
  medical_experience:  string;
  employment_relevant: string;
  notes:               string;
}

interface EmergencyContact {
  id:           string;
  full_name:    string;
  email:        string;
  phone:        string;
  relationship: string;
  address:      string;
  notes:        string;
}

const EMPTY_CARE_PARTNER: CarePartnerInfo = {
  full_name: '', email: '', phone: '', relationship: '',
  education_level: '', medical_experience: '', employment_relevant: '', notes: '',
};

const EMPTY_EMERGENCY: EmergencyContact = {
  id: '', full_name: '', email: '', phone: '', relationship: '', address: '', notes: '',
};

// ─── Field Component ──────────────────────────────────────────────────────────
function Field({ label, icon: Icon, children, hint }: {
  label: string; icon?: any; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-charcoal">
        {Icon && <Icon className="w-3.5 h-3.5 text-warm-bronze" />}
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-medium-gray">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white transition-colors";
const textareaCls = "w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white resize-none transition-colors";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PatientEmergencyContacts() {
  const { state } = useApp();
  const patientId = state.currentUser?.id;
  const { blockIfReadOnly } = useTempUser();

  // Care Partner state
  const [cpInfo,       setCpInfo]       = useState<CarePartnerInfo>(EMPTY_CARE_PARTNER);
  const [cpSaving,     setCpSaving]     = useState(false);
  const [cpLoaded,     setCpLoaded]     = useState(false);
  const [cpExpanded,   setCpExpanded]   = useState(true);

  // Emergency contacts state
  const [contacts,     setContacts]     = useState<EmergencyContact[]>([]);
  const [ecSaving,     setEcSaving]     = useState<string | null>(null);
  const [ecLoaded,     setEcLoaded]     = useState(false);
  const [ecExpanded,   setEcExpanded]   = useState(true);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  // ── Load on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!patientId) return;
    loadCarePartner();
    loadEmergencyContacts();
  }, [patientId]);

  const loadCarePartner = async () => {
    try {
      const { data } = await supabase
        .from('patient_care_partners')
        .select('*')
        .eq('patient_id', patientId)
        .maybeSingle();
      if (data) {
        setCpInfo({
          full_name:           data.full_name           || '',
          email:               data.email               || '',
          phone:               data.phone               || '',
          relationship:        data.relationship        || '',
          education_level:     data.education_level     || '',
          medical_experience:  data.medical_experience  || '',
          employment_relevant: data.employment_relevant || '',
          notes:               data.notes               || '',
        });
      }
    } catch (err) {
      // Table may not exist yet — handled gracefully
      console.warn('patient_care_partners not found:', err);
    } finally {
      setCpLoaded(true);
    }
  };

  const loadEmergencyContacts = async () => {
    try {
      const { data } = await supabase
        .from('patient_emergency_contacts')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: true });
      if (data) {
        setContacts(data.map((d: any) => ({
          id:           d.id,
          full_name:    d.full_name    || '',
          email:        d.email        || '',
          phone:        d.phone        || '',
          relationship: d.relationship || '',
          address:      d.address      || '',
          notes:        d.notes        || '',
        })));
      }
    } catch (err) {
      console.warn('patient_emergency_contacts not found:', err);
    } finally {
      setEcLoaded(true);
    }
  };

  // ── Save Care Partner ─────────────────────────────────────────────────────
  const saveCarePartner = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (blockIfReadOnly() || isTempUser(authUser?.email)) return;
    if (!cpInfo.full_name.trim()) { toast.error('Care partner name is required'); return; }
    setCpSaving(true);
    try {
      const { error } = await supabase
        .from('patient_care_partners')
        .upsert({
          patient_id:          patientId,
          full_name:           cpInfo.full_name.trim(),
          email:               cpInfo.email.trim()               || null,
          phone:               cpInfo.phone.trim()               || null,
          relationship:        cpInfo.relationship.trim()        || null,
          education_level:     cpInfo.education_level.trim()     || null,
          medical_experience:  cpInfo.medical_experience.trim()  || null,
          employment_relevant: cpInfo.employment_relevant.trim() || null,
          notes:               cpInfo.notes.trim()               || null,
          updated_at:          new Date().toISOString(),
        }, { onConflict: 'patient_id' });
      if (error) throw error;
      toast.success('Care partner information saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setCpSaving(false);
    }
  };

  // ── Emergency contact helpers ─────────────────────────────────────────────
  const addContact = () => {
    const newContact = { ...EMPTY_EMERGENCY, id: `new-${Date.now()}` };
    setContacts(prev => [...prev, newContact]);
    setExpandedId(newContact.id);
  };

  const updateContact = (id: string, field: keyof EmergencyContact, value: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const saveContact = async (contact: EmergencyContact) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (blockIfReadOnly() || isTempUser(authUser?.email)) return;
    if (!contact.full_name.trim()) { toast.error('Contact name is required'); return; }
    setEcSaving(contact.id);
    try {
      const isNew = contact.id.startsWith('new-');
      const payload = {
        patient_id:   patientId,
        full_name:    contact.full_name.trim(),
        email:        contact.email.trim()        || null,
        phone:        contact.phone.trim()        || null,
        relationship: contact.relationship.trim() || null,
        address:      contact.address.trim()      || null,
        notes:        contact.notes.trim()        || null,
        updated_at:   new Date().toISOString(),
      };
      if (isNew) {
        const { data, error } = await supabase
          .from('patient_emergency_contacts')
          .insert(payload).select('id').single();
        if (error) throw error;
        setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, id: data.id } : c));
      } else {
        const { error } = await supabase
          .from('patient_emergency_contacts')
          .update(payload).eq('id', contact.id);
        if (error) throw error;
      }
      toast.success('Emergency contact saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setEcSaving(null);
    }
  };

  const deleteContact = async (id: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (blockIfReadOnly() || isTempUser(authUser?.email)) return;
    if (!confirm('Remove this emergency contact?')) return;
    try {
      if (!id.startsWith('new-')) {
        const { error } = await supabase
          .from('patient_emergency_contacts').delete().eq('id', id);
        if (error) throw error;
      }
      setContacts(prev => prev.filter(c => c.id !== id));
      toast.success('Contact removed');
    } catch (err: any) {
      toast.error('Failed to remove: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-charcoal">Emergency Contact & Care Partner</h1>
        <p className="text-medium-gray text-sm mt-1">
          Your care partner and emergency contacts — updated and ready when needed.
        </p>
      </div>

      {/* ── EMERGENCY CONTACTS SECTION ───────────────────────────────────── */}
      <motion.div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>

        <div className="flex items-center justify-between px-6 py-4">
          <button onClick={() => setEcExpanded(p => !p)} className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-gentle-coral/10 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-gentle-coral" />
            </div>
            <div>
              <p className="font-semibold text-charcoal">Emergency Contacts</p>
              <p className="text-xs text-medium-gray mt-0.5">
                {contacts.length === 0 ? 'No contacts added yet' : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} on file`}
              </p>
            </div>
            {ecExpanded ? <ChevronUp className="w-5 h-5 text-medium-gray ml-2" /> : <ChevronDown className="w-5 h-5 text-medium-gray ml-2" />}
          </button>
          <button onClick={addContact}
            className="flex items-center gap-1.5 px-4 py-2 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" /> Add Contact
          </button>
        </div>

        <AnimatePresence>
          {ecExpanded && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden border-t border-soft-taupe">
              {!ecLoaded ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-warm-bronze" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-12 text-medium-gray">
                  <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No emergency contacts yet</p>
                  <p className="text-sm mt-1">Tap "Add Contact" to add someone who should be called in an emergency</p>
                </div>
              ) : (
                <div className="divide-y divide-soft-taupe/30">
                  {contacts.map((contact, idx) => (
                    <div key={contact.id} className="p-4">
                      {/* Contact row header */}
                      <div className="flex items-center gap-3 mb-0">
                        <button
                          onClick={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          <div className="w-9 h-9 bg-gentle-coral/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-gentle-coral font-semibold text-sm">
                              {contact.full_name ? contact.full_name[0].toUpperCase() : (idx + 1)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-charcoal text-sm truncate">
                              {contact.full_name || <span className="text-medium-gray italic">New contact</span>}
                            </p>
                            <p className="text-xs text-medium-gray">
                              {[contact.relationship, contact.phone].filter(Boolean).join(' · ') || 'Tap to fill in details'}
                            </p>
                          </div>
                          {expandedId === contact.id
                            ? <ChevronUp className="w-4 h-4 text-medium-gray flex-shrink-0" />
                            : <ChevronDown className="w-4 h-4 text-medium-gray flex-shrink-0" />}
                        </button>
                        <button onClick={() => deleteContact(contact.id)}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-gentle-coral hover:bg-gentle-coral/10 transition-colors flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Expanded contact form */}
                      <AnimatePresence>
                        {expandedId === contact.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="pt-4 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Full Name *" icon={User}>
                                  <input value={contact.full_name}
                                    onChange={e => updateContact(contact.id, 'full_name', e.target.value)}
                                    placeholder="Contact's full name" className={inputCls} />
                                </Field>
                                <Field label="Relationship to Patient" icon={Heart}>
                                  <input value={contact.relationship}
                                    onChange={e => updateContact(contact.id, 'relationship', e.target.value)}
                                    placeholder="e.g. Neighbor, Friend, Doctor" className={inputCls} />
                                </Field>
                                <Field label="Phone Number" icon={Phone}>
                                  <input type="tel" value={contact.phone}
                                    onChange={e => updateContact(contact.id, 'phone', e.target.value)}
                                    placeholder="(555) 123-4567" className={inputCls} />
                                </Field>
                                <Field label="Email Address" icon={Mail}>
                                  <input type="email" value={contact.email}
                                    onChange={e => updateContact(contact.id, 'email', e.target.value)}
                                    placeholder="email@example.com" className={inputCls} />
                                </Field>
                              </div>
                              <Field label="Address" icon={User}
                                hint="Home or work address — useful if they need to come quickly">
                                <input value={contact.address}
                                  onChange={e => updateContact(contact.id, 'address', e.target.value)}
                                  placeholder="Street, City, State, ZIP" className={inputCls} />
                              </Field>
                              <Field label="Additional Notes">
                                <textarea value={contact.notes}
                                  onChange={e => updateContact(contact.id, 'notes', e.target.value)}
                                  placeholder="Any other relevant details — best time to call, language spoken, etc."
                                  rows={2} className={textareaCls} />
                              </Field>
                              <div className="flex gap-3">
                                <button onClick={() => saveContact(contact)}
                                  disabled={ecSaving === contact.id}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">
                                  {ecSaving === contact.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                  {ecSaving === contact.id ? 'Saving...' : 'Save Contact'}
                                </button>
                                <button onClick={() => setExpandedId(null)}
                                  className="px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 transition-colors">
                                  Done
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>


      {/* ── CARE PARTNER SECTION ─────────────────────────────────────────── */}
      <motion.div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>

        <button
          onClick={() => setCpExpanded(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-soft-taupe/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warm-bronze/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-warm-bronze" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-charcoal">Care Partner</p>
              <p className="text-xs text-medium-gray mt-0.5">
                {cpInfo.full_name || 'Not yet filled in'} {cpInfo.relationship ? `· ${cpInfo.relationship}` : ''}
              </p>
            </div>
          </div>
          {cpExpanded ? <ChevronUp className="w-5 h-5 text-medium-gray" /> : <ChevronDown className="w-5 h-5 text-medium-gray" />}
        </button>

        <AnimatePresence>
          {cpExpanded && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden border-t border-soft-taupe">
              {!cpLoaded ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-warm-bronze" />
                </div>
              ) : (
                <div className="p-6 space-y-5">

                  {/* Basic Info */}
                  <div>
                    <p className="text-xs font-semibold text-medium-gray uppercase tracking-wide mb-3">Basic Information</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Full Name *" icon={User}>
                        <input value={cpInfo.full_name} onChange={e => setCpInfo(p => ({...p, full_name: e.target.value}))}
                          placeholder="Care partner's full name" className={inputCls} />
                      </Field>
                      <Field label="Relationship to Patient" icon={Heart}>
                        <input value={cpInfo.relationship} onChange={e => setCpInfo(p => ({...p, relationship: e.target.value}))}
                          placeholder="e.g. Daughter, Son, Spouse, Friend" className={inputCls} />
                      </Field>
                      <Field label="Email Address" icon={Mail}>
                        <input type="email" value={cpInfo.email} onChange={e => setCpInfo(p => ({...p, email: e.target.value}))}
                          placeholder="email@example.com" className={inputCls} />
                      </Field>
                      <Field label="Phone Number" icon={Phone}>
                        <input type="tel" value={cpInfo.phone} onChange={e => setCpInfo(p => ({...p, phone: e.target.value}))}
                          placeholder="(555) 123-4567" className={inputCls} />
                      </Field>
                    </div>
                  </div>

                  {/* Qualifications */}
                  <div>
                    <p className="text-xs font-semibold text-medium-gray uppercase tracking-wide mb-3">Qualifications & Background</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Education Level" icon={GraduationCap}
                        hint="e.g. High school, Associate's, Bachelor's, Master's, Doctorate">
                        <input value={cpInfo.education_level} onChange={e => setCpInfo(p => ({...p, education_level: e.target.value}))}
                          placeholder="Highest education completed" className={inputCls} />
                      </Field>
                      <Field label="Relevant Medical Experience" icon={Stethoscope}
                        hint="Any nursing, caregiving, or medical training">
                        <input value={cpInfo.medical_experience} onChange={e => setCpInfo(p => ({...p, medical_experience: e.target.value}))}
                          placeholder="e.g. CNA, Home health aide, RN" className={inputCls} />
                      </Field>
                    </div>
                    <div className="mt-4">
                      <Field label="Relevant Employment / Position" icon={Briefcase}
                        hint="Current or past employment relevant to this caregiving role">
                        <input value={cpInfo.employment_relevant} onChange={e => setCpInfo(p => ({...p, employment_relevant: e.target.value}))}
                          placeholder="e.g. Retired nurse, Social worker at Raleigh Senior Care" className={inputCls} />
                      </Field>
                    </div>
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <p className="text-xs font-semibold text-medium-gray uppercase tracking-wide mb-3">Additional Notes</p>
                    <Field label="Anything else important to note about this care partner">
                      <textarea value={cpInfo.notes} onChange={e => setCpInfo(p => ({...p, notes: e.target.value}))}
                        placeholder="Any other relevant information — availability, special instructions, etc."
                        rows={3} className={textareaCls} />
                    </Field>
                  </div>

                  <button onClick={saveCarePartner} disabled={cpSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">
                    {cpSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {cpSaving ? 'Saving...' : 'Save Care Partner Info'}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

    </div>
  );
}