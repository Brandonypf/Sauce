"use client";

import { TitleBar } from "@/components/TitleBar";
import { OtpInput } from "@/components/OtpInput";

export default function VerifyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md overflow-hidden rounded-2xl">
      <TitleBar active="catálogo" />

      <section className="flex flex-col items-center px-8 py-14">
        <div className="glass-strong mb-5 flex h-13 w-13 items-center justify-center rounded-2xl p-3.5">
          <span className="text-2xl">✉</span>
        </div>
        <p className="text-base font-medium text-white">verifica tu correo</p>
        <p className="mb-8 mt-1 text-center text-sm text-white/50">
          enviamos un código de 5 dígitos a tu correo
        </p>

        <OtpInput onVerified={() => {}} />
      </section>
    </main>
  );
}
