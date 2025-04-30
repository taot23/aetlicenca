import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Clock, User, MessageSquare, ArrowRightLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "./status-badge";

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
}

export function StatusHistory({ licenseId, states }: StatusHistoryProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<string>("all");
  
  // Buscar o histórico completo
  const { 
    data: historyData, 
    isLoading, 
    isError 
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
  } = useQuery<StatusHistoryItem[]>({
    queryKey: [`/api/licenses/${licenseId}/status-history/${activeTab}`],
    enabled: !!licenseId && activeTab !== "all",
    staleTime: 30000, // 30 segundos
  });

  // Função para formatar data em formato legível
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  };

  // Se houver erro, mostrar mensagem de erro
  React.useEffect(() => {
    if (isError) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar histórico",
        description: "Não foi possível carregar o histórico de status.",
      });
    }
    
    if (isStateError && activeTab !== "all") {
      toast({
        variant: "destructive",
        title: "Erro ao carregar histórico do estado",
        description: `Não foi possível carregar o histórico de status para o estado ${activeTab}.`,
      });
    }
  }, [isError, isStateError, activeTab, toast]);

  // Mostrar dados com base na tab ativa
  const displayData = activeTab === "all" ? historyData : stateHistoryData;
  const isDataLoading = activeTab === "all" ? isLoading : isStateLoading;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Histórico de Status</CardTitle>
        <CardDescription>
          Acompanhe todas as mudanças de status desta licença
        </CardDescription>
      </CardHeader>
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
                      <Badge variant="outline">{item.state}</Badge>
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