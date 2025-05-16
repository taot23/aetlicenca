import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { LicenseRequest, InsertLicenseRequest } from "@shared/schema";
import { LicenseForm } from "@/components/licenses/license-form";
import { LicenseList } from "@/components/licenses/license-list";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogClose,
  DialogFooter
} from "@/components/ui/dialog";

export default function RequestLicensePage() {
  const [showForm, setShowForm] = useState(false);
  const [currentDraft, setCurrentDraft] = useState<LicenseRequest | null>(null);
  const [preSelectedTransporterId, setPreSelectedTransporterId] = useState<number | null>(null);
  const { toast } = useToast();

  // Verificar se há um transportador pré-selecionado
  useEffect(() => {
    const selectedId = sessionStorage.getItem('selectedTransporterId');
    if (selectedId) {
      const transporterId = parseInt(selectedId, 10);
      setPreSelectedTransporterId(transporterId);
      
      // Se tiver um transportador pré-selecionado, abrimos o formulário automaticamente
      setShowForm(true);
      
      // Limpar o sessionStorage para não reutilizar em futuras visitas à página
      sessionStorage.removeItem('selectedTransporterId');
      
      toast({
        title: "Transportador selecionado",
        description: "Continuando com a solicitação para o transportador selecionado",
      });
    }
  }, []);

  const { data: draftLicenses, isLoading, refetch } = useQuery<LicenseRequest[]>({
    queryKey: ["/api/licenses/drafts", "includeRenewal"],
    queryFn: async () => {
      // Adicionamos o parâmetro includeRenewal=true para incluir rascunhos de renovação
      const res = await fetch("/api/licenses/drafts?includeRenewal=true", {
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error("Erro ao buscar rascunhos de licenças");
      }
      return res.json();
    }
  });

  const handleNewRequest = () => {
    setCurrentDraft(null);
    setShowForm(true);
  };

  const handleEditDraft = (draft: LicenseRequest) => {
    setCurrentDraft(draft);
    setShowForm(true);
  };

  const handleFormComplete = () => {
    setShowForm(false);
    setCurrentDraft(null);
    refetch();
  };

  return (
    <MainLayout>
      {/* Dialog para o formulário */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent 
          className="max-w-6xl w-[95vw] max-h-[92vh] sm:max-h-[85vh] overflow-y-auto p-0 mobile-form-dialog"
          preventCloseOnMobile={true}
        >
          <div className="sticky top-0 z-20 bg-white p-4 sm:p-6 border-b shadow-sm">
            <DialogHeader className="mb-0">
              <DialogTitle className="text-xl sm:text-2xl">
                {currentDraft ? "Editar Solicitação" : "Solicitar AET"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                Preencha os dados abaixo para solicitar uma Autorização Especial de Transporte
              </DialogDescription>
            </DialogHeader>
            <button 
              className="absolute right-3 top-3 rounded-sm opacity-80 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none bg-gray-100 p-1.5"
              onClick={() => setShowForm(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span className="sr-only">Fechar</span>
            </button>
          </div>
          
          <div className="p-4 sm:p-6">
            <LicenseForm
              draft={currentDraft}
              onComplete={handleFormComplete}
              onCancel={() => setShowForm(false)}
              preSelectedTransporterId={preSelectedTransporterId}
            />
          </div>
          
          {/* Botão de Cancelar removido para melhorar a experiência em mobile */}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Solicitar Licença</h1>
        <Button onClick={handleNewRequest} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Solicitar AET
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-800">AETs Pendentes de Envio</h2>
        </div>
        <LicenseList 
          licenses={draftLicenses || []} 
          isLoading={isLoading}
          isDraftList
          onEdit={handleEditDraft}
          onRefresh={refetch}
        />
      </div>
    </MainLayout>
  );
}
