import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Clock, User, MessageSquare, ArrowRightLeft, AlertCircle, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";

// Declare a tipagem para a conexão WebSocket global
declare global {
  interface Window {
    wsConnection?: WebSocket;
  }
}

interface StatusHistoryItem {
  id: number;
  licenseId: number;
  state: string;
  userId: number;
  oldStatus: string;
  newStatus: string;
  comments: string | null;
  createdAt: string;
  user?: {
    fullName: string;
    email: string;
  };
}

interface StatusHistoryProps {
  licenseId: number;
  states: string[];
  showHeader?: boolean;
}

export function StatusHistory({ licenseId, states, showHeader = true }: StatusHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<string>("all");
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  
  // Buscar o histórico completo
  const { 
    data: historyData, 
    isLoading, 
    isError,
    refetch: refetchHistory
  } = useQuery<StatusHistoryItem[]>({
    queryKey: [`/api/licenses/${licenseId}/status-history`],
    enabled: !!licenseId,
    staleTime: 30000, // 30 segundos
  });
  
  // Buscar histórico específico de um estado quando a tab está ativa
  const { 
    data: stateHistoryData,
    isLoading: isStateLoading,
    isError: isStateError,
    refetch: refetchStateHistory
  } = useQuery<StatusHistoryItem[]>({
    queryKey: [`/api/licenses/${licenseId}/status-history/${activeTab}`],
    enabled: !!licenseId && activeTab !== "all",
    staleTime: 30000, // 30 segundos
  });
  
  // Função para atualizar os dados
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === "all") {
        await refetchHistory();
      } else {
        await refetchStateHistory();
      }
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Ouvir eventos de WebSocket para atualização em tempo real
  React.useEffect(() => {
    if (!licenseId) return;
    
    // Referência para o objeto websocket
    let ws: WebSocket | null = null;
    
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Se for uma atualização de status de licença
        if (data.type === "STATUS_UPDATE" && data.data.licenseId === licenseId) {
          console.log("StatusUpdate em tempo real para histórico:", data.data);
          
          // Refetch dos dados
          refreshData();
          
          // Notificar o usuário
          toast({
            title: "Histórico atualizado",
            description: `Status da licença alterado para ${data.data.status}`,
            variant: "default",
          });
        }
      } catch (error) {
        console.error("Erro ao processar mensagem WebSocket:", error);
      }
    };
    
    // Configurar o evento listener para WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    // Criar uma nova instância do WebSocket
    try {
      ws = new WebSocket(wsUrl);
      
      ws.addEventListener("open", () => {
        console.log("WebSocket conectado para histórico");
      });
      
      ws.addEventListener("error", (error) => {
        console.error("Erro WebSocket:", error);
      });
      
      ws.addEventListener("message", handleWebSocketMessage);
    } catch (error) {
      console.error("Falha ao iniciar conexão WebSocket:", error);
    }
    
    // Limpar evento listener quando o componente for desmontado
    return () => {
      if (ws) {
        ws.removeEventListener("message", handleWebSocketMessage);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    };
  }, [licenseId, refreshData, toast]);

  // Função para formatar data em formato legível
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  };

  // Lidar com erros de maneira mais controlada, sem mostrar toast para erros de autenticação
  const [errorState, setErrorState] = React.useState<{
    hasError: boolean;
    isAuth: boolean;
    message: string;
  }>({
    hasError: false,
    isAuth: false,
    message: "",
  });

  React.useEffect(() => {
    if (isError) {
      // Verificar se o erro é de autenticação (não exibir toast nesse caso)
      const isAuthError = true; // Assumindo que todos os 401 são por falta de autenticação
      
      setErrorState({
        hasError: true,
        isAuth: isAuthError,
        message: "Não foi possível carregar o histórico de status."
      });
      
      // Mostrar toast apenas para erros que não são de autenticação
      if (!isAuthError) {
        toast({
          variant: "destructive",
          title: "Erro ao carregar histórico",
          description: "Não foi possível carregar o histórico de status.",
        });
      }
    } else if (isStateError && activeTab !== "all") {
      setErrorState({
        hasError: true,
        isAuth: false,
        message: `Não foi possível carregar o histórico de status para o estado ${activeTab}.`
      });
      
      toast({
        variant: "destructive",
        title: "Erro ao carregar histórico do estado",
        description: `Não foi possível carregar o histórico de status para o estado ${activeTab}.`,
      });
    } else {
      setErrorState({
        hasError: false,
        isAuth: false,
        message: ""
      });
    }
  }, [isError, isStateError, activeTab, toast]);

  // Mostrar dados com base na tab ativa
  const displayData = activeTab === "all" ? historyData : stateHistoryData;
  const isDataLoading = activeTab === "all" ? isLoading : isStateLoading;

  return (
    <Card className="w-full">
      {showHeader && (
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Histórico de Status</CardTitle>
            <CardDescription>
              Acompanhe todas as mudanças de status desta licença
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-auto" 
            onClick={refreshData}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Atualizar
          </Button>
        </CardHeader>
      )}
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="all">Todos os Estados</TabsTrigger>
            {states.map((state) => (
              <TabsTrigger key={state} value={state}>{state}</TabsTrigger>
            ))}
          </TabsList>
          
          {isDataLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : errorState.hasError ? (
            <div className="text-center py-8">
              {errorState.isAuth ? (
                <div>
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                  <h3 className="font-medium text-lg">Autenticação necessária</h3>
                  <p className="text-muted-foreground mt-1">
                    Você precisa estar logado para visualizar o histórico de status.
                  </p>
                </div>
              ) : (
                <div>
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                  <h3 className="font-medium text-lg">Erro ao carregar histórico</h3>
                  <p className="text-muted-foreground mt-1">
                    {errorState.message}
                  </p>
                </div>
              )}
            </div>
          ) : displayData && displayData.length > 0 ? (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {displayData.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <ArrowRightLeft className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="font-medium">
                          Alteração de <StatusBadge status={item.oldStatus} /> para <StatusBadge status={item.newStatus} />
                        </span>
                      </div>
                      {(() => {
                        // Definir cores baseadas no status do estado
                        let badgeClass = "bg-gray-100 border-gray-200 text-gray-800";
                        
                        // Usar o status atual do item para definir a cor
                        if (item.newStatus === "approved") {
                          badgeClass = "bg-green-50 border-green-200 text-green-800";
                        } else if (item.newStatus === "rejected") {
                          badgeClass = "bg-red-50 border-red-200 text-red-800";
                        } else if (item.newStatus === "pending_approval") {
                          badgeClass = "bg-yellow-50 border-yellow-200 text-yellow-800";
                        } else if (item.newStatus === "under_review") {
                          badgeClass = "bg-blue-50 border-blue-200 text-blue-800";
                        }
                        
                        return (
                          <Badge variant="outline" className={`text-xs ${badgeClass}`}>
                            {item.state}
                          </Badge>
                        );
                      })()}
                    </div>
                    
                    <div className="flex items-center text-sm text-muted-foreground mb-2">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                    
                    <div className="flex items-center text-sm text-muted-foreground mb-2">
                      <User className="h-4 w-4 mr-1" />
                      <span>
                        {item.user ? item.user.fullName : `Usuário ID: ${item.userId}`}
                      </span>
                    </div>
                    
                    {item.comments && (
                      <div className="mt-2 pt-2 border-t">
                        <div className="flex items-start">
                          <MessageSquare className="h-4 w-4 mr-1 mt-0.5 text-muted-foreground" />
                          <div className="text-sm">{item.comments}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum registro de histórico encontrado.
            </div>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}