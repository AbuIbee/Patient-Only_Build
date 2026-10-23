-- OWNER DIRECTIVE: RLS POLICY-SCOPING SECURITY REMEDIATION (supersedes the
-- rejected grant-based draft previously staged as this migration number;
-- that draft was never applied anywhere and is safely replaced, not
-- rewritten-in-place, per the owner's explicit instruction not to treat a
-- staged-but-unapplied file as historical).
--
-- BACKGROUND: migrations 085/090 revoked anon's EXECUTE on every SECURITY
-- DEFINER function in `public`, without accounting for functions called
-- DIRECTLY inside an RLS policy's USING/WITH CHECK expression on a policy
-- that carries no `TO` clause (i.e. applies to every role, anon included).
-- A function invoked this way needs the QUERYING role's own EXECUTE grant
-- (unlike a nested call from inside another SECURITY DEFINER function's
-- body, which runs under that function's own escalated privilege and
-- needs no separate grant — confirmed empirically this session: an anon
-- caller could invoke caller_is_expired_companion() successfully even
-- though its own nested call to is_my_program_active() has no anon grant
-- at all). Revoking anon's EXECUTE on a directly-referenced function
-- turned "RLS correctly returns an empty result for anon" into a hard
-- `42501 permission denied for function ...` error.
--
-- A prior draft of this migration (rejected) proposed re-granting anon
-- EXECUTE on the 10 affected functions to stop the error. Security review
-- found two problems with that approach: (1) it directly contradicts this
-- engagement's own stated defense-in-depth standard (migration 090's own
-- comment: "'happens to return false today' is not a substitute for the
-- grant not existing at all") by reopening a privilege purely because the
-- function happens to return false for anon; (2) one of the ten,
-- patient_has_paid_entitlement(uuid), does NOT gate on auth.uid() at all —
-- it and its nested call is_patient_enterprise_covered(uuid) key off the
-- CALLER-SUPPLIED patient_id argument alone, so granting it to anon would
-- let any unauthenticated caller probe an arbitrary patient UUID's
-- billing tier / Enterprise-coverage status. That is a real information
-- disclosure the grant-based approach would have reopened.
--
-- THE FIX APPLIED HERE INSTEAD: every affected policy already encodes a
-- role-membership/ownership/clinical-assignment check that is
-- structurally false for an unauthenticated caller (every branch bottoms
-- out in auth.uid(), NULL for anon) — anon never had any legitimate
-- reason to evaluate these predicates at all. `ALTER POLICY ... TO
-- authenticated` retargets a policy's role scope without touching its
-- USING/WITH CHECK logic, reproducing the identical effect (anon still
-- gets the correct empty result / blocked write) without ever invoking
-- any function as anon and without granting anon anything. This pattern
-- is already proven elsewhere in this exact schema — the patient-media
-- storage.objects policies already use `TO authenticated` successfully.
--
-- Scope: every PUBLIC-scoped (no TO clause) policy anywhere in the schema
-- that references one of the 12 functions implicated this session: the
-- 10 from the rejected draft, plus caller_is_expired_companion() /
-- caller_is_temp_user_program() (migration 105 — see the revokes below).
-- Exhaustively enumerated via a live catalog query against pg_policy, not
-- hand-assembled, then re-verified after writing this file. 124 policies
-- total, none of whose USING/WITH CHECK expressions are modified.
--
-- PRESERVED, VERIFIED SEPARATELY: patient_intake's "Public can submit
-- patient intake" policy (the one and only policy anywhere in this schema
-- explicitly scoped `TO anon`) is NOT touched. The four "Temporary
-- program cannot ... patient_intake" RESTRICTIVE policies below ARE
-- rescoped to `authenticated` — this is still correct and does not
-- weaken anything: a temp/demo-program user is, by this app's own
-- TEMP_USER_EMAIL_PATTERN definition, always a signed-in (authenticated)
-- account, never the literal anon database role, so the restriction
-- keeps applying to every account it was ever meant to restrict. A true
-- anonymous submitter was never a temp-program member and was never the
-- restriction's target. Verified live: no other policy anywhere in the
-- schema is scoped `TO anon`.

-- ============================================================
-- Section 1 — the 10 functions from the rejected grant-based draft
-- (has_patient_access, is_active_org_director, is_active_org_member,
-- is_admin, is_conversation_participant, is_medical_professional_for_patient,
-- is_platform_owner, is_professional_staff_for_patient,
-- is_therapist_for_patient, patient_has_paid_entitlement) — 56 policies.
-- ============================================================
ALTER POLICY "Platform Owner can view every deletion request" ON account_deletion_requests TO authenticated;
ALTER POLICY "Platform Owner can view the account management audit" ON account_management_audit TO authenticated;
ALTER POLICY "Free-tier accounts cannot submit new care partner check-ins (RE" ON care_partner_checkins TO authenticated;
ALTER POLICY "Active directors can view credentials within their own org" ON caregiver_credentials TO authenticated;
ALTER POLICY "Active directors can view all visits in their own org" ON caregiver_visits TO authenticated;
ALTER POLICY "Participants can view the participant list of their own convers" ON conversation_participants TO authenticated;
ALTER POLICY "Participants can view their conversations" ON conversations TO authenticated;
ALTER POLICY "Active directors can view coverage in their own org" ON covered_patient_memberships TO authenticated;
ALTER POLICY "The Platform Owner may review the full document access log" ON document_access_audit TO authenticated;
ALTER POLICY "Active directors can view and resolve incident reports in their" ON incident_reports TO authenticated;
ALTER POLICY "Free-tier accounts cannot create new memories (REPAIR C)" ON memories TO authenticated;
ALTER POLICY "Participants can view acknowledgment state in their conversatio" ON message_acknowledgments TO authenticated;
ALTER POLICY "Conversation participants can view message attachments" ON message_attachments TO authenticated;
ALTER POLICY "Participants can view messages in their conversations" ON messages TO authenticated;
ALTER POLICY "Only organization directors can view their organization's licen" ON organization_licenses TO authenticated;
ALTER POLICY "Active directors can view all memberships in their own org" ON organization_memberships TO authenticated;
ALTER POLICY "Platform Owner can view all organization memberships" ON organization_memberships TO authenticated;
ALTER POLICY "Active org members can view their own organization" ON organizations TO authenticated;
ALTER POLICY "Platform Owner can view all organizations" ON organizations TO authenticated;
ALTER POLICY "Authorized caregivers/staff can record allergies" ON patient_allergies TO authenticated;
ALTER POLICY "Authorized caregivers/staff can view allergies" ON patient_allergies TO authenticated;
ALTER POLICY "Only professional staff may claim a verified or professional_ob" ON patient_allergies TO authenticated;
ALTER POLICY "Authorized caregivers/staff can record care plans" ON patient_care_plans TO authenticated;
ALTER POLICY "Authorized caregivers/staff can view care plans" ON patient_care_plans TO authenticated;
ALTER POLICY "Only professional staff may author or supersede a care plan" ON patient_care_plans TO authenticated;
ALTER POLICY "Authorized caregivers/staff can record care preferences" ON patient_care_preferences TO authenticated;
ALTER POLICY "Authorized caregivers/staff can view care preferences" ON patient_care_preferences TO authenticated;
ALTER POLICY "Authorized caregivers/staff can record a patient's providers" ON patient_care_providers TO authenticated;
ALTER POLICY "Authorized caregivers/staff can view a patient's providers" ON patient_care_providers TO authenticated;
ALTER POLICY "Only professional staff may claim a verified or professional_ob" ON patient_care_providers TO authenticated;
ALTER POLICY "Authorized caregivers/staff can record diagnoses" ON patient_diagnoses TO authenticated;
ALTER POLICY "Authorized caregivers/staff can view diagnoses" ON patient_diagnoses TO authenticated;
ALTER POLICY "Only professional staff may claim a verified or professional_ob" ON patient_diagnoses TO authenticated;
ALTER POLICY "Medical professionals can create clinical observations for thei" ON patient_notes TO authenticated;
ALTER POLICY "Medical professionals can view their own clinical observations" ON patient_notes TO authenticated;
ALTER POLICY "Therapists can create session notes for their patients" ON patient_notes TO authenticated;
ALTER POLICY "Therapists can view and manage their own session notes" ON patient_notes TO authenticated;
ALTER POLICY "Authorized caregivers/staff can view therapy goals" ON patient_therapy_goals TO authenticated;
ALTER POLICY "Only professional staff can record therapy goals" ON patient_therapy_goals TO authenticated;
ALTER POLICY "Only professional staff can update their own therapy goals" ON patient_therapy_goals TO authenticated;
ALTER POLICY "Authorized caregivers/staff can record vitals" ON patient_vitals TO authenticated;
ALTER POLICY "Authorized caregivers/staff can view vitals" ON patient_vitals TO authenticated;
ALTER POLICY "Only professional staff may claim a verified or professional_ob" ON patient_vitals TO authenticated;
ALTER POLICY "Active org directors can view patients covered by their own org" ON patients TO authenticated;
ALTER POLICY "Authorized reviewers can view application documents" ON professional_application_documents TO authenticated;
ALTER POLICY "Authorized reviewers can view application history" ON professional_application_events TO authenticated;
ALTER POLICY "Active org directors can view applications targeting their org" ON professional_applications TO authenticated;
ALTER POLICY "Platform Owner can view every application" ON professional_applications TO authenticated;
ALTER POLICY "Admins can delete pending signups only" ON profiles TO authenticated;
ALTER POLICY "Admins can update other profiles" ON profiles TO authenticated;
ALTER POLICY "Admins can view all profiles" ON profiles TO authenticated;
ALTER POLICY "Active directors can view scope concerns in their own org" ON scope_concerns TO authenticated;
ALTER POLICY "Active directors can view all shift handoffs in their own org" ON shift_handoffs TO authenticated;
ALTER POLICY "Active directors can view all assignments in their own org" ON staff_patient_assignments TO authenticated;
ALTER POLICY "Authorized reviewers can view application credential files" ON storage.objects TO authenticated;
ALTER POLICY "Conversation participants can read message attachment objects" ON storage.objects TO authenticated;

-- ============================================================
-- Section 2 — the 2 functions migration 105 granted directly to anon
-- (caller_is_expired_companion, caller_is_temp_user_program) — 68
-- policies, dynamically created across many tables by migrations
-- 018/019/024's per-table loops.
-- ============================================================
ALTER POLICY "Temporary program cannot delete from appointments (REPAIR 007)" ON appointments TO authenticated;
ALTER POLICY "Temporary program cannot delete from appointments (REPAIR 008)" ON appointments TO authenticated;
ALTER POLICY "Temporary program cannot insert into appointments (REPAIR 007)" ON appointments TO authenticated;
ALTER POLICY "Temporary program cannot insert into appointments (REPAIR 008)" ON appointments TO authenticated;
ALTER POLICY "Temporary program cannot read appointments (REPAIR 008)" ON appointments TO authenticated;
ALTER POLICY "Temporary program cannot update appointments (REPAIR 007)" ON appointments TO authenticated;
ALTER POLICY "Temporary program cannot update appointments (REPAIR 008)" ON appointments TO authenticated;
ALTER POLICY "Temporary program cannot delete from care_team_members (REPAIR " ON care_team_members TO authenticated;
ALTER POLICY "Temporary program cannot insert into care_team_members (REPAIR " ON care_team_members TO authenticated;
ALTER POLICY "Temporary program cannot read care_team_members (REPAIR 008)" ON care_team_members TO authenticated;
ALTER POLICY "Temporary program cannot update care_team_members (REPAIR 007)" ON care_team_members TO authenticated;
ALTER POLICY "Temporary program cannot update care_team_members (REPAIR 008)" ON care_team_members TO authenticated;
ALTER POLICY "Temporary program cannot read caregiver_patients (REPAIR 008)" ON caregiver_patients TO authenticated;
ALTER POLICY "Expired companion cannot access medication_logs (REPAIR 008)" ON medication_logs TO authenticated;
ALTER POLICY "Temporary program cannot delete from medication_logs (REPAIR 00" ON medication_logs TO authenticated;
ALTER POLICY "Temporary program cannot insert into medication_logs (REPAIR 00" ON medication_logs TO authenticated;
ALTER POLICY "Temporary program cannot read medication_logs (REPAIR 008)" ON medication_logs TO authenticated;
ALTER POLICY "Temporary program cannot update medication_logs (REPAIR 008)" ON medication_logs TO authenticated;
ALTER POLICY "Expired companion cannot access medications (REPAIR 008)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot delete from medications (REPAIR 007)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot delete from medications (REPAIR 008)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot insert into medications (REPAIR 007)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot insert into medications (REPAIR 008)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot read medications (REPAIR 008)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot update medications (REPAIR 007)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot update medications (REPAIR 008)" ON medications TO authenticated;
ALTER POLICY "Temporary program cannot delete from memories (REPAIR 007)" ON memories TO authenticated;
ALTER POLICY "Temporary program cannot delete from memories (REPAIR 008)" ON memories TO authenticated;
ALTER POLICY "Temporary program cannot insert into memories (REPAIR 007)" ON memories TO authenticated;
ALTER POLICY "Temporary program cannot insert into memories (REPAIR 008)" ON memories TO authenticated;
ALTER POLICY "Temporary program cannot read memories (REPAIR 008)" ON memories TO authenticated;
ALTER POLICY "Temporary program cannot update memories (REPAIR 007)" ON memories TO authenticated;
ALTER POLICY "Temporary program cannot update memories (REPAIR 008)" ON memories TO authenticated;
ALTER POLICY "Temporary program cannot delete from mood_entries (REPAIR 007)" ON mood_entries TO authenticated;
ALTER POLICY "Temporary program cannot delete from mood_entries (REPAIR 008)" ON mood_entries TO authenticated;
ALTER POLICY "Temporary program cannot insert into mood_entries (REPAIR 007)" ON mood_entries TO authenticated;
ALTER POLICY "Temporary program cannot insert into mood_entries (REPAIR 008)" ON mood_entries TO authenticated;
ALTER POLICY "Temporary program cannot read mood_entries (REPAIR 008)" ON mood_entries TO authenticated;
ALTER POLICY "Temporary program cannot update mood_entries (REPAIR 007)" ON mood_entries TO authenticated;
ALTER POLICY "Temporary program cannot update mood_entries (REPAIR 008)" ON mood_entries TO authenticated;
ALTER POLICY "Expired companion cannot access patient_document_uploads (REPAI" ON patient_document_uploads TO authenticated;
ALTER POLICY "Temporary program cannot delete from patient_document_uploads (" ON patient_document_uploads TO authenticated;
ALTER POLICY "Temporary program cannot insert into patient_document_uploads (" ON patient_document_uploads TO authenticated;
ALTER POLICY "Temporary program cannot read patient_document_uploads (REPAIR " ON patient_document_uploads TO authenticated;
ALTER POLICY "Temporary program cannot update patient_document_uploads (REPAI" ON patient_document_uploads TO authenticated;
-- patient_intake: see the preservation note above. "Public can submit
-- patient intake" (TO anon, permissive) is untouched by this migration.
ALTER POLICY "Temporary program cannot delete from patient_intake (REPAIR 008" ON patient_intake TO authenticated;
ALTER POLICY "Temporary program cannot insert into patient_intake (REPAIR 008" ON patient_intake TO authenticated;
ALTER POLICY "Temporary program cannot read patient_intake (REPAIR 008)" ON patient_intake TO authenticated;
ALTER POLICY "Temporary program cannot update patient_intake (REPAIR 008)" ON patient_intake TO authenticated;
ALTER POLICY "Temporary program cannot delete from patient_notes (REPAIR 007)" ON patient_notes TO authenticated;
ALTER POLICY "Temporary program cannot delete from patient_notes (REPAIR 008)" ON patient_notes TO authenticated;
ALTER POLICY "Temporary program cannot insert into patient_notes (REPAIR 007)" ON patient_notes TO authenticated;
ALTER POLICY "Temporary program cannot insert into patient_notes (REPAIR 008)" ON patient_notes TO authenticated;
ALTER POLICY "Temporary program cannot read patient_notes (REPAIR 008)" ON patient_notes TO authenticated;
ALTER POLICY "Temporary program cannot update patient_notes (REPAIR 007)" ON patient_notes TO authenticated;
ALTER POLICY "Temporary program cannot update patient_notes (REPAIR 008)" ON patient_notes TO authenticated;
ALTER POLICY "Temporary program cannot insert patients (REPAIR 007)" ON patients TO authenticated;
ALTER POLICY "Temporary program cannot read patients (REPAIR 008)" ON patients TO authenticated;
ALTER POLICY "Temporary program cannot update patients (REPAIR 007)" ON patients TO authenticated;
ALTER POLICY "Expired companion cannot access patient-media/documents storage" ON storage.objects TO authenticated;
ALTER POLICY "Temporary program cannot access patient-media/documents storage" ON storage.objects TO authenticated;
ALTER POLICY "Temporary program cannot delete from tasks (REPAIR 007)" ON tasks TO authenticated;
ALTER POLICY "Temporary program cannot delete from tasks (REPAIR 008)" ON tasks TO authenticated;
ALTER POLICY "Temporary program cannot insert into tasks (REPAIR 007)" ON tasks TO authenticated;
ALTER POLICY "Temporary program cannot insert into tasks (REPAIR 008)" ON tasks TO authenticated;
ALTER POLICY "Temporary program cannot read tasks (REPAIR 008)" ON tasks TO authenticated;
ALTER POLICY "Temporary program cannot update tasks (REPAIR 007)" ON tasks TO authenticated;
ALTER POLICY "Temporary program cannot update tasks (REPAIR 008)" ON tasks TO authenticated;

-- ============================================================
-- Section 3 — correct migration 105's residual exposure. Every policy
-- that embedded caller_is_expired_companion()/caller_is_temp_user_program()
-- is now scoped TO authenticated (Section 2 above), so no policy anywhere
-- evaluates either function for an anon caller any more. Verified no
-- other legitimate direct anon caller exists: grepped src/ for any client
-- call to either RPC name (none found — both are internal-only helpers,
-- their own original migration-018 comment already said as much). Safe
-- to revoke the grant migration 105 added; migration 105's own file is
-- left untouched (it already executed), this is a forward-only
-- correction, not a rewrite of history.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.caller_is_expired_companion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.caller_is_temp_user_program() FROM anon;

-- ============================================================
-- Section 4 — additional finding from this session's broader audit
-- ("every other argument-based SECURITY DEFINER function for comparable
-- caller-independent disclosure"). is_authorized_for_patient(p_user_id,
-- p_patient_id) and is_org_director_for_patient(p_user_id, p_patient_id)
-- take the caller's identity as an ordinary argument rather than reading
-- auth.uid() internally. Neither is referenced by any RLS policy
-- (verified live against pg_policy) — both are nested-only helpers,
-- called exclusively from inside other SECURITY DEFINER functions
-- (search_my_conversations, create_conversation, add_conversation_participant,
-- get_my_conversations, send_message, get_patient_care_circle;
-- is_conversation_participant for the director check), every one of
-- which passes auth.uid() as p_user_id. But both currently also grant
-- EXECUTE directly to `authenticated` — meaning any signed-in user could
-- call either one directly via /rest/v1/rpc with an ARBITRARY other
-- user's UUID and learn that other user's patient-access or
-- org-director-for-patient relationship. This is a real
-- caller-independent disclosure, pre-existing and unrelated to anon.
-- Revoking authenticated's direct EXECUTE does not affect any of the six
-- legitimate nested callers above (nested calls run under the calling
-- SECURITY DEFINER function's own escalated privilege, not the original
-- client's grant — same mechanism verified empirically for the anon case
-- earlier this session).
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_authorized_for_patient(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_director_for_patient(uuid, uuid) FROM authenticated;
