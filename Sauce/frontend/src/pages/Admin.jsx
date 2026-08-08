import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import { CreatorManager } from "@/components/admin/CreatorManager";
import { WorkManager } from "@/components/admin/WorkManager";
import { BulkImport } from "@/components/admin/BulkImport";

export function Admin() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold">Panel de administración</h1>
      <p className="mt-1 text-muted-foreground">
        Control de creadores, obras y catálogo.
      </p>

      <Tabs defaultValue="creators" className="mt-8">
        <TabsList>
          <TabsTrigger value="creators">Creadores</TabsTrigger>
          <TabsTrigger value="works">Obras</TabsTrigger>
          <TabsTrigger value="import">Importar</TabsTrigger>
        </TabsList>
        <TabsContent value="creators" className="pt-4">
          <CreatorManager />
        </TabsContent>
        <TabsContent value="works" className="pt-4">
          <WorkManager />
        </TabsContent>
        <TabsContent value="import" className="pt-4">
          <BulkImport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
