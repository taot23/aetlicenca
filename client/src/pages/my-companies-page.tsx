import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Transporter } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Building2, Users, FileText, PackageCheck, Info, AlertCircle, ArrowLeft, Home, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

export default function MyCompaniesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userTransporters, setUserTransporters] = useState<Transporter[]>([]);
  const [, navigate] = useLocation();
  
  // Buscar os transportadores vinculados ao usuário atual
  const { data: transporters = [], isLoading, error } = useQuery({
    queryKey: ["/api/user/transporters"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/user/transporters");
        return await response.json();
      } catch (error) {
        console.error("Erro ao buscar transportadores:", error);
        return [];
      }
    },
    // Otimizações de performance
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
    retry: 1, // Uma tentativa extra em caso de falha
  });
  
  useEffect(() => {
    if (transporters && transporters.length > 0) {
      setUserTransporters(transporters);
    }
  }, [transporters]);

  const handleBack = () => {
    // Usar o router para navegação sem recarregar a página (mais rápido)
    navigate("/");
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="flex justify-between items-center mb-6">
        <Button 
          variant="default" 
          size="sm" 
          onClick={handleBack}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Dashboard
        </Button>

        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate("/")}
          className="ml-auto"
        >
          <Home className="h-4 w-4 mr-2" />
          Página Inicial
        </Button>
      </div>
      
      <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minhas Empresas</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie as empresas vinculadas ao seu perfil.
          </p>
        </div>
        <Button 
          onClick={() => {
            // Atualizar os dados dos transportadores
            isLoading ? null : window.location.reload();
            
            toast({
              title: "Atualizando dados",
              description: "Atualizando a lista de empresas...",
              duration: 3000,
            });
          }} 
          variant="outline" 
          className="flex items-center gap-1 bg-white"
          disabled={isLoading}
          title="Atualizar lista de empresas"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>
      
      <Separator className="mb-6" />
      
      {userTransporters.length === 0 ? (
        <Alert className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Nenhuma empresa vinculada</AlertTitle>
          <AlertDescription>
            Você ainda não possui empresas vinculadas ao seu perfil. 
            Entre em contato com o administrador do sistema para vincular uma empresa à sua conta.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {userTransporters.map((transporter) => (
            <Card key={transporter.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardHeader className="bg-primary/5 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Building2 className="h-5 w-5 text-primary" />
                      {transporter.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <Badge variant="outline" className="mt-1">
                        {transporter.personType === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}
                      </Badge>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-500">Documento</span>
                      <span className="font-medium">
                        {transporter.documentNumber || "Não informado"}
                      </span>
                    </div>
                    
                    {transporter.personType === "pj" && transporter.tradeName && (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-500">Nome Fantasia</span>
                        <span className="font-medium">{transporter.tradeName}</span>
                      </div>
                    )}
                    
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-500">Contato</span>
                      <span className="font-medium">{transporter.email || "Não informado"}</span>
                      <span className="text-sm">{transporter.phone || "Telefone não cadastrado"}</span>
                    </div>
                    
                    {(transporter.city || transporter.state) && (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-500">Localização</span>
                        <span className="font-medium">
                          {transporter.city || ""}
                          {transporter.city && transporter.state && ", "}
                          {transporter.state || ""}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-3 flex flex-col sm:flex-row gap-2">
                    <Button 
                      variant="default" 
                      className="w-full" 
                      size="sm" 
                      onClick={() => {
                        // Usar navegação interna para melhor performance
                        // Armazenar transportador selecionado no sessionStorage para uso na página de solicitação
                        sessionStorage.setItem('selectedTransporterId', transporter.id.toString());
                        navigate("/request-license");
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Solicitar Licença
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      size="sm"
                      onClick={() => {
                        // Atualmente mantido sem ação, mas poderia redirecionar para detalhes
                        // do transportador no futuro
                        toast({
                          title: "Funcionalidade em desenvolvimento",
                          description: "Detalhes do transportador estarão disponíveis em breve."
                        });
                      }}
                    >
                      <Info className="mr-2 h-4 w-4" />
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}