import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-[60vh] w-full max-w-shell px-6 pt-8 md:px-12 lg:px-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
