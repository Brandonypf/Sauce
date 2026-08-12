import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import { WorkManager } from "@/components/admin/WorkManager";
import { PublishForm } from "@/components/admin/PublishForm";
import { BulkImport } from "@/components/admin/BulkImport";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Button } from "@/components/button";
import { useToast } from "@/components/use-toast";
import { api } from "@/api/client";
import { useWallet } from "@/lib/wallet-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/card";


function ProfileEditor() {
  const { toast } = useToast();
  const { address } = useWallet();

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!address) {
      toast({
        title: "Wallet requerida",
        description: "Conecta tu wallet antes de crear el perfil.",
        variant: "destructive",
      });
      return;
    }

    if (!name.trim() || !handle.trim()) {
      toast({
        title: "Faltan datos",
        description: "El nombre y el handle son obligatorios.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const result = await api.creators.register({
        name: name.trim(),
        handle: handle.trim().toLowerCase(),
        bio: bio.trim(),
        payoutAddress: payoutAddress.trim() || address,
      });

      toast({
        title: "Perfil de creador creado",
        description: `@${result.creator.handle} ya está activo y puede publicar obras.`,
      });
    } catch (err) {
      console.error(err);

      toast({
        title: "No se pudo crear el perfil",
        description:
          err?.message ?? "Ocurrió un error al registrar el creador.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Perfil del creador</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="creator-name">Nombre</Label>
            <Input
              id="creator-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tu nombre o nombre artístico"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="creator-handle">Handle</Label>
            <Input
              id="creator-handle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="brandon_dev"
            />
            <p className="text-sm text-muted-foreground">
              Solo minúsculas, números y guion bajo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="creator-bio">Biografía</Label>
            <textarea
              id="creator-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Cuéntanos sobre ti..."
              maxLength={500}
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="creator-payout">
              Dirección para recibir pagos
            </Label>
            <Input
              id="creator-payout"
              value={payoutAddress}
              onChange={(event) => setPayoutAddress(event.target.value)}
              placeholder={address || "0x..."}
            />
            <p className="text-sm text-muted-foreground">
              Si lo dejas vacío, se utilizará la wallet conectada.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Crear perfil"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function CreatorStudio() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Studio</h1>
      <p className="text-muted-foreground">
        Gestiona tus obras, cobros e importaciones.
      </p>

      <Tabs defaultValue="works" className="mt-8">
        <TabsList>
          <TabsTrigger value="works">Obras</TabsTrigger>
          <TabsTrigger value="import">Importar</TabsTrigger>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
        </TabsList>

        <TabsContent value="works" className="pt-4">
          <div className="space-y-6">
            <PublishForm />
            <WorkManager />
          </div>
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
