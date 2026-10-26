import { AppProvider } from '@/store/AppContext';
import { useApp } from '@/store/useApp';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import ResetPasswordPage from '@/pages/common/ResetPasswordPage';
import ActivatePatientPage from '@/pages/common/ActivatePatientPage';
import PublicPatientIntakePage from '@/pages/common/PublicPatientIntakePage';
import AboutUsPage from '@/pages/common/AboutUsPage';
import BusinessLandingPage from '@/pages/common/BusinessLandingPage';
import ProfessionalLandingPage from '@/pages/professional/ProfessionalLandingPage';
import PrivacyPage from '@/pages/privacy/PrivacyPage';
import { Toaster } from '@/components/ui/sonner';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import { cancelAllReminderNotifications } from '@/lib/reminderScheduler';
import { selfHealMissingProfile } from '@/services/profileService';
import type { UserRole } from '@/types';

// CRITICAL OWNER-REPORTED REMEDIATION Correction H: these three are the
// entire authenticated app — every patient view, the full admin panel,
// and every Enterprise dashboard — previously imported eagerly at the
// top of this file, so EVERY visitor (including an unauthenticated one
// on the public /patient-intake form) paid the cost of downloading and
// parsing all of it before the page they actually requested could
// become interactive. Lazy-loading means an unauthenticated visitor's
// bundle now only includes the small public pages above; the
// authenticated trees load on demand, exactly when state.isAuthenticated
// actually requires one of them.
const PatientLayout = lazy(() => import('@/pages/patient/PatientLayout'));
const EnterprisePatientRouter = lazy(() => import('@/pages/patient/EnterprisePatientRouter'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const EnterpriseDashboardRouter = lazy(() => import('@/pages/enterprise/EnterpriseDashboardRouter'));
const ProfessionalEntryRouter = lazy(() => import('@/pages/professional/ProfessionalEntryRouter'));
import './App.css';

const PROFILE_COLUMNS =
  'id, email, first_name, last_name, role, phone, created_at, updated_at, must_change_password, mfa_enabled';

function AppContent() {
  const { state, dispatch } = useApp();
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [forcedChange, setForcedChange] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 4: when self-heal fails,
  // the session is BLOCKED here — never let through on
  // buildAuthFallbackProfile(), which is a real auth.uid() with no
  // matching profiles row and would let the user reach FK-dependent
  // writes (patient_intake, etc.) that the database would then reject
  // anyway, after the UI had already implied things were fine.
  const [profileSetupBlocked, setProfileSetupBlocked] = useState(false);
  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 3: a recovery link
  // ALWAYS swaps the browser's Supabase session to the link's own
  // target user the moment the hash is consumed — that happens before
  // this app ever sees the PASSWORD_RECOVERY event, so it cannot be
  // prevented outright. What this CAN do is detect that the session just
  // changed to a DIFFERENT identity than whoever was previously signed
  // in, and require an explicit, deliberate confirmation before showing
  // the password-setup screen — "deliberate account switching," never a
  // silent swap the caregiver might not notice.
  const [pendingIdentitySwitch, setPendingIdentitySwitch] = useState<{ previousUserId: string; recoveryEmail: string } | null>(null);
  // MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 2: the trusted,
  // server-computed Temporary-program signal for THIS session's routing
  // decision below — never derived from an email pattern. Populated by
  // the same subscription read restoreSession() already performs; null
  // until that resolves, which fails closed (routes like any ordinary
  // account) rather than optimistically treating an unconfirmed session
  // as Temporary.
  const [isTrustedTempUserProgram, setIsTrustedTempUserProgram] = useState(false);

  // Supabase can emit SIGNED_OUT while its client is initializing. The first
  // getSession() call is the source of truth during startup; genuine SIGNED_OUT
  // events are honored only after that initial check completes.
  const initialCheckDoneRef = useRef(false);

  // The onAuthStateChange callback below is registered once (effect deps:
  // [dispatch]) and so closes over `state` as it was at that first render —
  // reading state.currentUser directly inside it would always see the
  // stale, pre-login value. A ref kept in sync on every render gives the
  // callback the live id instead.
  const currentUserIdRef = useRef<string | undefined>(undefined);
  currentUserIdRef.current = state.currentUser?.id;

  const currentPath = useMemo(() => window.location.pathname, []);
  // MyMemoriaProfessional_homepage patch — an Enterprise-only deployment
  // (its own Vercel project/Preview environment, its own VITE_ENTERPRISE_SITE
  // env var, consistent with this repo's existing per-branch/per-deployment
  // VITE_SUPABASE_URL override pattern — see FIVE_OFFICE_GIT_AND_PREVIEW_REPORT.md)
  // shows a dedicated Enterprise marketing homepage at "/" instead of the
  // residential LandingPage. Unset/false (every other deployment, including
  // the real consumer PatientOnlyBuild production site) leaves "/" completely
  // unchanged — this flag defaults to false and is additive only.
  const isEnterpriseLandingRoute = import.meta.env.VITE_ENTERPRISE_SITE === 'true' && currentPath === '/';
  const isPublicPatientIntakeRoute = currentPath === '/patient-intake';
  const isPrivacyRoute = currentPath === '/privacy';
  const isAboutUsRoute = currentPath === '/about-us';
  // OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase C item 1: a separate
  // commercial landing route — same public-route pattern as the other
  // unauthenticated marketing pages above.
  //
  // APPROVED ENTERPRISE UI DIRECTIVE §5 — "direct navigation, browser
  // refresh... handled safely": a prefix match, not exact equality, so a
  // fresh (non-SPA) load of a deep link like /business/patients/<id>
  // (EnterpriseCaregiverDashboard's own URL-synced sub-routes) is still
  // recognized as the business route even when unauthenticated, landing
  // on BusinessLandingPage/LoginPage rather than the residential one.
  const isBusinessRoute = currentPath === '/business' || currentPath.startsWith('/business/');
  // P1 CORRECTIVE ORDER — "the owner has selected one centralized
  // authentication entrance: /Professional." Supersedes the prior
  // round's provisional per-office top-level paths, which all shared
  // BusinessLandingPage as their unauthenticated pre-login experience —
  // confirmed root cause of the reported "/admin, /caregiver, /medical,
  // /therapy all show the same public caregiver registration page"
  // defect: it was not a routing bug, it was the deliberate (now
  // superseded) design decision to reuse that one marketing page as the
  // shared pre-login screen for all four. /Professional/* now has its
  // own dedicated sign-in page (ProfessionalLoginPage) and its own
  // authorization resolver (ProfessionalOfficeResolver) that independently
  // re-derives office access from real organization_memberships /
  // Enterprise-patient-coverage data — never from the URL.
  const isProfessionalRoute = /^\/Professional(\/|$)/i.test(currentPath);
  // Backward compatibility (§9: "use appropriate compatibility redirects
  // for prior office routes where safe") — the four OLD top-level paths
  // now redirect to their /Professional/<Office> equivalent instead of
  // rendering BusinessLandingPage. /Patient (singular, old top-level) is
  // deliberately EXCLUDED here: it remains its own separate, unchanged
  // entry point (EnterprisePatientRouter, reached via the ordinary
  // residential/patient sign-in) — "do not redirect existing patient
  // application users into an unrelated professional workspace."
  // /Professional/Patient is a distinct, additional entry for the same
  // underlying EnterprisePatientDashboard, reached only through the new
  // centralized professional login.
  const legacyOfficeAlias = currentPath.match(/^\/(admin|caregiver|medical|therapy)(\/|$)/i)?.[1]?.toLowerCase() ?? null;
  const isLegacyOfficeRoute = legacyOfficeAlias !== null;
  // REMEDIATION B: ALSO handled by its own, separate, earlier early
  // return below — BEFORE checkingSession's render — so it never shows
  // the ordinary loading spinner either.
  const isActivationRoute = currentPath === '/activate';
  // isActivationRoute is folded in here too: the URL-normalization and
  // browser-back-history effects below must never rewrite /activate to
  // "/" — confirmed live that they did exactly that before this fix
  // (confirmed via a real browser: the address bar collapsed to "/"
  // within the first render, which would also discard the activation
  // context on any mid-flow page refresh). The separate, earlier
  // render-time check for isActivationRoute (below, before
  // checkingSession) remains distinct — stronger than these other
  // public routes, which still pass through the ordinary
  // checkingSession/renderContent path.
  const isPublicRoute =
    isEnterpriseLandingRoute || isPublicPatientIntakeRoute || isPrivacyRoute || isAboutUsRoute || isBusinessRoute || isProfessionalRoute || isLegacyOfficeRoute || isActivationRoute;

  // Canonicalize a legacy office alias (/admin, /caregiver, /medical,
  // /therapy) to its /Professional/<Office> equivalent BEFORE paint —
  // useLayoutEffect, not useEffect, so ProfessionalOfficeResolver's own
  // mount-time URL parse (a child rendered in the same commit) reads the
  // canonical path, not the stale alias. A bookmarked old link still
  // works; the address bar now reflects where the owner wants it to.
  useLayoutEffect(() => {
    if (!legacyOfficeAlias) return;
    const officeSegment = { admin: 'Admin', caregiver: 'Caregiver', medical: 'Medical', therapy: 'Therapy' }[legacyOfficeAlias];
    if (!officeSegment) return;
    const rest = currentPath.slice(`/${legacyOfficeAlias}`.length); // preserve any nested sub-path
    window.history.replaceState({}, '', `/Professional/${officeSegment}${rest}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreUser = useCallback((profile: Pick<Database['public']['Tables']['profiles']['Row'],
    'id' | 'email' | 'first_name' | 'last_name' | 'role' | 'phone' | 'created_at' | 'updated_at' | 'mfa_enabled'>) => {
    const safeRole = (profile.role as UserRole) || 'patient';

    dispatch({
      type: 'SET_USER',
      payload: {
        id: profile.id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: safeRole,
        phone: profile.phone || undefined,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        mfaEnabled: Boolean(profile.mfa_enabled),
      },
    });

    dispatch({
      type: 'SET_ROLE',
      payload: safeRole,
    });

    dispatch({ type: 'SET_AUTHENTICATED', payload: true });
  }, [dispatch]);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) return;

        // Codex MMA-CODEX-01 — fail closed when a restored session's own
        // assurance level is insufficient for an account that has since
        // enrolled a verified MFA factor. A session established BEFORE
        // enrollment (or restored from storage after some other
        // inconsistency) could otherwise persist at AAL1 indefinitely —
        // this app's only MFA-aware check (LoginPage.tsx's SignInForm)
        // only ever runs once, at the moment of a fresh sign-in. This
        // does not make MFA mandatory for anyone (an account with no
        // enrolled factor is completely unaffected — nextLevel stays
        // 'aal1' and this check is a no-op), per the explicit
        // instruction not to enable a mandatory cohort policy without
        // owner approval.
        // Codex F-15 FIX — the assurance lookup itself can fail (a
        // transient network/API error, not "no MFA enrolled"), and an
        // error response leaves `data` null. The check above only
        // ever compared `aal`'s fields, so an error silently fell
        // through as if assurance were sufficient — exactly the "fail
        // open on a lookup error" Codex named. A lookup failure must
        // be treated the same as an insufficient level: it means this
        // app cannot currently confirm the session is trustworthy.
        const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) {
          console.warn('Could not verify this session\'s MFA assurance level — signing out rather than restoring.', aalError.message);
          await supabase.auth.signOut();
          return;
        }
        if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          console.warn('Restored session is below the required MFA assurance level for this account — signing out rather than restoring.');
          await supabase.auth.signOut();
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('id', session.user.id)
          .maybeSingle();

        // CODEX-VERIFIED CRITICAL REMEDIATION Critical 4: a missing OR
        // unreadable profile row is no longer papered over with an
        // in-memory-only fallback and let through — that fallback's id
        // is a real, valid auth.uid() with NO matching profiles row,
        // and a later FK-dependent write (patient_intake.
        // patient_profile_id, etc.) would correctly be rejected by the
        // database anyway, after the UI had already implied things were
        // fine. A genuinely missing row is self-healed (idempotent,
        // scoped to this user, sources only the same fields
        // handle_new_user() already derives) and the REAL resulting row
        // used afterward; a query that outright failed (e.g. a network
        // blip) is retried once before blocking, rather than treated the
        // same as "no row exists."
        let realProfile = profile;
        let lastProfileError = profileError;
        if (!realProfile && profileError) {
          const retry = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).maybeSingle();
          realProfile = retry.data;
          lastProfileError = retry.error;
        }
        if (!realProfile && !lastProfileError) {
          console.warn('Authenticated user has no profile row — attempting self-heal before proceeding.');
          const { profile: healed, error: healError } = await selfHealMissingProfile();
          if (healed) {
            realProfile = healed;
          } else {
            console.error('Profile self-heal failed — blocking entry rather than proceeding on a fabricated profile:', healError);
            setProfileSetupBlocked(true);
            return;
          }
        }
        if (!realProfile) {
          console.error('Profile could not be verified after retry — blocking entry rather than proceeding on a fabricated profile:', lastProfileError?.message);
          setProfileSetupBlocked(true);
          return;
        }

        if (realProfile?.must_change_password) {
          setCurrentUserEmail(realProfile.email || '');

          dispatch({
            type: 'SET_USER',
            payload: {
              id: realProfile.id,
              email: realProfile.email,
              firstName: realProfile.first_name,
              lastName: realProfile.last_name,
              role: (realProfile.role as UserRole) || 'patient',
              phone: realProfile.phone || undefined,
              createdAt: realProfile.created_at,
              updatedAt: realProfile.updated_at,
            },
          });

          setForcedChange(true);
          return;
        }

        // Retain the current subscription policy for accounts with a profile,
        // but never sign a user out because the subscription query itself failed.
        if (realProfile) {
          const isPrivileged = ['admin', 'caregiver', 'master', 'superadmin'].includes(realProfile.role);

          if (!isPrivileged) {
            // MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 1 + PHASE 2:
            // this check previously (a) treated "no subscription row yet"
            // as "must pay" — but a fresh signup that used the
            // "Confirm your email, then sign in" path (PricingPage.tsx:
            // `if (!data.session) { ...; onGoToLogin?.(); return; }`) never
            // reaches handleSelectTier()'s provision_free_subscription()
            // call before its first login, so `sub` is genuinely null on
            // that first session-restore — this was signing a brand-new,
            // legitimate free-tier user straight back out with a false
            // "payment required" message, not a hypothetical edge case.
            // SubscriptionContext.tsx's own loadSubscription() already
            // treats a missing row as "provision free_tier," never as
            // "block" — this now agrees with that, rather than duplicating
            // a second, divergent definition of "needs payment." (b)
            // included 'requires_payment'/'incomplete' in its blocked-
            // status list — neither is one of the six values the
            // subscriptions_status_check CHECK constraint
            // (013_subscriptions_atomic_lifecycle.sql) allows; dead
            // conditions removed, matching the real six-status model
            // src/types/subscription.ts and ProtectedRoute.tsx already use.
            // (c) added `program` so a Temporary/Companion account's
            // trusted eligibility (never a client-visible status/date) is
            // this session's signal for the routing decision in the render
            // function below, replacing the email-pattern check that used
            // to be the only thing available there.
            const { data: sub, error: subError } = await supabase
              .from('subscriptions')
              .select('status, tier, program, stripe_subscription_id')
              .eq('user_id', realProfile.id)
              .maybeSingle();

            const isMaster = sub?.tier === 'master';
            const blockedStatuses = ['pending_payment', 'expired', 'canceled', 'past_due'];
            const isBlockedStatus = Boolean(sub && blockedStatuses.includes(sub.status));

            if (sub?.program) {
              const { data: programActive, error: programError } = await supabase.rpc('is_my_program_active');
              if (programError) {
                console.error('Program eligibility check failed:', programError.message);
              }
              setIsTrustedTempUserProgram(sub.program === 'temp_user' && programActive === true);
            } else {
              setIsTrustedTempUserProgram(false);
            }

            // A program row is always status='active' at the DB level
            // (migration 018's CHECK) — isBlockedStatus is already false
            // for it — so a program account never needs the payment
            // redirect below regardless of its trusted eligibility (losing
            // eligibility means losing the program, never "needs payment,"
            // exactly as needsPayment() in src/types/subscription.ts
            // already defines for every other gate in this app).
            // CODEX-VERIFIED CRITICAL REMEDIATION Critical 5: a stale
            // personal subscription (e.g. 'expired' or 'canceled' from
            // before this patient joined an Enterprise organization)
            // must never sign out and payment-wall a patient who is
            // ACTIVELY covered by that organization's license — coverage
            // is checked via the same authoritative
            // is_my_enterprise_coverage_active() SubscriptionContext and
            // every database policy already use, never a second,
            // divergent definition.
            let isEnterpriseCovered = false;
            if (!isMaster && isBlockedStatus) {
              const { data: covered, error: coverageError } = await supabase.rpc('is_my_enterprise_coverage_active');
              if (coverageError) {
                console.error('Enterprise coverage check failed:', coverageError.message);
              }
              isEnterpriseCovered = covered === true;
            }

            const needsPayment = !subError && Boolean(sub) && isBlockedStatus && !isEnterpriseCovered;

            if (!isMaster && needsPayment) {
              await supabase.auth.signOut();

              let errorMessage = 'Please complete payment to access your account.';
              if (sub?.status === 'expired') {
                errorMessage = 'Your subscription has expired. Please renew to continue.';
              } else if (sub?.status === 'pending_payment') {
                errorMessage =
                  'Payment pending. Please complete checkout to access your account.';
              }

              sessionStorage.setItem('paymentRequiredMessage', errorMessage);
              window.location.href = '/pricing';
              return;
            }

            if (subError) {
              console.error('Subscription restore query failed:', subError.message);
            }
          }
        }

        restoreUser(realProfile);
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        initialCheckDoneRef.current = true;
        setCheckingSession(false);
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, recoverySession) => {
      if (event === 'SIGNED_OUT') {
        if (!initialCheckDoneRef.current) return;

        // F16/C02-005: clear this patient's scheduled reminder
        // notifications on sign-out so a shared/reused device doesn't keep
        // firing a prior patient's medication/reminder notifications after
        // they've logged out (no-ops outside a native build). Logged, not
        // silently ignored, if clearance cannot be confirmed.
        const signedOutUserId = currentUserIdRef.current;
        if (signedOutUserId) {
          void cancelAllReminderNotifications(signedOutUserId).then(result => {
            if (result.status !== 'SCHEDULED' && result.status !== 'UNSUPPORTED') {
              console.error('Could not confirm reminder notifications were cleared on sign-out:', result);
            }
          });
        }

        dispatch({ type: 'LOGOUT' });
        setShowPasswordReset(false);
        setForcedChange(false);
      }

      if (event === 'PASSWORD_RECOVERY') {
        const previousUserId = currentUserIdRef.current;
        const recoveryUserId = recoverySession?.user?.id;
        if (previousUserId && recoveryUserId && previousUserId !== recoveryUserId) {
          // A DIFFERENT identity's recovery link while someone is
          // already signed in — never swap silently. Show the explicit
          // confirmation interstitial instead of the password form.
          setPendingIdentitySwitch({ previousUserId, recoveryEmail: recoverySession?.user?.email || 'this account' });
          setCheckingSession(false);
          return;
        }
        setShowPasswordReset(true);
        setForcedChange(false);
        setCheckingSession(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [dispatch, restoreUser]);

  useEffect(() => {
    if (isPublicRoute) return;

    if (state.isAuthenticated && state.selectedRole) {
      const allowedRoles = ['patient', 'admin', 'superadmin', 'caregiver'];
      const roleForRoute = allowedRoles.includes(state.selectedRole)
        ? state.selectedRole
        : 'patient';
      const targetPath = `/${roleForRoute}`;

      // replaceState prevents building an auth-history stack that can send the
      // browser Back button to a stale pre-login route.
      if (window.location.pathname !== targetPath || window.history.state?.role !== roleForRoute) {
        window.history.replaceState({ role: roleForRoute }, '', targetPath);
      }
    } else if (!state.isAuthenticated) {
      window.history.replaceState({}, '', '/');
    }
  }, [state.isAuthenticated, state.selectedRole, isPublicRoute]);

  useEffect(() => {
    if (isPublicRoute) return;

    const handlePop = () => {
      // Browser Back must never destroy the Supabase session. If it reaches a
      // stale pre-login history entry while the user is still authenticated,
      // normalize the URL back to the authenticated route.
      if (!window.history.state?.role && state.isAuthenticated && state.selectedRole) {
        const allowedRoles = ['patient', 'admin', 'superadmin', 'caregiver'];
        const roleForRoute = allowedRoles.includes(state.selectedRole)
          ? state.selectedRole
          : 'patient';

        window.history.replaceState({ role: roleForRoute }, '', `/${roleForRoute}`);
      }
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [isPublicRoute, state.isAuthenticated, state.selectedRole]);

  const handlePasswordSet = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setShowPasswordReset(false);
      setForcedChange(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile reload after password change failed:', profileError.message);
    }

    // The forced gate is only cleared once the DB confirms
    // must_change_password is actually false. If the write that was supposed
    // to clear it (ResetPasswordPage) failed or hasn't landed yet, re-show the
    // forced screen instead of letting the user into the app with a stale
    // local "forcedChange = false" state. F01 remediation: this gate must not
    // be bypassable by a failed/raced backend write.
    if (profile?.must_change_password) {
      setCurrentUserEmail(profile.email || '');
      setForcedChange(true);
      setShowPasswordReset(false);
      return;
    }

    let realProfile = profile;
    if (!realProfile && !profileError) {
      const { profile: healed, error: healError } = await selfHealMissingProfile();
      if (healed) {
        realProfile = healed;
      } else {
        console.error('Profile self-heal failed after password setup — blocking entry rather than proceeding on a fabricated profile:', healError);
        setShowPasswordReset(false);
        setForcedChange(false);
        setProfileSetupBlocked(true);
        return;
      }
    }
    if (!realProfile) {
      console.error('Profile could not be verified after password setup — blocking entry rather than proceeding on a fabricated profile:', profileError?.message);
      setShowPasswordReset(false);
      setForcedChange(false);
      setProfileSetupBlocked(true);
      return;
    }

    setShowPasswordReset(false);
    setForcedChange(false);
    restoreUser(realProfile);
  };

  useEffect(() => {
    if (!state.isAuthenticated || isPublicRoute) return;

    const TIMEOUT = 10 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut();
        dispatch({ type: 'LOGOUT' });
      }, TIMEOUT);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];

    events.forEach((eventName) =>
      window.addEventListener(eventName, resetTimeout, { passive: true })
    );

    resetTimeout();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((eventName) =>
        window.removeEventListener(eventName, resetTimeout)
      );
    };
  }, [state.isAuthenticated, dispatch, isPublicRoute]);

  // REMEDIATION B: checked before everything else, including
  // checkingSession's own spinner — this route never participates in
  // the shared client's session-restore UI at all. The shared client
  // already has detectSessionInUrl disabled for this exact path
  // (src/lib/supabase.ts), so whatever restoreSession() above found (or
  // didn't) is unaffected by and unrelated to this page.
  if (isActivationRoute) {
    // ACT-03: this early return bypasses every other <Toaster> mount
    // further down this component — on /activate, ResetPasswordPage's
    // toast.error() calls (e.g. "Failed to set password: ...") had no
    // notification provider to render into and were silently
    // invisible. Mounted here explicitly so activation errors are
    // never swallowed.
    return (
      <>
        <ActivatePatientPage />
        <Toaster position="top-center" />
      </>
    );
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-charcoal font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 4: shown instead of any
  // authenticated view whenever the profile row could not be verified or
  // repaired — the user is signed in (a real Auth session exists) but
  // deliberately not routed anywhere, since every patient-scoped write
  // in this app depends on a real profiles row existing.
  if (profileSetupBlocked) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-soft-taupe rounded-2xl shadow-card p-8 text-center space-y-4">
          <h2 className="text-xl font-bold text-charcoal">We couldn&apos;t finish setting up your account</h2>
          <p className="text-medium-gray text-sm">
            Your sign-in was verified, but your account profile could not be loaded or repaired automatically.
            Please try signing out and back in — if this continues, contact support.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); setProfileSetupBlocked(false); dispatch({ type: 'LOGOUT' }); }}
            className="w-full rounded-xl bg-warm-bronze text-white font-semibold px-4 py-3 hover:bg-deep-bronze transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 3: deliberate account
  // switching — the browser's session already changed to the recovery
  // link's target identity; this screen makes that change EXPLICIT and
  // reversible-by-choice rather than silent.
  if (pendingIdentitySwitch) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-soft-taupe rounded-2xl shadow-card p-8 text-center space-y-4">
          <h2 className="text-xl font-bold text-charcoal">This activation link is for a different account</h2>
          <p className="text-medium-gray text-sm">
            You are currently signed in as a different user. Continuing will switch this browser to
            <strong> {pendingIdentitySwitch.recoveryEmail}</strong> to finish setting up that account's password.
            Your own session here cannot be restored afterward — sign back in separately once you&apos;re done.
          </p>
          <div className="flex gap-3">
            <button
              onClick={async () => { await supabase.auth.signOut(); setPendingIdentitySwitch(null); dispatch({ type: 'LOGOUT' }); }}
              className="flex-1 rounded-xl border border-soft-taupe text-charcoal font-semibold px-4 py-3 hover:bg-soft-taupe/20 transition-colors"
            >
              Cancel &amp; Sign Out
            </button>
            <button
              onClick={() => { setPendingIdentitySwitch(null); setShowPasswordReset(true); setForcedChange(false); }}
              className="flex-1 rounded-xl bg-warm-bronze text-white font-semibold px-4 py-3 hover:bg-deep-bronze transition-colors"
            >
              Continue to Activate
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (forcedChange) {
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage
          forced={true}
          userEmail={currentUserEmail}
          onComplete={handlePasswordSet}
        />
        <Toaster position="top-center" />
      </div>
    );
  }

  if (showPasswordReset) {
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage
          forced={false}
          userEmail={currentUserEmail}
          onComplete={handlePasswordSet}
        />
        <Toaster position="top-center" />
      </div>
    );
  }

  const renderContent = () => {
    if (isEnterpriseLandingRoute) {
      return <ProfessionalLandingPage />;
    }

    if (isPrivacyRoute) {
      return <PrivacyPage />;
    }

    if (isAboutUsRoute) {
      return <AboutUsPage />;
    }

    if (isPublicPatientIntakeRoute) {
      return <PublicPatientIntakePage />;
    }

    // P1 CORRECTIVE ORDER — the one centralized professional entrance.
    // ProfessionalEntryRouter self-gates on auth state (its own dedicated
    // sign-in page when unauthenticated, ProfessionalOfficeResolver once
    // signed in) — nothing here decides office access. Legacy office
    // aliases (/admin, /caregiver, /medical, /therapy) are canonicalized
    // to /Professional/<Office> by the useLayoutEffect above BEFORE this
    // renders, so by the time this check runs the address bar already
    // reads /Professional/... for both entry forms.
    if (isProfessionalRoute || isLegacyOfficeRoute) {
      return <ProfessionalEntryRouter />;
    }

    // Phase C item 5: an already-signed-in caregiver landing on /business
    // routes straight to /caregiver — every other visitor (unauthenticated,
    // or signed in as a different role) sees the marketing page itself,
    // UNLESS they've clicked into the sign-in/sign-up flow from it (same
    // state.currentView === 'login' signal the ordinary unauthenticated
    // branch below already uses) — otherwise BusinessLandingPage's own
    // "Caregiver Sign In" button would have nowhere to actually route to.
    // Unchanged by the P1 Corrective Order — /business keeps its own
    // established residential/no-org fallback behavior exactly as before
    // ("provided this does not break working residential or
    // organizational flows" — redirecting it was judged not safe to do
    // this round; see the delivery report).
    if (isBusinessRoute) {
      if (state.isAuthenticated && state.selectedRole === 'caregiver') {
        // P1 OWNER-VISIBLE DASHBOARD DELIVERY — businessWorkspace=true
        // tells the router this is the explicit Business entry point,
        // so a caregiver with no Enterprise organization still sees the
        // approved Enterprise shell (its own honest no-organization
        // state), never the residential CaregiverPortal. The generic
        // authenticated-switch render of this same component further
        // below (reached from any other route) omits the prop, so
        // ordinary residential caregivers elsewhere are unaffected.
        return <EnterpriseDashboardRouter businessWorkspace />;
      }
      if (!state.isAuthenticated && state.currentView === 'login') {
        return <LoginPage />;
      }
      if (!state.isAuthenticated) {
        return <BusinessLandingPage />;
      }
    }

    if (!state.isAuthenticated) {
      return state.currentView === 'login' ? <LoginPage /> : <LandingPage />;
    }

    // MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 2: no longer an
    // email-pattern check. `isTrustedTempUserProgram` is set by
    // restoreSession() above from the same trusted `subscriptions.program`
    // + is_my_program_active() signal SubscriptionContext/PatientLayout use
    // everywhere else — this call site only ever RESTRICTS (forces a
    // confirmed Temporary account into PatientLayout instead of
    // AdminLayout if selectedRole were somehow 'admin'; every other role
    // already falls into the switch's own PatientLayout default below) and
    // can never grant, renew, or remove the actual entitlement, which
    // PatientLayout re-derives independently from SubscriptionContext once
    // mounted regardless of how it was routed here.
    if (isTrustedTempUserProgram) {
      return <PatientLayout />;
    }

    switch (state.selectedRole) {
      case 'patient':
        // FIVE-OFFICE ENTERPRISE PLATFORM — EnterprisePatientRouter checks
        // the patient's real Enterprise coverage before deciding which
        // dashboard renders (never from the URL). An ordinary individual
        // patient — the default outcome, and every existing user today —
        // still renders PatientLayout, unchanged.
        return <EnterprisePatientRouter />;
      case 'admin':
        return <AdminLayout />;
      case 'caregiver':
        return <EnterpriseDashboardRouter />;
      default:
        return <PatientLayout />;
    }
  };

  return (
    <div className="min-h-screen bg-warm-ivory">
      <Suspense fallback={
        <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        {renderContent()}
      </Suspense>
      <Toaster position="top-center" />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
