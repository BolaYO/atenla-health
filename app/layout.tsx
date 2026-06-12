import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Atenla Health - Hospital & Clinic Operations for Nigerian Healthcare Facilities',
  description: 'Inventory, billing, patient records, and staff in one platform built for how Nigerian hospitals, clinics, and diagnostic centers actually operate.',
  keywords: ['hospital management Nigeria', 'clinic software', 'diagnostic center software', 'patient billing Nigeria', 'hospital inventory', 'EMR Nigeria', 'Lagos hospital software'],
  authors: [{ name: 'Itan Household Essentials Ltd', url: 'https://www.health.atenla.ng' }],
  creator: 'Itan Household Essentials Ltd',
  publisher: 'Atenla',
  metadataBase: new URL('https://www.health.atenla.ng'),
  openGraph: {
    type: 'website',
    url: 'https://www.health.atenla.ng',
    title: 'Atenla Health - Hospital & Clinic Operations Platform',
    description: 'Inventory, billing, patient records, and staff in one platform built for how Nigerian hospitals, clinics, and diagnostic centers actually operate.',
    siteName: 'Atenla Health',
    locale: 'en_NG',
  },
  twitter: {
    card: 'summary',
    title: 'Atenla Health - Hospital & Clinic Operations Platform',
    description: 'Inventory, billing, patient records, and staff for Nigerian healthcare facilities.',
  },
  icons: {
    icon: { url: '/favicon.svg', type: 'image/svg+xml' },
  },
}

export const viewport: Viewport = {
  themeColor: '#0EA5E9',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}