import type { Metadata } from 'next';
import { Archivo_Black, Barlow, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
const display = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const body = Barlow({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Ritual Arcana Card — 卡牌链游',
  description: 'Lightweight on-chain card game on Ritual Chain (Chain ID 1979). Collect, build decks, battle the on-chain AI.',
  icons: { icon: '/favicon.webp' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
