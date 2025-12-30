import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GnarMap",
  description: "Visualize NOHRSC Snow Depth data",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="en">
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
