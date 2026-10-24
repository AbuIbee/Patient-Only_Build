// OWNER DIRECTIVE MMA-ENT-SALES-006 Phase F3 — client wrappers for
// migration 115's enterprise_contracts. Every write is a thin
// pass-through to a SECURITY DEFINER RPC that independently
// re-verifies is_platform_owner() server-side; nothing here fabricates
// or verifies a signature -- "executed" only ever reflects what the
// Platform Owner explicitly attested to via a real execution method
// and evidence reference, per the RPC's own fail-closed validation.
import { supabase } from '@/lib/supabase';

export type ContractType = 'saas_license' | 'baa' | 'dpa';
export type ContractStatus = 'draft' | 'presented' | 'executed' | 'void';

export interface EnterpriseContract {
  id: string;
  quoteId: string;
  contractType: ContractType;
  templateVersion: string;
  signatoryName: string;
  signatoryTitle: string | null;
  status: ContractStatus;
  presentedAt: string | null;
  executionMethod: string | null;
  executionEvidenceReference: string | null;
  executedBy: string | null;
  executedAt: string | null;
  voidedReason: string | null;
  supersedesContractId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

function mapContract(r: Record<string, unknown>): EnterpriseContract {
  return {
    id: r.id as string, quoteId: r.quote_id as string, contractType: r.contract_type as ContractType,
    templateVersion: r.template_version as string, signatoryName: r.signatory_name as string, signatoryTitle: r.signatory_title as string | null,
    status: r.status as ContractStatus, presentedAt: r.presented_at as string | null,
    executionMethod: r.execution_method as string | null, executionEvidenceReference: r.execution_evidence_reference as string | null,
    executedBy: r.executed_by as string | null, executedAt: r.executed_at as string | null, voidedReason: r.voided_reason as string | null,
    supersedesContractId: r.supersedes_contract_id as string | null,
    createdBy: r.created_by as string, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

// Visible to the Platform Owner (every contract) and to whichever
// applicant/amendment-requesting director the quote belongs to (only
// once presented -- RLS, migration 115). Works for either audience
// without the caller needing to know which one they are.
export async function getContractsForQuote(quoteId: string): Promise<EnterpriseContract[]> {
  const { data, error } = await supabase.from('enterprise_contracts').select('*').eq('quote_id', quoteId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map(mapContract);
}

// p_supersedes_contract_id (migration 117): required whenever a live
// contract already exists for this exact quote+type -- the RPC
// refuses a second one outright unless it's an explicit, auditable
// replacement of a contract the owner has already voided. Omitted (or
// null) for a brand-new quote+type pairing.
export async function createContract(
  quoteId: string, contractType: ContractType, templateVersion: string, signatoryName: string, signatoryTitle: string | null,
  supersedesContractId: string | null = null,
): Promise<{ data: EnterpriseContract | null; error: string | null }> {
  const { data, error } = await supabase.rpc('platform_owner_create_contract', {
    p_quote_id: quoteId, p_contract_type: contractType, p_template_version: templateVersion,
    p_signatory_name: signatoryName, p_signatory_title: signatoryTitle, p_supersedes_contract_id: supersedesContractId,
  });
  if (error || !data) return { data: null, error: errMsg(error, 'Could not create this contract.') };
  return { data: mapContract(data as Record<string, unknown>), error: null };
}

export async function presentContract(contractId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_present_contract', { p_contract_id: contractId });
  return { error: error ? errMsg(error, 'Could not present this contract.') : null };
}

export async function recordContractExecution(
  contractId: string, executionMethod: string, executionEvidenceReference: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_record_contract_execution', {
    p_contract_id: contractId, p_execution_method: executionMethod, p_execution_evidence_reference: executionEvidenceReference,
  });
  return { error: error ? errMsg(error, 'Could not record this execution.') : null };
}

export async function voidContract(contractId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_void_contract', { p_contract_id: contractId, p_reason: reason });
  return { error: error ? errMsg(error, 'Could not void this contract.') : null };
}
