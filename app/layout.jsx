import "./globals.css";
export const metadata = {
  title: "SeatWise — Good nights start here.",
  description:
    "Find your next concert, comedy night, or live show. Fair queues. Real seat holds. A spot that’s yours.",
  icons: { icon: "/icon.svg" },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10110f",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
