# Production identity and migration baseline
Run HCN-E2E-002; observed 2026-11-04 19:11–19:13 UTC. Production SHA 6621b4b755b8d682135cf075ab60712803e8762f. No authenticated test identities; organization/patient IDs unavailable.

Canonical URL https://www.haneencarenetwork.com/Professional returned HTTP 200. Browser rendered public Sign In then /Professional/Register with first name, last name, email, password, Continue. No form submitted.
Vercel project prj_XmF8EOpV0PbA171Cmm9khJOSC8Zo; canonical www alias resolves to dpl_8BCMZqDkLmukn4WajTeYDC1udnHj; READY production SHA above, branch fix/hcn-onboarding-activation-20261029. Live main script /assets/index-xPEGYREh.js references https://zgkghauitpyzzljbtrxk.supabase.co. Supabase project ACTIVE_HEALTHY.

Migration ledger count 185, latest version 20261104160225 hcn_patient_access_active_assignment_gate. Ledger fingerprint MD5(version:name joined with newline in version order)=3dd750fa64c1c9b230d8ebefc42fb648. This is a ledger fingerprint, NOT a migration SQL content hash or schema-parity assertion. Full schema/source parity not performed.
Test branch head at read 2dd20f4a8209a14e33ba59342dbda4e62d9c98f9; canonical specification blob 06405a97d28c1e4e9eeb8cdc4c3871a35988fbd7. No deploy or production SQL patch proposed. Safe next work: supply execution prerequisites, then resume Phase 0.3 before writes. Product decisions for role/cap gaps remain separate.

Unverified: CORS under authenticated calls, SMTP quota, signer gate, actual provider invoices/charges, runtime auth/RLS, mobile 320/375/390/768/1024/desktop, slow network and idempotent resumption. None marked PASS.
