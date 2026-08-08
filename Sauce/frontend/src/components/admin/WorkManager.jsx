import { useState } from "react";
import { Badge } from "@/components/content/Badge";
import { Button } from "@/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/card";
import { useToast } from "@/components/use-toast";

const STATUS_TONE = {
  published: "success",
  pending: "warning",
  rejected: "danger",
  draft: "default",
};

const SEED = [
  { id: 1, title: "Guía de Arbitrum", creator: "@sauce", status: "published", price: 5 },
  { id: 2, title: "Pack de assets", creator: "@pixel", status: "pending", price: 12 },
  { id: 3, title: "Curso de Foundry", creator: "@sauce", status: "draft", price: 25 },
];

export function WorkManager() {
  const { toast } = useToast();
  const [works, setWorks] = useState(SEED);

  const setStatus = (id, status) => {
    setWorks((prev) => prev.map((w) => (w.id === id ? { ...w, status } : w)));
    toast({
      title: "Estado actualizado",
      description: `La obra quedó como "${status}".`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestión de obras</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {works.map((work) => (
          <div
            key={work.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{work.title}</p>
              <p className="text-sm text-muted-foreground">
                {work.creator} · ${work.price} USDC
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[work.status] ?? "default"}>
                {work.status}
              </Badge>
              {work.status === "pending" && (
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => setStatus(work.id, "published")}>
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus(work.id, "rejected")}
                  >
                    Rechazar
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
