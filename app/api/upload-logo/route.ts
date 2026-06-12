import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

export async function POST(req: NextRequest) {
  try {
    const { dataUrl, facilityId } = await req.json()
    if (!dataUrl || !facilityId) {
      return NextResponse.json({ error: 'Missing dataUrl or facilityId' }, { status: 400 })
    }

    cloudinary.config({
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })

    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: `atenla-health/${facilityId}/branding`,
      public_id: 'logo',
      overwrite: true,
    })

    return NextResponse.json({ success: true, url: result.secure_url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Upload failed' }, { status: 500 })
  }
}