import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LicenseRequest, LicenseStatus } from "@shared/schema";
import { format, isAfter, isBefore, addDays, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { 
  Dialog, 
  DialogContent, 
  DialogTitle, 
  DialogHeader, 
  DialogDescription,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { FileDown, ExternalLink, AlertCircle, CheckCircle2, Clock, RefreshCcw } from "lucide-react";
import { Status, StatusBadge } from "@/components/licenses/status-badge";
import { TransporterInfo } from "@/components/transporters/transporter-info";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/sortable-header";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function IssuedLicensesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLicense, setSelectedLicense] = useState<LicenseRequest | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>("emissionDate");
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [licenseToRenew, setLicenseToRenew] = useState<{licenseId: number, state: string} | null>(null);
  const itemsPerPage = 10;

  const { data: issuedLicenses, isLoading, refetch } = useQuery<LicenseRequest[]>({
    queryKey: ["/api/licenses/issued"],
    queryFn: async () => {
      const res = await fetch("/api/licenses/issued", {
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error("Erro ao buscar licenças emitidas");
      }
      return res.json();
    },
    // Desabilita o cache para garantir que sempre temos os dados mais recentes
    staleTime: 0,
    // Recarrega os dados quando a página recebe foco
    refetchOnWindowFocus: true
  });

  // Interface para as licenças expandidas por estado
  interface ExpandedLicense {
    id: number;
    licenseId: number;
    requestNumber: string;
    type: string;
    mainVehiclePlate: string;
    transporterId: number;
    state: string;
    status: string;
    stateStatus: string;
    emissionDate: string | null;
    validUntil: string | null;
    licenseFileUrl: string | null;
    stateFileUrl: string | null;
    aetNumber: string | null; // Número da AET
  }
  
  // Obter licenças com status aprovado por estado
  const expandedLicenses = useMemo(() => {
    if (!issuedLicenses) return [];
    
    const result: ExpandedLicense[] = [];
    
    issuedLicenses.forEach(license => {
      // Para cada licença, expandir para uma linha por estado que tenha sido aprovado
      license.states.forEach((state, index) => {
        // Verifica se este estado específico foi aprovado
        const stateStatusEntry = license.stateStatuses?.find(entry => entry.startsWith(`${state}:`));
        const stateStatus = stateStatusEntry?.split(':')?.[1] || 'pending_registration';
        const stateFileEntry = license.stateFiles?.find(entry => entry.startsWith(`${state}:`));
        const stateFileUrl = stateFileEntry?.split(':')?.[1] || null;
        
        // Só incluir estados com status "approved"
        if (stateStatus === 'approved') {
          // Obter data de validade específica para este estado, se disponível
          let stateValidUntil = license.validUntil ? license.validUntil.toString() : null;
          
          // Novo formato: "estado:status:data_validade"
          if (stateStatusEntry && stateStatusEntry.split(':').length > 2) {
            // Extrair data de validade do formato estado:status:data
            stateValidUntil = stateStatusEntry.split(':')[2];
            console.log(`Data de validade extraída para ${state}: ${stateValidUntil}`);
          }
          
          // Obter número AET específico para este estado, se disponível
          let stateAETNumber = null;
          
          // Verificar primeiro no array stateAETNumbers (formato "SP:123456")
          if (license.stateAETNumbers && Array.isArray(license.stateAETNumbers)) {
            const aetEntry = license.stateAETNumbers.find(entry => entry.startsWith(`${state}:`));
            if (aetEntry) {
              const parts = aetEntry.split(':');
              if (parts.length >= 2) {
                stateAETNumber = parts[1];
              }
            }
          }
          
          // Se não encontrou no stateAETNumbers, tentar no campo aetNumber (legado)
          if (!stateAETNumber && license.aetNumber) {
            stateAETNumber = license.aetNumber;
          }
          
          result.push({
            id: license.id * 100 + index, // Gerar ID único para a linha
            licenseId: license.id,
            requestNumber: license.requestNumber,
            type: license.type,
            mainVehiclePlate: license.mainVehiclePlate,
            state,
            status: stateStatus,
            stateStatus,
            emissionDate: license.updatedAt ? license.updatedAt.toString() : null,
            validUntil: stateValidUntil,
            licenseFileUrl: license.licenseFileUrl,
            stateFileUrl,
            transporterId: license.transporterId || 0,
            aetNumber: stateAETNumber // Usar o número AET específico do estado
          });
        }
      });
    });
    
    return result;
  }, [issuedLicenses]);

  // Verificar validade das licenças
  const getLicenseStatus = (validUntil: string | null): 'active' | 'expired' | 'expiring_soon' => {
    if (!validUntil) return 'active';
    
    const validDate = new Date(validUntil);
    const today = new Date();
    
    if (isBefore(validDate, today)) {
      return 'expired';
    }
    
    // Se a validade é menos de 30 dias a partir de hoje
    if (differenceInDays(validDate, today) <= 30) {
      return 'expiring_soon';
    }
    
    return 'active';
  };
  
  // Filtrar as licenças expandidas
  const filteredLicenses = expandedLicenses.filter(license => {
    const matchesSearch = !searchTerm || 
      license.requestNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      license.mainVehiclePlate.toLowerCase().includes(searchTerm.toLowerCase());
    
    const licenseDate = license.emissionDate ? new Date(license.emissionDate) : null;
    
    const matchesDateFrom = !dateFrom || (
      licenseDate && 
      licenseDate >= new Date(dateFrom)
    );
    
    const matchesDateTo = !dateTo || (
      licenseDate && 
      licenseDate <= new Date(dateTo)
    );
    
    const matchesState = !stateFilter || stateFilter === "all_states" || (
      license.state === stateFilter
    );
    
    // Verificar o status da licença para filtro de situação
    const validityStatus = getLicenseStatus(license.validUntil);
    const matchesStatus = !statusFilter || statusFilter === "all_status" || statusFilter === validityStatus;
    
    return matchesSearch && matchesDateFrom && matchesDateTo && matchesState && matchesStatus;
  });

  // Função para ordenar as licenças
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

  // Ordenar licenças filtradas
  const sortedLicenses = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return filteredLicenses;
    }

    // Criar uma cópia para ordenação
    const toSort = [...filteredLicenses];
    
    // Definir uma função de ordenação personalizada com base na coluna e direção
    const getSortValue = (license: ExpandedLicense, column: string): any => {
      if (column === 'state') {
        return license.state;
      } else if (column === 'mainVehiclePlate') {
        return license.mainVehiclePlate;
      } else if (column === 'type') {
        return license.type;
      } else if (column === 'requestNumber') {
        return license.requestNumber;
      } else if (column === 'validUntil') {
        return license.validUntil ? new Date(license.validUntil).getTime() : 0;
      } else if (column === 'emissionDate') {
        return license.emissionDate ? new Date(license.emissionDate).getTime() : 0;
      } else if (column === 'status') {
        return getLicenseStatus(license.validUntil);
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

  // Paginação
  const totalPages = Math.ceil(sortedLicenses.length / itemsPerPage);
  const paginatedLicenses = sortedLicenses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const viewLicenseDetails = (license: LicenseRequest) => {
    setSelectedLicense(license);
  };
  
  // Navegação para redirecionar após renovação
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Mutação para renovar licença
  const renewLicenseMutation = useMutation({
    mutationFn: async ({ licenseId, state }: { licenseId: number, state: string }) => {
      try {
        // Usar o endpoint que aceita o corpo da requisição
        const response = await apiRequest("POST", "/api/licenses/renew", { licenseId, state });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erro ao renovar licença: ${errorText}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Erro na renovação:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Renovação bem-sucedida:", data);
      
      // Fechar o diálogo de renovação
      setRenewDialogOpen(false);
      
      // Invalidar a cache para garantir que os dados são atualizados
      queryClient.invalidateQueries({ queryKey: ["/api/licenses/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/licenses/issued"] });
      
      // Notificar o usuário e redirecionar para a página de edição do rascunho
      toast({
        title: "Licença renovada com sucesso",
        description: `Licença renovada para o estado ${data.draft.states[0]}. Você será redirecionado para editar o rascunho.`,
        duration: 5000,
      });
      
      // Navegar para a página de edição do rascunho após um pequeno atraso
      setTimeout(() => {
        setLocation(`/request-license?draft=${data.draft.id}`);
      }, 1000);
    },
    onError: (error: Error) => {
      console.error("Erro na renovação:", error);
      
      toast({
        title: "Erro ao renovar licença",
        description: error.message || "Não foi possível completar a renovação da licença. Tente novamente.",
        variant: "destructive",
        duration: 5000,
      });
    }
  });

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Licenças Emitidas</h1>
        <p className="text-gray-600 mt-1">Histórico de todas as licenças liberadas</p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="issued-search" className="block text-sm font-medium text-gray-700 mb-1">
              Pesquisar
            </label>
            <div className="relative">
              <Input
                id="issued-search"
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
          
          <div>
            <label htmlFor="date-from" className="block text-sm font-medium text-gray-700 mb-1">
              Data Inicial
            </label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          
          <div>
            <label htmlFor="date-to" className="block text-sm font-medium text-gray-700 mb-1">
              Data Final
            </label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          
          <div>
            <label htmlFor="state-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_states">Todos os estados</SelectItem>
                {/* O erro estava aqui: brazilianStates é um objeto no schema, não um array de strings */}
                {['SP', 'MG', 'MT', 'PE', 'TO', 'MS', 'PR', 'ES', 'DNIT', 'RS', 'BA', 'PA', 'SC', 'DF', 'MA', 'GO', 'RJ', 'CE', 'AL', 'SE'].map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Situação
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as situações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_status">Todas as situações</SelectItem>
                <SelectItem value="active">
                  <div className="flex items-center">
                    <CheckCircle2 className="h-3 w-3 mr-2 text-green-500" /> 
                    Ativas
                  </div>
                </SelectItem>
                <SelectItem value="expiring_soon">
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-2 text-amber-500" /> 
                    Vence
                  </div>
                </SelectItem>
                <SelectItem value="expired">
                  <div className="flex items-center">
                    <AlertCircle className="h-3 w-3 mr-2 text-red-500" /> 
                    Vencidas
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Estatísticas rápidas */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {expandedLicenses.length > 0 && (
            <>
              <div className="text-center py-2 bg-gray-50 rounded-md border border-gray-200">
                <span className="text-xs text-gray-500">Total de licenças</span>
                <p className="font-semibold">{expandedLicenses.length}</p>
              </div>
              <div className="text-center py-2 bg-amber-50 rounded-md border border-amber-200">
                <span className="text-xs text-amber-800">Vence em 30 dias</span>
                <p className="font-semibold text-amber-700">
                  {expandedLicenses.filter(l => getLicenseStatus(l.validUntil) === 'expiring_soon').length}
                </p>
              </div>
              <div className="text-center py-2 bg-red-50 rounded-md border border-red-200">
                <span className="text-xs text-red-800">Vencidas</span>
                <p className="font-semibold text-red-700">
                  {expandedLicenses.filter(l => getLicenseStatus(l.validUntil) === 'expired').length}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Versão desktop - tabela */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-100">
                  <SortableHeader
                    column="state"
                    label="Estado"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="requestNumber"
                    label="Nº Pedido"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="mainVehiclePlate"
                    label="Placa Principal"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <TableHead>Transportador</TableHead>
                  <TableHead>Nº Licença</TableHead>
                  <SortableHeader
                    column="emissionDate"
                    label="Emissão"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="validUntil"
                    label="Validade"
                    currentSort={sortColumn}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10">
                      Carregando licenças...
                    </TableCell>
                  </TableRow>
                ) : paginatedLicenses.length > 0 ? (
                  paginatedLicenses.map((license) => {
                    const validityStatus = getLicenseStatus(license.validUntil);
                    
                    return (
                      <TableRow 
                        key={`${license.licenseId}-${license.state}`}
                        className={
                          validityStatus === 'expired' ? 'bg-red-50' : 
                          validityStatus === 'expiring_soon' ? 'bg-amber-50' : 
                          'hover:bg-gray-50'
                        }
                      >
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-50 text-blue-800 hover:bg-blue-100">
                            {license.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{license.requestNumber}</TableCell>
                        <TableCell>{license.mainVehiclePlate}</TableCell>
                        <TableCell>
                          <TransporterInfo transporterId={license.transporterId} />
                        </TableCell>
                        <TableCell>
                          {license.aetNumber ? (
                            <span className="font-semibold text-blue-700">{license.aetNumber}</span>
                          ) : (
                            <span className="text-gray-500">Não atribuído</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {license.emissionDate ? new Intl.DateTimeFormat('pt-BR').format(new Date(license.emissionDate)) : '-'}
                        </TableCell>
                        <TableCell>
                          {license.validUntil ? (
                            <span className={
                              validityStatus === 'expired' ? 'font-semibold text-red-700' : 
                              validityStatus === 'expiring_soon' ? 'font-semibold text-amber-700' : 
                              'font-semibold text-green-700'
                            }>
                              {new Intl.DateTimeFormat('pt-BR').format(new Date(license.validUntil))}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {validityStatus === 'expired' && (
                            <Badge variant="destructive" className="flex items-center gap-1 justify-center w-24 mx-auto">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                              </span>
                              Vencida
                            </Badge>
                          )}
                          {validityStatus === 'expiring_soon' && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 flex items-center gap-1 justify-center w-24 mx-auto">
                              <Clock className="h-3 w-3" /> 
                              Vence
                            </Badge>
                          )}
                          {validityStatus === 'active' && (
                            <Badge variant="outline" className="bg-green-50 text-green-800 flex items-center gap-1 justify-center w-24 mx-auto">
                              <CheckCircle2 className="h-3 w-3" /> 
                              Ativa
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center space-x-1">
                            {/* Botão para baixar arquivo específico do estado */}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              asChild 
                              className="flex items-center justify-center" 
                              title="Baixar licença para o estado"
                            >
                              {(() => {
                                // Encontrar o arquivo específico para este estado
                                const originalLicense = issuedLicenses?.find(l => l.id === license.licenseId);
                                const stateFileEntry = originalLicense?.stateFiles?.find(file => file.startsWith(`${license.state}:`));
                                const stateFileUrl = stateFileEntry ? stateFileEntry.split(':')[1] : null;
                                
                                return (
                                  <a 
                                    href={stateFileUrl || '#'} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                      if (!stateFileUrl) {
                                        e.preventDefault();
                                        toast({
                                          title: "Documento indisponível",
                                          description: `Documento da licença para o estado ${license.state} não está disponível.`,
                                          variant: "destructive"
                                        });
                                      }
                                    }}
                                    className={!stateFileUrl ? "opacity-40 cursor-not-allowed" : ""}
                                  >
                                    <FileDown className="h-4 w-4 text-green-600" />
                                  </a>
                                );
                              })()}
                            </Button>
                            
                            {/* Botão para visualizar detalhes */}
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="flex items-center justify-center"
                              title="Ver detalhes"
                              onClick={() => {
                                // Buscar a licença original
                                const originalLicense = issuedLicenses?.find(l => l.id === license.licenseId);
                                if (originalLicense) {
                                  viewLicenseDetails(originalLicense);
                                }
                              }}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            
                            {/* Botão para renovar licença */}
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="flex items-center justify-center"
                              title="Renovar licença para este estado"
                              onClick={() => {
                                setLicenseToRenew({
                                  licenseId: license.licenseId,
                                  state: license.state
                                });
                                setRenewDialogOpen(true);
                              }}
                            >
                              <RefreshCcw className="h-4 w-4 text-blue-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10">
                      Nenhuma licença emitida encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        
        {/* Versão mobile - cards */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="py-10 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-solid border-blue-500 border-r-transparent"></div>
              <p className="mt-2 text-gray-600">Carregando licenças...</p>
            </div>
          ) : paginatedLicenses.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {paginatedLicenses.map((license) => {
                const validityStatus = getLicenseStatus(license.validUntil);
                
                return (
                  <div 
                    key={`mobile-${license.licenseId}-${license.state}`} 
                    className={`p-4 ${
                      validityStatus === 'expired' ? 'bg-red-50' : 
                      validityStatus === 'expiring_soon' ? 'bg-amber-50' : 
                      'bg-white'
                    }`}
                  >
                    <div className="flex justify-between mb-2">
                      <div className="flex flex-col">
                        <Badge variant="outline" className="bg-blue-50 text-blue-800 self-start mb-1">
                          {license.state}
                        </Badge>
                        <span className="font-medium text-gray-900">{license.requestNumber}</span>
                      </div>
                      <div className="flex space-x-1">

                        
                        {/* Botão para baixar arquivo específico do estado - versão mobile */}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          asChild 
                          className="h-8 w-8 p-0 flex items-center justify-center" 
                          aria-label="Download da licença" 
                          title="Baixar licença para o estado"
                        >
                          {(() => {
                            // Encontrar o arquivo específico para este estado
                            const originalLicense = issuedLicenses?.find(l => l.id === license.licenseId);
                            const stateFileEntry = originalLicense?.stateFiles?.find(file => file.startsWith(`${license.state}:`));
                            const stateFileUrl = stateFileEntry ? stateFileEntry.split(':')[1] : null;
                            
                            return (
                              <a 
                                href={stateFileUrl || '#'} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  if (!stateFileUrl) {
                                    e.preventDefault();
                                    toast({
                                      title: "Documento indisponível",
                                      description: `Documento da licença para o estado ${license.state} não está disponível.`,
                                      variant: "destructive"
                                    });
                                  }
                                }}
                                className={!stateFileUrl ? "opacity-40 cursor-not-allowed" : ""}
                              >
                                <FileDown className="h-4 w-4 text-green-600" />
                              </a>
                            );
                          })()}
                        </Button>
                        
                        {/* Botão para visualizar detalhes */}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0 flex items-center justify-center"
                          aria-label="Ver detalhes"
                          title="Ver detalhes"
                          onClick={() => {
                            // Buscar a licença original
                            const originalLicense = issuedLicenses?.find(l => l.id === license.licenseId);
                            if (originalLicense) {
                              viewLicenseDetails(originalLicense);
                            }
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        
                        {/* Botão de renovação - versão mobile */}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0 flex items-center justify-center"
                          aria-label="Renovar licença"
                          title="Renovar licença para este estado"
                          onClick={() => {
                            setLicenseToRenew({
                              licenseId: license.licenseId,
                              state: license.state
                            });
                            setRenewDialogOpen(true);
                          }}
                        >
                          <RefreshCcw className="h-4 w-4 text-blue-600" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-2 text-sm">
                      <div>
                        <span className="text-xs text-gray-500">Nº Licença:</span>
                        <div>
                          {license.aetNumber ? (
                            <span className="font-semibold text-blue-700">{license.aetNumber}</span>
                          ) : (
                            <span className="text-gray-500">Não atribuído</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Placa:</span>
                        <div>{license.mainVehiclePlate}</div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Emissão:</span>
                        <div>{license.emissionDate ? new Intl.DateTimeFormat('pt-BR').format(new Date(license.emissionDate)) : '-'}</div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Validade:</span>
                        <div className={
                          validityStatus === 'expired' ? 'font-semibold text-red-700' : 
                          validityStatus === 'expiring_soon' ? 'font-semibold text-amber-700' : 
                          'font-semibold text-green-700'
                        }>
                          {license.validUntil ? new Intl.DateTimeFormat('pt-BR').format(new Date(license.validUntil)) : '-'}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-xs text-gray-500">Situação:</span>
                      <div className="mt-1">
                        {validityStatus === 'expired' && (
                          <Badge variant="destructive" className="flex items-center gap-1 justify-center w-24 mx-auto">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                            </span>
                            Vencida
                          </Badge>
                        )}
                        {validityStatus === 'expiring_soon' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 flex items-center gap-1 justify-center w-24 mx-auto">
                            <Clock className="h-3 w-3" /> 
                            Vence
                          </Badge>
                        )}
                        {validityStatus === 'active' && (
                          <Badge variant="outline" className="bg-green-50 text-green-800 flex items-center gap-1 justify-center w-24 mx-auto">
                            <CheckCircle2 className="h-3 w-3" /> 
                            Ativa
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-gray-500">
              Nenhuma licença emitida encontrada.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-4 sm:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-600 text-center sm:text-left">
              Mostrando <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium">
                {Math.min(currentPage * itemsPerPage, filteredLicenses.length)}
              </span> de <span className="font-medium">{filteredLicenses.length}</span> licenças
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(totalPages, 3) }).map((_, i) => {
                  const pageNumber = currentPage <= 2 
                    ? i + 1 
                    : currentPage >= totalPages - 1 
                      ? totalPages - 2 + i 
                      : currentPage - 1 + i;
                  
                  if (pageNumber <= 0 || pageNumber > totalPages) return null;
                  
                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        isActive={currentPage === pageNumber}
                        onClick={() => setCurrentPage(pageNumber)}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      {/* Diálogo de renovação de licença */}
      <Dialog 
        open={renewDialogOpen} 
        onOpenChange={(open) => {
          setRenewDialogOpen(open);
          if (!open) setLicenseToRenew(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renovar Licença</DialogTitle>
            <DialogDescription>
              Confirme a renovação da licença para criar um novo rascunho.
            </DialogDescription>
          </DialogHeader>
          {licenseToRenew && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="text-sm text-blue-800 mb-2 font-medium">Informações da renovação:</p>
                <div className="text-sm">
                  <div className="flex items-center mb-1">
                    <span className="font-medium mr-2">Estado:</span>
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                      {licenseToRenew.state}
                    </Badge>
                  </div>
                  <p><span className="font-medium">ID da Licença:</span> {licenseToRenew.licenseId}</p>
                  <p className="text-xs text-blue-600 mt-2">
                    A licença será renovada como um rascunho que você poderá editar antes de enviar.
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 p-3 rounded-md">
                <p className="text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 inline-block mr-1" />
                  Isso criará uma cópia da licença original apenas para o estado selecionado.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="sm:w-auto">
                Cancelar
              </Button>
            </DialogClose>
            <Button 
              className="sm:w-auto" 
              disabled={renewLicenseMutation.isPending || !licenseToRenew}
              onClick={() => {
                if (licenseToRenew) {
                  console.log("Renovando licença:", licenseToRenew);
                  renewLicenseMutation.mutate({
                    licenseId: licenseToRenew.licenseId,
                    state: licenseToRenew.state
                  });
                  // Não fechar automaticamente, aguardar resultado da mutação
                }
              }}
            >
              {renewLicenseMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Processando...
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Renovar Licença
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de detalhes da licença */}
      {selectedLicense && (
        <Dialog open={!!selectedLicense} onOpenChange={(open) => !open && setSelectedLicense(null)}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Licença</DialogTitle>
              <p className="text-sm text-gray-500">Informações detalhadas da licença selecionada</p>
            </DialogHeader>
            <div className="space-y-4">
              {selectedLicense && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Número do Pedido</h3>
                <p className="text-gray-900">{selectedLicense.requestNumber}</p>
              </div>
              )}
              <div>
                <h3 className="text-sm font-medium text-gray-500">Tipo de Conjunto</h3>
                <p className="text-gray-900">
                  {selectedLicense.type === "roadtrain_9_axles" && "Rodotrem 9 eixos"}
                  {selectedLicense.type === "bitrain_9_axles" && "Bitrem 9 eixos"}
                  {selectedLicense.type === "bitrain_7_axles" && "Bitrem 7 eixos"}
                  {selectedLicense.type === "bitrain_6_axles" && "Bitrem 6 eixos"}
                  {selectedLicense.type === "flatbed" && "Prancha"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Placa Principal</h3>
                <p className="text-gray-900">{selectedLicense.mainVehiclePlate}</p>
              </div>
              <TransporterInfo transporterId={selectedLicense.transporterId} />
              <div>
                <h3 className="text-sm font-medium text-gray-500">Estados</h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedLicense.states.map(state => (
                    <span key={state} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {state}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Status</h3>
                <Status status={selectedLicense.status} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Data de Liberação</h3>
                <p className="text-gray-900">
                  {selectedLicense.updatedAt ? new Intl.DateTimeFormat('pt-BR').format(new Date(selectedLicense.updatedAt)) : '-'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Validade</h3>
                <p className="font-semibold text-green-700">
                  {selectedLicense.validUntil ? new Intl.DateTimeFormat('pt-BR').format(new Date(selectedLicense.validUntil)) : '-'}
                </p>
              </div>
              {/* Arquivos por estado - mostrar sempre, mesmo que não haja arquivos ainda */}
              {selectedLicense.states && selectedLicense.states.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Arquivos por Estado</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {selectedLicense.states.map(state => {
                      // Procura o arquivo para este estado
                      const stateFileEntry = selectedLicense.stateFiles?.find(sf => sf.startsWith(`${state}:`));
                      const stateStatus = selectedLicense.stateStatuses?.find(ss => ss.startsWith(`${state}:`))?.split(':')[1] || "pending_registration";
                      const isApproved = stateStatus === "approved";
                      
                      return (
                        <div key={state} className={`flex justify-between items-center p-3 rounded border ${isApproved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex flex-col">
                            <div className="flex items-center mb-1">
                              <span className="font-medium text-gray-800">{state}</span>
                              <div className="mx-1 text-gray-400">•</div>
                              <StatusBadge status={stateStatus as LicenseStatus} />
                            </div>
                            
                            {stateStatus === "approved" ? (
                              <span className="text-xs text-green-600 font-medium">
                                {selectedLicense.requestNumber} - "{state}"
                              </span>
                            ) : (
                              <span className="text-xs text-gray-700">
                                {selectedLicense.requestNumber} - "{state}"
                              </span>
                            )}
                            
                            {!stateFileEntry && (
                              <span className="text-xs text-gray-500 italic mt-1">Nenhum arquivo disponível</span>
                            )}
                          </div>
                          
                          {stateFileEntry && (
                            <Button variant="outline" size="sm" asChild>
                              <a 
                                href={stateFileEntry?.split?.(':')?.[1] || '#'} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  if (!stateFileEntry?.split?.(':')?.[1]) {
                                    e.preventDefault();
                                    alert('Arquivo não disponível no momento.');
                                  }
                                }}
                              >
                                <FileDown className="h-4 w-4 mr-1" /> Baixar
                              </a>
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Arquivo principal da licença (manter para compatibilidade) */}
              {selectedLicense.licenseFileUrl && (
                <div className="pt-4">
                  <Button asChild className="w-full">
                    <a 
                      href={selectedLicense.licenseFileUrl || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!selectedLicense.licenseFileUrl) {
                          e.preventDefault();
                          alert('Arquivo não disponível no momento.');
                        }
                      }}
                    >
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
