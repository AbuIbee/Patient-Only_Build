// P1 CORRECTIVE ORDER — top of the /Professional tree. Authentication
// (identity) is decided here and ONLY here; authorization (which office,
// if any) is decided entirely inside ProfessionalOfficeResolver, which
// independently re-derives it from real backend data every time — never
// from this component, and never from the URL.
import { useApp } from '@/store/useApp';
import ProfessionalLoginPage from './ProfessionalLoginPage';
import ProfessionalOfficeResolver from './ProfessionalOfficeResolver';

export default function ProfessionalEntryRouter() {
  const { state } = useApp();
  if (!state.isAuthenticated) {
    return <ProfessionalLoginPage />;
  }
  return <ProfessionalOfficeResolver />;
}
