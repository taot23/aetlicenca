import { useQuery } from "@tanstack/react-query";
import { Transporter } from "@shared/schema";
import { Loader2 } from "lucide-react";

interface TransporterInfoProps {
  transporterId: number | null;
  className?: string;
  compact?: boolean;
}

/**
 * Componente otimizado para exibir informações do transportador
 * 
 * Características:
 * - Utiliza endpoint público que não requer autenticação
 * - Implementa cache de 10 minutos para reduzir chamadas à API
 * - Suporta dois modos de exibição: completo e compacto
 * - Exibe informações formatadas de acordo com o tipo de pessoa (PJ/PF)
 * - Gerencia estados de carregamento e erro de forma intuitiva
 * 
 * Casos de uso:
 * - Exibição de dados do transportador em detalhes de licenças
 * - Referência em listagens e relatórios
 * - Seleção de transportador em formulários
 * 
 * Props:
 * - transporterId: ID do transportador a ser exibido
 * - className: Classe CSS adicional para estilização
 * - compact: Se true, exibe uma versão mais compacta do componente (apenas nome do transportador)
 */
export const TransporterInfo = ({ 
  transporterId, 
  className = "", 
  compact = false 
}: TransporterInfoProps) => {
  const { data: transporter, isLoading } = useQuery<Transporter>({
    queryKey: ['/api/public/transporters', transporterId],
    queryFn: async () => {
      if (!transporterId) return null;
      console.log(`[TransporterInfo] Buscando dados do transportador ID: ${transporterId}`);
      
      // Usar o endpoint público que não requer autenticação
      const res = await fetch(`/api/public/transporters/${transporterId}`);
      
      if (!res.ok) {
        console.error(`[TransporterInfo] Erro ao buscar transportador ID ${transporterId}:`, res.status);
        return null;
      }
      const data = await res.json();
      console.log(`[TransporterInfo] Dados do transportador ID ${transporterId} carregados:`, data);
      return data;
    },
    enabled: !!transporterId,
    staleTime: 10 * 60 * 1000, // Cache por 10 minutos
    retry: 1
  });

  if (compact) {
    return (
      <span className={`inline-block ${className}`}>
        {isLoading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
            <span className="text-gray-500">Carregando...</span>
          </span>
        ) : transporter ? (
          <span className="font-medium">
            {transporter.name}
          </span>
        ) : (
          <span className="text-gray-500 italic">Transportador não encontrado</span>
        )}
      </span>
    );
  }

  return (
    <div className={className}>
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Carregando dados do transportador...</span>
        </div>
      ) : transporter ? (
        <>
          <p className="text-gray-900 font-medium">
            {transporter.name}
          </p>
          {transporter.documentNumber && (
            <p className="text-sm text-gray-700">
              <span className="font-medium">
                {transporter.personType === "pj" ? "CNPJ" : "CPF"}:
              </span> {transporter.documentNumber}
            </p>
          )}
        </>
      ) : (
        <p className="text-gray-500">Transportador não encontrado</p>
      )}
    </div>
  );
};