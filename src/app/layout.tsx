import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SITE_NAME,
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  )
}
