// FUNCTIONAL-REPAIR-004 / REPAIR 3: type-level regression check for the
// `Relationships`-field structural fix in src/types/supabase.ts.
//
// This is a Vitest TYPECHECK file (`*.test-d.ts`), not a runtime test — it
// is never executed (`npm run test:unit`'s `include: ['tests/unit/**/*.test.ts']`
// does not match this filename), only type-checked, via `npx vitest typecheck`
// (uses the already-installed `expect-type`/`vitest` toolchain — no new
// dependency). Before the fix, @supabase/supabase-js's internal
// `GenericSchema` constraint was never satisfied because no Tables/Views
// entry declared `Relationships`, which made `SupabaseClient`'s `Schema`
// generic resolve to `never` — and every `supabase.rpc(fn, args)` call's
// `args` parameter resolved to `undefined` regardless of what the
// `Functions` map declared, regardless of `fn`. If that regresses (e.g. a
// newly added Tables/Views entry omits `Relationships`), the assertions
// below stop type-checking and `npx vitest typecheck` fails.
import { expectTypeOf, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

declare const supabase: ReturnType<typeof createClient<Database>>;

// Wrapped in a trivial `it` purely so Vitest's combined `--typecheck` run
// doesn't report "no test suite found" for this file — the body itself
// still only matters to the TYPE checker; nothing here executes anything
// meaningful at runtime.
it('type-level: Database Relationships + rpc() argument resolution', () => {
  // 1. A Tables Row actually resolves to its real shape (not `never`/`any`)
  // — this is only true if `Database['public']` satisfies `GenericSchema`.
  expectTypeOf<Database['public']['Tables']['profiles']['Row']>().not.toBeNever();
  expectTypeOf<Database['public']['Tables']['profiles']['Row']['email']>().toEqualTypeOf<string>();

  // 2. Every Tables/Views entry declares `Relationships` (the exact field
  // that was missing). TypeScript enforces this structurally — if any
  // entry in the big Database literal dropped it, `GenericSchema`
  // conformance breaks and (2)/(3)/(4) below stop compiling; this line
  // only documents the shape explicitly, exercised already by
  // SupabaseClient's own generic.
  expectTypeOf<Database['public']['Tables']['profiles']['Relationships']>().toEqualTypeOf<never[]>();

  // 3. supabase.rpc()'s second argument resolves to the REAL declared shape
  // for each Functions entry — the exact thing that was broken (every call
  // used to type-check `args` as `undefined` regardless of the function).
  expectTypeOf(supabase.rpc)
    .parameter(1)
    .exclude<undefined>()
    .not.toBeNever();

  // 4. A couple of the actual RPCs this project's app code calls, with
  // their real argument shapes — these lines simply must compile.
  void supabase.rpc('admin_set_role', { p_user_id: 'x', p_role: 'patient' });
  void supabase.rpc('create_patient_with_caregiver', { p_patient_id: 'x' });
  void supabase.rpc('redeem_promo_code', { p_code: 'X' });
  void supabase.from('profiles').select('id, email, role');
});
