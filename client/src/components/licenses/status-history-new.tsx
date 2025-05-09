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
  showTabs?: boolean;
  className?: string;
}

export function StatusHistoryNew({ licenseId, states, showHeader = true, showTabs = true, className }: StatusHistoryProps) {
  // Estados para controlar interface
  const [activeTab, setActiveTab] = React.useState("all");
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const { toast } = useToast();
  
  // Estado para controlar erros de autenticação ou outros erros
  const [errorState, setErrorState] = React.useState({
    hasError: false,
    isAuth: false,
    message: ""
  });
  
  // Buscar o histórico de status da licença
  const {
    data: historyData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [`/api/licenses/${licenseId}/status-history`],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/licenses/${licenseId}/status-history`);
        if (!res.ok) {
          if (res.status === 401) {
            setErrorState({
              hasError: true,
              isAuth: true,
              message: "Você precisa estar autenticado para visualizar o histórico"
            });
            throw new Error("Não autenticado");
          }
          throw new Error("Erro ao carregar histórico de status");
        }
        
        const data = await res.json() as StatusHistoryItem[];
        setErrorState({
          hasError: false,
          isAuth: false,
          message: ""
        });
        return data;
      } catch (err: any) {
        setErrorState({
          hasError: true,
          isAuth: err.message === "Não autenticado" || err.status === 401,
          message: err.message || "Erro ao carregar histórico de status"
        });
        throw err;
      }
    }
  });
  
  // Calcular dados de exibição baseados na aba ativa
  const displayData = React.useMemo(() => {
    if (!historyData) return [] as StatusHistoryItem[];
    if (activeTab === "all") return historyData;
    return historyData.filter((item: StatusHistoryItem) => item.state === activeTab);
  }, [historyData, activeTab]);
  
  // Carregamento de dados quando a aba muda
  const isDataLoading = isLoading && activeTab === "all";
  
  const connectWebSocket = () => {
    try {
      // Se já existe uma conexão e está aberta, não fazer nada
      if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
        return;
      }
      
      // Determinar o protocolo (ws ou wss) baseado no protocolo atual da página
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      // Criar nova conexão WebSocket
      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log("WebSocket conectado para histórico");
        window.wsConnection = socket;
        
        // Enviar mensagem para registrar interesse em atualizações desta licença
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "REGISTER_INTEREST",
            licenseId: licenseId
          }));
        }
      };
      
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "STATUS_UPDATE" && data.licenseId === licenseId) {
          // Atualizar os dados quando receber uma notificação de mudança de status
          refetch();
        }
      };
      
      socket.onerror = (error) => {
        console.error("Erro WebSocket:", error);
      };
      
      socket.onclose = () => {
        console.log("WebSocket desconectado");
        // Remover a referência à conexão quando fechada
        if (window.wsConnection === socket) {
          window.wsConnection = undefined;
        }
        // Tentar reconectar após um pequeno atraso
        setTimeout(connectWebSocket, 3000);
      };
    } catch (err) {
      console.error("Erro ao conectar WebSocket:", err);
    }
  };
  
  // Conectar WebSocket quando o componente montar
  React.useEffect(() => {
    connectWebSocket();
    
    // Limpar conexão quando o componente desmontar
    return () => {
      if (window.wsConnection) {
        window.wsConnection.close();
      }
    };
  }, [licenseId]);
  
  // Função para atualizar os dados manualmente
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: "Histórico atualizado",
        description: "Os dados de histórico foram atualizados com sucesso.",
      });
    } catch (err) {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o histórico. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Função para formatar data
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
    } catch (error) {
      return dateString;
    }
  };
  
  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Histórico de Status</CardTitle>
            <CardDescription>
              Acompanhe todas as mudanças de status desta licença
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-auto flex items-center gap-1.5" 
            onClick={refreshData}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
        </CardHeader>
      )}
      <CardContent>
        {showTabs ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 flex-wrap bg-gray-50 p-2 rounded-lg inline-flex">
              <TabsTrigger value="all" className="px-4 py-1.5 rounded-md">Todos os Estados</TabsTrigger>
              {states.map((state) => (
                <TabsTrigger key={state} value={state} className="px-4 py-1.5 rounded-md">{state}</TabsTrigger>
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
              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-6">
                  {displayData.map((item: StatusHistoryItem) => (
                    <div key={item.id} className="pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          Alteração de <StatusBadge status={item.oldStatus} showIcon={false} size="sm" /> para <StatusBadge status={item.newStatus} showIcon={false} size="sm" />
                        </span>
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
                            <Badge variant="outline" className={`ml-auto text-xs px-2 py-0 ${badgeClass}`}>
                              {item.state}
                            </Badge>
                          );
                        })()}
                      </div>
                      
                      <div className="flex items-center text-sm text-muted-foreground ml-6">
                        <Clock className="h-4 w-4 mr-1" />
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                      
                      <div className="flex items-center text-sm text-muted-foreground ml-6">
                        <User className="h-4 w-4 mr-1" />
                        <span>
                          {item.user ? item.user.fullName : `Usuário ID: ${item.userId}`}
                        </span>
                      </div>
                      
                      {item.comments && (
                        <div className="mt-2 ml-6">
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
        ) : (
          /* Quando showTabs for falso, mostrar apenas o histórico completo sem as abas */
          <>
            {isLoading ? (
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
            ) : historyData && historyData.length > 0 ? (
              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-6">
                  {historyData.map((item: StatusHistoryItem) => (
                    <div key={item.id} className="pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          Alteração de <StatusBadge status={item.oldStatus} showIcon={false} size="sm" /> para <StatusBadge status={item.newStatus} showIcon={false} size="sm" />
                        </span>
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
                            <Badge variant="outline" className={`ml-auto text-xs px-2 py-0 ${badgeClass}`}>
                              {item.state}
                            </Badge>
                          );
                        })()}
                      </div>
                      
                      <div className="flex items-center text-sm text-muted-foreground ml-6">
                        <Clock className="h-4 w-4 mr-1" />
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                      
                      <div className="flex items-center text-sm text-muted-foreground ml-6">
                        <User className="h-4 w-4 mr-1" />
                        <span>
                          {item.user ? item.user.fullName : `Usuário ID: ${item.userId}`}
                        </span>
                      </div>
                      
                      {item.comments && (
                        <div className="mt-2 ml-6">
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
          </>
        )}
      </CardContent>
    </Card>
  );
}