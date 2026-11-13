import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MenuFlow · Restaurant service",
    template: "%s · MenuFlow",
  },
  description: "Digital menus, table ordering and restaurant service.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
