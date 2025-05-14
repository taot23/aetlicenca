import { useState } from "react";
import { Vehicle } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash, FileText, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VehicleListProps {
  vehicles: Vehicle[];
  isLoading: boolean;
  onEdit: (vehicle: Vehicle) => void;
  onRefresh: () => void;
}

export function VehicleList({ vehicles, isLoading, onEdit, onRefresh }: VehicleListProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/vehicles/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Veículo excluído",
        description: "O veículo foi excluído com sucesso",
      });
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir o veículo",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedVehicle) {
      deleteMutation.mutate(selectedVehicle.id);
      setDeleteDialogOpen(false);
    }
  };

  const handleDocumentPreview = (vehicle: Vehicle) => {
    // Verificar se o veículo realmente tem o CRLV disponível
    if (!vehicle.crlvUrl) {
      toast({
        title: "Documento indisponível",
        description: "O CRLV deste veículo não está disponível no momento.",
        variant: "destructive",
      });
      return;
    }
    
    if (isMobile) {
      // Em dispositivos móveis, abrir diretamente em nova aba
      window.open(vehicle.crlvUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Em desktop, abrir o modal
      setSelectedVehicle(vehicle);
      setPreviewDialogOpen(true);
    }
  };

  const getVehicleTypeLabel = (type: string) => {
    switch (type) {
      case "tractor_unit": return "Unidade Tratora (Cavalo)";
      case "semi_trailer": return "Semirreboque";
      case "trailer": return "Reboque";
      case "dolly": return "Dolly";
      case "flatbed": return "Prancha";
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Ativo</Badge>;
      case "maintenance":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Em Manutenção</Badge>;
      case "inactive":
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">Inativo</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Diálogo de confirmação de exclusão - aparece em qualquer visualização (móvel ou desktop)
  const DeleteConfirmDialog = () => (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Veículo</AlertDialogTitle>
          <AlertDialogDescription>
            Você tem certeza que deseja excluir o veículo {selectedVehicle?.plate}?
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            className="bg-red-600 hover:bg-red-700"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    return (
      <>
        {isLoading ? (
          <div className="py-10 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-solid border-blue-500 border-r-transparent"></div>
            <p className="mt-2 text-gray-600">Carregando veículos...</p>
          </div>
        ) : vehicles.length > 0 ? (
          <div className="space-y-4">
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="bg-white border rounded-lg p-4 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                    <div className="font-semibold text-lg">{vehicle.plate}</div>
                    <div className="text-sm text-gray-600">{getVehicleTypeLabel(vehicle.type)}</div>
                  </div>
                  {getStatusBadge(vehicle.status)}
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <div>
                    <span className="text-gray-500">Marca:</span> {vehicle.brand || "-"}
                  </div>
                  <div>
                    <span className="text-gray-500">Modelo:</span> {vehicle.model || "-"}
                  </div>
                  <div>
                    <span className="text-gray-500">Eixos:</span> {vehicle.axleCount || "-"}
                  </div>
                  <div>
                    <span className="text-gray-500">Ano:</span> {vehicle.year || "-"}
                  </div>
                  <div>
                    <span className="text-gray-500">Tara:</span> {vehicle.tare.toLocaleString()} kg
                  </div>
                  <div>
                    <span className="text-gray-500">Ano CRLV:</span> {vehicle.crlvYear}
                  </div>
                </div>
                
                <div className="mt-4 flex justify-between items-center">
                  <div>
                    {vehicle.crlvUrl ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDocumentPreview(vehicle)}
                      >
                        <FileText className="mr-1 h-4 w-4" /> Ver CRLV
                      </Button>
                    ) : (
                      <span className="text-gray-500 text-sm">CRLV não disponível</span>
                    )}
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(vehicle)}
                      className="text-blue-600 border-blue-200"
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(vehicle)}
                      className="text-red-600 border-red-200"
                    >
                      <Trash className="h-4 w-4 mr-1" /> Excluir
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
            <div className="bg-white p-4 rounded-lg border text-center text-gray-600 text-sm">
              Mostrando <span className="font-medium">{vehicles.length}</span> veículos
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg p-8 shadow text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
            <p>Nenhum veículo cadastrado. Clique em "Cadastrar Veículo" para adicionar.</p>
          </div>
        )}

        {/* Modal de confirmação de exclusão - versão móvel */}
        <DeleteConfirmDialog />
      </>
    );
  }

  // Versão Desktop - Tabela
  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Tipo de Veículo</TableHead>
                <TableHead>Marca/Modelo</TableHead>
                <TableHead>Eixos</TableHead>
                <TableHead>Tara (kg)</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Documentação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10">
                    Carregando veículos...
                  </TableCell>
                </TableRow>
              ) : vehicles.length > 0 ? (
                vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.plate}</TableCell>
                    <TableCell>{getVehicleTypeLabel(vehicle.type)}</TableCell>
                    <TableCell>
                      {vehicle.brand && vehicle.model 
                        ? `${vehicle.brand} / ${vehicle.model}` 
                        : vehicle.brand || vehicle.model || "-"}
                    </TableCell>
                    <TableCell>{vehicle.axleCount || "-"}</TableCell>
                    <TableCell>{vehicle.tare.toLocaleString()}</TableCell>
                    <TableCell>{vehicle.year || "-"}</TableCell>
                    <TableCell>{getStatusBadge(vehicle.status)}</TableCell>
                    <TableCell>
                      {vehicle.crlvUrl ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-blue-600"
                          onClick={() => handleDocumentPreview(vehicle)}
                        >
                          Ver CRLV
                        </Button>
                      ) : (
                        <span className="text-gray-500 text-sm">Não disponível</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(vehicle)}
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(vehicle)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 ml-1"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p>Nenhum veículo cadastrado. Clique em "Cadastrar Veículo" para adicionar.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {vehicles.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Mostrando <span className="font-medium">{vehicles.length}</span> veículos
            </p>
          </div>
        )}
      </div>

      {/* Modal de confirmação de exclusão - versão desktop */}
      <DeleteConfirmDialog />

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>CRLV do Veículo {selectedVehicle?.plate}</DialogTitle>
          </DialogHeader>
          
          {selectedVehicle?.crlvUrl ? (
            <div className="aspect-video">
              <div className="w-full h-[500px] flex flex-col items-center justify-center text-gray-500 bg-gray-50 rounded border p-6">
                <FileText className="h-16 w-16 text-gray-400 mb-4" />
                <p className="mb-4">O sistema não consegue exibir o documento diretamente.</p>
                <Button asChild>
                  <a 
                    href={selectedVehicle.crlvUrl || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!selectedVehicle.crlvUrl) {
                        e.preventDefault();
                        alert('Arquivo não disponível no momento.');
                      }
                    }}
                  >
                    Abrir documento em nova aba
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-4" />
              <p>Documento não disponível.</p>
            </div>
          )}
          
          {selectedVehicle?.crlvUrl && (
            <div className="flex justify-center mt-4">
              <Button asChild>
                <a 
                  href={selectedVehicle.crlvUrl || '#'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto"
                  onClick={(e) => {
                    if (!selectedVehicle.crlvUrl) {
                      e.preventDefault();
                      alert('Arquivo não disponível no momento.');
                    }
                  }}
                >
                  Abrir em Nova Aba
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
