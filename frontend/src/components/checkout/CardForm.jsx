import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";

const onlyDigits = (value) => value.replace(/\D/g, "");
const formatNumber = (value) =>
  onlyDigits(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
const formatExpiry = (value) => {
  const digits = onlyDigits(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};
const formatCvc = (value) => onlyDigits(value).slice(0, 4);

export function CardForm({ onSubmit }) {
  const [values, setValues] = useState({
    name: "",
    number: "",
    expiry: "",
    cvc: "",
  });

  const setField = (field) => (e) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const valid =
    values.name.trim() !== "" &&
    onlyDigits(values.number).length === 16 &&
    onlyDigits(values.expiry).length === 4 &&
    onlyDigits(values.cvc).length >= 3;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit?.(values);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="card-name">Titular de la tarjeta</Label>
        <Input
          id="card-name"
          placeholder="Nombre como figura en la tarjeta"
          value={values.name}
          onChange={setField("name")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="card-number">Número</Label>
        <Input
          id="card-number"
          inputMode="numeric"
          placeholder="4242 4242 4242 4242"
          value={values.number}
          onChange={(e) =>
            setValues((prev) => ({
              ...prev,
              number: formatNumber(e.target.value),
            }))
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="card-expiry">Vencimiento</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            placeholder="MM/AA"
            value={values.expiry}
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                expiry: formatExpiry(e.target.value),
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="card-cvc">CVC</Label>
          <Input
            id="card-cvc"
            inputMode="numeric"
            placeholder="123"
            value={values.cvc}
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                cvc: formatCvc(e.target.value),
              }))
            }
          />
        </div>
      </div>
      <Button className="w-full" disabled={!valid} type="submit">
        <CreditCard className="mr-2 size-4" />
        Pagar ahora
      </Button>
    </form>
  );
}
