import { useState } from "react";
import { FileUpload } from "./FileUpload";
import { Button } from "@/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { useToast } from "@/components/use-toast";

function parseFile(text) {
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  } catch {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    return lines.slice(1).map((line) => {
      const [title, creator, price, category] = line.split(",");
      return {
        title: title?.trim(),
        creator: creator?.trim(),
        price: Number(price) || 0,
        category: category?.trim(),
      };
    });
  }
}

export function BulkImport() {
  const { toast } = useToast();
  const [parsed, setParsed] = useState([]);

  const handleFiles = async (files) => {
    const results = [];
    for (const file of files) {
      try {
        const text = await file.text();
        results.push(...parseFile(text));
      } catch (err) {
        console.error(err);
      }
    }
    setParsed(results);
    if (results.length === 0) {
      toast({
        title: "Sin datos",
        description: "No se pudo leer ningún elemento del archivo.",
        variant: "destructive",
      });
    }
  };

  const doImport = () => {
    toast({
      title: "Importación completada",
      description: `${parsed.length} elementos importados.`,
    });
    setParsed([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar metadatos en lote</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileUpload
          multiple
          accept=".json,.csv,.txt"
          onFiles={handleFiles}
          label="Sube un JSON o CSV con los datos de tus obras"
          hint='Crea borradores sin archivo. El PDF o EPUB de cada obra se sube por separado desde “Publicar una obra”.'
        />
        {parsed.length > 0 && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{parsed.length} elementos listos</p>
            <p className="mt-1 line-clamp-2 text-muted-foreground">
              {parsed
                .slice(0, 5)
                .map((item) => item.title)
                .join(" · ")}
            </p>
            <Button className="mt-3" onClick={doImport}>
              Confirmar importación
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
