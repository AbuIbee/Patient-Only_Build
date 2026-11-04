# Defects and execution blockers
Run HCN-E2E-002; observed 2026-11-04 19:11–19:13 UTC. Production SHA 6621b4b755b8d682135cf075ab60712803e8762f. No authenticated test identities; organization/patient IDs unavailable.

## P0 REQUIREMENT-CAP-01 — four simultaneous specialists exceed published Complete capacity
Evidence E02: license_tier_catalog Complete specialist_slot_count=3; test demands S01–S04 simultaneously. Required resolution: explicit owner product/licensing decision or revised acceptance scope before implementation. Do not change production caps. Affected sources: supabase/migrations/20261030020000_hcn_correct_complete_tier_specialist_slot_count.sql and catalog data. Regression proof after a separately approved decision: activate licensed seat count through UI, reject N+1 atomically and concurrently, retain existing customer entitlements. Stop at seat-cap rejection; no rotation to claim four simultaneous accounts.

## P0 REQUIREMENT-ROLE-02 — distinct Nutritionist/PT offices unsupported in current constraints
E02: professional_applications requested_office/approved_office allow director, caregiver, medical_professional, therapist; organization_memberships_org_role_check lacks nutritionist/PT/other_specialist. Affected definitions are the named CHECK constraints; application/credential/assignment paths require further source tracing before an exact implementation order. No code patch specified or authorized on incomplete tracing. Required design: approved specialty metadata or roles with enforceable patient scope, credential semantics and seat counting. Proof: invitation -> truthful credential gate -> correct role -> assigned-only JWT/RLS access; wrong specialty/unassigned denied. Stop before mislabeling or inserting unsupported role values.

## BLOCKER ENV-01 — no controlled inbox or encrypted credential vault
Browser exists; default TinyFish profile has domain_count=0 and no signed_in_sites. No mail connector or vault capability exposed, no operator-controlled domain/22 aliases supplied. No product defect inferred. Resolution: connect operator-owned test inbox/catch-all and encrypted credential vault; allocate O01,D01,C01–04,S01–04,P01–12. Proof: first authentic email, production activation URL, non-expired single-use token and password proof; max two transient attempts, stop bulk on 429.

## BLOCKER LEGAL-01 / CLINICAL-01 / FINANCE-01
Lawful synthetic signing authority, approved synthetic credential verification and any required safe billing facility have not been demonstrated. Exact UI gates not reached. Do not call these observed product failures. Stop affected paths on false attestation, live mandate or charge. Annual coupon does not waive monthly $250.
