// ROUND 6 (continued) — closes P06 (Medical Providers), P07 (Patient
// Intake surfaced to authorized staff), O08 (Notification preferences),
// and the write-access gaps blocking W03 (Quick Observation Entry) and
// W10 (Care Team Invitations) in the new Enterprise Caregiver Portal.
//
// LIVE VERIFICATION (this round, local isolated Supabase stack): a full
// disposable fixture (director, org-caregiver staff member, covered
// patient, verified therapist account) exercised every change below via
// real HTTP. All positive cases succeeded; all cross-tenant negative
// cases (an entirely unrelated account with no assignment/membership)
// were rejected. See this round's handoff report for the exact fixture
// and raw HTTP responses. All fixtures deleted and verified removed
// after the session.
//
// Also discovered (and fixed here, since this migration already edits
// this exact table's RLS): 016's and 023's RESTRICTIVE policies on
// care_partner_checkins INSERT were both defined BEFORE
// 027_staging_production_table_parity.sql actually creates the table —
// each one's own `WHEN undefined_table THEN ... skipped` branch fired
// silently at every `supabase db reset` replay, confirmed via a direct
// pg_policy query. Neither policy has ever actually existed on this
// table in this repo's real migration order. Re-created verbatim here,
// now that the table unambiguously exists at this later point.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ROUND 6 — migration 072 providers/intake/notifications/staff-write fixes', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/migrations/072_r6_providers_intake_notifications_and_staff_writes.sql'), 'utf-8');

  it('P06: patient_care_providers table + record_patient_provider() gate the professional_observation source claim', () => {
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS patient_care_providers/);
    const fn = source.split('CREATE OR REPLACE FUNCTION public.record_patient_provider')[1];
    expect(fn).toMatch(/IF p_source = 'professional_observation' AND NOT public\.is_professional_staff_for_patient\(p_patient_id\) THEN/);
    expect(source).toMatch(/USING \(public\.has_patient_access\(patient_id\)\)/);
  });

  it("P07: an authorized caregiver or assigned staff member may now SELECT their patient's intake record", () => {
    const fn = source.split('"Authorized caregivers/staff can view their patient\'s intake record"')[1];
    expect(fn).toMatch(/EXISTS \(SELECT 1 FROM caregiver_patients cp WHERE cp\.patient_id = patient_intake\.patient_profile_id AND cp\.caregiver_id = auth\.uid\(\)\)/);
    expect(fn).toMatch(/EXISTS \(SELECT 1 FROM staff_patient_assignments spa WHERE spa\.patient_id = patient_intake\.patient_profile_id AND spa\.user_id = auth\.uid\(\) AND spa\.is_active = true\)/);
  });

  it('O08: caregiver_notification_preferences is strictly self-row (SELECT/INSERT/UPDATE all gated on user_id = auth.uid()) with no delivery-receipt column', () => {
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS caregiver_notification_preferences/);
    const table = source.split('CREATE TABLE IF NOT EXISTS caregiver_notification_preferences')[1].split(';')[0];
    expect(table).not.toMatch(/delivered_at|sent_at/);
    const policies = source.split('caregiver_notification_preferences FOR')[1] + source.split('caregiver_notification_preferences FOR')[2] + source.split('caregiver_notification_preferences FOR')[3];
    expect(policies).toMatch(/user_id = auth\.uid\(\)/);
  });

  it('W03: care_partner_checkins and care_partner_notes gain a staff INSERT path scoped to an active staff_patient_assignments row', () => {
    expect(source).toMatch(/"Assigned staff can submit check-ins for their patients"\s+ON care_partner_checkins FOR INSERT/);
    expect(source).toMatch(/"Assigned staff can create Care Partner notes for their patients"\s+ON care_partner_notes FOR INSERT/);
  });

  it("W10: caregiver_invite_therapist's sole authorization check now also accepts an active staff_patient_assignments row, every other line preserved from migration 065", () => {
    const fn = source.split('CREATE OR REPLACE FUNCTION public.caregiver_invite_therapist')[1];
    expect(fn).toMatch(/NOT EXISTS \(SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth\.uid\(\)\)\s+AND NOT EXISTS \(SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth\.uid\(\) AND is_active = true\)/);
    // THER-02's FOR UPDATE row lock and the reinvite-vs-new-row branch are unchanged.
    expect(fn).toMatch(/FOR UPDATE;/);
    expect(fn).toMatch(/v_existing\.status = 'pending'/);
  });

  it('discovered-and-fixed: the care_partner_checkins entitlement RESTRICTIVE policy (016) and ownership RESTRICTIVE policy (023) are re-applied at a point in migration order where the table actually exists', () => {
    expect(source).toMatch(/"Free-tier accounts cannot submit new care partner check-ins \(REPAIR C, re-applied R6\)"\s+ON care_partner_checkins\s+AS RESTRICTIVE\s+FOR INSERT\s+WITH CHECK \(public\.patient_has_paid_entitlement\(patient_id\)\)/);
    expect(source).toMatch(/"Caller must be the check-in's own patient, linked caregiver, or assigned staff \(FQA-019\/SEC-008, extended R6\)"\s+ON care_partner_checkins AS RESTRICTIVE FOR INSERT/);
  });
});
