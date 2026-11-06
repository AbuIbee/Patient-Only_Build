// HCN-CARE-MASTER-001/002: one authoritative, patient-scoped healthcare directory.
// The security boundary is hcn_save_patient_contact() + patient-scoped RLS.
// No client UPDATE grant or service-role credential is required.
import { supabase } from '@/lib/supabase';

export interface HealthcareContact {
  id: string;
  patientId: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  alternatePhone: string;
  practiceName: string;
  address: string;
  preferredContactMethod: string;
  notes: string;
  isPreferredHospital: boolean;
  verificationStatus: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
}

export interface HealthcareContactInput {
  name: string;
  role: string;
  phone: string;
  email: string;
  alternatePhone: string;
  practiceName: string;
  address: string;
  preferredContactMethod: string;
  notes: string;
  isPreferredHospital: boolean;
}

interface DbContact {
  id: string;
  patient_id: string;
  provider_name: string;
  provider_role: string;
  phone: string | null;
  email: string | null;
  alternate_phone: string | null;
  practice_name: string | null;
  address: string | null;
  preferred_contact_method: string | null;
  notes: string | null;
  is_preferred_hospital: boolean;
  verification_status: string;
  is_active: boolean;
  version: number;
  updated_at: string;
}

function fromRow(row: DbContact): HealthcareContact {
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.provider_name,
    role: row.provider_role,
    phone: row.phone ?? '',
    email: row.email ?? '',
    alternatePhone: row.alternate_phone ?? '',
    practiceName: row.practice_name ?? '',
    address: row.address ?? '',
    preferredContactMethod: row.preferred_contact_method ?? '',
    notes: row.notes ?? '',
    isPreferredHospital: row.is_preferred_hospital,
    verificationStatus: row.verification_status,
    isActive: row.is_active,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export async function loadHealthcareContacts(patientId: string): Promise<{
  data: HealthcareContact[] | null;
  error: string | null;
}> {
  if (!patientId) return { data: null, error: 'Patient context is required.' };
  const { data, error } = await supabase
    .from('patient_care_providers')
    .select('id,patient_id,provider_name,provider_role,phone,email,alternate_phone,practice_name,address,preferred_contact_method,notes,is_preferred_hospital,verification_status,is_active,version,updated_at')
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .order('provider_role');
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map((row) => fromRow(row as DbContact)), error: null };
}

export async function saveHealthcareContact(
  patientId: string,
  input: HealthcareContactInput,
  existing?: Pick<HealthcareContact, 'id' | 'version'> | null,
): Promise<{ data: HealthcareContact | null; error: string | null }> {
  if (!patientId || !input.name.trim() || !input.role.trim()) {
    return { data: null, error: 'Patient, contact name, and contact category are required.' };
  }
  const { data, error } = await supabase.rpc('hcn_save_patient_contact', {
    p_patient_id: patientId,
    p_provider_id: existing?.id ?? null,
    p_expected_version: existing?.version ?? null,
    p_provider_name: input.name.trim(),
    p_provider_role: input.role.trim(),
    p_phone: input.phone.trim() || null,
    p_email: input.email.trim() || null,
    p_alternate_phone: input.alternatePhone.trim() || null,
    p_practice_name: input.practiceName.trim() || null,
    p_address: input.address.trim() || null,
    p_preferred_contact_method: input.preferredContactMethod.trim() || null,
    p_notes: input.notes.trim() || null,
    p_is_preferred_hospital: input.isPreferredHospital,
  });
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: 'The contact save returned no record.' };
  return { data: fromRow(data as DbContact), error: null };
}
