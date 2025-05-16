import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LicenseRequest } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Pencil, Trash, Send, ExternalLink, Download, FileText } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { format } from "date-fns";
import { TransporterInfo } from "@/components/transporters/transporter-info";
import { useIsMobile } from "@/hooks/use-mobile";
import { SortableHeader } from "@/components/ui/sortable-header";

interface LicenseListProps {
  licenses: LicenseRequest[];
  isLoading: boolean;
  isDraftList?: boolean;
  onEdit?: (license: LicenseRequest) => void;
  onView?: (license: LicenseRequest) => void;
  onRefresh: () => void;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (column: string) => void;
}

export function LicenseList({ 
  licenses, 
  isLoading, 
  isDraftList = false,
  onEdit, 
  onView,
  onRefresh,
  sortColumn = null,
  sortDirection = null,
  onSort
}: LicenseListProps) {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<LicenseRequest | null>(null);
  
  // Delete mutation for drafts
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/licenses/drafts/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Rascunho excluído",
        description: "O rascunho da licença foi excluído com sucesso",
      });
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir o rascunho",
        variant: "destructive",
      });
    },
  });

  // Submit draft mutation
  const submitMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/licenses/drafts/${id}/submit`);
    },
    onSuccess: () => {
      toast({
        title: "Solicitação enviada",
        description: "A solicitação de licença foi enviada com sucesso",
      });
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível enviar a solicitação",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (license: LicenseRequest) => {
    setSelectedLicense(license);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedLicense) {
      deleteMutation.mutate(selectedLicense.id);
      setDeleteDialogOpen(false);
    }
  };

  const handleSubmitDraft = (license: LicenseRequest) => {
    submitMutation.mutate(license.id);
  };

  const getLicenseTypeLabel = (type: string) => {
    switch (type) {
      case "roadtrain_9_axles": return "Rodotrem 9 eixos";
      case "bitrain_9_axles": return "Bitrem 9 eixos";
      case "bitrain_7_axles": return "Bitrem 7 eixos";
      case "bitrain_6_axles": return "Bitrem 6 eixos";
      case "flatbed": return "Prancha";
      case "truck_and_trailer": return "Romeu e Julieta";
      default: return type;
    }
  };
  
  // Função para obter a URL do arquivo para um estado específico da licença
  const getStateFileUrl = (license: LicenseRequest): string | undefined => {
    // Se a licença tiver apenas um estado, ou se estivermos em uma visualização específica por estado
    if ((license as any).specificState && license.stateFiles && Array.isArray(license.stateFiles)) {
      const stateFile = license.stateFiles.find(sf => sf.startsWith(`${(license as any).specificState}:`));
      if (stateFile) {
        // Retorna a parte da string após o primeiro ":"
        return stateFile.split(':', 2)[1];
      }
    } 
    // Se tiver licenseFileUrl diretamente (para compatibilidade com código legado)
    else if ((license as any).licenseFileUrl) {
      return (license as any).licenseFileUrl;
    }
    // Para licenças com múltiplos estados sem estado específico selecionado
    else if (license.stateFiles && Array.isArray(license.stateFiles) && license.stateFiles.length > 0) {
      // Pegamos o primeiro arquivo disponível
      const firstStateFile = license.stateFiles[0];
      return firstStateFile.split(':', 2)[1];
    }
    
    return undefined;
  };
  
  // Função para obter a data de validade de um estado específico
  const getStateValidUntil = (license: LicenseRequest): string | undefined => {
    // Se a licença tiver um estado específico
    if ((license as any).specificState && license.stateStatuses && Array.isArray(license.stateStatuses)) {
      // Buscar status que comece com o estado específico e contenha "approved"
      const stateStatus = license.stateStatuses.find(ss => 
        ss.startsWith(`${(license as any).specificState}:approved:`)
      );
      
      if (stateStatus) {
        // O formato é "estado:approved:data:numeroAET", extrair a data
        const parts = stateStatus.split(':');
        if (parts.length >= 3) {
          return parts[2]; // Retorna a data
        }
      }
    }
    // Se tiver validUntil diretamente (para compatibilidade)
    else if (license.validUntil) {
      return license.validUntil.toString();
    }
    // Para licenças com múltiplos estados sem estado específico
    else if (license.stateStatuses && Array.isArray(license.stateStatuses)) {
      // Procurar pelo primeiro estado com status "approved" e data
      const approvedState = license.stateStatuses.find(ss => ss.includes(':approved:'));
      if (approvedState) {
        const parts = approvedState.split(':');
        if (parts.length >= 3) {
          return parts[2]; // Retorna a data
        }
      }
    }
    
    return undefined;
  };
  
  // Função para obter o número AET de um estado específico
  const getStateAETNumber = (license: LicenseRequest): string | undefined => {
    // Primeira prioridade: buscar no array stateAETNumbers (nova implementação)
    // (formato esperado "estado:numeroAET")
    if (license.stateAETNumbers && Array.isArray(license.stateAETNumbers)) {
      // Se temos um estado específico
      if ((license as any).specificState) {
        const stateAET = license.stateAETNumbers.find(aet => 
          aet.startsWith(`${(license as any).specificState}:`)
        );
        
        if (stateAET) {
          const parts = stateAET.split(':');
          if (parts.length >= 2) {
            return parts[1]; // Retorna o número AET
          }
        }
      } 
      // Sem estado específico, use o primeiro AET disponível
      else if (license.stateAETNumbers.length > 0) {
        const firstAET = license.stateAETNumbers[0];
        const parts = firstAET.split(':');
        if (parts.length >= 2) {
          return parts[1];
        }
      }
    }
    
    // Segunda prioridade: verificar campo aetNumber (compatibilidade)
    if (license.aetNumber) {
      return license.aetNumber;
    }
    
    // Se a licença tiver um estado específico, tente extrair do stateStatuses (terceira prioridade)
    if ((license as any).specificState && license.stateStatuses && Array.isArray(license.stateStatuses)) {
      // Verificar nos status aprovados que têm o formato "estado:approved:data:numeroAET"
      const approvedStatus = license.stateStatuses.find(ss => 
        ss.startsWith(`${(license as any).specificState}:approved:`) && ss.split(':').length >= 4
      );
      
      if (approvedStatus) {
        const parts = approvedStatus.split(':');
        if (parts.length >= 4) {
          return parts[3]; // Retorna o número AET
        }
      }
      
      // Verificar nos status pendentes que têm o formato "estado:status:numeroAET"
      const pendingStatus = license.stateStatuses.find(ss => 
        ss.startsWith(`${(license as any).specificState}:`) && 
        (ss.includes(':under_review:') || ss.includes(':pending_approval:'))
      );
      
      if (pendingStatus) {
        const parts = pendingStatus.split(':');
        if (parts.length >= 3) {
          return parts[2]; // Retorna o número AET
        }
      }
    }
    
    // Para licenças com múltiplos estados sem estado específico (quarta prioridade)
    else if (license.stateStatuses && Array.isArray(license.stateStatuses)) {
      // Buscar primeiro número AET de qualquer estado aprovado
      const approvedWithAET = license.stateStatuses.find(ss => {
        const parts = ss.split(':');
        return parts.length >= 4 && parts[1] === 'approved';
      });
      
      if (approvedWithAET) {
        const parts = approvedWithAET.split(':');
        return parts[3];
      }
      
      // Buscar primeiro número AET de qualquer estado pendente
      const pendingWithAET = license.stateStatuses.find(ss => {
        const parts = ss.split(':');
        return parts.length >= 3 && 
               (parts[1] === 'under_review' || parts[1] === 'pending_approval');
      });
      
      if (pendingWithAET) {
        const parts = pendingWithAET.split(':');
        return parts[2];
      }
    }
    
    return undefined;
  };

  // Function to render actions based on list type and license status
  const renderActions = (license: LicenseRequest) => {
    if (isDraftList) {
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit && onEdit(license)}
            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSubmitDraft(license)}
            className="text-green-600 hover:text-green-800 hover:bg-green-50 ml-1"
            disabled={submitMutation.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteClick(license)}
            className="text-red-600 hover:text-red-800 hover:bg-red-50 ml-1"
            disabled={deleteMutation.isPending}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </>
      );
    } else {
      // Para licenças em acompanhamento
      const stateStatus = (license as any).specificStateStatus || license.status;
      
      // Se o status do estado específico ou o status geral for "approved" (liberada)
      if (stateStatus === "approved") {
        // Sempre mostrar botão de download para licenças aprovadas/liberadas, mesmo se o arquivo ainda não estiver disponível
        return (
          <div className="flex justify-end items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-green-600 hover:text-green-800 hover:bg-green-50"
              title={getStateFileUrl(license) ? "Baixar licença" : "Arquivo não disponível"}
            >
              <a 
                href={getStateFileUrl(license) || '#'} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!getStateFileUrl(license)) {
                    e.preventDefault();
                    alert('Arquivo da licença não disponível no momento.');
                  }
                }}
                className={!getStateFileUrl(license) ? "opacity-40 cursor-not-allowed" : ""}
              >
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onView && onView(license)}
              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        );
      } else if (stateStatus === "rejected") {
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onView && onView(license)}
            className="text-red-600 hover:text-red-800 hover:bg-red-50"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        );
      } else {
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onView && onView(license)}
            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        );
      }
    }
  };

  const isMobile = useIsMobile();

  // Render mobile view with cards
  if (isMobile) {
    return (
      <>
        {isLoading ? (
          <div className="py-10 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-solid border-blue-500 border-r-transparent"></div>
            <p className="mt-2 text-gray-600">Carregando...</p>
          </div>
        ) : licenses.length > 0 ? (
          <div className="space-y-4 p-4">
            {licenses.map((license) => (
              <div key={(license as any).uniqueId || license.id} className="bg-white shadow rounded-lg p-4 border border-gray-100">
                <div className="flex justify-between mb-2">
                  <div className="font-medium text-lg">{license.requestNumber}</div>
                  {!isDraftList && <StatusBadge status={(license as any).specificStateStatus || license.status} />}
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div>
                    <span className="text-sm text-gray-500 block">Tipo:</span>
                    <span>{getLicenseTypeLabel(license.type)}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500 block">Placa Principal:</span>
                    <span>{license.mainVehiclePlate}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500 block">Transportador:</span>
                    <TransporterInfo 
                      transporterId={license.transporterId} 
                      compact={true}
                    />
                  </div>
                  <div>
                    <span className="text-sm text-gray-500 block">Estado:</span>
                    <span>{(license as any).specificState || license.states.join(", ")}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500 block">
                      {isDraftList ? "Última Modificação:" : "Data Solicitação:"}
                    </span>
                    <span>
                      {isDraftList 
                        ? (license.updatedAt && format(new Date(license.updatedAt), "dd/MM/yyyy HH:mm"))
                        : (license.createdAt && format(new Date(license.createdAt), "dd/MM/yyyy"))}
                    </span>
                  </div>
                  
                  {/* Adicionar data de validade para licenças aprovadas */}
                  {((license as any).specificStateStatus === "approved" || license.status === "approved") && 
                   getStateValidUntil(license) && (
                    <div className="col-span-2">
                      <span className="text-sm text-gray-500 block">Validade:</span>
                      <span className="text-green-600 font-medium">
                        {format(new Date(getStateValidUntil(license)!), "dd/MM/yyyy")}
                      </span>
                    </div>
                  )}
                  
                  {/* Adicionar número AET para licenças aprovadas ou em análise */}
                  {getStateAETNumber(license) && (
                    <div className="col-span-2">
                      <span className="text-sm text-gray-500 block">Nº AET:</span>
                      <span className="font-medium">
                        {getStateAETNumber(license)}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end space-x-2 mt-4 border-t pt-4">
                  {isDraftList ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit && onEdit(license)}
                        className="text-blue-600 border-blue-200"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSubmitDraft(license)}
                        className="text-green-600 border-green-200"
                        disabled={submitMutation.isPending}
                      >
                        <Send className="h-4 w-4 mr-1" /> Enviar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(license)}
                        className="text-red-600 border-red-200"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash className="h-4 w-4 mr-1" /> Excluir
                      </Button>
                    </>
                  ) : (
                    (() => {
                      // Verificar tanto o status específico do estado quanto o status geral
                      const stateStatus = (license as any).specificStateStatus || license.status;
                      
                      if (stateStatus === "approved") {
                        return (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="text-green-600 border-green-200 mr-1"
                              title={getStateFileUrl(license) ? "Baixar licença" : "Arquivo não disponível"}
                            >
                              <a 
                                href={getStateFileUrl(license) || '#'} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  if (!getStateFileUrl(license)) {
                                    e.preventDefault();
                                    alert('Arquivo da licença não disponível no momento.');
                                  }
                                }}
                                className={!getStateFileUrl(license) ? "opacity-40 cursor-not-allowed" : ""}
                              >
                                <Download className="h-4 w-4 mr-1" /> Download
                              </a>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onView && onView(license)}
                              className="text-blue-600 border-blue-200"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" /> Detalhes
                            </Button>
                          </>
                        );
                      } else if (stateStatus === "rejected") {
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onView && onView(license)}
                            className="text-red-600 border-red-200"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" /> Detalhes
                          </Button>
                        );
                      } else {
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onView && onView(license)}
                            className="text-blue-600 border-blue-200"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" /> Detalhes
                          </Button>
                        );
                      }
                    })()
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
            <p>
              {isDraftList 
                ? "Nenhum rascunho de licença encontrado."
                : "Nenhuma licença encontrada."}
            </p>
          </div>
        )}
      </>
    );
  }

  // Render desktop view with table
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {onSort ? (
                <SortableHeader
                  column="requestNumber"
                  label={isDraftList ? "Nº Rascunho" : "Nº do Pedido"}
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              ) : (
                <TableHead>{isDraftList ? "Nº Rascunho" : "Nº do Pedido"}</TableHead>
              )}
              
              {onSort ? (
                <SortableHeader
                  column="type"
                  label="Tipo de Conjunto"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              ) : (
                <TableHead>Tipo de Conjunto</TableHead>
              )}
              
              {onSort ? (
                <SortableHeader
                  column="mainVehiclePlate"
                  label="Placa Principal"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              ) : (
                <TableHead>Placa Principal</TableHead>
              )}
              
              {/* Coluna de Transportador, presente em todas as páginas que usam este componente */}
              <TableHead>Transportador</TableHead>
              
              {onSort ? (
                <SortableHeader
                  column="state"
                  label="Estado"
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              ) : (
                <TableHead>Estado</TableHead>
              )}
              
              {onSort ? (
                <SortableHeader
                  column={isDraftList ? "updatedAt" : "createdAt"}
                  label={isDraftList ? "Última Modificação" : "Data Solicitação"}
                  currentSort={sortColumn}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              ) : (
                <TableHead>{isDraftList ? "Última Modificação" : "Data Solicitação"}</TableHead>
              )}

              {/* Coluna de validade SOMENTE para página de licenças emitidas (/licenses/issued) */}
              {!isDraftList && window.location.pathname.includes('/licenses/issued') && (
                onSort ? (
                  <SortableHeader
                    column="validUntil"
                    label="Validade"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={onSort}
                  />
                ) : (
                  <TableHead>Validade</TableHead>
                )
              )}
              
              {/* Coluna de número AET SOMENTE para página de licenças emitidas (/licenses/issued) */}
              {!isDraftList && window.location.pathname.includes('/licenses/issued') && (
                onSort ? (
                  <SortableHeader
                    column="aetNumber"
                    label="Nº Licença"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={onSort}
                  />
                ) : (
                  <TableHead>Nº Licença</TableHead>
                )
              )}
              
              {!isDraftList && (
                onSort ? (
                  <SortableHeader
                    column="status"
                    label="Status"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={onSort}
                  />
                ) : (
                  <TableHead>Status</TableHead>
                )
              )}
              
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell 
                  colSpan={isDraftList 
                    ? 7 // Rascunhos (agora com transportador)
                    : window.location.pathname.includes('/licenses/issued')
                      ? 10 // Licenças emitidas (com transportador, validade e número AET)
                      : 8 // Outras páginas de licenças (com transportador, sem validade)
                  } 
                  className="text-center py-10">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : licenses.length > 0 ? (
              licenses.map((license) => (
                <TableRow key={(license as any).uniqueId || license.id}>
                  <TableCell className="font-medium">
                    {license.requestNumber}
                    {/* Indicador visual para rascunhos de renovação */}
                    {isDraftList && license.comments?.includes('Renovação') && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Renovação
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{getLicenseTypeLabel(license.type)}</TableCell>
                  <TableCell>{license.mainVehiclePlate}</TableCell>
                  <TableCell>
                    <TransporterInfo 
                      transporterId={license.transporterId} 
                      compact={true}
                    />
                  </TableCell>
                  <TableCell>
                    {(license as any).specificState || license.states.join(", ")}
                  </TableCell>
                  <TableCell>
                    {isDraftList 
                      ? (license.updatedAt && format(new Date(license.updatedAt), "dd/MM/yyyy HH:mm"))
                      : (license.createdAt && format(new Date(license.createdAt), "dd/MM/yyyy"))}
                  </TableCell>
                  {/* Coluna de validade apenas na página de licenças emitidas */}
                  {!isDraftList && window.location.pathname.includes('/licenses/issued') && (
                    <TableCell>
                      {/* Exibir data de validade se disponível */}
                      {getStateValidUntil(license) ? (
                        <span className="text-green-600 font-medium">
                          {format(new Date(getStateValidUntil(license)!), "dd/MM/yyyy")}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}
                  
                  {/* Coluna de número AET (licença) apenas na página de licenças emitidas */}
                  {!isDraftList && window.location.pathname.includes('/licenses/issued') && (
                    <TableCell>
                      {getStateAETNumber(license) ? (
                        <span className="font-medium">
                          {getStateAETNumber(license)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}
                  
                  {/* Coluna de status sempre presente para licenças não-rascunho */}
                  {!isDraftList && (
                    <TableCell>
                      <StatusBadge status={(license as any).specificStateStatus || license.status} />
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {renderActions(license)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell 
                  colSpan={isDraftList 
                    ? 7 // Rascunhos (agora com transportador)
                    : window.location.pathname.includes('/licenses/issued')
                      ? 10 // Licenças emitidas (com transportador, validade e número AET)
                      : 8 // Outras páginas de licenças (com transportador, sem validade)
                  } 
                  className="text-center py-10 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>
                    {isDraftList 
                      ? "Nenhum rascunho de licença encontrado."
                      : "Nenhuma licença encontrada."}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Rascunho</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem certeza que deseja excluir este rascunho de licença?
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
    </>
  );
}
