import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const patientId = formData.get('patientId') as string;
    
    if (!file || !patientId) {
      return NextResponse.json({ error: 'Missing file or patientId' }, { status: 400 });
    }

    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const path = `videos/${patientId}/${safeName}`;

    const { data, error } = await supabase.storage
      .from('music-files')
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    // Get signed URL for the uploaded file
    const { data: signedUrl } = await supabase.storage
      .from('music-files')
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

    return NextResponse.json({ success: true, path, signedUrl: signedUrl?.signedUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}