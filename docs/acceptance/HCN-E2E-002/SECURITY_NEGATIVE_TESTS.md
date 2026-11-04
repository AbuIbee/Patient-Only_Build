# Security results — BLOCKED, no denial PASS claimed
Run HCN-E2E-002; observed 2026-11-04 19:11–19:13 UTC. Production SHA 6621b4b755b8d682135cf075ab60712803e8762f. No authenticated test identities; organization/patient IDs unavailable.

No actual role JWTs available. No service-role query was counted as a customer denial test. No requests were made against unrelated customer records.

| Required denial | Status | Missing prerequisite |
|---|---|---|
| Invited workspace/patient access; stale revoked/declined invite | BLOCKED | Controlled invitations and activated test accounts |
| Caregiver staff creation / role tampering / unlicensed office | BLOCKED | Caregiver JWT and isolated licensed test organization |
| Wrong-tenant staff creation, census, reads/writes | BLOCKED | Two controlled test tenants and distinct Directors |
| Four caregivers each allowed 3 and denied 9 patients | BLOCKED | 12 protected UI enrollments and exact assignments |
| Patient self-only / P01 denied P02 | BLOCKED | Separate activated patient JWTs |
| Unassign C02/P04, stale-session denial, restore | BLOCKED | Valid test assignment and Director session |
| Revoked member / expired license with stale assignment | BLOCKED | Disposable isolated test environment |
| Unassigned clinician read/send/notification denial | BLOCKED | Approved synthetic credential mechanism and specialty accounts |
| HTML sanitization, notification privacy, author consistency | BLOCKED | Synthetic threads and authenticated sessions |

HTTP statuses, correlation IDs, exact denied policies: unavailable because these requests were not executed. RLS enabled metadata alone provides no authorization guarantee.
