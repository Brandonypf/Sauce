import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { WorkManager } from "@/components/admin/WorkManager";
import { BulkImport } from "@/components/admin/BulkImport";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Button } from "@/components/button";
import { useToast } from "@/components/use-toast";

function ProfileEditor() {
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil del creador</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="studio-handle">Handle</Label>
          <Input id="studio-handle" placeholder="@tuhandle" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="studio-bio">Biografía</Label>
          <Input id="studio-bio" placeholder="Cuéntanos qué creas…" />
        </div>
        <div className="space-y-2">
          <Label>Imagen de portada</Label>
          <ImageUpload />
        </div>
        <Button
          onClick={() =>
            toast({ title: "Perfil guardado", description: "Cambios aplicados." })
          }
        >
          Guardar
        </Button>
      </CardContent>
    </Card>
  );
}

export function CreatorStudio() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold">Studio</h1>
      <p className="mt-1 text-muted-foreground">
        Gestiona tus obras, cobros e importaciones.
      </p>

      <Tabs defaultValue="works" className="mt-8">
        <TabsList>
          <TabsTrigger value="works">Obras</TabsTrigger>
          <TabsTrigger value="import">Importar</TabsTrigger>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
        </TabsList>
        <TabsContent value="works" className="pt-4">
          <WorkManager />
        </TabsContent>
        <TabsContent value="import" className="pt-4">
          <BulkImport />
        </TabsContent>
        <TabsContent value="profile" className="pt-4">
          <ProfileEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
