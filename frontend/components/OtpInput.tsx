"use client";

import { useRef, useState } from "react";

type Status = "idle" | "verifying" | "success" | "error";

const LENGTH = 5;
/** Código de ejemplo para el prototipo; en producción esto lo valida el backend. */
const VALID_CODE = "48219";

export function OtpInput({ onVerified }: { onVerified?: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [status, setStatus] = useState<Status>("idle");
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const isComplete = digits.every((d) => d.length === 1);

  function setDigit(index: number, value: string) {
    const clean = value.replace(/[^0-9]/g, "").slice(0, 1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    setStatus("idle");

    if (clean && index < LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, LENGTH);
    const next = Array(LENGTH).fill("");
    pasted.split("").forEach((ch, i) => (next[i] = ch));
    setDigits(next);
    const focusIndex = Math.min(pasted.length, LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
  }

  async function verify() {
    if (!isComplete) return;
    setStatus("verifying");

    // Simula la llamada al backend que valida el código de 5 dígitos.
    // El haz de luz gira durante esta espera.
    await new Promise((resolve) => setTimeout(resolve, 900));

    const code = digits.join("");
    if (code === VALID_CODE) {
      setStatus("success");
      onVerified?.();
    } else {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-2.5">
        {digits.map((digit, i) => (
          <div
            key={i}
            className={[
              "otp-box-wrap",
              status === "verifying" ? "otp-verifying" : "",
              status === "success" ? "otp-success" : "",
            ].join(" ")}
          >
            <div className="otp-box-inner">
              <input
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                value={digit}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                inputMode="numeric"
                maxLength={1}
                disabled={status === "verifying" || status === "success"}
                className="h-full w-full bg-transparent text-center outline-none"
                aria-label={`dígito ${i + 1} de ${LENGTH}`}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={verify}
        disabled={!isComplete || status === "verifying" || status === "success"}
        className="glass-strong w-full rounded-xl py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-40"
      >
        {status === "verifying" ? "verificando…" : status === "success" ? "verificado" : "verificar"}
      </button>

      {status === "error" && (
        <p className="text-xs text-[#f09595]">código incorrecto. inténtalo de nuevo.</p>
      )}
    </div>
  );
}
