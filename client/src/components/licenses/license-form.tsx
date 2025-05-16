import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  insertLicenseRequestSchema, 
  insertDraftLicenseSchema, 
  brazilianStates, 
  licenseTypeEnum,
  Vehicle,
  LicenseRequest,
  Transporter,
  insertVehicleSchema
} from "@shared/schema";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CampoPlacaAdicional } from "./placas-adicionais";
import { 
  LoaderCircle,
  X, 
  Plus, 
  Truck, 
  Search, 
  Upload, 
  Building2, 
  Link as LinkIcon,
  FileUp,
  Check
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { useOnClickOutside } from "@/hooks/use-on-click-outside";
import { VehicleTypeImage } from "@/components/ui/vehicle-type-image";

// Tipos de carga por categoria
const NON_FLATBED_CARGO_TYPES = [
  { value: "dry_cargo", label: "Carga Seca" },
  { value: "liquid_cargo", label: "Líquida" },
  { value: "live_cargo", label: "Viva" },
  { value: "sugar_cane", label: "Cana de Açúcar" }
];

const FLATBED_CARGO_TYPES = [
  { value: "indivisible_cargo", label: "Carga Indivisível" },
  { value: "agricultural_machinery", label: "Máquinas Agrícolas" },
  { value: "oversized", label: "SUPERDIMENSIONADA" }
];

// Limites dimensionais
const DIMENSION_LIMITS = {
  default: {
    maxLength: 30.00,
    minLength: 19.80,
    maxWidth: 2.60,
    maxHeight: 4.40
  },
  flatbed: {
    maxLength: 25.00,
    minLength: 0,
    maxWidth: 3.20,
    maxHeight: 4.95
  },
  oversized: {
    // Sem limites pré-definidos
    maxLength: 999.99,
    minLength: 0,
    maxWidth: 999.99,
    maxHeight: 999.99
  }
};

// Funções auxiliares para formatar campos de dimensão com vírgula e limites específicos
function formatNumericInput(value: string, maxDigits: number = 6): string {
  // Esta é uma função básica que apenas formata a entrada, preservando a digitação
  // e garantindo que o formato esteja correto, sem aplicar regras de negócio
  
  // Remover caracteres inválidos (manter apenas números, vírgula e ponto)
  let formattedValue = value.replace(/[^\d.,]/g, '');
  
  // Substituir ponto por vírgula para exibição
  formattedValue = formattedValue.replace(/\./g, ',');
  
  // Garantir que só tem uma vírgula
  const parts = formattedValue.split(',');
  if (parts.length > 2) {
    formattedValue = parts[0] + ',' + parts[1];
  }
  
  // Limitar a 2 casas decimais sem completar zeros à direita
  if (parts.length > 1 && parts[1].length > 2) {
    formattedValue = parts[0] + ',' + parts[1].substring(0, 2);
  }
  
  // Limitar tamanho total para evitar overflow
  if (formattedValue.length > maxDigits) {
    formattedValue = formattedValue.substring(0, maxDigits);
  }
  
  return formattedValue;
}

// Esta função completa os zeros para o formato visual final (00,00)
function formatFinalValue(value: string): string {
  if (!value) return '';
  
  // Remover qualquer caractere que não seja número, vírgula ou ponto
  let cleanValue = value.replace(/[^\d.,]/g, '');
  
  // Substituir ponto por vírgula para padronização
  cleanValue = cleanValue.replace('.', ',');
  
  // Separar parte inteira e decimal
  const parts = cleanValue.split(',');
  const integerPart = parts[0] || '0';
  
  // Se não tem parte decimal, adicionar ,00
  if (parts.length === 1) {
    return integerPart + ',00';
  }
  
  // Garantir exatamente 2 casas decimais sem arredondamento
  let decimalPart = parts[1] || '';
  
  // Truncar para exatamente 2 dígitos se tiver mais
  if (decimalPart.length > 2) {
    decimalPart = decimalPart.substring(0, 2);
  }
  
  // Completar com zeros se tiver menos de 2 dígitos
  while (decimalPart.length < 2) {
    decimalPart += '0';
  }
  
  return integerPart + ',' + decimalPart;
}

// Função para limitar comprimento (19,80 a 30,00 metros para maioria dos conjuntos)
function formatLengthInput(value: string, licenseType: string, cargoType?: string): { 
  displayValue: string; 
  numericValue: number | undefined; 
} {
  // Formatar entrada numérica padrão
  const formattedValue = formatNumericInput(value);
  
  // Converter para número para verificar limites
  const numericValue = parseFloat(formattedValue.replace(',', '.'));
  
  // Se não for um número, retornar valor formatado apenas
  if (isNaN(numericValue)) {
    return {
      displayValue: formattedValue,
      numericValue: undefined
    };
  }
  
  // Determinar limites com base no tipo de licença
  let finalValue = formattedValue;
  let finalNumeric = numericValue;
  
  // Durante a digitação, apenas verificamos limites máximos, nunca mínimos
  // para permitir que o usuário digite livremente os valores
  if (licenseType === 'flatbed') {
    // Para pranchas com carga superdimensionada, não aplicamos limite rígido
    if (cargoType === 'oversized') {
      if (numericValue > 100) {
        finalNumeric = 100;
        // Só formatamos com zeros adicionais no final da edição (onBlur)
      }
    } 
    // Para outras pranchas, limite de 25 metros
    else if (numericValue > 25) {
      finalNumeric = 25;
      // Só formatamos com zeros adicionais no final da edição (onBlur)
    }
  } 
  // Para os demais conjuntos, apenas verificar o limite máximo
  else if (numericValue > 30) {
    finalNumeric = 30;
    // Só formatamos com zeros adicionais no final da edição (onBlur)
  }
  
  return {
    displayValue: finalValue,
    numericValue: finalNumeric
  };
}

// Função para limitar largura (2,60m para conjuntos normais, 3,20m para prancha)
function formatWidthInput(value: string, licenseType: string, cargoType?: string): { 
  displayValue: string; 
  numericValue: number | undefined; 
} {
  // Formatar entrada numérica padrão
  const formattedValue = formatNumericInput(value);
  
  // Converter para número para verificar limites
  const numericValue = parseFloat(formattedValue.replace(',', '.'));
  
  // Se não for um número, retornar valor formatado apenas
  if (isNaN(numericValue)) {
    return {
      displayValue: formattedValue,
      numericValue: undefined
    };
  }
  
  // Determinar limites com base no tipo de licença
  let finalValue = formattedValue;
  let finalNumeric = numericValue;
  
  // Durante a digitação, apenas verificamos limites máximos
  if (licenseType === 'flatbed') {
    // Para pranchas com carga superdimensionada, não aplicamos limite rígido
    if (cargoType === 'oversized') {
      if (numericValue > 10) {
        finalNumeric = 10;
      }
    } 
    // Para outras pranchas, limite de 3,20 metros
    else if (numericValue > 3.20) {
      finalNumeric = 3.20;
    }
  } 
  // Para os demais conjuntos, limite de 2,60 metros
  else if (numericValue > 2.60) {
    finalNumeric = 2.60;
  }
  
  return {
    displayValue: finalValue,
    numericValue: finalNumeric
  };
}

// Função para limitar altura (4,40m para conjuntos normais, 4,95m para prancha)
function formatHeightInput(value: string, licenseType: string, cargoType?: string): { 
  displayValue: string; 
  numericValue: number | undefined; 
} {
  // Formatar entrada numérica padrão
  const formattedValue = formatNumericInput(value);
  
  // Converter para número para verificar limites
  const numericValue = parseFloat(formattedValue.replace(',', '.'));
  
  // Se não for um número, retornar valor formatado apenas
  if (isNaN(numericValue)) {
    return {
      displayValue: formattedValue,
      numericValue: undefined
    };
  }
  
  // Determinar limites com base no tipo de licença
  let finalValue = formattedValue;
  let finalNumeric = numericValue;
  
  // Durante a digitação, apenas verificamos limites máximos
  if (licenseType === 'flatbed') {
    // Para pranchas com carga superdimensionada, não aplicamos limite rígido
    if (cargoType === 'oversized') {
      if (numericValue > 10) {
        finalNumeric = 10;
      }
    } 
    // Para outras pranchas, limite de 4,95 metros
    else if (numericValue > 4.95) {
      finalNumeric = 4.95;
    }
  } 
  // Para os demais conjuntos, limite de 4,40 metros
  else if (numericValue > 4.40) {
    finalNumeric = 4.40;
  }
  
  return {
    displayValue: finalValue,
    numericValue: finalNumeric
  };
}

interface LicenseFormProps {
  draft?: LicenseRequest | null;
  onComplete: () => void;
  onCancel: () => void;
  preSelectedTransporterId?: number | null;
}

export function LicenseForm({ draft, onComplete, onCancel, preSelectedTransporterId }: LicenseFormProps) {
  const { toast } = useToast();
  const [licenseType, setLicenseType] = useState<string>(draft?.type || "");

  // Fetch vehicles for the dropdown selectors
  const { data: vehicles, isLoading: isLoadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });
  
  // Fetch transporters linked to the user
  const { data: transporters = [], isLoading: isLoadingTransporters } = useQuery<Transporter[]>({
    queryKey: ["/api/user/transporters"],
  });

  // Define filtered vehicle lists based on type
  const tractorUnits = vehicles?.filter(v => v.type === "tractor_unit") || [];
  const semiTrailers = vehicles?.filter(v => v.type === "semi_trailer") || [];
  const dollys = vehicles?.filter(v => v.type === "dolly") || [];
  const trailers = vehicles?.filter(v => v.type === "trailer") || [];
  const flatbeds = vehicles?.filter(v => v.type === "flatbed") || [];

  // Define a schema that can be validated partially (for drafts)
  const formSchema = draft?.isDraft 
    ? insertDraftLicenseSchema 
    : insertLicenseRequestSchema;

  // Usar o transportador pré-selecionado quando disponível
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: draft ? {
      type: draft.type,
      transporterId: draft.transporterId || undefined,
      mainVehiclePlate: draft.mainVehiclePlate,
      tractorUnitId: draft.tractorUnitId || undefined,
      firstTrailerId: draft.firstTrailerId || undefined,
      dollyId: draft.dollyId || undefined,
      secondTrailerId: draft.secondTrailerId || undefined,
      flatbedId: draft.flatbedId || undefined,
      length: draft.length / 100, // Convert from cm to meters for display
      width: draft.width ? draft.width / 100 : undefined, // Convert from cm to meters for display
      height: draft.height ? draft.height / 100 : undefined, // Convert from cm to meters for display
      cargoType: draft.cargoType || undefined,
      additionalPlates: draft.additionalPlates || [],
      additionalPlatesDocuments: draft.additionalPlatesDocuments || [],
      states: draft.states,
      isDraft: draft.isDraft,
      comments: draft.comments || undefined,
    } : {
      type: "",
      transporterId: preSelectedTransporterId || undefined, // Usar o transportador pré-selecionado
      mainVehiclePlate: "",
      tractorUnitId: undefined,
      firstTrailerId: undefined,
      dollyId: undefined,
      secondTrailerId: undefined,
      flatbedId: undefined,
      length: 0,
      width: undefined,
      height: undefined,
      cargoType: undefined,
      additionalPlates: [],
      states: [],
      additionalPlatesDocuments: [],
      isDraft: true,
      comments: "",
    },
  });

  // Efeito para mostrar notificação quando tiver transportador pré-selecionado
  useEffect(() => {
    if (preSelectedTransporterId && transporters && transporters.length > 0) {
      const selectedTransporter = transporters.find(t => t.id === preSelectedTransporterId);
      if (selectedTransporter) {
        toast({
          title: "Transportador selecionado",
          description: `Usando ${selectedTransporter.name} como transportador para esta solicitação`,
        });
      }
    }
  }, [preSelectedTransporterId, transporters, toast]);

  // Watch for type changes to conditionally render fields
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "type") {
        setLicenseType(value.type as string);
      }
      
      // Set main vehicle plate based on tractor unit selection
      if (name === "tractorUnitId" && value.tractorUnitId) {
        const selectedVehicle = vehicles?.find(v => v.id === value.tractorUnitId);
        if (selectedVehicle) {
          form.setValue("mainVehiclePlate", selectedVehicle.plate);
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form, vehicles]);

  // Handle form submissions
  const saveAsDraftMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertDraftLicenseSchema>) => {
      const url = draft ? `/api/licenses/drafts/${draft.id}` : '/api/licenses/drafts';
      const method = draft ? "PATCH" : "POST";
      const res = await apiRequest(method, url, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Rascunho salvo",
        description: "O rascunho da licença foi salvo com sucesso",
      });
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível salvar o rascunho",
        variant: "destructive",
      });
    },
  });

  const submitRequestMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertLicenseRequestSchema>) => {
      const url = draft ? `/api/licenses/drafts/${draft.id}/submit` : '/api/licenses';
      const method = "POST";
      const res = await apiRequest(method, url, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Solicitação enviada",
        description: "A solicitação de licença foi enviada com sucesso",
      });
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível enviar a solicitação",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Adjust length from meters to centimeters for storage
    const dataToSubmit = {
      ...values,
      length: Math.round((values.length || 0) * 100), // Convert to centimeters
      width: values.width ? Math.round(values.width * 100) : undefined, // Convert to centimeters if exists
      height: values.height ? Math.round(values.height * 100) : undefined, // Convert to centimeters if exists
    };
    
    if (values.isDraft) {
      // Cast to appropriate types to satisfy TypeScript
      saveAsDraftMutation.mutate(dataToSubmit as any);
    } else {
      // Remove isDraft from payload when submitting a license request
      const { isDraft, ...requestData } = dataToSubmit;
      submitRequestMutation.mutate(requestData as any);
    }
  };

  const handleSaveDraft = () => {
    form.setValue("isDraft", true);
    form.handleSubmit(onSubmit)();
  };

  const handleSubmitRequest = () => {
    // Prevenir múltiplos envios
    if (isProcessing) {
      toast({
        title: "Processando",
        description: "Aguarde, sua solicitação já está sendo processada...",
      });
      return;
    }
    
    // Preparar dados para envio
    try {
      // Definir que não é rascunho
      form.setValue("isDraft", false);
      
      // Obter valores do formulário
      const values = form.getValues();
      
      // Preparar dados para envio com conversão de unidades
      const dataToSubmit = {
        ...values,
        length: Math.round((values.length || 0) * 100), // Convert to centimeters
        width: values.width ? Math.round(values.width * 100) : undefined, // Convert to centimeters if exists
        height: values.height ? Math.round(values.height * 100) : undefined, // Convert to centimeters if exists
        isDraft: false
      };
      
      // Remover isDraft do payload
      const { isDraft, ...requestData } = dataToSubmit;
      
      // Mostrar toast de envio
      toast({
        title: "Enviando pedido",
        description: "Processando sua solicitação...",
      });
      
      // Enviar diretamente, evitando usar form.handleSubmit que pode falhar no modal
      console.log("Enviando dados:", requestData);
      submitRequestMutation.mutate(requestData as any);
    } catch (error) {
      console.error("Erro ao preparar envio:", error);
      toast({
        title: "Erro ao enviar",
        description: "Ocorreu um erro ao processar sua solicitação. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const isProcessing = saveAsDraftMutation.isPending || submitRequestMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
          control={form.control}
          name="transporterId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transportador</FormLabel>
              <Select 
                onValueChange={(value) => field.onChange(parseInt(value))} 
                defaultValue={field.value?.toString()}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o transportador" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isLoadingTransporters ? (
                    <SelectItem value="loading">Carregando transportadores...</SelectItem>
                  ) : transporters.length > 0 ? (
                    transporters.map((transporter) => (
                      <SelectItem key={transporter.id} value={transporter.id.toString()}>
                        {transporter.name} {transporter.documentNumber ? `- ${transporter.documentNumber}` : ''}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no_transporter">Nenhum transportador vinculado</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                Selecione o transportador para o qual esta licença será emitida.
                Caso não encontre o transportador desejado, vá para "Minhas Empresas" e vincule o transportador à sua conta.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Conjunto</FormLabel>
              <div className="flex flex-col space-y-3">
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="roadtrain_9_axles">Rodotrem 9 eixos</SelectItem>
                    <SelectItem value="bitrain_9_axles">Bitrem 9 eixos</SelectItem>
                    <SelectItem value="bitrain_7_axles">Bitrem 7 eixos</SelectItem>
                    <SelectItem value="bitrain_6_axles">Bitrem 6 eixos</SelectItem>
                    <SelectItem value="flatbed">Prancha</SelectItem>
                    <SelectItem value="romeo_and_juliet">Romeu e Julieta</SelectItem>
                  </SelectContent>
                </Select>
                
                {licenseType && (
                  <div className="p-3 border rounded-md flex flex-col items-center">
                    <VehicleTypeImage type={licenseType} iconSize={100} />
                    <p className="text-sm text-muted-foreground mt-2">
                      {licenseType === 'roadtrain_9_axles' && 'Rodotrem 9 eixos'}
                      {licenseType === 'bitrain_9_axles' && 'Bitrem 9 eixos'}
                      {licenseType === 'bitrain_7_axles' && 'Bitrem 7 eixos'}
                      {licenseType === 'bitrain_6_axles' && 'Bitrem 6 eixos'}
                      {licenseType === 'flatbed' && 'Prancha'}
                      {licenseType === 'romeo_and_juliet' && 'Romeu e Julieta'}
                    </p>
                  </div>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo de carga */}
        {licenseType && (
          <FormField
            control={form.control}
            name="cargoType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Carga</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de carga" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {licenseType === 'flatbed' ? (
                      // Opções de carga para prancha
                      FLATBED_CARGO_TYPES.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))
                    ) : (
                      // Opções de carga para outros tipos
                      NON_FLATBED_CARGO_TYPES.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs text-muted-foreground mt-1">
                  {licenseType === 'flatbed' 
                    ? 'Selecione o tipo de carga para este conjunto de prancha'
                    : 'Selecione o tipo de carga para este conjunto'
                  }
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Dynamic fields for Rodotrem 9 eixos */}
        {licenseType === 'roadtrain_9_axles' && (
          <div className="border border-gray-200 rounded-md p-4 space-y-4">
            <h3 className="font-medium text-gray-800 mb-2">Veículos do Rodotrem</h3>
            
            <FormField
              control={form.control}
              name="tractorUnitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidade Tratora</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a unidade tratora" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : tractorUnits.length > 0 ? (
                        tractorUnits.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_tractor">Nenhuma unidade tratora cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="firstTrailerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>1ª Carreta</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a 1ª carreta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : semiTrailers.length > 0 ? (
                        semiTrailers.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_trailer">Nenhuma carreta cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dollyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dolly</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o dolly" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : dollys.length > 0 ? (
                        dollys.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_dolly">Nenhum dolly cadastrado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="secondTrailerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>2ª Carreta</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a 2ª carreta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : semiTrailers.length > 0 ? (
                        semiTrailers.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_trailer">Nenhuma carreta cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Dynamic fields for Bitrems */}
        {(licenseType === 'bitrain_9_axles' || licenseType === 'bitrain_7_axles' || licenseType === 'bitrain_6_axles') && (
          <div className="border border-gray-200 rounded-md p-4 space-y-4">
            <h3 className="font-medium text-gray-800 mb-2">Veículos do Bitrem</h3>
            
            <FormField
              control={form.control}
              name="tractorUnitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidade Tratora</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a unidade tratora" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : tractorUnits.length > 0 ? (
                        tractorUnits.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_tractor">Nenhuma unidade tratora cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="firstTrailerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>1ª Carreta</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a 1ª carreta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : semiTrailers.length > 0 ? (
                        semiTrailers.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_trailer">Nenhuma carreta cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="secondTrailerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>2ª Carreta</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a 2ª carreta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : semiTrailers.length > 0 ? (
                        semiTrailers.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_trailer">Nenhuma carreta cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Dynamic fields for Prancha */}
        {licenseType === 'flatbed' && (
          <div className="border border-gray-200 rounded-md p-4 space-y-4">
            <h3 className="font-medium text-gray-800 mb-2">Veículos da Prancha</h3>
            
            <FormField
              control={form.control}
              name="tractorUnitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidade Tratora</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a unidade tratora" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : tractorUnits.length > 0 ? (
                        tractorUnits.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_tractor">Nenhuma unidade tratora cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="flatbedId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prancha</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a prancha" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : flatbeds.length > 0 ? (
                        flatbeds.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_flatbed">Nenhuma prancha cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Romeu e Julieta fields */}
        {licenseType === 'romeo_and_juliet' && (
          <div className="border border-gray-200 rounded-md p-4 space-y-4">
            <h3 className="font-medium text-gray-800 mb-2">Veículos do Romeu e Julieta</h3>
            
            <FormField
              control={form.control}
              name="tractorUnitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Caminhão</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o caminhão" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : tractorUnits
                          .filter(v => v.model?.toLowerCase().includes('caminhão'))
                          .length > 0 ? (
                        tractorUnits
                          .filter(v => v.model?.toLowerCase().includes('caminhão'))
                          .map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                              {vehicle.plate}
                            </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="no_truck">Nenhum caminhão cadastrado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Para o Romeu e Julieta, a unidade tratora deve ser um caminhão
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="firstTrailerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reboque</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o reboque" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingVehicles ? (
                        <SelectItem value="loading">Carregando...</SelectItem>
                      ) : trailers.length > 0 ? (
                        trailers.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.plate}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no_trailer">Nenhum reboque cadastrado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Para o Romeu e Julieta, o reboque deve ser do tipo "Reboque"
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Adicionar campo para placas adicionais */}
        <div className="border border-gray-200 rounded-md p-4 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-gray-800">Placas Adicionais</h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const currentPlates = form.getValues("additionalPlates") || [];
                form.setValue("additionalPlates", [...currentPlates, ""]);
              }}
              className="h-8 px-2 text-xs"
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Placa
            </Button>
          </div>
          
          <div className="space-y-3">
            {form.watch("additionalPlates")?.map((_, index) => (
              <CampoPlacaAdicional
                key={index}
                index={index}
                form={form}
                onRemove={() => {
                  const plates = [...(form.getValues("additionalPlates") || [])];
                  plates.splice(index, 1);
                  form.setValue("additionalPlates", plates);
                }}
              />
            ))}
          </div>

          {form.watch("additionalPlates")?.length === 0 && (
            <div className="text-sm text-gray-500 italic">
              Nenhuma placa adicional. Clique no botão acima para adicionar.
            </div>
          )}
        </div>

        <FormField
          control={form.control}
          name="length"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Comprimento (metros)</FormLabel>
              <FormControl>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder="Ex.: 19,80" 
                  {...field}
                  className="mobile-input h-10"
                  value={
                    typeof field.value === 'number' 
                      ? field.value.toString().replace('.', ',') 
                      : field.value || ''
                  }
                  onFocus={(e) => {
                    // Adicionar a classe ao body quando o input receber foco
                    document.body.classList.add('keyboard-active');
                    // Rolar a página para cima quando o input receber foco
                    window.scrollTo(0, 0);
                    // Adicionar pequeno atraso para garantir que o teclado apareça antes de reposicionar
                    setTimeout(() => {
                      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                  }}
                  onBlur={(e) => {
                    // Remover a classe do body quando o input perder o foco
                    document.body.classList.remove('keyboard-active');
                    
                    // Formatar o valor final com 2 casas decimais obrigatórias
                    if (e.target.value) {
                      // Garantir formatação com 2 casas decimais ao sair do campo
                      const formattedValue = formatFinalValue(e.target.value);
                      e.target.value = formattedValue;
                      
                      // Converter para valor numérico exato para o form
                      const parts = formattedValue.split(',');
                      const intPart = parseInt(parts[0]);
                      const decimalPart = parts[1] || "00";
                      
                      // Converter para número com precisão exata (sem arredondamento)
                      const numericValue = (intPart * 100 + parseInt(decimalPart.padEnd(2, "0").substring(0, 2))) / 100;
                      
                      if (!isNaN(numericValue)) {
                        field.onChange(numericValue);
                      }
                    }
                  }}
                  onChange={(e) => {
                    // Usar a função específica para comprimento
                    const { displayValue, numericValue } = formatLengthInput(
                      e.target.value,
                      licenseType,
                      form.watch('cargoType')
                    );
                    
                    // Atualizar campo visual
                    e.target.value = displayValue;
                    
                    // Atualizar valor numérico no form se válido
                    if (numericValue !== undefined) {
                      field.onChange(numericValue);
                    }
                  }}
                />
              </FormControl>
              <FormDescription>
                {licenseType === 'flatbed' ? (
                  form.watch('cargoType') === 'oversized' ? (
                    "Para carga SUPERDIMENSIONADA, não há limite pré-definido de comprimento."
                  ) : (
                    "Para prancha, o comprimento máximo é de 25,00 metros."
                  )
                ) : (
                  "O comprimento deve ser de no mínimo 19,80 metros e no máximo 30,00 metros."
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Dimensões adicionais para prancha */}
        {(licenseType === 'flatbed') && (
          <>
            <FormField
              control={form.control}
              name="width"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">Largura (metros)</FormLabel>
                  <FormControl>
                    <Input 
                      type="text" 
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      placeholder="Ex.: 2,60" 
                      {...field}
                      className="mobile-input h-10"
                      value={
                        typeof field.value === 'number' 
                          ? field.value.toString().replace('.', ',') 
                          : field.value || ''
                      }
                      onFocus={(e) => {
                        document.body.classList.add('keyboard-active');
                        window.scrollTo(0, 0);
                        setTimeout(() => {
                          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                      }}
                      onBlur={(e) => {
                        document.body.classList.remove('keyboard-active');
                        
                        if (e.target.value) {
                          const formattedValue = formatFinalValue(e.target.value);
                          e.target.value = formattedValue;
                          
                          const parts = formattedValue.split(',');
                          const intPart = parseInt(parts[0]);
                          const decimalPart = parts[1] || "00";
                          
                          const numericValue = (intPart * 100 + parseInt(decimalPart.padEnd(2, "0").substring(0, 2))) / 100;
                          
                          if (!isNaN(numericValue)) {
                            field.onChange(numericValue);
                          }
                        }
                      }}
                      onChange={(e) => {
                        // Usar a função específica para largura
                        const { displayValue, numericValue } = formatWidthInput(
                          e.target.value,
                          licenseType,
                          form.watch('cargoType')
                        );
                        
                        // Atualizar campo visual
                        e.target.value = displayValue;
                        
                        // Atualizar valor numérico no form se válido
                        if (numericValue !== undefined) {
                          field.onChange(numericValue);
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {form.watch('cargoType') === 'oversized' ? (
                      "Para carga SUPERDIMENSIONADA, não há limite pré-definido de largura."
                    ) : (
                      "Para prancha, a largura máxima é de 3,20 metros."
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="height"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">Altura (metros)</FormLabel>
                  <FormControl>
                    <Input 
                      type="text" 
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      placeholder="Ex.: 4,40" 
                      {...field}
                      className="mobile-input h-10"
                      value={
                        typeof field.value === 'number' 
                          ? field.value.toString().replace('.', ',') 
                          : field.value || ''
                      }
                      onFocus={(e) => {
                        document.body.classList.add('keyboard-active');
                        window.scrollTo(0, 0);
                        setTimeout(() => {
                          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                      }}
                      onBlur={(e) => {
                        document.body.classList.remove('keyboard-active');
                        
                        if (e.target.value) {
                          const formattedValue = formatFinalValue(e.target.value);
                          e.target.value = formattedValue;
                          
                          const parts = formattedValue.split(',');
                          const intPart = parseInt(parts[0]);
                          const decimalPart = parts[1] || "00";
                          
                          const numericValue = (intPart * 100 + parseInt(decimalPart.padEnd(2, "0").substring(0, 2))) / 100;
                          
                          if (!isNaN(numericValue)) {
                            field.onChange(numericValue);
                          }
                        }
                      }}
                      onChange={(e) => {
                        // Usar a função específica para altura
                        const { displayValue, numericValue } = formatHeightInput(
                          e.target.value,
                          licenseType,
                          form.watch('cargoType')
                        );
                        
                        // Atualizar campo visual
                        e.target.value = displayValue;
                        
                        // Atualizar valor numérico no form se válido
                        if (numericValue !== undefined) {
                          field.onChange(numericValue);
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {form.watch('cargoType') === 'oversized' ? (
                      "Para carga SUPERDIMENSIONADA, não há limite pré-definido de altura."
                    ) : (
                      "Para prancha, a altura máxima é de 4,95 metros."
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="states"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel>Estados</FormLabel>
                <FormDescription>
                  Selecione os estados para os quais a licença será solicitada
                </FormDescription>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {Object.entries(brazilianStates).map(([state, label]) => (
                  <FormField
                    key={state}
                    control={form.control}
                    name="states"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={state}
                          className="flex flex-row items-start space-x-3 space-y-0 p-2 border rounded-md"
                        >
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(state)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...field.value, state])
                                  : field.onChange(
                                      field.value?.filter(
                                        (value) => value !== state
                                      )
                                    );
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">
                            {typeof label === 'string' ? label : state}
                          </FormLabel>
                        </FormItem>
                      );
                    }}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="comments"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Insira aqui quaisquer observações relevantes para esta solicitação"
                  className="resize-y"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                Informações adicionais para o órgão que irá analisar sua solicitação
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0 sm:space-x-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="w-full sm:w-auto order-3 sm:order-1"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isProcessing}
            className="border-yellow-500 text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50 w-full sm:w-auto order-2"
          >
            {saveAsDraftMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Rascunho
          </Button>
          <Button
            type="button"
            onClick={handleSubmitRequest}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto order-1 sm:order-3"
          >
            {submitRequestMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Pedido
          </Button>
        </div>
      </form>
    </Form>
  );
}