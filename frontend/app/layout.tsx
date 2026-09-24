import type { Metadata } from "next";
import { Be_Vietnam_Pro, Caprasimo, Figtree, Fraunces, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import AppThemeProvider from "@/components/AppThemeProvider";
import { PreferencesProvider } from "@/lib/preferences";

// Broadsheet: Source Serif 4 for headings, body and UI chrome, with the true
// italic at the body weight (vietnamese subset for the app's Vietnamese copy)
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

// Organic: Caprasimo headings over Figtree. Neither has the Vietnamese
// tone-marked letters (U+1EA0-1EF1), so Vietnamese text uses the closest
// faces that do: Fraunces (soft, heavy) and Be Vietnam Pro (globals.css picks
// by <html lang>). Not preloaded: only needed when Organic is the chosen style.
const caprasimo = Caprasimo({ variable: "--font-caprasimo", subsets: ["latin", "latin-ext"], weight: "400", preload: false });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], preload: false });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin", "vietnamese"], axes: ["SOFT", "WONK"], preload: false });
const beVietnamPro = Be_Vietnam_Pro({ variable: "--font-be-vietnam-pro", subsets: ["latin", "vietnamese"], weight: ["400", "600", "700"], preload: false });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "N3 Utilization Tools",
  description: "A collection of productivity tools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${caprasimo.variable} ${figtree.variable} ${fraunces.variable} ${beVietnamPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Preferences need the signed-in user; the theme and language need the preferences */}
        <AuthProvider>
          <PreferencesProvider>
            <AppThemeProvider>
              {children}
            </AppThemeProvider>
          </PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
