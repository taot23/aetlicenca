import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Input } from "@/components/ui/input";
import { FileDown, CheckCircle, Search, Download } from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { LicenseRequest } from "@shared/schema";
import { LicenseList } from "@/components/licenses/license-list";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/licenses/status-badge";
import { ProgressFlow, StateProgressFlow } from "@/components/licenses/progress-flow";
import { format } from "date-fns";
import { getLicenseTypeLabel } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { TransporterInfo } from "@/components/transporters/transporter-info";
import { SortableHeader } from "@/components/ui/sortable-header";
import { LicenseDetailsCard } from "@/components/licenses/license-details-card";

export default function TrackLicensePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedLicense, setSelectedLicense] = useState<LicenseRequest | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>("createdAt");
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');

  const { toast } = useToast();
  
  // Buscamos todas as licenças não finalizadas usando a rota /api/licenses
  // Rascunhos de renovação não devem aparecer aqui
  const { data: licenses, isLoading, refetch } = useQuery<LicenseRequest[]>({
    queryKey: ["/api/licenses"],
    queryFn: async () => {
      // O parâmetro includeRenewal=false é o padrão, mas explicitamos para clareza
      const res = await fetch("/api/licenses?includeRenewal=false", {
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error("Erro ao buscar licenças");
      }
      
      const data = await res.json();
      
      // Filtrar para remover quaisquer rascunhos de renovação que possam ter passado pelo filtro do backend
      const filteredData = data.filter((license) => {
        // Exclui qualquer licença que seja rascunho E tenha 'Renovação' no campo comments
        return !(license.isDraft && license.comments?.includes('Renovação'));
      });
      
      return filteredData;
    },
    // Otimização: Mantém dados em cache por 5 minutos
    staleTime: 5 * 60 * 1000,
    // Recarrega os dados quando a página recebe foco para obter atualizações
    refetchOnWindowFocus: true,
    // Permite uma tentativa adicional em caso de falha
    retry: 1
  });

  // Usado para notificar o usuário sobre a disponibilidade de dados em cache
  useEffect(() => {
    if (licenses && licenses.length > 0) {
      toast({
        title: "Licenças carregadas",
        description: `${licenses.length} licenças disponíveis para consulta.`,
        duration: 3000,
      });
    }
  }, [licenses, toast]);

  // Otimizado usando useMemo para evitar recálculos desnecessários
  // Criar interface estendida para a licença com estado específico
  interface ExtendedLicense extends Omit<LicenseRequest, 'transporterId'> {
    specificState?: string;
    specificStateStatus?: string;
    specificStateFileUrl?: string;
    stateValidUntil?: string;
    // Sobrescrever transporterId para aceitar null também
    transporterId: number | null;
  }

  // Função para ordenar licenças
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Se já está ordenando por esta coluna, alterna a direção
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortDirection('asc');
      }
    } else {
      // Nova coluna selecionada, começa com ascendente
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  interface ExtendedLicenseWithId extends ExtendedLicense {
    uniqueId?: string;
  }
  
  // Criar uma lista expandida de licenças separadas por estado (sem duplicação quando ordenadas)
  const expandedLicenses = useMemo(() => {
    if (!licenses) return [];
    
    const result: ExtendedLicenseWithId[] = [];
    
    licenses.forEach(license => {
      // Para cada estado na licença, crie uma entrada específica
      if (license.states && license.states.length > 0) {
        license.states.forEach((state, index) => {
          // Verificar o status para este estado específico
          const stateStatusEntry = license.stateStatuses?.find(ss => ss.startsWith(`${state}:`));
          const stateStatus = stateStatusEntry?.split(':')[1];
          
          // Verificar se temos uma data de validade no formato estado:status:data
          const stateValidUntil = stateStatusEntry && stateStatusEntry.split(':').length > 2 ? 
            stateStatusEntry.split(':')[2] : undefined;
          
          // Verificar se existe um arquivo específico para este estado
          const stateFileEntry = license.stateFiles?.find(sf => sf.startsWith(`${state}:`));
          const stateFileUrl = stateFileEntry ? stateFileEntry.split(':').slice(1).join(':') : undefined;
          
          // Criar uma cópia da licença com o estado específico e um ID único
          const stateLicense: ExtendedLicenseWithId = {
            ...license,
            specificState: state,
            // Substituir o array de estados com apenas este estado
            states: [state],
            // Para filtros de status no frontend, usamos o status do estado específico
            specificStateStatus: stateStatus,
            // URL do arquivo deste estado específico
            specificStateFileUrl: stateFileUrl,
            // Incluir data de validade específica para este estado
            stateValidUntil: stateValidUntil,
            // ID único para esta licença expandida
            uniqueId: `${license.id}-${state}`
          };
          
          result.push(stateLicense);
        });
      } else {
        // Se não houver estados, apenas adicione a licença como está com ID único
        result.push({
          ...license,
          uniqueId: `${license.id}-default`
        });
      }
    });
    
    return result;
  }, [licenses]);
  
  // Aplicar filtros à lista expandida
  const filteredLicenses = useMemo(() => {
    return expandedLicenses.filter(license => {
      const matchesSearch = !searchTerm || 
        license.requestNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        license.mainVehiclePlate.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Modo compatibilidade: filtrar pelo status geral ou status específico do estado
      const matchesStatus = !statusFilter || statusFilter === "all_status" || 
        license.status === statusFilter || 
        license.specificStateStatus === statusFilter;
      
      const matchesDate = !dateFilter || (
        license.createdAt && 
        format(new Date(license.createdAt), "yyyy-MM-dd") === dateFilter
      );
      
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [expandedLicenses, searchTerm, statusFilter, dateFilter]);

  // Ordenar licenças filtradas (sem duplicações)
  const sortedLicenses = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return filteredLicenses;
    }

    // Criar uma cópia para ordenação
    const toSort = [...filteredLicenses];
    
    // Definir uma função de ordenação personalizada com base na coluna e direção
    const getSortValue = (license: ExtendedLicenseWithId, column: string): any => {
      if (column === 'status') {
        return license.specificStateStatus || license.status;
      } else if (column === 'state') {
        return license.specificState || (license.states && license.states.length > 0 ? license.states[0] : '');
      } else if (column === 'requestNumber') {
        return license.requestNumber;
      } else if (column === 'type') {
        return license.type;
      } else if (column === 'mainVehiclePlate') {
        return license.mainVehiclePlate;
      } else if (column === 'createdAt') {
        return license.createdAt ? new Date(license.createdAt).getTime() : 0;
      } else if (column === 'updatedAt') {
        return license.updatedAt ? new Date(license.updatedAt).getTime() : 0;
      } else if (column === 'validUntil') {
        // Ordenar por data de validade, priorizando a do estado específico
        const dateStr = license.stateValidUntil || license.validUntil;
        return dateStr ? new Date(dateStr).getTime() : 0;
      } else {
        return license[column as keyof typeof license];
      }
    };
    
    // Ordenar o array
    toSort.sort((a, b) => {
      const aValue = getSortValue(a, sortColumn);
      const bValue = getSortValue(b, sortColumn);
      
      // Valores iguais
      if (aValue === bValue) return 0;
      
      // Tratamento para nulos
      if (aValue === null || aValue === undefined) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      if (bValue === null || bValue === undefined) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      
      // Para strings
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      // Para números e outros tipos
      return sortDirection === 'asc' 
        ? (aValue < bValue ? -1 : 1) 
        : (bValue < aValue ? -1 : 1);
    });
    
    return toSort;
  }, [filteredLicenses, sortColumn, sortDirection]);

  const handleViewLicense = (license: LicenseRequest) => {
    setSelectedLicense(license);
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Acompanhar Licença</h1>
        <p className="text-gray-600 mt-1">Acompanhe o status de todas as suas licenças solicitadas</p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="w-full md:w-auto flex-1">
            <label htmlFor="license-search" className="block text-sm font-medium text-gray-700 mb-1">
              Pesquisar
            </label>
            <div className="relative">
              <Input
                id="license-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nº do pedido ou placa..."
                className="pl-10"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>
          </div>
          
          <div className="w-full md:w-auto">
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_status">Todos os status</SelectItem>
                <SelectItem value="pending_registration">Pedido em Cadastramento</SelectItem>
                <SelectItem value="registration_in_progress">Cadastro em Andamento</SelectItem>
                <SelectItem value="rejected">Reprovado</SelectItem>
                <SelectItem value="under_review">Análise do Órgão</SelectItem>
                <SelectItem value="pending_approval">Pendente Liberação</SelectItem>
                <SelectItem value="approved">Liberada</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-full md:w-auto">
            <label htmlFor="date-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Data
            </label>
            <Input
              id="date-filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <LicenseList 
        licenses={sortedLicenses || []} 
        isLoading={isLoading}
        onView={handleViewLicense}
        onRefresh={refetch}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {selectedLicense && (
        <Dialog open={!!selectedLicense} onOpenChange={(open) => !open && setSelectedLicense(null)}>
          <DialogContent className="max-w-[1330px] max-h-[90vh] w-[98vw] overflow-y-auto p-4 sm:p-6">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl font-bold">Detalhes da Licença</DialogTitle>
              <DialogDescription>
                Visualize os detalhes da sua solicitação
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Fluxo de progresso individualizado por estado */}
              {selectedLicense.states && selectedLicense.states.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div className="grid grid-cols-1 gap-4">
                    {selectedLicense.states.map(state => {
                      // Procura o status para este estado
                      const stateStatusEntry = selectedLicense.stateStatuses?.find(ss => ss.startsWith(`${state}:`));
                      const stateStatus = stateStatusEntry?.split(':')[1] || "pending_registration";
                      
                      // Extrair data de validade
                      const stateValidUntil = stateStatusEntry && stateStatusEntry.split(':').length > 2 ? 
                        stateStatusEntry.split(':')[2] : undefined;
                      
                      return (
                        <div key={state} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                          <h4 className="font-medium text-sm mb-2">Fluxo de Progresso da Licença: {state}</h4>
                          <StateProgressFlow stateStatus={stateStatus} size="sm" className="py-1" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Componente LicenseDetailsCard para exibição dos detalhes */}
              <LicenseDetailsCard license={selectedLicense} />
              
              {/* O bloco de status específico por estado foi removido conforme solicitado */}
              
              {selectedLicense.comments && (
                <div>
                  <h3 className="font-medium text-sm text-gray-500">Comentários</h3>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded-md border border-gray-200 text-sm">
                    {selectedLicense.comments}
                  </p>
                </div>
              )}
              
              {/* Área de Status por Estado - Exibindo apenas botões de download para estados liberados */}
              {selectedLicense.states && selectedLicense.states.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-sm text-gray-500 mb-2">Licenças por Estado</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedLicense.states.map(state => {
                      // Verificar o status para este estado específico
                      const stateStatusEntry = selectedLicense.stateStatuses?.find(ss => ss.startsWith(`${state}:`));
                      const stateStatus = stateStatusEntry?.split(':')[1] || "pending_registration";
                      
                      // Extrair data de validade se existir
                      const stateValidUntil = stateStatusEntry && stateStatusEntry.split(':').length > 2 ? 
                        stateStatusEntry.split(':')[2] : undefined;
                      
                      // Verificar se existe um arquivo específico para este estado
                      const stateFileEntry = selectedLicense.stateFiles?.find(sf => sf.startsWith(`${state}:`));
                      const stateFileUrl = stateFileEntry ? stateFileEntry.split(':').slice(1).join(':') : undefined;
                      
                      return (
                        <div 
                          key={state} 
                          className={`p-3 rounded-lg border ${
                            stateStatus === "approved" 
                              ? "bg-green-50 border-green-200" 
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{state}</span>
                                <StatusBadge status={stateStatus} />
                              </div>
                              <p className="text-xs text-gray-600">
                                {stateStatus === "approved" 
                                  ? stateValidUntil 
                                    ? `Licença liberada para download - Válida até ${new Date(stateValidUntil).toLocaleDateString('pt-BR')}` 
                                    : "Licença liberada para download" 
                                  : "Status em processamento"}
                              </p>
                            </div>
                            
                            {stateStatus === "approved" && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                asChild
                                className="text-green-600 border-green-200"
                              >
                                <a 
                                  href={stateFileUrl || selectedLicense.licenseFileUrl || '#'} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  onClick={(e) => {
                                    if (!stateFileUrl && !selectedLicense.licenseFileUrl) {
                                      e.preventDefault();
                                      alert('Arquivo da licença não disponível no momento.');
                                    }
                                  }}
                                  className={(!stateFileUrl && !selectedLicense.licenseFileUrl) ? "opacity-40 cursor-not-allowed" : ""}
                                >
                                  <Download className="h-4 w-4 mr-1" /> Download
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Arquivo principal da licença (manter para compatibilidade) */}
              {selectedLicense.status === "approved" && selectedLicense.licenseFileUrl && (
                <div className="pt-4">
                  <Button asChild className="w-full">
                    <a href={selectedLicense.licenseFileUrl} target="_blank" rel="noopener noreferrer">
                      Download da Licença Completa
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}
