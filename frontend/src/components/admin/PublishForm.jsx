import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Image as ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select";
import { useToast } from "@/components/use-toast";
import { useUpload } from "@/hooks/useUpload";
import { useWallet } from "@/lib/wallet-context";
import { api } from "@/api/client";
import { WORK_FORMATS } from "@/lib/app-params";

/**
 * Publicar una obra.
 *
 * Esto es lo que faltaba: la pestaña "Importar" acepta JSON o CSV, que sirve para
 * metadatos —títulos, precios, categorías— pero no puede transportar un PDF de
 * 80 MB. Un archivo se sube de uno en uno, por el flujo prefirmado, y va aquí.
 *
 * El archivo no pasa por la API: el navegador lo manda directo al almacenamiento.
 * El SHA-256 se calcula antes de transferir nada, y ese mismo hash acaba siendo
 * el `contentHash` de la atestación de autoría on-chain.
 */

const FORMATS = WORK_FORMATS.filter((f) => f.value);

const ACCEPT = ".pdf,.epub,.zip,.cbz,.cbr,application/pdf,application/epub+zip,application/zip";

export function PublishForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { upload, progress, phase, error, reset } = useUpload();
  const { address: walletAddress } = useWallet();

  // Hook aparte para la portada: es un archivo independiente del contenido y
  // compartir estado haria que una barra de progreso pisara a la otra.
  const cover = useUpload();

  const [form, setForm] = useState({
    title: "",
    description: "",
    format: "visual_novel",
    priceSoles: "",
  });

  const [file, setFile] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [coverUploadId, setCoverUploadId] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const set = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e?.target ? e.target.value : e }));

  const handleFile = async (chosen) => {
    setFile(chosen);
    setUploadId(null);

    try {
      const result = await upload(chosen, "content");
      setUploadId(result.uploadId);

      toast({
        title: result.deduplicated ? "Archivo ya disponible" : "Archivo subido",
        description: result.deduplicated
          ? "Este archivo ya estaba en el almacenamiento, no hizo falta transferirlo."
          : `${chosen.name} verificado correctamente.`,
      });
    } catch {
      toast({ title: "No se pudo subir", description: error, variant: "destructive" });
    }
  };

  const handleCover = async (chosen) => {
    // `createObjectURL` da vista previa inmediata, sin esperar a la subida. Se
    // revoca al reemplazar para no acumular blobs en memoria.
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(chosen);
    });

    try {
      const result = await cover.upload(chosen, "cover");
      setCoverUploadId(result.uploadId);
    } catch {
      toast({
        title: "No se pudo subir la portada",
        description: cover.error,
        variant: "destructive",
      });
    }
  };

  const publish = async () => {
    if (!uploadId) return;

    setPublishing(true);

    try {
      // El precio se escribe en soles y se guarda en céntimos. Dinero en enteros,
      // nunca en coma flotante: 38.10 * 100 da 3809.999... en JavaScript.
      const priceMinor = Math.round(Number(form.priceSoles || 0) * 100);

      const { work } = await api.creators.publish({
        title: form.title,
        description: form.description,
        category: form.format,
        uploadId,
        coverUploadId: coverUploadId ?? undefined,
        priceMinor,
        priceCurrency: "PEN",
      });

      toast({ title: "Obra publicada", description: `${work.title} ya está en el catálogo.` });

      // La publicación off-chain sigue siendo válida, pero cuando el creador tiene
      // una wallet real completamos inmediatamente la atestación EIP-712. El
      // relayer se encargará después de enviar la transacción y pagar el gas.
      if (walletAddress && window.ethereum) {
        try {
          const chainHex = await window.ethereum.request({ method: "eth_chainId" });
          if (parseInt(chainHex, 16) !== 421614) {
            throw new Error("Cambia MetaMask a Arbitrum Sepolia para registrar la obra.");
          }

          const onchain = await api.creators.onchain();
          if (!onchain.registered) {
            const txHash = await window.ethereum.request({
              method: "eth_sendTransaction",
              params: [{
                from: walletAddress,
                to: onchain.transaction.to,
                data: onchain.transaction.data,
              }],
            });

            let receipt = null;
            for (let i = 0; i < 60 && !receipt; i += 1) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              receipt = await window.ethereum.request({
                method: "eth_getTransactionReceipt",
                params: [txHash],
              });
            }
            if (!receipt || receipt.status !== "0x1") {
              throw new Error("La transacción de registro del creador no confirmó correctamente.");
            }
          }

          const registration = await api.works.registration(work.slug);
          const typedData = {
            domain: {
              name: "SauceContentRegistry",
              version: "1",
              chainId: 421614,
              verifyingContract: registration.verifyingContract,
            },
            types: {
              RegisterContent: [
                { name: "creator", type: "address" },
                { name: "title", type: "string" },
                { name: "metadataURI", type: "string" },
                { name: "contentHash", type: "bytes32" },
                { name: "referencePrice", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint64" },
              ],
            },
            primaryType: "RegisterContent",
            message: {
              creator: walletAddress,
              title: registration.title,
              metadataURI: registration.metadataURI ?? "",
              contentHash: registration.contentHash,
              referencePrice: "0",
              nonce: registration.nonce,
              deadline: Math.floor(Date.now() / 1000) + 3600,
            },
          };

          const signature = await window.ethereum.request({
            method: "eth_signTypedData_v4",
            params: [walletAddress, JSON.stringify(typedData)],
          });

          await api.works.register(work.slug, {
            creatorAddress: walletAddress,
            title: registration.title,
            metadataURI: registration.metadataURI ?? "",
            contentHash: registration.contentHash,
            referencePrice: "0",
            nonce: registration.nonce,
            deadline: typedData.message.deadline,
            signature,
            chainId: 421614,
            verifyingContract: registration.verifyingContract,
          });

          toast({
            title: "Autoría firmada",
            description: "La obra quedó lista para el relayer de Arbitrum Sepolia.",
          });
        } catch (onchainError) {
          console.error("Registro on-chain pendiente:", onchainError);
          toast({
            title: "Obra publicada; registro on-chain pendiente",
            description: onchainError?.message ?? "Vuelve a conectar la wallet para firmar la autoría.",
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["works"] });

      setForm({ title: "", description: "", format: "visual_novel", priceSoles: "" });
      setFile(null);
      setUploadId(null);
      setCoverUploadId(null);
      setCoverPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      reset();
      cover.reset();
    } catch (e) {
      toast({
        title: "No se pudo publicar",
        description: e?.message ?? "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  const ready = form.title.trim() && uploadId && !publishing;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publicar una obra</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={form.title}
              onChange={set("title")}
              placeholder="Hoshizora no Kanata"
            />
          </div>

          <div className="space-y-2">
            <Label>Formato</Label>
            <Select value={form.format} onValueChange={set("format")}>
              <SelectTrigger>
                <SelectValue>
                  {FORMATS.find((f) => f.value === form.format)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Sinopsis</Label>
          <Input
            id="description"
            value={form.description}
            onChange={set("description")}
            placeholder="De qué trata tu obra"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Precio en soles</Label>
          <Input
            id="price"
            type="number"
            min="0"
            step="0.10"
            value={form.priceSoles}
            onChange={set("priceSoles")}
            placeholder="38.00"
            className="max-w-40"
          />
          <p className="text-xs text-muted-foreground">
            {Number(form.priceSoles || 0) === 0
              ? "Gratis: los usuarios la obtendran sin pasar por el checkout."
              : "Los compradores pagaran este importe en soles."}
          </p>
        </div>

        <CoverField
          preview={coverPreview}
          phase={cover.phase}
          progress={cover.progress}
          uploaded={Boolean(coverUploadId)}
          onPick={handleCover}
          onClear={() => {
            setCoverUploadId(null);
            setCoverPreview((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });
            cover.reset();
          }}
        />

        <FileField
          file={file}
          phase={phase}
          progress={progress}
          uploadId={uploadId}
          error={error}
          onPick={handleFile}
          onClear={() => {
            setFile(null);
            setUploadId(null);
            reset();
          }}
        />

        <Button onClick={publish} disabled={!ready} className="w-full sm:w-auto">
          {publishing && <Loader2 className="size-4 animate-spin" />}
          Publicar obra
        </Button>
      </CardContent>
    </Card>
  );
}

function FileField({ file, phase, progress, uploadId, error, onPick, onClear }) {
  const busy = ["hashing", "reserving", "uploading", "verifying"].includes(phase);

  // Cada fase se nombra por lo que hace de verdad. "Cargando…" durante dos
  // minutos de hash sobre un archivo de 2 GB parece un cuelgue.
  const PHASE_LABEL = {
    hashing: "Calculando la huella del archivo…",
    reserving: "Reservando espacio…",
    uploading: "Subiendo…",
    verifying: "Verificando en el servidor…",
  };

  if (!file) {
    return (
      <div className="space-y-2">
        <Label>Archivo de la obra</Label>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors hover:bg-sakura-glow">
          <UploadCloud className="size-8 text-coral" />
          <span className="text-sm font-medium">
            Sube el PDF, EPUB o ZIP de tu obra
          </span>
          <span className="text-xs text-muted-foreground">
            El archivo va directo al almacenamiento, no pasa por el servidor
          </span>
          <input
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) onPick(chosen);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Archivo de la obra</Label>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-coral" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>

            {busy && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{PHASE_LABEL[phase]}</span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sakura-glow">
                  <div
                    className="h-full rounded-full bg-coral transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadId && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-3.5" />
                Verificado por el servidor
              </p>
            )}

            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </div>

          {!busy && (
            <button
              onClick={onClear}
              aria-label="Quitar archivo"
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * Campo de portada.
 *
 * Separado del archivo de contenido a proposito: son cosas distintas. La portada
 * se ve en el catalogo y es publica; el contenido esta protegido por licencia.
 *
 * La vista previa sale de `createObjectURL`, asi que aparece al instante sin
 * esperar a que termine la subida.
 */
function CoverField({ preview, phase, progress, uploaded, onPick, onClear }) {
  const busy = ["hashing", "reserving", "uploading", "verifying"].includes(phase);

  return (
    <div className="space-y-2">
      <Label>Portada (opcional)</Label>

      <div className="flex items-start gap-4">
        <div className="aspect-cover w-28 shrink-0 overflow-hidden rounded-lg border bg-sakura-glow">
          {preview ? (
            <img src={preview} alt="Vista previa" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center px-2 text-center text-[11px] text-muted-foreground">
              Sin portada
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-sakura-glow">
            <ImageIcon className="size-4 text-coral" />
            {preview ? "Cambiar portada" : "Elegir imagen"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) onPick(chosen);
                e.target.value = "";
              }}
            />
          </label>

          <p className="text-xs text-muted-foreground">JPG, PNG o WebP. Proporcion 3:4.</p>

          {busy && (
            <div className="h-1.5 overflow-hidden rounded-full bg-sakura-glow">
              <div
                className="h-full rounded-full bg-coral transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {uploaded && (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="size-3.5" />
              Portada lista
            </p>
          )}

          {preview && !busy && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
