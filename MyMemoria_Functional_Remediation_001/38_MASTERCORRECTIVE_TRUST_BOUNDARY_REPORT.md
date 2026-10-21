# MASTER CORRECTIVE — Security Trust-Boundary Report

## The pattern behind every SEC-prefixed finding

Every SEC-01 through SEC-06 defect shares one root cause shape: **a SECURITY DEFINER RPC correctly enforced an authorization or provenance invariant, but the underlying table it wrote to did not independently enforce the same invariant** — so any caller able to reach the table directly via PostgREST (which every `authenticated` request can, by default, unless RLS says otherwise) bypassed the RPC's gate entirely. The RPC layer was treated as *the* trust boundary; it is not — in this schema, with `anon`/`authenticated` as the only Postgres roles and every table reachable at `/rest/v1/<table>`, the table's own RLS is the real, final trust boundary. An RPC is a convenience and a UX/validation layer in front of it, never a substitute for it.

This is why Section 4 of the Master Corrective order required root-cause fixes rather than patches: patching the RPCs again would have left the exact same class of bypass reachable through the same direct-table path. Every fix in migration 076 instead adds the missing invariant **at the table or trigger level**:

| Finding | RPC already did the right thing | Table-level gap closed by |
|---|---|---|
| SEC-01 | N/A — a genuine ordering bug inside the RPC itself | Reordered the lock acquisition inside `revoke_therapist_connection()` |
| SEC-02 | N/A — missing re-checks inside the RPCs themselves | Added current-authorization re-checks inside `record_note_amendment()`/`start_caregiver_visit()`/`end_caregiver_visit()` |
| SEC-03 | `record_patient_*()` RPCs gated `professional_observation`/`verified_source` | `BEFORE INSERT/UPDATE` trigger on `patients`; `RESTRICTIVE` INSERT policies on the 3 clinical tables |
| SEC-04 | — (RPC itself lacked the check; both fixed together) | `is_professional_staff_for_patient()` added to the RPC + a `RESTRICTIVE` table policy |
| SEC-05 | N/A — no RPC existed for this column at all | `BEFORE UPDATE` trigger forcing `status_updated_by = auth.uid()` |
| SEC-06 | N/A — a row-scoped RLS policy was simply too permissive | Replaced the policy; added a narrow RPC for the legitimate operational need |

## Why "RPC-level gating" was previously treated as sufficient, and why that was wrong

Reading migration 070's own inline comment is instructive: *"the RLS WITH CHECK alone cannot see the `source` value cleanly across all six shapes, so the source-claim gate lives in the RPCs, not bare table policies."* This reasoning is incorrect — a `WITH CHECK` (or `USING`) expression in Postgres RLS can reference any column of the row being written or read, including `source`, exactly like any other `WHERE`-style predicate. The actual reason the gate was never duplicated at the table level appears to be that prior rounds verified authorization using the RPC endpoints exclusively (via `supabase.rpc(...)` in application code and curl against `/rest/v1/rpc/*` in testing), and never independently tested the *same* invariant against a direct `/rest/v1/<table>` call with a forged value. This is exactly the blind spot Section 7 of the Master Corrective order anticipated by requiring tests that assert "actual DB contents," with "positive AND negative controls" — a positive RPC test proves the RPC works; it proves nothing about whether the table underneath it is independently safe.

## Trust boundaries now enforced redundantly (defense in depth)

After migration 076, every provenance- or authorization-sensitive write in the affected surface area is enforced at **two independent layers** that must both agree:
1. The RPC's own `IF NOT ... THEN RAISE EXCEPTION` checks (unchanged, still the primary UX-facing validation).
2. A table-level `RESTRICTIVE` RLS policy or `BEFORE`-trigger that re-derives the same answer from `auth.uid()` and the current state of `staff_patient_assignments`/`therapist_relationships`/`profiles.role`, independent of which code path reached the table.

This means a *future* RPC, or a direct admin tool, or a bug in application code that forgets to call the gate, cannot reintroduce any of SEC-01 through SEC-06 without also changing the table-level invariant — which is the durable property the Master Corrective order asked for ("not UI-only hiding," "DB-level invariant").

## Identity derivation

No fix in this round widens any trust source. `auth.uid()` (derived from the verified JWT, never a request parameter) remains the only source of caller identity used by every new trigger and policy. `status_updated_by`, `code_status_updated_by`, and `communication_needs_updated_by` are now **always** server-derived from `auth.uid()` inside a trigger, never accepted from the client even when the client happens to send the correct value.

## What was deliberately NOT changed

- No broad role-based shortcut or permissive fallback was added anywhere. Every fix narrows a prior over-broad grant or closes a missing check — none widens access.
- No existing RLS policy that was already correctly scoped was touched (e.g., `patient_care_preferences`, `patient_therapy_goals`'s existing policies, `has_patient_access()` itself).
- `caregiver_invite_therapist()`/`respond_to_therapist_invite()`'s THER-01 positive-eligibility role check and every other previously-hardened line in migrations 062/064/065/072/074 is preserved byte-for-byte except for the one reordering in SEC-01.
- No service-role credential appears in any client-reachable code path; the new RPCs and triggers all run as `SECURITY DEFINER` functions owned by the database owner, exactly matching the established pattern for every other RPC in this schema.

## Outstanding, explicitly out of scope for this round

- **W13 (Offline Drafting):** remains OPEN, no change — see `35_ROUND7_CORRECTIVE_W13_DECISION.md` and the finding register's FUNC-06 entry.
- **O09 language/speech, O10 MFA/active-sessions:** remain the owner's decisions already on record in `34_ROUND7_CORRECTIVE_30ITEM_VALIDATION.md` — no new evidence this round changes that.
- **H13 (EVV):** left PARTIAL per the directive's own explicit instruction not to invent payer-specific rules absent a concrete requirement.
