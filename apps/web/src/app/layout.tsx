import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = "https://gnarmap.com";
const title = "GnarMap - Interactive Snow Depth Map";
const description =
  "Explore real-time and historical snow depth across the United States. Powered by NOHRSC SNODAS data with daily updates, interactive mapping, and time series charts.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "GnarMap",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "GnarMap - Interactive Snow Depth Map of the United States",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  keywords: [
    "snow depth",
    "snow map",
    "SNODAS",
    "NOHRSC",
    "snow data",
    "winter weather",
    "skiing",
    "snowboarding",
    "backcountry",
    "snow conditions",
  ],
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "GnarMap",
              url: siteUrl,
              description,
              applicationCategory: "WeatherApplication",
              operatingSystem: "Any",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              image: `${siteUrl}/og-image.png`,
            }),
          }}
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-RV76T2889D"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('consent', 'default', {
              'analytics_storage': 'granted'
            });
            gtag('config', 'G-RV76T2889D');
          `}
        </Script>
      </head>
      <body className="antialiased">
        <div id="global-loader" className="fixed inset-0 flex items-center justify-center bg-black/20 z-50">
          <div className="bg-white rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700">Loading snow data...</span>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
};

export default RootLayout;
