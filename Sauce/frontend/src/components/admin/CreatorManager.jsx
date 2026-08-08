import { useState } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/content/Badge";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/card";
import { useToast } from "@/components/use-toast";

const SEED = [
  { id: 1, name: "Sauce Studio", handle: "sauce", email: "sauce@studio.app", verified: true, works: 12 },
  { id: 2, name: "Pixel Poeta", handle: "pixel", email: "pixel@poeta.app", verified: false, works: 4 },
  { id: 3, name: "Aster Studio", handle: "aster", email: "aster@studio.app", verified: false, works: 1 },
];

export function CreatorManager() {
  const { toast } = useToast();
  const [creators, setCreators] = useState(SEED);
  const [query, setQuery] = useState("");

  const filtered = creators.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.handle.toLowerCase().includes(query.toLowerCase()),
  );

  const toggleVerified = (id) => {
    setCreators((prev) =>
      prev.map((c) => (c.id === id ? { ...c, verified: !c.verified } : c)),
    );
    toast({ title: "Actualizado", description: "Estado del creador cambiado." });
  };

  const remove = (id) => {
    setCreators((prev) => prev.filter((c) => c.id !== id));
    toast({ title: "Eliminado", description: "Creador removido.", variant: "destructive" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestión de creadores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Buscar por nombre o handle…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="divide-y rounded-md border">
          {filtered.map((creator) => (
            <div
              key={creator.id}
              className="flex items-center justify-between gap-4 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{creator.name}</p>
                  <Badge tone={creator.verified ? "success" : "outline"}>
                    {creator.verified ? "Verificado" : "Pendiente"}
                  </Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  @{creator.handle} · {creator.works} obras
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleVerified(creator.id)}
                >
                  {creator.verified ? <X className="size-4" /> : <Check className="size-4" />}
                  {creator.verified ? "Quitar" : "Verificar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(creator.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Sin resultados.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
