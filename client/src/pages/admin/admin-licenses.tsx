import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import { AdminLayout } from "@/components/layout/admin-layout";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { getLicenseTypeLabel, getCargoTypeLabel } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Loader2, Search, FileText, CheckCircle, XCircle, File, Clock, 
  MapPin, X, UploadCloud, Pencil, AlertCircle, Eye, EyeOff, Trash2,
  RefreshCw
} from "lucide-react";
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
import { StatusBadge } from "@/components/licenses/status-badge";
import { ProgressFlow, StateProgressFlow } from "@/components/licenses/progress-flow";
import { LicenseDetailsCard } from "@/components/licenses/license-details-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { LicenseRequest, brazilianStates as brazilianStatesObjects } from "@shared/schema";
import { TransporterInfo } from "@/components/transporters/transporter-info";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Lista simplificada de estados brasileiros para uso como strings
const brazilianStates = ["SP", "MG", "MT", "PE", "TO", "MS", "PR", "ES", "DNIT", "RS", "BA", "PA", "SC", "DF", "MA", "GO", "RJ", "CE", "AL", "SE"];
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Schema para atualização de status
const updateStatusSchema = z.object({
  status: z.string({
    required_error: "O status é obrigatório",
  }),
  comments: z.string().optional(),
  licenseFile: z.any().optional(),
});

// Schema para atualização de status por estado
const updateStateStatusSchema = z.object({
  state: z.string({
    required_error: "O estado é obrigatório",
  }),
  status: z.string({
    required_error: "O status é obrigatório",
  }),
  comments: z.string().optional(),
  validUntil: z.string().optional(),
  aetNumber: z.string().optional(),
  licenseFile: z
    .any()
    .optional()
    .refine(
      (file) => {
        if (!file) return true;
        return file && typeof file === 'object' && 'type' in file && 
          file.type === "application/pdf";
      },
      {
        message: "Apenas arquivos PDF são permitidos para a licença",
      }
    ),
}).superRefine((data, ctx) => {
  // Se o status for "approved", validade é obrigatória
  if (data.status === "approved" && !data.validUntil) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A data de validade é obrigatória quando o status é Liberada",
      path: ["validUntil"]
    });
  }
  
  // Se o status for "under_review" ou "pending_approval", número da AET é obrigatório
  if ((data.status === "under_review" || data.status === "pending_approval") && !data.aetNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `O número da AET é obrigatório quando o status é ${data.status === "under_review" ? "Análise do Órgão" : "Pendente Liberação"}`,
      path: ["aetNumber"]
    });
  }
  
  // Para o status "approved", o número da AET deve ser informado apenas se não houver um número anterior
  if (data.status === "approved" && !data.aetNumber) {
    // Não vamos adicionar o erro aqui, pois o backend vai buscar o valor do status anterior
    // Mas podemos melhorar isso com validação do lado do cliente se necessário
  }
});

// Constantes e funções auxiliares para status

export default function AdminLicensesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [transporterFilter, setTransporterFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedLicense, setSelectedLicense] = useState<LicenseRequest | null>(null);
  const [licenseDetailsOpen, setLicenseDetailsOpen] = useState(false);
  const [stateStatusDialogOpen, setStateStatusDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedState, setSelectedState] = useState("");
  const [location] = useLocation();
  const [visibleStateFlows, setVisibleStateFlows] = useState<string[]>([]);
  
  // Estado para ordenação
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { lastMessage } = useWebSocketContext();
  
  // Verificar se o usuário é do tipo operacional
  const isOperational = user?.role === 'operational';
  
  // Verificar se estamos na rota de gerenciar-licencas (staff) ou admin
  const isStaffRoute = location.includes('gerenciar-licencas');
  const apiEndpoint = isStaffRoute ? '/api/staff/licenses' : '/api/admin/licenses';
  
  // Efeito para atualizar o objeto selectedLicense em tempo real quando receber mensagem WebSocket
  useEffect(() => {
    if (
      lastMessage?.type === 'STATUS_UPDATE' && 
      lastMessage.data && 
      selectedLicense && 
      lastMessage.data.licenseId === selectedLicense.id
    ) {
      // Se o evento é para um estado específico
      if (lastMessage.data.state) {
        // Atualização de status de um estado específico
        const updatedStateStatuses = [...(selectedLicense.stateStatuses || [])];
        const stateStatusIndex = updatedStateStatuses.findIndex(
          entry => entry.startsWith(`${lastMessage.data.state}:`)
        );
        
        // Se o estado já existe nos status, atualizar
        if (stateStatusIndex >= 0) {
          updatedStateStatuses[stateStatusIndex] = `${lastMessage.data.state}:${lastMessage.data.status}`;
        } else {
          // Se não existe, adicionar
          updatedStateStatuses.push(`${lastMessage.data.state}:${lastMessage.data.status}`);
        }
        
        // Criar uma cópia atualizada da licença selecionada
        setSelectedLicense(prevLicense => {
          if (!prevLicense) return null;
          return {
            ...prevLicense,
            stateStatuses: updatedStateStatuses,
            // Se também recebemos uma atualização para o status geral da licença
            ...(lastMessage.data.license?.status && { status: lastMessage.data.license.status })
          };
        });
        
        console.log(`StatusUpdate em tempo real: Licença ${selectedLicense.id} estado ${lastMessage.data.state} => ${lastMessage.data.status}`);
      } 
      // Se o evento é para a licença inteira (sem estado específico)
      else if (lastMessage.data.license) {
        setSelectedLicense(prevLicense => {
          if (!prevLicense) return null;
          return {
            ...prevLicense,
            status: lastMessage.data.license.status,
            ...(lastMessage.data.license.stateStatuses && { stateStatuses: lastMessage.data.license.stateStatuses })
          };
        });
        
        console.log(`StatusUpdate em tempo real: Licença ${selectedLicense.id} => ${lastMessage.data.license.status}`);
      }
    }
  }, [lastMessage, selectedLicense]);

  // Form removido para atualização de status geral
  
  // Form para atualização de status por estado
  const stateStatusForm = useForm<z.infer<typeof updateStateStatusSchema>>({
    resolver: zodResolver(updateStateStatusSchema),
    defaultValues: {
      state: "",
      status: "",
      comments: "",
      aetNumber: "", // Adicionar campo para número da AET
      licenseFile: undefined, // Adicionar valor padrão para licenseFile
      validUntil: "", // Corrigindo: iniciar como string vazia ao invés de undefined
    },
  });

  // Buscar todas as licenças (excluindo rascunhos de renovação)
  const { data: licenses = [], isLoading, refetch } = useQuery<LicenseRequest[]>({
    queryKey: [apiEndpoint, "excludeRenewal"],
    queryFn: async () => {
      const res = await fetch(`${apiEndpoint}?includeRenewal=false`, {
        credentials: "include"
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Não autorizado");
        }
        throw new Error("Erro ao buscar licenças");
      }
      
      const data = await res.json();
      
      // Filtro adicional no cliente para garantir que não vamos mostrar
      // rascunhos de renovação na página de gerenciamento
      return data.filter((license: LicenseRequest) => {
        return !(license.isDraft && license.comments?.includes('Renovação'));
      });
    },
  });

  // Mutação para atualização de status geral foi removida - agora só usamos atualização por estado
  
  // Atualizar status por estado da licença
  const updateStateStatusMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: z.infer<typeof updateStateStatusSchema> }) => {
      const formData = new FormData();
      formData.append("state", data.state);
      formData.append("status", data.status);
      if (data.comments) {
        formData.append("comments", data.comments);
      }
      
      // Incluir data de validade se o status for "approved" (Liberada)
      if (data.validUntil && data.status === "approved") {
        formData.append("validUntil", data.validUntil);
      }
      
      // Incluir arquivo da licença se o status for "approved" (Liberada)
      if (data.licenseFile && data.status === "approved") {
        formData.append("stateFile", data.licenseFile);
      }
      
      // Incluir número da AET se o status for "under_review" (Análise do Órgão), "pending_approval" (Pendente Liberação) ou "approved" (Liberada)
      if (data.aetNumber && (data.status === "under_review" || data.status === "pending_approval" || data.status === "approved")) {
        formData.append("aetNumber", data.aetNumber);
      }
      
      const response = await apiRequest("PATCH", `/api/admin/licenses/${id}/state-status`, formData);
      return await response.json();
    },
    onSuccess: (updatedLicense) => {
      // Primeiro, mostrar a notificação de sucesso
      toast({
        title: "Status do estado atualizado",
        description: "Status do estado atualizado com sucesso!",
      });
      
      // Limpar o formulário e fechar o diálogo com um pequeno atraso
      // para garantir que o DOM tenha tempo de processar as mudanças
      setTimeout(() => {
        // Limpar o formulário completamente
        stateStatusForm.reset({
          state: "",
          status: "",
          comments: "",
          aetNumber: "",
          licenseFile: undefined,
          validUntil: "",
        });
        
        // Fechar o diálogo
        setStateStatusDialogOpen(false);
        
        // Redefinir estado selecionado
        setSelectedState("");
      }, 100);
      
      // Invalidar todas as queries relacionadas para garantir dados atualizados
      setTimeout(() => {
        // Invalidar as consultas específicas
        queryClient.invalidateQueries({ queryKey: [apiEndpoint] });
        queryClient.invalidateQueries({ queryKey: [`${apiEndpoint}/${updatedLicense.id}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/licenses/issued'] });
        queryClient.invalidateQueries({ queryKey: ['/api/licenses'] });
        
        // Forçar uma nova busca dos dados (opcional, mas pode ajudar)
        refetch();
      }, 300);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar status do estado",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Mutação para excluir licença
  const deleteLicenseMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/licenses/${id}`);
      return response.ok;
    },
    onSuccess: () => {
      toast({
        title: "Licença excluída",
        description: "A licença foi excluída com sucesso!",
      });
      // Invalidar as queries para manter a consistência
      queryClient.invalidateQueries({ queryKey: [apiEndpoint] });
      setDeleteDialogOpen(false);
      setLicenseDetailsOpen(false);
      setSelectedLicense(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir licença",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filtrar licenças com critérios múltiplos
  const filteredLicenses = licenses
    .filter(license => {
      // Filtro de busca (número do pedido, placa ou transportador)
      const matchesSearch = !searchTerm || 
        license.requestNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        license.mainVehiclePlate?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de status
      const matchesStatus = !statusFilter || statusFilter === "all" || license.status === statusFilter;
      
      // Filtro de transportador
      const matchesTransporter = !transporterFilter || transporterFilter === "all" || (
        license.transporterId != null && license.transporterId.toString() === transporterFilter
      );
      
      // Filtro de data
      let matchesDate = true;
      if (dateFilter) {
        const requestDate = license.createdAt ? new Date(license.createdAt) : null;
        const filterDate = new Date(dateFilter);
        
        if (requestDate) {
          // Comparar apenas ano, mês e dia
          matchesDate = 
            requestDate.getFullYear() === filterDate.getFullYear() &&
            requestDate.getMonth() === filterDate.getMonth() &&
            requestDate.getDate() === filterDate.getDate();
        } else {
          matchesDate = false;
        }
      }
      
      return matchesSearch && matchesStatus && matchesTransporter && matchesDate;
    })
    // Aplicar ordenação
    .sort((a, b) => {
      const getValue = (license: LicenseRequest, field: string) => {
        switch (field) {
          case 'requestNumber':
            return license.requestNumber || '';
          case 'type':
            return license.type || '';
          case 'mainVehiclePlate':
            return license.mainVehiclePlate || '';
          case 'status':
            return license.status || '';
          case 'createdAt':
            return new Date(license.createdAt || 0).getTime();
          default:
            return '';
        }
      };
      
      const aValue = getValue(a, sortField);
      const bValue = getValue(b, sortField);
      
      // Se ambos os valores são strings, ordenar ignorando case
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      
      // Se são números (timestamp para datas)
      if (sortDirection === 'asc') {
        return (aValue as number) - (bValue as number);
      } else {
        return (bValue as number) - (aValue as number);
      }
    });

  // Função removida pois o status agora só será editado por estado individual

  const handleViewDetails = (license: LicenseRequest) => {
    console.log("Detalhes da licença:", license);
    setSelectedLicense(license);
    // Inicialmente, todos os estados têm o fluxo oculto
    setVisibleStateFlows([]);
    setLicenseDetailsOpen(true);
  };

  // Função removida pois o status agora só é editado por estado individual
  
  const handleStateStatusUpdate = (license: LicenseRequest, state: string) => {
    setSelectedLicense(license);
    setSelectedState(state);
    
    // Determinar o status atual deste estado
    let currentStateStatus = "pending";
    
    // Parse dos stateStatuses (que são armazenados como "ESTADO:STATUS")
    if (license.stateStatuses && license.stateStatuses.length > 0) {
      const stateStatusEntry = license.stateStatuses.find(entry => entry.startsWith(`${state}:`));
      if (stateStatusEntry) {
        const [_, status] = stateStatusEntry.split(':');
        if (status) {
          currentStateStatus = status;
        }
      }
    }
    
    stateStatusForm.reset({
      state: state,
      status: currentStateStatus,
      comments: "",
      aetNumber: "", // Resetar também o campo de número da AET
      licenseFile: undefined, // Resetar o campo de arquivo
      validUntil: "", // Resetar a data de validade como string vazia, não undefined
    });
    
    setStateStatusDialogOpen(true);
  };
  
  const onSubmitStateStatus = (data: z.infer<typeof updateStateStatusSchema>) => {
    if (!selectedLicense) return;
    
    // Validação adicional para o status "approved": exigir arquivo PDF e data de validade
    if (data.status === "approved") {
      if (!data.licenseFile) {
        toast({
          title: "Erro de validação",
          description: "Para o status 'Liberada' é obrigatório anexar um documento PDF da licença.",
          variant: "destructive",
        });
        return;
      }
      
      if (!data.validUntil) {
        toast({
          title: "Erro de validação",
          description: "Para o status 'Liberada' é obrigatório definir uma data de validade.",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Validação adicional para o status "under_review" ou "pending_approval": exigir número da AET
    if (data.status === "under_review" || data.status === "pending_approval") {
      if (!data.aetNumber) {
        toast({
          title: "Erro de validação",
          description: `Para o status '${data.status === "under_review" ? "Análise do Órgão" : "Pendente Liberação"}' é obrigatório informar o número da AET.`,
          variant: "destructive",
        });
        return;
      }
    }
    
    // Garantir que useEffect não crie conflitos durante o processamento
    const licenseId = selectedLicense.id;
    
    updateStateStatusMutation.mutate({ 
      id: licenseId,
      data
    });
  };
  
  // Função para excluir a licença selecionada
  const handleDeleteLicense = () => {
    if (!selectedLicense) return;
    setDeleteDialogOpen(true);
  };
  
  // Função para confirmar a exclusão da licença
  const handleConfirmDelete = () => {
    if (!selectedLicense) return;
    deleteLicenseMutation.mutate(selectedLicense.id);
  };
  
  // Função para fechar o diálogo de detalhes e limpar o estado
  const handleCloseLicenseDetails = () => {
    // Primeiro fechar o diálogo
    setLicenseDetailsOpen(false);
    // Depois de um pequeno atraso, limpar o estado selecionado
    setTimeout(() => {
      setSelectedLicense(null);
      setVisibleStateFlows([]);
    }, 100);
  };

  // Formatar data com tratamento de erros
  const formatDate = (dateString: string | Date | undefined | null) => {
    try {
      if (!dateString) {
        return "Data não disponível";
      }
      
      let date;
      if (typeof dateString === 'string') {
        date = new Date(dateString);
      } else {
        date = dateString;
      }
      
      if (!date || isNaN(date.getTime())) {
        return "Data inválida";
      }
      
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    } catch (error) {
      console.error("Erro ao formatar data:", error);
      return "Data indisponível";
    }
  };

  // Opções de status para o select com descrições detalhadas
  const statusOptions = [
    { value: "pending_registration", label: "Pedido em Cadastramento", description: "Status inicial do pedido" },
    { value: "registration_in_progress", label: "Cadastro em Andamento", description: "Em fase de edição pelo usuário" },
    { value: "rejected", label: "Reprovado", description: "Com justificativa de pendências" },
    { value: "under_review", label: "Análise do Órgão", description: "Em avaliação oficial" },
    { value: "pending_approval", label: "Pendente Liberação", description: "Aguardando aprovação final" },
    { value: "approved", label: "Liberada", description: "Licença aprovada com documento disponível" },
    { value: "canceled", label: "Cancelado", description: "Licença cancelada pelo cliente ou pelo sistema" },
  ];

  return (
    <AdminLayout>
      <div className="container mx-auto py-4 px-3 md:px-6 md:py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight">Licenças</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Gerencie todas as licenças no sistema.
            </p>
          </div>
        </div>

        <div className="flex flex-col space-y-4">
          <Card>
            <CardContent className="pt-4 px-3 md:pt-6 md:px-6">
              {/* Novo layout de pesquisa conforme mockup, similar ao da página "Acompanhar Licença" */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-5">
                <div>
                  <div className="flex flex-col space-y-1">
                    <Label htmlFor="license-search" className="text-sm">Pesquisar</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-500" />
                      <Input
                        id="license-search"
                        placeholder="Nº do pedido ou placa..."
                        className="pl-8 h-9 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="flex flex-col space-y-1">
                    <Label htmlFor="status-filter" className="text-sm">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger id="status-filter" className="h-9 text-sm">
                        <SelectValue placeholder="Todos os status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <StatusBadge status={option.value} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <div className="flex flex-col space-y-1">
                    <Label htmlFor="date-filter" className="text-sm">Data</Label>
                    <Input
                      id="date-filter"
                      type="date"
                      className="h-9 text-sm"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="md:col-span-3">
                  <div className="flex flex-col space-y-1">
                    <Label htmlFor="transporter-filter" className="text-sm">Transportador</Label>
                    <Select value={transporterFilter} onValueChange={setTransporterFilter}>
                      <SelectTrigger id="transporter-filter" className="h-9 text-sm">
                        <SelectValue placeholder="Todos os transportadores" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os transportadores</SelectItem>
                        {/* Aqui seria ideal ter uma lista de transportadores para selecionar */}
                        {/* Como é um exemplo, adicionamos alguns valores genéricos */}
                        <SelectItem value="1">Transportadora ABC Ltda</SelectItem>
                        <SelectItem value="2">Transportes XYZ S.A.</SelectItem>
                        <SelectItem value="3">Logística Express Ltda</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center h-60">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Visão Desktop */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead 
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => {
                              if (sortField === 'requestNumber') {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('requestNumber');
                                setSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center">
                              Nº Solicitação
                              {sortField === 'requestNumber' && (
                                <span className="ml-1">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => {
                              if (sortField === 'type') {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('type');
                                setSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center">
                              Tipo
                              {sortField === 'type' && (
                                <span className="ml-1">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => {
                              if (sortField === 'mainVehiclePlate') {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('mainVehiclePlate');
                                setSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center">
                              Veículo Principal
                              {sortField === 'mainVehiclePlate' && (
                                <span className="ml-1">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead>Transportador</TableHead>
                          <TableHead>Estados</TableHead>
                          <TableHead
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => {
                              if (sortField === 'status') {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('status');
                                setSortDirection('asc');
                              }
                            }}
                          >
                            <div className="flex items-center">
                              Status
                              {sortField === 'status' && (
                                <span className="ml-1">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => {
                              if (sortField === 'createdAt') {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('createdAt');
                                setSortDirection('desc'); // Padrão decrescente para datas
                              }
                            }}
                          >
                            <div className="flex items-center">
                              Data de Solicitação
                              {sortField === 'createdAt' && (
                                <span className="ml-1">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLicenses.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-6">
                              Nenhuma licença encontrada
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredLicenses.map((license) => (
                            <TableRow key={license.id}>
                              <TableCell className="font-medium">{license.requestNumber}</TableCell>
                              <TableCell>
                                {getLicenseTypeLabel(license.type)}
                              </TableCell>
                              <TableCell>{license.mainVehiclePlate}</TableCell>
                              <TableCell>
                                <TransporterInfo 
                                  transporterId={license.transporterId} 
                                  compact={true}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {license.states.map((state, idx) => {
                                    // Encontrar o status atual deste estado
                                    let stateStatus = "pending";
                                    if (license.stateStatuses && license.stateStatuses.length > 0) {
                                      const stateStatusEntry = license.stateStatuses.find(entry => entry.startsWith(`${state}:`));
                                      if (stateStatusEntry) {
                                        const [_, status] = stateStatusEntry.split(':');
                                        if (status) {
                                          stateStatus = status;
                                        }
                                      }
                                    }
                                    
                                    // Definir cores baseadas no status
                                    let badgeClass = "bg-gray-100 border-gray-200 text-gray-800";
                                    if (stateStatus === "approved") {
                                      badgeClass = "bg-green-50 border-green-200 text-green-800";
                                    } else if (stateStatus === "rejected") {
                                      badgeClass = "bg-red-50 border-red-200 text-red-800";
                                    } else if (stateStatus === "pending_approval") {
                                      badgeClass = "bg-yellow-50 border-yellow-200 text-yellow-800";
                                    } else if (stateStatus === "under_review") {
                                      badgeClass = "bg-blue-50 border-blue-200 text-blue-800";
                                    }
                                    
                                    return (
                                      <Badge key={idx} variant="outline" className={`text-xs ${badgeClass}`}>
                                        {state}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center">
                                  <StatusBadge status={license.status} />
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(license.createdAt)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewDetails(license)}
                                    className="flex items-center"
                                  >
                                    <Pencil className="h-4 w-4 mr-1" />
                                    Detalhes
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Visão Mobile (Cards) */}
                  <div className="grid grid-cols-1 gap-4 md:hidden">
                    {filteredLicenses.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        Nenhuma licença encontrada
                      </div>
                    ) : (
                      filteredLicenses.map((license) => (
                        <Card key={license.id} className="overflow-hidden">
                          <CardContent className="p-3">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="font-medium text-base">{license.requestNumber}</h3>
                                  <p className="text-xs text-gray-500">
                                    {getLicenseTypeLabel(license.type)}
                                  </p>
                                </div>
                                <StatusBadge status={license.status} />
                              </div>
                              
                              <div className="mt-1.5 space-y-1">
                                <div className="flex items-center text-xs">
                                  <span className="font-medium min-w-[70px]">Veículo:</span> 
                                  <span className="truncate">{license.mainVehiclePlate}</span>
                                </div>
                                <div className="flex items-start text-xs">
                                  <span className="font-medium min-w-[70px] mt-0.5">Transportador:</span>
                                  <span className="truncate">
                                    <TransporterInfo transporterId={license.transporterId} compact={true} />
                                  </span>
                                </div>
                                <div className="flex items-center text-xs">
                                  <span className="font-medium min-w-[70px]">Data:</span> 
                                  <span>{formatDate(license.createdAt)}</span>
                                </div>
                                <div className="mt-1">
                                  <span className="text-xs font-medium">Estados:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {license.states.map((state, idx) => {
                                      // Encontrar o status atual deste estado
                                      let stateStatus = "pending";
                                      if (license.stateStatuses && license.stateStatuses.length > 0) {
                                        const stateStatusEntry = license.stateStatuses.find(entry => entry.startsWith(`${state}:`));
                                        if (stateStatusEntry) {
                                          const [_, status] = stateStatusEntry.split(':');
                                          if (status) {
                                            stateStatus = status;
                                          }
                                        }
                                      }
                                      
                                      // Definir cores baseadas no status
                                      let badgeClass = "bg-gray-100 border-gray-200 text-gray-800";
                                      if (stateStatus === "approved") {
                                        badgeClass = "bg-green-50 border-green-200 text-green-800";
                                      } else if (stateStatus === "rejected") {
                                        badgeClass = "bg-red-50 border-red-200 text-red-800";
                                      } else if (stateStatus === "pending_approval") {
                                        badgeClass = "bg-yellow-50 border-yellow-200 text-yellow-800";
                                      } else if (stateStatus === "under_review") {
                                        badgeClass = "bg-blue-50 border-blue-200 text-blue-800";
                                      }
                                      
                                      return (
                                        <Badge key={idx} variant="outline" className={`text-[10px] px-1.5 py-0.5 ${badgeClass}`}>
                                          {state}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-center mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewDetails(license)}
                                  className="flex items-center h-8 text-xs"
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1" />
                                  Detalhes
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* O diálogo para atualizar status foi removido pois o status agora só é editado por estado individual */}

      {/* Diálogo para atualizar status por estado */}
      <Dialog open={stateStatusDialogOpen} onOpenChange={setStateStatusDialogOpen}>
        <DialogContent className="w-full max-w-4xl mx-auto overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Editar Status do Estado {selectedState}</DialogTitle>
            <DialogDescription>
              Atualize as informações da licença para este estado
            </DialogDescription>
          </DialogHeader>
          <Form {...stateStatusForm}>
            <div className="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
              <h4 className="font-medium text-sm mb-2">Guia de Fluxo de Status:</h4>
              <ul className="text-sm space-y-1">
                <li><span className="font-semibold">Pedido em Cadastramento:</span> Status inicial do pedido</li>
                <li><span className="font-semibold">Cadastro em Andamento:</span> Em fase de edição pelo usuário</li>
                <li><span className="font-semibold">Reprovado:</span> Com justificativa de pendências</li>
                <li><span className="font-semibold">Análise do Órgão:</span> Em avaliação oficial</li>
                <li><span className="font-semibold">Pendente Liberação:</span> Aguardando aprovação final</li>
                <li><span className="font-semibold">Liberada:</span> Licença aprovada com documento disponível</li>
                <li><span className="font-semibold">Cancelado:</span> Licença cancelada pelo cliente ou pelo sistema</li>
              </ul>
            </div>
            <form onSubmit={stateStatusForm.handleSubmit(onSubmitStateStatus)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={stateStatusForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {brazilianStates.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={stateStatusForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {statusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={stateStatusForm.control}
                name="comments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comentários (opcional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Adicione comentários sobre a atualização do status" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Campo para Número de AET quando status for Análise do Órgão, Pendente Liberação ou Liberada */}
              {(stateStatusForm.watch("status") === "under_review" || 
                stateStatusForm.watch("status") === "pending_approval" || 
                stateStatusForm.watch("status") === "approved") && (
                <div className="space-y-4">
                  <h3 className="font-medium text-sm text-gray-800 mt-2 border-t pt-4">
                    {stateStatusForm.watch("status") === "under_review" && "Informações para Análise do Órgão"}
                    {stateStatusForm.watch("status") === "pending_approval" && "Informações para Pendente Liberação"}
                    {stateStatusForm.watch("status") === "approved" && "Número da AET"}
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={stateStatusForm.control}
                      name="aetNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Número da AET para {selectedState} <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder={`Digite o número da AET para ${selectedState}`}
                              {...field}
                              className="w-full"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Número único para este estado específico
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
              
              {/* Campo de upload de arquivo PDF para status "Liberada" */}
              {stateStatusForm.watch("status") === "approved" && (
                <div className="space-y-4">
                  <h3 className="font-medium text-sm text-gray-800 mt-2 border-t pt-4">Informações para Licença Liberada</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={stateStatusForm.control}
                      name="validUntil"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Vencimento da Licença <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              value={field.value || ""}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              min={new Date().toISOString().split('T')[0]}
                              className="w-full"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Data de vencimento obrigatória para liberação
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={stateStatusForm.control}
                      name="licenseFile"
                      render={({ field: { value, onChange, ...field } }) => (
                        <FormItem>
                          <FormLabel>
                            Upload Licença para {selectedState} <span className="text-red-500">*</span>
                          </FormLabel>
                          <div className="mt-1 flex justify-center px-4 pt-4 pb-5 border-2 border-gray-300 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                              <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                              <div className="flex text-sm text-gray-600">
                                <label
                                  htmlFor="licenseFile"
                                  className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                                >
                                  <span>Carregar arquivo</span>
                                  <input
                                    id="licenseFile"
                                    type="file"
                                    className="sr-only"
                                    accept=".pdf,application/pdf"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      onChange(file);
                                    }}
                                    {...field}
                                  />
                                </label>
                                <p className="pl-1">ou arraste e solte</p>
                              </div>
                              <p className="text-xs text-gray-500">
                                PDF até 10MB
                              </p>
                              {value && (
                                <p className="text-sm text-green-600">
                                  Arquivo selecionado: {value.name}
                                </p>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Arquivo PDF específico para o estado {selectedState}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
              
              {/* Campo de upload de arquivo PDF para status "Reprovado" */}
              {stateStatusForm.watch("status") === "rejected" && (
                <div className="space-y-4">
                  <h3 className="font-medium text-sm text-gray-800 mt-2 border-t pt-4">Informações para Licença Reprovada</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={stateStatusForm.control}
                      name="comments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Motivo da Reprovação <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Detalhe os motivos da reprovação"
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Informações sobre o motivo da reprovação
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={stateStatusForm.control}
                      name="licenseFile"
                      render={({ field: { value, onChange, ...field } }) => (
                        <FormItem>
                          <FormLabel>
                            Upload Documento de Reprovação <span className="text-red-500">*</span>
                          </FormLabel>
                          <div className="mt-1 flex justify-center px-4 pt-4 pb-5 border-2 border-gray-300 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                              <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                              <div className="flex text-sm text-gray-600">
                                <label
                                  htmlFor="licenseFile-rejected"
                                  className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                                >
                                  <span>Carregar arquivo</span>
                                  <input
                                    id="licenseFile-rejected"
                                    type="file"
                                    className="sr-only"
                                    accept=".pdf,application/pdf"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      onChange(file);
                                    }}
                                    {...field}
                                  />
                                </label>
                                <p className="pl-1">ou arraste e solte</p>
                              </div>
                              <p className="text-xs text-gray-500">
                                PDF até 10MB
                              </p>
                              {value && (
                                <p className="text-sm text-green-600">
                                  Arquivo selecionado: {value.name}
                                </p>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Documento com razões da reprovação
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
              <div className="mt-6 flex flex-col sm:flex-row justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStateStatusDialogOpen(false)}
                  disabled={updateStateStatusMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <button 
                  type="submit" 
                  disabled={
                    updateStateStatusMutation.isPending || 
                    ((stateStatusForm.watch("status") === "under_review" || 
                      stateStatusForm.watch("status") === "pending_approval" || 
                      stateStatusForm.watch("status") === "approved") && 
                     !stateStatusForm.watch("aetNumber"))
                  }
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-sm w-full sm:w-auto flex items-center justify-center"
                  onClick={(e) => {
                    e.preventDefault();
                    stateStatusForm.handleSubmit(onSubmitStateStatus)();
                  }}
                >
                  {updateStateStatusMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salvar
                </button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Diálogo para ver detalhes da licença */}
      <Dialog open={licenseDetailsOpen} onOpenChange={handleCloseLicenseDetails}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-xl">Detalhes da Licença</DialogTitle>
            <DialogDescription>
              Visualize todos os detalhes da licença
            </DialogDescription>
          </DialogHeader>
          {selectedLicense && (
            <div className="space-y-4">
              <div className="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200 overflow-x-auto">
                <h4 className="font-medium text-sm mb-2">Fluxo de Progresso da Licença:</h4>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-500">Status atual:</div>
                  <StatusBadge status={selectedLicense.status} licenseId={selectedLicense.id} />
                </div>
                <ProgressFlow 
                  currentStatus={selectedLicense.status} 
                  size="md" 
                  licenseId={selectedLicense.id}
                />
              </div>
              
              {/* Tabs para separar o conteúdo */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details">Detalhes da Licença</TabsTrigger>
                  <TabsTrigger value="states">Status por Estado</TabsTrigger>
                </TabsList>
                
                {/* Aba de Detalhes */}
                <TabsContent value="details" className="pt-4">
                  {/* Utilizando o componente LicenseDetailsCard para exibição dos detalhes */}
                  <LicenseDetailsCard license={selectedLicense} />
                </TabsContent>
                
                {/* Aba de Status por Estado */}
                <TabsContent value="states" className="pt-4">
                  <div className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="font-semibold text-base text-gray-700 mb-3 flex items-center">
                      <MapPin className="h-4 w-4 mr-2 text-blue-600" />
                      Status por Estado
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedLicense.states.map((state) => {
                    // Encontrar o status atual deste estado
                    let stateStatus = "pending";
                    if (selectedLicense.stateStatuses && selectedLicense.stateStatuses.length > 0) {
                      const stateStatusEntry = selectedLicense.stateStatuses.find(entry => entry.startsWith(`${state}:`));
                      if (stateStatusEntry) {
                        const [_, status] = stateStatusEntry.split(':');
                        if (status) {
                          stateStatus = status;
                        }
                      }
                    }
                    
                    // Definir cores baseadas no status
                    let borderColor = "border-gray-200";
                    if (stateStatus === "approved") {
                      borderColor = "border-green-200";
                    } else if (stateStatus === "rejected") {
                      borderColor = "border-red-200";
                    } else if (stateStatus === "pending_approval") {
                      borderColor = "border-yellow-200";
                    }
                    
                    return (
                      <div 
                        key={state} 
                        className={`border-l-4 ${borderColor} rounded-md p-3 flex flex-col gap-2 bg-white shadow-sm hover:shadow-md transition-all duration-200`}
                      >
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2 flex items-center gap-2">
                            <div className="bg-blue-50 text-blue-800 font-bold px-2 py-1 rounded text-sm min-w-[40px] text-center">
                              {state}
                            </div>
                            <StatusBadge 
                              status={stateStatus} 
                              licenseId={selectedLicense.id}
                              state={state}
                            />
                          </div>
                          <div className="col-span-1 flex items-center justify-end gap-1">
                            <Button 
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 rounded-full border-blue-200 hover:bg-blue-50"
                              onClick={() => {
                                // Encontrar o estado no array de estados visíveis e alternar
                                const stateFlowVisible = visibleStateFlows.includes(state);
                                if (stateFlowVisible) {
                                  setVisibleStateFlows(visibleStateFlows.filter(s => s !== state));
                                } else {
                                  setVisibleStateFlows([...visibleStateFlows, state]);
                                }
                              }}
                              title={visibleStateFlows.includes(state) ? "Ocultar progresso" : "Mostrar progresso"}
                            >
                              {visibleStateFlows.includes(state) ? 
                                <Eye className="h-4 w-4 text-blue-600" /> : 
                                <EyeOff className="h-4 w-4 text-gray-600" />
                              }
                            </Button>
                            <Button 
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 rounded-full border-green-200 hover:bg-green-50"
                              onClick={() => handleStateStatusUpdate(selectedLicense, state)}
                              title="Atualizar status"
                            >
                              <Pencil className="h-4 w-4 text-green-600" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Fluxo de Progresso do Estado */}
                        {visibleStateFlows.includes(state) && (
                          <div className="mt-2 pt-2 overflow-x-auto bg-gray-50 rounded-md p-2 border border-gray-100">
                            <StateProgressFlow 
                              stateStatus={stateStatus} 
                              size="sm" 
                              className="py-1"
                              licenseId={selectedLicense.id}
                              state={state}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedLicense.comments && (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <h3 className="font-medium text-sm text-gray-500 mb-2">Comentários</h3>
                    <div className="bg-white p-3 rounded border text-sm max-h-28 overflow-y-auto">
                      {selectedLicense.comments}
                    </div>
                  </div>
                )}

                {selectedLicense.licenseFileUrl && (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <h3 className="font-medium text-sm text-gray-500 mb-2">Documento da Licença</h3>
                    <div className="bg-white p-3 rounded border">
                      <a 
                        href={selectedLicense.licenseFileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 hover:text-blue-800"
                      >
                        <FileText className="h-5 w-5 mr-2" />
                        Ver documento
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-center items-center gap-4 mt-6 mb-2">
                <div className="bg-gray-50 rounded-md px-8 py-3 shadow-sm mx-auto">
                  <Button 
                    onClick={handleCloseLicenseDetails}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-md"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Fechar detalhes
                  </Button>
                </div>
                
                {/* Botão de excluir licença - não visível para usuários operacionais */}
                {!isOperational && (
                  <div className="bg-gray-50 rounded-md px-8 py-3 shadow-sm mx-auto">
                    <Button 
                      onClick={handleDeleteLicense}
                      variant="destructive"
                      className="px-8 py-2 rounded-md"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir Licença
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Licença</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem certeza que deseja excluir esta licença?
              Esta ação não pode ser desfeita e todos os dados associados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteLicenseMutation.isPending}
            >
              {deleteLicenseMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}