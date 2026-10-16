// REPAIR 008 / REPAIR A — Temporary (72-hour demo) account's Documents
// view. Same guarantee as the other two Temp-demo views: no
// '@/lib/supabase' import, no network call anywhere in this file.
import { FileText, Receipt, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { DEMO_DOCUMENTS, DEMO_DISABLED_MESSAGE } from '@/lib/tempDemoData';
import { TempDemoBanner } from './TempDemoBanner';

export default function TempDemoDocuments() {
  const blocked = () => toast.message(DEMO_DISABLED_MESSAGE);

  const docs = DEMO_DOCUMENTS.filter(d => d.section === 'medical_docs');
  const bills = DEMO_DOCUMENTS.filter(d => d.section === 'medical_bills');

  const Section = ({ title, icon: Icon, items }: { title: string; icon: React.ElementType; items: typeof DEMO_DOCUMENTS }) => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-warm-bronze" />
        <h3 className="text-sm font-bold text-charcoal uppercase tracking-wide">{title}</h3>
        <span className="text-xs bg-warm-bronze/15 text-warm-bronze px-2 py-0.5 rounded-full font-semibold">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map(doc => (
          <Card key={doc.id} className="p-4 border-0 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warm-bronze/15 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-warm-bronze" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-charcoal text-sm">{doc.title}</p>
              <p className="text-xs text-medium-gray">{doc.note}</p>
              <p className="text-xs text-medium-gray mt-0.5">{doc.uploadedAt}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <TempDemoBanner featureLabel="Documents" />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">Documents</h2>
          <p className="text-sm text-medium-gray mt-0.5">{DEMO_DOCUMENTS.length} sample documents (fictional)</p>
        </div>
        <button onClick={blocked}
          className="flex items-center gap-2 px-4 py-2 bg-soft-taupe/40 text-medium-gray rounded-xl font-medium text-sm cursor-not-allowed">
          <Upload className="w-4 h-4" /> Upload
        </button>
      </div>

      <Section title="Medical Documents" icon={FileText} items={docs} />
      <Section title="Medical Bills" icon={Receipt} items={bills} />
    </div>
  );
}
