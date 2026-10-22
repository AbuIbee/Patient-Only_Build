// P1 CORRECTIVE ORDER / MASTER ENTERPRISE IDENTITY DIRECTIVE — top of
// the /Professional tree. Authentication (identity) is decided here and
// ONLY here; authorization (which office, if any) is decided entirely
// inside ProfessionalOfficeResolver, which independently re-derives it
// from real backend data every time — never from this component, and
// never from the URL. /Professional/Register is the one exception: it
// has its own internal auth-aware steps (account creation, then the
// application form) and is reachable whether or not the visitor is
// already signed in.
import { useApp } from '@/store/useApp';
import ProfessionalLoginPage from './ProfessionalLoginPage';
import ProfessionalOfficeResolver from './ProfessionalOfficeResolver';
import ProfessionalRegisterPage from './ProfessionalRegisterPage';
import PlatformOwnerAdminPage from './PlatformOwnerAdminPage';

export default function ProfessionalEntryRouter() {
  const { state } = useApp();
  const path = window.location.pathname;
  const isRegisterRoute = /^\/Professional\/Register(\/|$)/i.test(path);
  const isOwnerRoute = /^\/Professional\/Owner(\/|$)/i.test(path);

  if (isRegisterRoute) {
    return <ProfessionalRegisterPage />;
  }
  if (!state.isAuthenticated) {
    return <ProfessionalLoginPage />;
  }
  if (isOwnerRoute) {
    return <PlatformOwnerAdminPage />;
  }
  return <ProfessionalOfficeResolver />;
}
