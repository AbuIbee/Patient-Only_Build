// FIVE-OFFICE ENTERPRISE PLATFORM — Office E resolver. Mirrors
// EnterpriseDashboardRouter.tsx's own pattern exactly: read the real,
// server-verified entitlement first, then decide which dashboard
// renders — never the other way around, and never based on the URL
// path. "Do not make the route itself grant patient access" (owner
// directive §7).
//
// is_my_enterprise_coverage_active() is the SAME SECURITY DEFINER RPC
// SubscriptionContext.tsx already calls for isEnterpriseCovered/the
// "Full Support — provided by your organization" plan label — calling
// it again here independently (rather than trying to read it out of
// SubscriptionContext, which only exists INSIDE PatientLayout's own
// component tree, not above it) guarantees this resolver can never
// disagree with what PatientLayout itself would show if it rendered.
//
// An ordinary individual patient (the overwhelming majority of existing
// users — this feature is brand new) gets `covered === false` and
// renders PatientLayout completely unchanged, byte-for-byte identical
// to before this file existed.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import PatientLayout from './PatientLayout';
import EnterprisePatientDashboard from './EnterprisePatientDashboard';

export default function EnterprisePatientRouter() {
  const [checking, setChecking] = useState(true);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('is_my_enterprise_coverage_active').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('[EnterprisePatientRouter] coverage check failed, defaulting to the standard patient experience:', error.message);
        setCovered(false); // fail closed into the existing, proven-safe experience
      } else {
        setCovered(data === true);
      }
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-warm-ivory"><Loader2 className="w-8 h-8 animate-spin text-warm-bronze" /></div>;
  }

  return covered ? <EnterprisePatientDashboard /> : <PatientLayout />;
}
