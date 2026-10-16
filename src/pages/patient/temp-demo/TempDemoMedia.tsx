// REPAIR 008 / REPAIR A — Temporary (72-hour demo) account's Media view.
// Same guarantee as TempDemoMedications.tsx: no '@/lib/supabase' import,
// no network call anywhere in this file. Deliberately renders an icon
// placeholder instead of any real or bundled image file for each item —
// a photo-shaped placeholder could be mistaken for genuine uploaded
// content; an icon + fictional caption cannot.
import { Image, Video, Mic, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { DEMO_MEDIA, DEMO_DISABLED_MESSAGE, type DemoMediaItem } from '@/lib/tempDemoData';
import { TempDemoBanner } from './TempDemoBanner';

const TYPE_ICON: Record<DemoMediaItem['fileType'], React.ElementType> = {
  photo: Image, video: Video, audio: Mic,
};

export default function TempDemoMedia() {
  const blocked = () => toast.message(DEMO_DISABLED_MESSAGE);

  return (
    <div className="space-y-5 max-w-3xl">
      <TempDemoBanner featureLabel="Media" />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">Videos &amp; Media</h2>
          <p className="text-sm text-medium-gray mt-0.5">{DEMO_MEDIA.length} sample items (fictional)</p>
        </div>
        <button onClick={blocked}
          className="flex items-center gap-2 px-4 py-2 bg-soft-taupe/40 text-medium-gray rounded-xl font-medium text-sm cursor-not-allowed">
          <Upload className="w-4 h-4" /> Upload
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEMO_MEDIA.map(item => {
          const TypeIcon = TYPE_ICON[item.fileType];
          return (
            <Card key={item.id} className="p-4 border-0 shadow-sm flex items-start gap-3">
              <div className="w-14 h-14 rounded-xl bg-calm-blue/20 flex items-center justify-center flex-shrink-0">
                <TypeIcon className="w-6 h-6 text-calm-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-charcoal text-sm">{item.caption}</p>
                <p className="text-xs text-medium-gray mt-0.5">Shared by {item.uploadedBy}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
