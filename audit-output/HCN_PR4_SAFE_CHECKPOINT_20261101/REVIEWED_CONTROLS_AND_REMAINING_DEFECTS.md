# HCN PR #4 — independently reviewed controls checkpoint

Status: **STATIC REVIEW PARTIAL PASS; NO MIGRATION ACCEPTANCE; NO RELEASE AUTHORIZATION.**

Reference: independent Codex review 004 of SHA `6ba5ac20817909db587393f65f98f3298f6fd8bd`, `audit-output/HCN_P0_CORRECTIVE_RETEST_004/HCN_PR4_S01_S02_STATIC_REVIEW.md`.

## Confirmed static observations (preserved as evidence, not deployed changes)

- All 29 original assignment-policy identity/command/mode/role tuples matched both captured catalog snapshots.
- M2 enumerates both recognized check-in restrictive ownership guards.
- Basic metadata validation and missing/extra guard rejection passed static modeling.
- Separate USING/WITH CHECK handling passed limited exact-literal partial-clause cases.
- SQL identifier quoting and ALTER POLICY construction passed static review.
- Documentation count of two policy removals passed review 003.

## Remaining failures (must not merge or deploy)

- S01-R1: substring-based guard recognition accepts unexpected OR/AND branches and incorrect helper arguments.
- S02-R1: historical post-M2 state contains 31 assignment-referencing policies; M1 rejects it.
- S02-R2: catalog deparsing may remove public schema qualification and break exact-string recognition.
- S02-R3: optional guard and original predicates are not fully validated; unsafe extra branches can be accepted.
- S02-R4: full preflight is not completed before ALTER planning; temp table reapply boundary is unspecified.

## Release controls

This branch deliberately contains **no corrective SQL migration**. The failing candidate migrations remain only in draft PR #4 on `fix/hcn-p0-clinical-revocation-20261101`.

Do not merge this checkpoint as evidence of P0 closure. No migration execution or authenticated clinical-access acceptance has occurred.

## Next engineering contract

Replace substring-driven policy rewriting with per-policy reviewed canonical predicates or PostgreSQL-normalized structural comparison. Include 29 initial identities plus both validated conditional post-M2 identities (30 fresh / 31 historical). Preflight all clauses and guard definitions before mutation. Reject any unsupported expression or metadata. After static PASS on S01 and S02, execute isolated migration and authenticated revoked-caregiver regression.
