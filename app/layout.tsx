import type { Metadata, Viewport } from 'next';
import { appearanceScript } from '@/components/Appearance';
import BloomBurst from '@/components/BloomBurst';
import './globals.css';

export const metadata: Metadata = {
  title: 'What Stayed',
  description: 'A private archive of the places you’ve been, the people you’ve loved, and the moments that made you.',
  applicationName: 'What Stayed',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180' }],
  },
  // installed from Safari's "Add to Home Screen": full screen, its own icon and launch screen
  appleWebApp: {
    capable: true,
    title: 'What Stayed',
    statusBarStyle: 'default',
    startupImage: [
      { url: '/icons/splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/icons/splash-1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/icons/splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/icons/splash-1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/icons/splash-1125x2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/icons/splash-828x1792.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/icons/splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/icons/splash-1242x2688.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
    ],
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'What Stayed',
    description: 'Tell it about the places you’ve been. Each memory grows into a blossom on a tree.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#ffffff' },
  ],
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The root layout wraps every route, so these fonts load everywhere (the rule is written for the pages router). */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500&display=swap"
        />
      </head>
      <body>
        {children}
        <BloomBurst />
      </body>
    </html>
  );
}
