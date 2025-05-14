import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DimensionField } from "./dimension-field";
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
import { VehicleSelectCard } from "./vehicle-select-card";
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
  Check,
  Send
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LicenseFormProps {
  draft?: LicenseRequest | null;
  onComplete: () => void;
  onCancel: () => void;
  preSelectedTransporterId?: number | null;
}

// Função para submeter uma renovação
export async function submitRenewalRequest(draftId: number, formData: any) {
  try {
    console.log("Processando envio de renovação com ID:", draftId);
    
    // Garantir valores para campos essenciais
    const requestData = { ...formData };
    
    if (!requestData.cargoType) {
      requestData.cargoType = requestData.type === 'flatbed' ? 'indivisible_cargo' : 'dry_cargo';
    }
    
    // --- CONVERSÃO DE DIMENSÕES ---
    // Primeiro: garantir valores padrão se não existirem
    if (!requestData.length) requestData.length = 25; // 25 metros
    if (!requestData.width) requestData.width = 2.6;  // 2.6 metros
    if (!requestData.height) requestData.height = 4.4; // 4.4 metros
    
    console.log("[RENOVAÇÃO_INICIO] Dimensões originais:", {
      length: requestData.length,
      width: requestData.width,
      height: requestData.height,
      "tipos": {
        length: typeof requestData.length,
        width: typeof requestData.width,
        height: typeof requestData.height,
      }
    });
    
    // Segundo: verificar se as dimensões estão em metros (valor < 100) e converter para centímetros
    // Mantendo o tipo float para preservar as casas decimais
    
    // Comprimento
    if (typeof requestData.length === 'number' && requestData.length < 100) {
      requestData.length = requestData.length * 100;
    }
    
    // Largura
    if (typeof requestData.width === 'number' && requestData.width < 100) {
      requestData.width = requestData.width * 100;
    }
    
    // Altura
    if (typeof requestData.height === 'number' && requestData.height < 100) {
      requestData.height = requestData.height * 100;
    }
    
    // Transformar em request normal (não draft)
    requestData.isDraft = false;
    
    console.log("[RENOVAÇÃO_FINAL] Dimensões convertidas para centímetros:", {
      length: requestData.length,
      width: requestData.width,
      height: requestData.height
    });
    
    console.log("Dados da renovação:", JSON.stringify(requestData));
    
    // Criar nova licença (contornando o endpoint de submit)
    const url = '/api/licenses';
    const response = await fetch(`${import.meta.env.VITE_API_URL || ''}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        ...requestData,
        draftToDeleteId: draftId // Para que o backend possa excluir o rascunho após criar
      })
    });
    
    // Verificar se há resposta de erro do servidor
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `Erro ao processar renovação: ${response.status} ${response.statusText}` }));
      throw new Error(errorData.message || `Erro ao processar renovação: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Invalidar cache
    queryClient.invalidateQueries({ queryKey: ['/api/licenses'] });
    queryClient.invalidateQueries({ queryKey: ['/api/licenses/drafts'] });
    
    return data;
  } catch (error) {
    console.error("Erro ao submeter renovação:", error);
    throw error;
  }
}

// Função para submeter um rascunho diretamente (pode ser chamada de fora do componente)
export async function submitDraftDirectly(draftId: number, formData?: any) {
  try {
    // Se temos dados de formulário e comentários, verificar se é renovação
    const isRenewal = formData?.comments && 
                      typeof formData.comments === 'string' && 
                      formData.comments.toLowerCase().includes('renovação');
    
    console.log(`submitDraftDirectly - É renovação? ${isRenewal ? 'SIM' : 'NÃO'}`);
    
    // Tratamento especial para renovações
    if (isRenewal && formData) {
      // Usar função dedicada para renovações
      return await submitRenewalRequest(draftId, formData);
    } else {
      // Caminho normal para rascunhos que não são renovações
      const url = `/api/licenses/drafts/${draftId}/submit`;
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      // Verificar se há resposta de erro do servidor
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro ao enviar rascunho: ${response.status} ${response.statusText}` }));
        throw new Error(errorData.message || `Erro ao enviar rascunho: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Invalidar cache
      queryClient.invalidateQueries({ queryKey: ['/api/licenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/licenses/drafts'] });
      
      return data;
    }
  } catch (error) {
    console.error("Erro ao submeter rascunho diretamente:", error);
    throw error;
  }
}

export function LicenseForm({ draft, onComplete, onCancel, preSelectedTransporterId }: LicenseFormProps) {
  const { toast } = useToast();
  const [licenseType, setLicenseType] = useState<string>(draft?.type || "");
  const [cargoType, setCargoType] = useState<string>("");
  const [showVehicleDialog, setShowVehicleDialog] = useState(false);
  const [showRequiredFieldsWarning, setShowRequiredFieldsWarning] = useState(false);

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
  const trucks = vehicles?.filter(v => v.type === "truck") || [];
  const semiTrailers = vehicles?.filter(v => v.type === "semi_trailer") || [];
  const trailers = vehicles?.filter(v => v.type === "trailer") || [];
  const dollys = vehicles?.filter(v => v.type === "dolly") || [];
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
      additionalPlates: draft.additionalPlates || [],
      additionalPlatesDocuments: draft.additionalPlatesDocuments || [],
      states: draft.states,
      isDraft: draft.isDraft,
      comments: draft.comments || undefined,
      cargoType: draft.cargoType as any || undefined, // Usar o tipo de carga do rascunho ou undefined (usando 'as any' para evitar erro de tipo)
    } : {
      type: "",
      transporterId: preSelectedTransporterId || undefined, // Usar o transportador pré-selecionado
      mainVehiclePlate: "",
      tractorUnitId: undefined,
      firstTrailerId: undefined,
      dollyId: undefined,
      secondTrailerId: undefined,
      flatbedId: undefined,
      length: undefined, // Valor não preenchido inicialmente
      width: undefined,
      height: undefined,
      additionalPlates: [],
      states: [],
      additionalPlatesDocuments: [],
      isDraft: true,
      comments: "",
      cargoType: undefined as any, // Inicializar como undefined para validação de formulário
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
        
        // Reset cargo type when changing license type
        form.setValue("cargoType", undefined);
        setCargoType("");
      }
      
      if (name === "cargoType") {
        setCargoType(value.cargoType as string);
      }
      
      // Set main vehicle plate based on tractor unit selection
      if (name === "tractorUnitId" && value.tractorUnitId) {
        const selectedVehicle = vehicles?.find(v => v.id === value.tractorUnitId);
        if (selectedVehicle) {
          form.setValue("mainVehiclePlate", selectedVehicle.plate);
        }
      }
      
      // Apply dynamic validation based on license type and cargo type
      const currentType = value.type as string;
      const currentCargoType = value.cargoType as string;
      
      // Ajustar validações de dimensões com base no tipo de conjunto e carga
      if (currentType && (name === "type" || name === "cargoType" || name === "length" || name === "width" || name === "height")) {
        let limits = DIMENSION_LIMITS.default;
        
        if (currentType === 'flatbed') {
          limits = currentCargoType === 'oversized' 
            ? DIMENSION_LIMITS.oversized 
            : DIMENSION_LIMITS.flatbed;
        }
        
        // Para conjuntos que não são prancha, forçar os valores padrão de largura e altura
        if (currentType !== 'flatbed' && name === "type") {
          form.setValue('width', 2.6);  // Largura fixa de 2,60m
          form.setValue('height', 4.4); // Altura fixa de 4,40m
        }
        
        // Aplicar validações de comprimento específicas
        if (currentType === 'flatbed' && currentCargoType === 'oversized') {
          // Sem limites para carga superdimensionada
          form.clearErrors('length');
          form.clearErrors('width');
          form.clearErrors('height');
        } else {
          // Verificar e validar dimensões atuais
          const currentLength = form.getValues('length');
          const currentWidth = form.getValues('width');
          const currentHeight = form.getValues('height');
          
          // Validar comprimento se estiver definido
          if (currentLength !== undefined) {
            if (currentType === 'flatbed') {
              // Para pranchas, a restrição de comprimento mínimo não se aplica
              if (currentLength > limits.maxLength) {
                form.setError('length', { 
                  type: 'manual', 
                  message: `O comprimento máximo para este tipo de conjunto é ${limits.maxLength.toFixed(2).replace('.', ',')} metros` 
                });
              } else {
                form.clearErrors('length');
              }
            } else {
              // Para outros tipos, validar tanto mínimo quanto máximo
              if (currentLength < limits.minLength) {
                form.setError('length', { 
                  type: 'manual', 
                  message: `O comprimento mínimo para este tipo de conjunto é ${limits.minLength.toFixed(2).replace('.', ',')} metros` 
                });
              } else if (currentLength > limits.maxLength) {
                form.setError('length', { 
                  type: 'manual', 
                  message: `O comprimento máximo para este tipo de conjunto é ${limits.maxLength.toFixed(2).replace('.', ',')} metros` 
                });
              } else {
                form.clearErrors('length');
              }
            }
          }
          
          // Validar largura se estiver definida
          if (currentWidth !== undefined) {
            if (currentWidth > limits.maxWidth) {
              form.setError('width', { 
                type: 'manual', 
                message: `A largura máxima para este tipo de conjunto é ${limits.maxWidth.toFixed(2).replace('.', ',')} metros` 
              });
            } else {
              form.clearErrors('width');
            }
          }
          
          // Validar altura se estiver definida
          if (currentHeight !== undefined) {
            if (currentHeight > limits.maxHeight) {
              form.setError('height', { 
                type: 'manual', 
                message: `A altura máxima para este tipo de conjunto é ${limits.maxHeight.toFixed(2).replace('.', ',')} metros` 
              });
            } else {
              form.clearErrors('height');
            }
          }
        }
        
        // Atualizar textos descritivos para as dimensões
        const lengthDesc = currentType === 'flatbed' && currentCargoType === 'oversized'
          ? 'Digite o comprimento em metros (sem limite para carga superdimensionada)'
          : currentType === 'flatbed'
            ? `Digite o comprimento em metros (max: ${limits.maxLength.toFixed(2).replace('.', ',')})`
            : `Digite o comprimento em metros (min: ${limits.minLength.toFixed(2).replace('.', ',')} - max: ${limits.maxLength.toFixed(2).replace('.', ',')})`;
            
        const widthDesc = currentType === 'flatbed' && currentCargoType === 'oversized'
          ? 'Informe a largura total do conjunto em metros (sem limite para carga superdimensionada)'
          : currentType === 'flatbed'
            ? `Informe a largura total do conjunto em metros (max: ${limits.maxWidth.toFixed(2).replace('.', ',')})`
            : `Informe a largura total do conjunto em metros (max: ${limits.maxWidth.toFixed(2).replace('.', ',')})`;
            
        const heightDesc = currentType === 'flatbed' && currentCargoType === 'oversized'
          ? 'Informe a altura total do conjunto em metros (sem limite para carga superdimensionada)'
          : currentType === 'flatbed'
            ? `Informe a altura total do conjunto em metros (max: ${limits.maxHeight.toFixed(2).replace('.', ',')})`
            : `Informe a altura total do conjunto em metros (max: ${limits.maxHeight.toFixed(2).replace('.', ',')})`;
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
    // Adjust dimensions from meters to centimeters for storage
    // Mantendo os valores como float (sem arredondar)
    const dataToSubmit = {
      ...values,
      length: (values.length || 0) * 100, // Convert to centimeters
      width: values.width ? values.width * 100 : undefined, // Convert to centimeters if exists
      height: values.height ? values.height * 100 : undefined, // Convert to centimeters if exists
    };
    
    if (values.isDraft) {
      // Cast to appropriate types to satisfy TypeScript
      saveAsDraftMutation.mutate(dataToSubmit as any);
    } else {
      // Remove isDraft from payload when submitting a license request
      const { isDraft, ...requestData } = dataToSubmit;
      // Log para depuração
      console.log('Enviando requisição:', requestData);
      
      // Garantir que o campo cargoType é válido antes de enviar
      if (!requestData.cargoType) {
        console.error('Erro: cargoType não definido no envio final');
        toast({
          title: "Erro de validação",
          description: "Por favor, selecione um tipo de carga para continuar",
          variant: "destructive",
        });
        return;
      }
      
      // Verificar se é um pedido de renovação
      const isRenewal = requestData.comments && 
                      typeof requestData.comments === 'string' && 
                      requestData.comments.toLowerCase().includes('renovação');
                      
      console.log(`Verificação de renovação: ${isRenewal ? 'É renovação' : 'Não é renovação'}`);
                      
      // Abordagem especial para renovações para evitar problemas
      if (isRenewal && draft?.id) {
        console.log("Usando abordagem direta para renovação de licença");
        
        // Para renovações, não aplicamos conversão para centímetros no cliente
        // O servidor fará essa conversão automaticamente ao detectar renovação
        // Garantimos apenas que temos valores válidos para campos obrigatórios
        
        const isPrancha = requestData.type === 'flatbed';
        if (!requestData.cargoType) {
          requestData.cargoType = isPrancha ? 'indivisible_cargo' : 'dry_cargo';
        }
        
        // Definir valores com base no tipo de conjunto (em metros para renovações)
        if (!requestData.length) {
          requestData.length = isPrancha ? 25 : 30; // Em metros para renovação
        }
        
        // Para conjuntos que não são prancha, forçar sempre 2,60m de largura
        if (isPrancha && !requestData.width) {
          requestData.width = 3.2; // Em metros para renovação
        } else if (!isPrancha) {
          requestData.width = 2.6; // Em metros para renovação
        }
        
        // Para conjuntos que não são prancha, forçar sempre 4,40m de altura
        if (isPrancha && !requestData.height) {
          requestData.height = 4.95; // Em metros para renovação
        } else if (!isPrancha) {
          requestData.height = 4.4; // Em metros para renovação
        }
        
        // Criar uma nova licença (não usando o endpoint de submit do rascunho)
        const url = '/api/licenses';
        const method = "POST";
        
        // IMPORTANTE: Não converter dimensões para renovações
        // Apenas logar os valores que serão enviados sem alteração
        console.log(`[RENOVAÇÃO DIRETA] Mantendo dimensões originais sem conversão:`);
        console.log(`  Comprimento: ${requestData.length}m`);
        console.log(`  Largura: ${requestData.width}m`);
        console.log(`  Altura: ${requestData.height}m`);
        
        // Incluir o ID do rascunho a ser excluído após sucesso
        const payload = {
          ...requestData,
          isRenewal: true, // Forçar flag de renovação
          draftToDeleteId: draft.id // Campo adicional para que o backend remova o rascunho após criar a licença
        };
        
        console.log("[RENOVAÇÃO] Enviando payload com dimensões convertidas:", payload);
        
        // Enviar usando o apiRequest em vez de fetch direto (evita uso de await no escopo do componente)
        apiRequest(method, url, payload)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Erro ao processar renovação: ${response.status} ${response.statusText}`);
            }
            return response.json();
          })
          .then(data => {
            // Notificar sucesso
            toast({
              title: "Renovação enviada",
              description: "A solicitação de renovação de licença foi enviada com sucesso",
            });
            
            // Invalidar cache e completar
            queryClient.invalidateQueries({ queryKey: ['/api/licenses'] });
            queryClient.invalidateQueries({ queryKey: ['/api/licenses/drafts'] });
            onComplete();
          })
          .catch(error => {
            console.error("Erro ao processar renovação:", error);
            toast({
              title: "Erro na renovação",
              description: error instanceof Error ? error.message : "Erro ao processar renovação",
              variant: "destructive",
            });
          });
      } else {
        // Para solicitações normais, usar o fluxo padrão
        console.log("Usando fluxo padrão para envio de solicitação");
        submitRequestMutation.mutate(requestData as any);
      }
    }
  };

  // Função de validação do formulário integrada diretamente ao handleSubmitRequest

  const handleSaveDraft = () => {
    form.setValue("isDraft", true);
    
    // Verificar se é uma renovação para converter unidades antes de salvar
    const values = form.getValues();
    const isRenewal = values.comments && typeof values.comments === 'string' && 
                      values.comments.toLowerCase().includes('renovação');
    
    if (isRenewal) {
      console.log("[RENOVAÇÃO] Detectada em salvamento de rascunho");
      
      // Converter medidas de metros para centímetros, se necessário
      if (values.length && values.length < 100) {
        const lengthInCm = values.length * 100;
        console.log(`[RENOVAÇÃO] Convertendo comprimento de ${values.length}m para ${lengthInCm}cm`);
        form.setValue('length', lengthInCm);
      }
      
      if (values.width && values.width < 100) {
        const widthInCm = values.width * 100;
        console.log(`[RENOVAÇÃO] Convertendo largura de ${values.width}m para ${widthInCm}cm`);
        form.setValue('width', widthInCm);
      }
      
      if (values.height && values.height < 100) {
        const heightInCm = values.height * 100;
        console.log(`[RENOVAÇÃO] Convertendo altura de ${values.height}m para ${heightInCm}cm`);
        form.setValue('height', heightInCm);
      }
    }
    
    form.handleSubmit(onSubmit)();
  };

  const handleSubmitRequest = async () => {
    // Obter valores do formulário para verificação
    const values = form.getValues();
    
    // Verificar se é um pedido de renovação
    const isRenewal = values.comments && 
                     typeof values.comments === 'string' && 
                     values.comments.toLowerCase().includes('renovação');
    
    console.log(`É pedido de renovação? ${isRenewal ? 'SIM' : 'NÃO'}`);
    
    // Se for renovação, adicionar campos adicionais para garantir validade
    if (isRenewal) {
      // Para renovações, apenas marcar como renovação sem fazer validações ou conversões
      console.log('[RENOVAÇÃO] Detectada - pulando validações e conversões conforme solicitado');
      values.skipDimensionValidation = true; // Flag para pular validações
      values.isRenewal = true; // Indicar que é renovação
      
      // Atualizar o formulário com os valores ajustados
      form.setValue('length', values.length);
      form.setValue('width', values.width);
      form.setValue('height', values.height);
      form.setValue('cargoType', values.cargoType as any);
      
      // Para renovações, usar nossa função específica quando for um draft existente
      if (draft && draft.id) {
        // Validar campos antes de enviar
        const isValid = await validateFields();
        if (!isValid) return;
        
        try {
          // Usar a função específica para renovações
          await submitRenewalRequest(draft.id, values);
          
          toast({
            title: "Renovação enviada com sucesso",
            description: "O pedido de renovação foi enviado para análise",
            variant: "success",
          });
          
          // Chamar onComplete para fechar o modal e atualizar a lista
          onComplete();
          return; // Sair da função aqui para não executar o restante
        } catch (error) {
          console.error("Erro ao enviar renovação:", error);
          toast({
            title: "Erro ao enviar renovação",
            description: error instanceof Error ? error.message : "Ocorreu um erro ao enviar a renovação",
            variant: "destructive",
          });
          return; // Sair da função em caso de erro
        }
      }
    }
    
    // Usar a nova função de validação assíncrona para verificar todos os campos
    const isValid = await validateFields();
    if (!isValid) return;
    
    // Validar dimensões
    validateDimensions(values);
    
    // Atualizar o valor isDraft para false e submeter
    form.setValue("isDraft", false);
    form.handleSubmit(onSubmit)();
  };
  
  // Função para submeter um rascunho existente diretamente
  const handleSubmitDraftDirectly = async () => {
    if (!draft || !draft.id) {
      toast({
        title: "Erro",
        description: "Não é possível enviar um rascunho que ainda não foi salvo",
        variant: "destructive",
      });
      return;
    }
    
    // Obter valores do formulário para verificação
    const values = form.getValues();
    
    // Verificar se é um pedido de renovação
    const isRenewal = values.comments && 
                     typeof values.comments === 'string' && 
                     values.comments.toLowerCase().includes('renovação');
    
    console.log(`É pedido de renovação? ${isRenewal ? 'SIM' : 'NÃO'}`);
    
    // Preparar valores para envio
    if (isRenewal) {
      // Garantir que dimensões e tipo de carga estão preenchidos
      if (!values.length) {
        values.length = 25; // 25m
        form.setValue('length', values.length);
      }
      if (!values.width) {
        values.width = 2.6;  // 2.6m
        form.setValue('width', values.width);
      }
      if (!values.height) {
        values.height = 4.4; // 4.4m
        form.setValue('height', values.height);
      }
      if (!values.cargoType) {
        values.cargoType = values.type === 'flatbed' ? 'indivisible_cargo' : 'dry_cargo';
        form.setValue('cargoType', values.cargoType as any);
      }
      
      // Forçar conversão de metros para centímetros apenas para o envio
      // Manter os valores originais no formulário (em metros)
      const valuesOriginal = { ...values };
      
      // Converter para centímetros diretamente nos valores, mantendo o tipo float
      if (typeof values.length === 'number' && values.length < 100) {
        values.length = values.length * 100;
      }
      
      if (typeof values.width === 'number' && values.width < 100) {
        values.width = values.width * 100;
      }
      
      if (typeof values.height === 'number' && values.height < 100) {
        values.height = values.height * 100;
      }
      
      console.log('[RENOVAÇÃO] Valores originais (metros):', {
        length: valuesOriginal.length,
        width: valuesOriginal.width,
        height: valuesOriginal.height,
      });
      
      console.log('[RENOVAÇÃO] Valores convertidos (centímetros):', {
        length: values.length,
        width: values.width,
        height: values.height,
      });
    }
    
    // Validar campos antes de enviar
    const isValid = await validateFields();
    if (!isValid) return;
    
    try {
      if (isRenewal) {
        // Usar função específica para renovações
        await submitRenewalRequest(draft.id, values);
      } else {
        // Usar função direta para rascunhos comuns (evitar recursão)
        const url = `/api/licenses/drafts/${draft.id}/submit`;
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}${url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: `Erro ao enviar rascunho: ${response.status} ${response.statusText}` }));
          throw new Error(errorData.message || `Erro ao enviar rascunho: ${response.status} ${response.statusText}`);
        }
        
        await response.json();
        
        // Invalidar cache
        queryClient.invalidateQueries({ queryKey: ['/api/licenses'] });
        queryClient.invalidateQueries({ queryKey: ['/api/licenses/drafts'] });
      }
      
      toast({
        title: isRenewal ? "Renovação enviada com sucesso" : "Rascunho enviado com sucesso",
        description: isRenewal 
          ? "O pedido de renovação foi enviado para análise" 
          : "O pedido de licença foi enviado para análise",
        variant: "success",
      });
      
      // Chamar onComplete para fechar o modal e atualizar a lista
      onComplete();
    } catch (error) {
      console.error("Erro ao submeter rascunho:", error);
      toast({
        title: "Erro ao enviar rascunho",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao enviar o rascunho",
        variant: "destructive",
      });
    }
  };
  
  // Verificar se uma placa está cadastrada no sistema (função auxiliar)
  const verifyPlateRegistered = async (plate: string): Promise<boolean> => {
    try {
      // Ignorar placas vazias
      if (!plate || plate.trim() === '') return true;
      
      console.log(`Buscando veículo com placa: ${plate}`);
      const response = await fetch(`/api/public/vehicle-by-plate/${plate}`);
      
      if (response.status === 404) {
        console.log(`Resposta para ${plate}: Veículo não encontrado`);
        return false;
      }
      
      if (!response.ok) {
        console.error(`Erro ao verificar placa ${plate}: ${response.statusText}`);
        return false;
      }
      
      const data = await response.json();
      console.log(`Resposta para ${plate}:`, data);
      return true;
    } catch (error) {
      console.error(`Erro ao verificar placa ${plate}:`, error);
      return false;
    }
  };
  
  // Verificar campos básicos no handleSubmitRequest
  const validateFields = async () => {
    const values = form.getValues();
    const missingFields = [];
    
    if (!values.type) missingFields.push("Tipo de Conjunto");
    if (!values.transporterId) missingFields.push("Transportador");
    
    // Verificação especial para o tipo de carga
    if (!values.cargoType) {
      missingFields.push("Tipo de Carga");
      
      // Definir o campo como erro no formulário
      form.setError('cargoType', { 
        type: 'manual', 
        message: 'Selecione um tipo de carga para continuar' 
      });
      
      // Se o tipo de licença estiver definido, fazer foco na seção de carga
      if (values.type) {
        // Destacar visualmente a seção de carga
        const cargoTypeSection = document.getElementById('cargo-type-section');
        if (cargoTypeSection) {
          cargoTypeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Adicionar classe para destacar o campo com erro
          cargoTypeSection.classList.add('border-red-300', 'bg-red-50');
          setTimeout(() => {
            cargoTypeSection.classList.remove('border-red-300', 'bg-red-50');
          }, 3000);
        }
      }
    }
    
    if (!values.length) missingFields.push("Comprimento");
    if (!values.width) missingFields.push("Largura");
    if (!values.height) missingFields.push("Altura");
    if (!values.states || values.states.length === 0) missingFields.push("Estados");
    
    // Verificar veículos com base no tipo
    if (values.type === 'bitrain_9_axles' || values.type === 'bitrain_7_axles' || values.type === 'bitrain_6_axles') {
      if (!values.tractorUnitId) missingFields.push("Unidade Tratora");
      if (!values.firstTrailerId) missingFields.push("1ª Carreta");
      if (!values.secondTrailerId) missingFields.push("2ª Carreta");
    } else if (values.type === 'flatbed') {
      if (!values.flatbedId) missingFields.push("Prancha");
    } else if (values.type === 'romeo_and_juliet') {
      if (!values.tractorUnitId) missingFields.push("Caminhão");
      if (!values.firstTrailerId) missingFields.push("Reboque");
    }
    
    // Se encontrou campos faltando
    if (missingFields.length > 0) {
      // Mostrar aviso 
      setShowRequiredFieldsWarning(true);
      
      // Rolar para o topo para garantir que o usuário veja o aviso
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Construir mensagem com os campos faltantes
      const fieldsText = missingFields.join(", ");
      
      // Notificar o usuário através de toast com detalhamento
      toast({
        title: "Campos obrigatórios não preenchidos",
        description: `Por favor, preencha os seguintes campos: ${fieldsText}`,
        variant: "destructive",
      });
      
      // Registrar os valores atuais no console para debug
      console.log('Formulário incompleto:', { 
        camposFaltantes: missingFields,
        valores: values 
      });
      
      return false;
    }
    
    // Verificar se todas as placas adicionais estão cadastradas
    if (values.additionalPlates && values.additionalPlates.length > 0) {
      const notRegisteredPlates = [];
      
      for (const plate of values.additionalPlates) {
        // Ignorar placas vazias
        if (!plate || plate.trim() === '') continue;
        
        const isRegistered = await verifyPlateRegistered(plate);
        if (!isRegistered) {
          notRegisteredPlates.push(plate);
        }
      }
      
      if (notRegisteredPlates.length > 0) {
        // Formatar lista de placas para exibição
        const platesList = notRegisteredPlates.join(", ");
        
        // Notificar o usuário através de toast com detalhamento
        toast({
          title: "Placas adicionais não cadastradas",
          description: `As seguintes placas adicionais não estão cadastradas no sistema: ${platesList}. Cadastre todos os veículos antes de submeter a licença.`,
          variant: "destructive",
        });
        
        return false;
      }
    }
    
    // Se tudo estiver preenchido, continuar com a submissão
    setShowRequiredFieldsWarning(false);
    
    // Antes de enviar, garantir que o cargoType esteja definido corretamente
    // Se ainda não tiver valor, tentar usar o estado local
    if (!values.cargoType && cargoType) {
      form.setValue("cargoType", cargoType as any);
    }
    
    // Registrar para debug o valor final que será enviado
    console.log('Valores finais antes de enviar:', form.getValues());
    
    form.setValue("isDraft", false);
    form.handleSubmit(onSubmit)();
  };

  // Função para validar dimensões com base no tipo de licença e carga
  const validateDimensions = (values: any) => {
    // Verificar se é um pedido de renovação
    const isRenewal = values.comments && 
                      typeof values.comments === 'string' && 
                      values.comments.toLowerCase().includes('renovação');
    
    // Para renovações, não aplicamos validação dimensional - NUNCA
    if (isRenewal || values.skipDimensionValidation) {
      console.log("[RENOVAÇÃO] Pulando validação dimensional conforme solicitado explicitamente");
      return { isValid: true, errors: [] };
    }
    
    // Obter o tipo de conjunto e de carga
    const licenseType = values.type || 'default';
    const cargoType = values.cargoType;
    
    // Verificar e converter valores de dimensão se necessário
    // Se os valores estiverem em centímetros (acima de 100), converter para metros
    const length = Number(values.length);
    const width = Number(values.width);
    const height = Number(values.height);
    
    console.log(`Validando comprimento:`, length, `tipo:`, typeof length);
    console.log(`Valor em metros:`, length, `Está em centímetros:`, length > 100);
    
    console.log(`Validando largura:`, width, `tipo:`, typeof width);
    console.log(`Largura em metros:`, width, `Está em centímetros:`, width > 100);
    
    console.log(`Validando altura:`, height, `tipo:`, typeof height);
    console.log(`Altura em metros:`, height, `Está em centímetros:`, height > 100);
    
    // Determinar quais limites usar com base no tipo
    let limits;
    
    if (licenseType === 'flatbed') {
      // Para pranchas, usar limite específico
      limits = DIMENSION_LIMITS.flatbed;
    } else {
      // Para outros tipos, usar limite padrão
      limits = DIMENSION_LIMITS.default;
    }
    
    // Para carga SUPERDIMENSIONADA, não há limites
    if (cargoType === 'oversized') {
      limits = DIMENSION_LIMITS.oversized;
    }
    
    // Ajustar os valores no formulário se necessário (conversão de cm para m)
    if (length > 100) {
      const convertedLength = length / 100;
      form.setValue('length', convertedLength);
      console.log(`Convertendo comprimento de ${length}cm para ${convertedLength}m`);
    }
    
    if (width > 100) {
      const convertedWidth = width / 100;
      form.setValue('width', convertedWidth);
      console.log(`Convertendo largura de ${width}cm para ${convertedWidth}m`);
    }
    
    if (height > 100) {
      const convertedHeight = height / 100;
      form.setValue('height', convertedHeight);
      console.log(`Convertendo altura de ${height}cm para ${convertedHeight}m`);
    }
    
    // Validação dos limites e mensagens de aviso
    if (cargoType !== 'oversized') {
      // Só validar limites para cargas que não são superdimensionadas
      const updatedLength = Number(form.getValues('length'));
      const updatedWidth = Number(form.getValues('width'));
      const updatedHeight = Number(form.getValues('height'));
      
      if (updatedLength > limits.maxLength) {
        toast({
          title: "Aviso sobre dimensões",
          description: `O comprimento (${updatedLength}m) excede o limite máximo de ${limits.maxLength}m para este tipo de conjunto. A licença pode ser recusada.`,
          variant: "warning",
        });
      }
      
      if (updatedWidth > limits.maxWidth) {
        toast({
          title: "Aviso sobre dimensões",
          description: `A largura (${updatedWidth}m) excede o limite máximo de ${limits.maxWidth}m para este tipo de conjunto. A licença pode ser recusada.`,
          variant: "warning",
        });
      }
      
      if (updatedHeight > limits.maxHeight) {
        toast({
          title: "Aviso sobre dimensões",
          description: `A altura (${updatedHeight}m) excede o limite máximo de ${limits.maxHeight}m para este tipo de conjunto. A licença pode ser recusada.`,
          variant: "warning",
        });
      }
    }
  };

  const isProcessing = saveAsDraftMutation.isPending || submitRequestMutation.isPending;

  // Mutation para criar um novo veículo
  const createVehicleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertVehicleSchema>) => {
      const res = await apiRequest("POST", "/api/vehicles", data);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Veículo cadastrado",
        description: "O veículo foi cadastrado com sucesso",
      });
      
      // Atualizar a lista de veículos
      queryClient.invalidateQueries({
        queryKey: ["/api/vehicles"]
      });
      
      setShowVehicleDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível cadastrar o veículo",
        variant: "destructive",
      });
    },
  });
  
  // Formulário para cadastro de veículo
  const vehicleForm = useForm<z.infer<typeof insertVehicleSchema>>({
    resolver: zodResolver(insertVehicleSchema),
    defaultValues: {
      plate: "",
      type: "",
      brand: "",
      model: "",
      year: undefined,
      axleCount: undefined,
      renavam: "",
      remarks: ""
    }
  });
  
  const handleCreateVehicle = (data: z.infer<typeof insertVehicleSchema>) => {
    createVehicleMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Aviso de campos obrigatórios não preenchidos */}
        {showRequiredFieldsWarning && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded-md">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Atenção! Campos obrigatórios não preenchidos
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Os seguintes campos são obrigatórios para enviar a solicitação:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pl-5 mt-2">
                    {/* Campos básicos */}
                    {!form.getValues('type') && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                        <span>Tipo de Conjunto</span>
                      </div>
                    )}
                    {!form.getValues('transporterId') && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                        <span>Transportador</span>
                      </div>
                    )}
                    {!form.getValues('cargoType') && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                        <span>Tipo de Carga</span>
                      </div>
                    )}
                    
                    {/* Dimensões */}
                    {!form.getValues('length') && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                        <span>Comprimento</span>
                      </div>
                    )}
                    {!form.getValues('width') && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                        <span>Largura</span>
                      </div>
                    )}
                    {!form.getValues('height') && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                        <span>Altura</span>
                      </div>
                    )}
                    
                    {/* Estados */}
                    {(!form.getValues('states') || form.getValues('states').length === 0) && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                        <span>Estados</span>
                      </div>
                    )}
                    
                    {/* Veículos dependendo do tipo */}
                    {form.getValues('type') === 'bitrain_9_axles' || 
                     form.getValues('type') === 'bitrain_7_axles' || 
                     form.getValues('type') === 'bitrain_6_axles' ? (
                      <>
                        {!form.getValues('tractorUnitId') && (
                          <div className="flex items-center">
                            <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                            <span>Unidade Tratora</span>
                          </div>
                        )}
                        {!form.getValues('firstTrailerId') && (
                          <div className="flex items-center">
                            <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                            <span>1ª Carreta</span>
                          </div>
                        )}
                        {!form.getValues('secondTrailerId') && (
                          <div className="flex items-center">
                            <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                            <span>2ª Carreta</span>
                          </div>
                        )}
                      </>
                    ) : form.getValues('type') === 'flatbed' ? (
                      <>
                        {!form.getValues('flatbedId') && (
                          <div className="flex items-center">
                            <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                            <span>Prancha</span>
                          </div>
                        )}
                      </>
                    ) : form.getValues('type') === 'romeo_and_juliet' ? (
                      <>
                        {!form.getValues('tractorUnitId') && (
                          <div className="flex items-center">
                            <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                            <span>Caminhão</span>
                          </div>
                        )}
                        {!form.getValues('firstTrailerId') && (
                          <div className="flex items-center">
                            <span className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></span>
                            <span>Reboque</span>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm">
                    <span className="font-medium">Dica:</span> Preencha todos os campos acima indicados para poder enviar sua solicitação.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      
      <Dialog open={showVehicleDialog} onOpenChange={setShowVehicleDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Veículo</DialogTitle>
            <DialogDescription>
              Preencha as informações do veículo para adicioná-lo ao sistema
            </DialogDescription>
          </DialogHeader>
          
          <Form {...vehicleForm}>
            <form onSubmit={vehicleForm.handleSubmit(handleCreateVehicle)} className="space-y-4">
              <FormField
                control={vehicleForm.control}
                name="plate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Placa</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC-1234" {...field} className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={vehicleForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Veículo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="tractor_unit">Unidade Tratora (Cavalo)</SelectItem>
                        <SelectItem value="truck">Caminhão</SelectItem>
                        <SelectItem value="semi_trailer">Semirreboque</SelectItem>
                        <SelectItem value="trailer">Reboque</SelectItem>
                        <SelectItem value="dolly">Dolly</SelectItem>
                        <SelectItem value="flatbed">Prancha</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={vehicleForm.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marca</FormLabel>
                      <FormControl>
                        <Input placeholder="Marca" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={vehicleForm.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modelo</FormLabel>
                      <FormControl>
                        <Input placeholder="Modelo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={vehicleForm.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="2023" 
                          {...field}
                          value={field.value || ''} 
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={vehicleForm.control}
                  name="axleCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade de Eixos</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="2" 
                          {...field}
                          value={field.value || ''} 
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={vehicleForm.control}
                name="renavam"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Renavam</FormLabel>
                    <FormControl>
                      <Input placeholder="Renavam" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={vehicleForm.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Observações sobre o veículo..." 
                        className="resize-none" 
                        {...field} 
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowVehicleDialog(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  disabled={createVehicleMutation.isPending}
                >
                  {createVehicleMutation.isPending && (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Cadastrar Veículo
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
        <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
            <Building2 className="mr-2 h-5 w-5" />
            Dados do Transportador
          </h3>
          
          <div className="grid grid-cols-1 gap-4">
            <FormField
              control={form.control}
              name="transporterId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">Transportador</FormLabel>
                  <div className="relative">
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 pr-10">
                          <SelectValue placeholder="Buscar transportador..." />
                          <Search className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingTransporters ? (
                          <SelectItem value="loading">
                            <div className="flex items-center space-x-2">
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              <span>Carregando transportadores...</span>
                            </div>
                          </SelectItem>
                        ) : transporters.length > 0 ? (
                          transporters.map((transporter) => (
                            <SelectItem key={transporter.id} value={transporter.id.toString()}>
                              <div className="font-medium">{transporter.name}</div>
                              {transporter.documentNumber && (
                                <div className="text-xs text-muted-foreground">{transporter.documentNumber}</div>
                              )}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no_transporter">Nenhum transportador vinculado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
            <Truck className="mr-2 h-5 w-5" />
            Tipo de Conjunto
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">Tipo de Conjunto</FormLabel>
                  <Select onValueChange={(value) => {
                    // Atualizar o tipo do conjunto
                    field.onChange(value);
                    
                    // Quando o tipo muda, resetar o valor do tipo de carga
                    // para forçar o usuário a selecionar um tipo compatível
                    if (value !== field.value) {
                      setLicenseType(value);
                      form.setValue("cargoType", undefined as any);
                      setCargoType("");
                    }
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Selecione um tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="roadtrain_9_axles">
                        <div className="flex items-center">
                          <VehicleTypeImage type="roadtrain_9_axles" className="mr-2" iconSize={24} />
                          <span>Rodotrem 9 eixos</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="bitrain_9_axles">
                        <div className="flex items-center">
                          <VehicleTypeImage type="bitrain_9_axles" className="mr-2" iconSize={24} />
                          <span>Bitrem 9 eixos</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="bitrain_7_axles">
                        <div className="flex items-center">
                          <VehicleTypeImage type="bitrain_7_axles" className="mr-2" iconSize={24} />
                          <span>Bitrem 7 eixos</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="bitrain_6_axles">
                        <div className="flex items-center">
                          <VehicleTypeImage type="bitrain_6_axles" className="mr-2" iconSize={24} />
                          <span>Bitrem 6 eixos</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="flatbed">
                        <div className="flex items-center">
                          <VehicleTypeImage type="flatbed" className="mr-2" iconSize={24} />
                          <span>Prancha</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="romeo_and_juliet">
                        <div className="flex items-center">
                          <VehicleTypeImage type="romeo_and_juliet" className="mr-2" iconSize={24} />
                          <span>Romeu e Julieta</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Campo de Tipo de Carga - varia conforme tipo de conjunto */}
            {licenseType && (
              <FormField
                control={form.control}
                name="cargoType"
                render={({ field }) => {
                  // Verificar se o campo está vazio
                  const isEmpty = !field.value; // Simplificação para checar se é falsy
                  
                  return (
                    <FormItem id="cargo-type-section">
                      <FormLabel className="text-base font-medium flex items-center">
                        Tipo de Carga
                        {isEmpty && (
                          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Obrigatório
                          </span>
                        )}
                      </FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          // Garantir que o tipo de carga seja salvo no formulário
                          field.onChange(value);
                          // Atualizar o estado local para referência também
                          setCargoType(value);
                          // Remover erros relacionados a este campo
                          form.clearErrors('cargoType');
                        }} 
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className={`h-10 ${isEmpty ? 'border-amber-500 ring-1 ring-amber-500' : ''}`}>
                            <SelectValue placeholder="Selecione o tipo de carga" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {licenseType === 'flatbed' 
                            ? FLATBED_CARGO_TYPES.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))
                            : NON_FLATBED_CARGO_TYPES.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                      
                      {isEmpty && (
                        <div className="mt-1 text-sm text-amber-600 font-medium">
                          Este campo é obrigatório. Por favor, selecione um tipo de carga.
                        </div>
                      )}
                      
                      <FormDescription className="text-xs text-muted-foreground mt-1">
                        {licenseType === 'flatbed' 
                          ? 'Selecione o tipo de carga para este conjunto de prancha'
                          : 'Selecione o tipo de carga para este conjunto'
                        }
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}

            <FormField
              control={form.control}
              name="length"
              render={({ field }) => (
                <DimensionField
                  field={field}
                  fieldType="comprimento"
                  label="Comprimento (metros)"
                  placeholder="Ex.: 19,80"
                  description={
                    licenseType === 'flatbed' && form.watch('cargoType') === 'oversized'
                      ? 'Digite o comprimento em metros (sem limite para carga superdimensionada)'
                      : licenseType === 'flatbed'
                        ? 'Digite o comprimento em metros (max: 25,00)'
                        : 'Digite o comprimento em metros (min: 19,80 - max: 30,00)'
                  }
                />
              )}
            />
            
            <FormField
              control={form.control}
              name="width"
              render={({ field }) => (
                <DimensionField
                  field={field}
                  fieldType="largura"
                  label="Largura do Conjunto (metros)"
                  placeholder="Ex.: 2,60"
                  disabled={licenseType !== 'flatbed'} // Desabilitar para conjuntos não-prancha
                  description={
                    licenseType === 'flatbed' && form.watch('cargoType') === 'oversized'
                      ? 'Informe a largura total do conjunto em metros (sem limite para carga superdimensionada)'
                      : licenseType === 'flatbed'
                        ? 'Informe a largura total do conjunto em metros (max: 3,20)'
                        : 'Largura padrão de 2,60 metros para este tipo de conjunto (não editável)'
                  }
                />
              )}
            />
            
            <FormField
              control={form.control}
              name="height"
              render={({ field }) => (
                <DimensionField
                  field={field}
                  fieldType="altura"
                  label="Altura do Conjunto (metros)"
                  placeholder="Ex.: 4,40"
                  disabled={licenseType !== 'flatbed'} // Desabilitar para conjuntos não-prancha
                  description={
                    licenseType === 'flatbed' && form.watch('cargoType') === 'oversized'
                      ? 'Informe a altura total do conjunto em metros (sem limite para carga superdimensionada)'
                      : licenseType === 'flatbed'
                        ? 'Informe a altura total do conjunto em metros (max: 4,95)'
                        : 'Altura padrão de 4,40 metros para este tipo de conjunto (não editável)'
                  }
                />
              )}
            />
          </div>
        </div>

        {/* Dynamic fields for Rodotrem 9 eixos */}
        {licenseType === 'roadtrain_9_axles' && (
          <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
              <VehicleTypeImage type="roadtrain_9_axles" className="mr-2" iconSize={32} />
              Composição Principal do Rodotrem
            </h3>
            
            {/* Unidade Tratora - Esta é a unidade principal que desbloqueia a linha de frente */}
            <div className="mb-6">
              <FormField
                control={form.control}
                name="tractorUnitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Unidade Tratora (Cavalo Mecânico)</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 bg-blue-50 border-blue-200">
                          <SelectValue placeholder="Selecione a unidade tratora" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingVehicles ? (
                          <SelectItem value="loading">Carregando...</SelectItem>
                        ) : tractorUnits.length > 0 ? (
                          tractorUnits.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                              {vehicle.plate} - {vehicle.brand} {vehicle.model}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no_tractor">Nenhum cavalo mecânico cadastrado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs text-muted-foreground mt-1">
                      Esta é a unidade principal que irá puxar o conjunto
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Linha de Frente - Com destaque visual como componente principal */}
            <div className="border border-red-300 rounded-md p-4 bg-red-50 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-red-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Linha de Frente (Componentes Principais)
              </h4>
              
              {/* Sequência lógica de componentes do Rodotrem - Usando listas suspensas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="firstTrailerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">1ª Carreta</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 bg-green-50 border-green-200">
                            <SelectValue placeholder="Selecione a 1ª carreta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingVehicles ? (
                            <SelectItem value="loading">Carregando...</SelectItem>
                          ) : semiTrailers.length > 0 ? (
                            semiTrailers.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                {vehicle.plate} - {vehicle.brand} {vehicle.model}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no_semi_trailer">Nenhum semirreboque cadastrado</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-muted-foreground mt-1">
                        Primeiro semirreboque da composição
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dollyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Dolly</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 bg-amber-50 border-amber-200">
                            <SelectValue placeholder="Selecione o dolly" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingVehicles ? (
                            <SelectItem value="loading">Carregando...</SelectItem>
                          ) : dollys.length > 0 ? (
                            dollys.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                {vehicle.plate} - {vehicle.brand} {vehicle.model}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no_dolly">Nenhum dolly cadastrado</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-muted-foreground mt-1">
                        Dispositivo de acoplamento
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secondTrailerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">2ª Carreta</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 bg-purple-50 border-purple-200">
                            <SelectValue placeholder="Selecione a 2ª carreta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingVehicles ? (
                            <SelectItem value="loading">Carregando...</SelectItem>
                          ) : semiTrailers.length > 0 ? (
                            semiTrailers.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                {vehicle.plate} - {vehicle.brand} {vehicle.model}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no_semi_trailer">Nenhum semirreboque cadastrado</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-muted-foreground mt-1">
                        Segundo semirreboque da composição
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            {/* Resumo da composição */}
            <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Composição selecionada:</h4>
              <div className="flex flex-col gap-3">
                {/* Veículos principais */}
                <div className="flex flex-wrap gap-2">
                  <div className="text-xs font-medium text-gray-600 mr-1">Veículos principais:</div>
                  {form.watch("tractorUnitId") && (
                    <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Unidade Principal:</span> {
                        tractorUnits.find(v => v.id === form.watch("tractorUnitId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("firstTrailerId") && (
                    <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">1ª Carreta:</span> {
                        semiTrailers.find(v => v.id === form.watch("firstTrailerId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("dollyId") && (
                    <div className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Dolly:</span> {
                        dollys.find((v) => v.id === form.watch("dollyId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("secondTrailerId") && (
                    <div className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">2ª Carreta:</span> {
                        semiTrailers.find(v => v.id === form.watch("secondTrailerId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                </div>
                
                {/* Placas adicionais */}
                {form.watch("additionalPlates") && form.watch("additionalPlates").length > 0 && (
                  <div className="flex flex-col">
                    <div className="text-xs font-medium text-gray-600 mb-1">Placas adicionais:</div>
                    <div className="flex flex-wrap gap-2">
                      {form.watch("additionalPlates").map((plate, index) => (
                        plate && <div key={index} className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-md flex items-center">
                          <span className="font-medium mr-1">{index + 1}:</span> {plate}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total de veículos */}
                <div className="text-xs text-gray-500 mt-1">
                  Total: {[
                    form.watch("tractorUnitId") ? 1 : 0,
                    form.watch("firstTrailerId") ? 1 : 0,
                    form.watch("dollyId") ? 1 : 0,
                    form.watch("secondTrailerId") ? 1 : 0,
                    form.watch("additionalPlates") ? form.watch("additionalPlates").filter(p => p).length : 0
                  ].reduce((a, b) => a + b, 0)} veículos
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic fields for Bitrem */}
        {(licenseType === 'bitrain_9_axles' || licenseType === 'bitrain_7_axles' || licenseType === 'bitrain_6_axles') && (
          <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
              {licenseType === 'bitrain_6_axles' ? (
                <VehicleTypeImage type="bitrain_6_axles" className="mr-2" iconSize={32} />
              ) : licenseType === 'bitrain_9_axles' ? (
                <VehicleTypeImage type="bitrain_9_axles" className="mr-2" iconSize={32} />
              ) : licenseType === 'bitrain_7_axles' ? (
                <VehicleTypeImage type="bitrain_7_axles" className="mr-2" iconSize={32} />
              ) : (
                <Truck className="mr-2 h-8 w-8" />
              )}
              Composição Principal do Bitrem
            </h3>
            
            {/* Unidade Tratora - Esta é a unidade principal que desbloqueia a linha de frente */}
            <div className="mb-6">
              <FormField
                control={form.control}
                name="tractorUnitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Unidade Tratora (Cavalo Mecânico)</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 bg-blue-50 border-blue-200">
                          <SelectValue placeholder="Selecione a unidade tratora" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingVehicles ? (
                          <SelectItem value="loading">Carregando...</SelectItem>
                        ) : tractorUnits.length > 0 ? (
                          tractorUnits.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                              {vehicle.plate} - {vehicle.brand} {vehicle.model}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no_tractor">Nenhum cavalo mecânico cadastrado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs text-muted-foreground mt-1">
                      Esta é a unidade principal que irá puxar o conjunto
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Linha de Frente - Com destaque visual como componente principal */}
            <div className="border border-red-300 rounded-md p-4 bg-red-50 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-red-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Linha de Frente (Componentes Principais)
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstTrailerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">1ª Carreta</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 bg-green-50 border-green-200">
                            <SelectValue placeholder="Selecione a 1ª carreta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingVehicles ? (
                            <SelectItem value="loading">Carregando...</SelectItem>
                          ) : semiTrailers.length > 0 ? (
                            semiTrailers.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                {vehicle.plate} - {vehicle.brand} {vehicle.model}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no_semi_trailer">Nenhum semirreboque cadastrado</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-muted-foreground mt-1">
                        Selecione o primeiro semirreboque da composição
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secondTrailerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">2ª Carreta</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 bg-purple-50 border-purple-200">
                            <SelectValue placeholder="Selecione a 2ª carreta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingVehicles ? (
                            <SelectItem value="loading">Carregando...</SelectItem>
                          ) : semiTrailers.length > 0 ? (
                            semiTrailers.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                {vehicle.plate} - {vehicle.brand} {vehicle.model}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no_semi_trailer">Nenhum semirreboque cadastrado</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-muted-foreground mt-1">
                        Selecione o segundo semirreboque da composição
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            {/* Resumo da composição */}
            <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Composição selecionada:</h4>
              <div className="flex flex-col gap-3">
                {/* Veículos principais */}
                <div className="flex flex-wrap gap-2">
                  <div className="text-xs font-medium text-gray-600 mr-1">Veículos principais:</div>
                  {form.watch("tractorUnitId") && (
                    <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Unidade Principal:</span> {
                        tractorUnits.find(v => v.id === form.watch("tractorUnitId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("firstTrailerId") && (
                    <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">1ª Carreta:</span> {
                        semiTrailers.find(v => v.id === form.watch("firstTrailerId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("dollyId") && (
                    <div className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Dolly:</span> {
                        dollys.find(v => v.id === form.watch("dollyId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("secondTrailerId") && (
                    <div className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">2ª Carreta:</span> {
                        semiTrailers.find(v => v.id === form.watch("secondTrailerId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("flatbedId") && (
                    <div className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Prancha:</span> {
                        flatbeds.find(v => v.id === form.watch("flatbedId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                </div>
                
                {/* Placas adicionais */}
                {form.watch("additionalPlates") && form.watch("additionalPlates").length > 0 && (
                  <div className="flex flex-col">
                    <div className="text-xs font-medium text-gray-600 mb-1">Placas adicionais:</div>
                    <div className="flex flex-wrap gap-2">
                      {form.watch("additionalPlates").map((plate, index) => (
                        plate && <div key={index} className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-md flex items-center">
                          <span className="font-medium mr-1">{index + 1}:</span> {plate}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total de veículos */}
                <div className="text-xs text-gray-500 mt-1">
                  Total: {[
                    form.watch("tractorUnitId") ? 1 : 0,
                    form.watch("firstTrailerId") ? 1 : 0,
                    form.watch("dollyId") ? 1 : 0,
                    form.watch("secondTrailerId") ? 1 : 0,
                    form.watch("flatbedId") ? 1 : 0,
                    form.watch("additionalPlates") ? form.watch("additionalPlates").filter(p => p).length : 0
                  ].reduce((a, b) => a + b, 0)} veículos
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic fields for Prancha */}
        {licenseType === 'flatbed' && (
          <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
              <VehicleTypeImage type="flatbed" className="mr-2" iconSize={32} />
              Composição Principal da Prancha
            </h3>
            
            {/* Unidade Tratora - Esta é a unidade principal que desbloqueia a linha de frente */}
            <div className="mb-6">
              <FormField
                control={form.control}
                name="tractorUnitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Unidade Tratora (Cavalo Mecânico)</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 bg-blue-50 border-blue-200">
                          <SelectValue placeholder="Selecione a unidade tratora" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingVehicles ? (
                          <SelectItem value="loading">Carregando...</SelectItem>
                        ) : tractorUnits.length > 0 ? (
                          tractorUnits.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                              {vehicle.plate} - {vehicle.brand} {vehicle.model}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no_tractor">Nenhum cavalo mecânico cadastrado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs text-muted-foreground mt-1">
                      Esta é a unidade principal que irá puxar o conjunto
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Linha de Frente - Com destaque visual como componente principal */}
            <div className="border border-red-300 rounded-md p-4 bg-red-50 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-red-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Linha de Frente (Componente Principal)
              </h4>
              
              <FormField
                control={form.control}
                name="flatbedId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Prancha</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 bg-red-50 border-red-200">
                          <SelectValue placeholder="Selecione a prancha" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingVehicles ? (
                          <SelectItem value="loading">Carregando...</SelectItem>
                        ) : flatbeds.length > 0 ? (
                          flatbeds.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                              {vehicle.plate} - {vehicle.brand} {vehicle.model}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no_flatbed">Nenhuma prancha cadastrada</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs text-muted-foreground mt-1">
                      Veículo para transporte de cargas excepcionais
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Resumo da composição */}
            <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Composição selecionada:</h4>
              <div className="flex flex-col gap-3">
                {/* Veículos principais */}
                <div className="flex flex-wrap gap-2">
                  <div className="text-xs font-medium text-gray-600 mr-1">Veículos principais:</div>
                  {form.watch("tractorUnitId") && (
                    <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Unidade Principal:</span> {
                        tractorUnits.find(v => v.id === form.watch("tractorUnitId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("flatbedId") && (
                    <div className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Prancha:</span> {
                        flatbeds.find(v => v.id === form.watch("flatbedId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                </div>
                
                {/* Placas adicionais */}
                {form.watch("additionalPlates") && form.watch("additionalPlates").length > 0 && (
                  <div className="flex flex-col">
                    <div className="text-xs font-medium text-gray-600 mb-1">Placas adicionais:</div>
                    <div className="flex flex-wrap gap-2">
                      {form.watch("additionalPlates").map((plate, index) => (
                        plate && <div key={index} className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-md flex items-center">
                          <span className="font-medium mr-1">{index + 1}:</span> {plate}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total de veículos */}
                <div className="text-xs text-gray-500 mt-1">
                  Total: {[
                    form.watch("tractorUnitId") ? 1 : 0,
                    form.watch("flatbedId") ? 1 : 0,
                    form.watch("additionalPlates") ? form.watch("additionalPlates").filter(p => p).length : 0
                  ].reduce((a, b) => a + b, 0)} veículos
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic fields for Romeo and Juliet */}
        {licenseType === 'romeo_and_juliet' && (
          <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
              <VehicleTypeImage type="romeo_and_juliet" className="mr-2" iconSize={32} />
              Composição Principal do Romeu e Julieta
            </h3>
            
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800 flex items-center">
                <Check className="h-4 w-4 mr-2 flex-shrink-0" />
                Para o conjunto "Romeu e Julieta", a unidade tratora deve ser do tipo "Caminhão" e a 1ª carreta deve ser do tipo "Reboque".
              </p>
            </div>
            
            {/* Unidade Tratora - Esta é a unidade principal que desbloqueia a linha de frente */}
            <div className="mb-6">
              <FormField
                control={form.control}
                name="tractorUnitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Caminhão</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 bg-blue-50 border-blue-200">
                          <SelectValue placeholder="Selecione o caminhão" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingVehicles ? (
                          <SelectItem value="loading">Carregando...</SelectItem>
                        ) : trucks.length > 0 ? (
                          trucks.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                              {vehicle.plate} - {vehicle.brand} {vehicle.model}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no_truck">Nenhum caminhão cadastrado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs text-muted-foreground mt-1">
                      Unidade principal do Romeu e Julieta
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Linha de Frente - Com destaque visual como componente principal */}
            <div className="border border-red-300 rounded-md p-4 bg-red-50 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-red-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Reboque (Componente Principal)
              </h4>
              
              <FormField
                control={form.control}
                name="firstTrailerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Reboque</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 bg-amber-50 border-amber-200">
                          <SelectValue placeholder="Selecione o reboque" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingVehicles ? (
                          <SelectItem value="loading">Carregando...</SelectItem>
                        ) : trailers.length > 0 ? (
                          trailers.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                              {vehicle.plate} - {vehicle.brand} {vehicle.model}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no_trailer">Nenhum reboque cadastrado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs text-muted-foreground mt-1">
                      Componente principal do Romeu e Julieta
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Resumo da composição */}
            <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Composição selecionada:</h4>
              <div className="flex flex-col gap-3">
                {/* Veículos principais */}
                <div className="flex flex-wrap gap-2">
                  <div className="text-xs font-medium text-gray-600 mr-1">Veículos principais:</div>
                  {form.watch("tractorUnitId") && (
                    <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Caminhão:</span> {
                        trucks.find(v => v.id === form.watch("tractorUnitId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                  {form.watch("firstTrailerId") && (
                    <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-md flex items-center">
                      <Truck className="h-3 w-3 mr-1" />
                      <span className="font-medium">Reboque:</span> {
                        trailers.find(v => v.id === form.watch("firstTrailerId"))?.plate || "Selecionado"
                      }
                    </div>
                  )}
                </div>
                
                {/* Placas adicionais */}
                {form.watch("additionalPlates") && form.watch("additionalPlates").length > 0 && (
                  <div className="flex flex-col">
                    <div className="text-xs font-medium text-gray-600 mb-1">Placas adicionais:</div>
                    <div className="flex flex-wrap gap-2">
                      {form.watch("additionalPlates").map((plate, index) => (
                        plate && <div key={index} className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-md flex items-center">
                          <span className="font-medium mr-1">{index + 1}:</span> {plate}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total de veículos */}
                <div className="text-xs text-gray-500 mt-1">
                  Total: {[
                    form.watch("tractorUnitId") ? 1 : 0,
                    form.watch("firstTrailerId") ? 1 : 0,
                    form.watch("additionalPlates") ? form.watch("additionalPlates").filter(p => p).length : 0
                  ].reduce((a, b) => a + b, 0)} veículos
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect>
              <path d="M2 13h20"></path>
            </svg>
            Placas Adicionais (Veículos Secundários)
          </h3>
          
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Veículos Complementares</h4>
                <p className="text-xs text-gray-600">
                  Nesta seção você pode adicionar placas de veículos que fazem parte da composição 
                  mas não são considerados parte da linha de frente. Estes veículos complementam 
                  o conjunto principal selecionado acima.
                </p>
              </div>
            </div>
            
            <div className="mt-3 flex flex-wrap gap-2">
              {form.watch("tractorUnitId") && (
                <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md flex items-center">
                  <Truck className="h-3 w-3 mr-1" />
                  Linha de frente já inclui: {
                    tractorUnits.find(v => v.id === form.watch("tractorUnitId"))?.plate || "Unidade tratora"
                  }
                </div>
              )}
              {form.watch("firstTrailerId") && (
                <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-md">
                  1ª Carreta já incluída
                </div>
              )}
              {form.watch("secondTrailerId") && (
                <div className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-md">
                  2ª Carreta já incluída
                </div>
              )}
              {form.watch("dollyId") && (
                <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-md">
                  Dolly já incluído
                </div>
              )}
              {form.watch("flatbedId") && (
                <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-md">
                  Prancha já incluída
                </div>
              )}
            </div>
          </div>
          
          <div className="text-sm text-gray-700 mb-3 font-medium">
            <span className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              Gerenciamento de Placas Adicionais
            </span>
          </div>
          
          {/* Componente de campo de placas adicionais com autopreenchimento */}
          <div className="border-dashed border-2 border-gray-300 rounded-md p-4 bg-gray-50">
            <CampoPlacaAdicional 
              form={form} 
              vehicles={vehicles} 
              isLoadingVehicles={isLoadingVehicles}
              licenseType={licenseType}
            />
          </div>
          
          {/* Total de veículos */}
          <div className="mt-4 flex justify-between items-center text-sm">
            <span className="text-gray-600">
              Tipo de conjunto: <span className="font-medium">{
                licenseType === 'bitrain_6_axles' ? 'Bitrem 6 Eixos' : 
                licenseType === 'bitrain_7_axles' ? 'Bitrem 7 Eixos' : 
                licenseType === 'bitrain_9_axles' ? 'Bitrem 9 Eixos' : 
                licenseType === 'roadtrain_9_axles' ? 'Rodotrem 9 Eixos' : 
                licenseType === 'flatbed' ? 'Prancha' : 
                licenseType === 'romeo_and_juliet' ? 'Romeu e Julieta' : 'Outro'
              }</span>
            </span>
            <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-md flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"></path>
                <path d="M10 22V4"></path>
                <path d="M15 4v18"></path>
              </svg>
              Total de Veículos: <span className="font-medium ml-1">{
                // Contabilizar principais + adicionais
                (form.watch("tractorUnitId") ? 1 : 0) + 
                (form.watch("firstTrailerId") ? 1 : 0) + 
                (form.watch("secondTrailerId") ? 1 : 0) + 
                (form.watch("dollyId") ? 1 : 0) + 
                (form.watch("flatbedId") ? 1 : 0) + 
                (form.watch("additionalPlates")?.length || 0)
              }</span>
            </span>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
            <FileUp className="mr-2 h-5 w-5" />
            Documentos
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
              <h4 className="text-blue-700 font-medium mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                Documentação dos Veículos
              </h4>
              <p className="text-sm text-blue-600 mb-3">
                Os CRLVs dos veículos serão vinculados automaticamente a partir do cadastro de veículos.
                Caso não encontre algum veículo, cadastre-o clicando no +:
              </p>
              <div className="text-xs text-gray-500">
                Formatos aceitos: PDF, JPG, PNG
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-md border border-amber-100">
              <h4 className="text-amber-700 font-medium mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                </svg>
                Tempo de Processamento
              </h4>
              <p className="text-sm text-amber-600 mb-3">
                Após o envio, a solicitação passará por análise do órgão competente.
                O prazo médio para análise varia de acordo com cada estado.
              </p>
              <div className="text-xs text-gray-500">
                Acompanhe o status na página "Acompanhar Licença"
              </div>
            </div>
          </div>
          
          <FormField
            control={form.control}
            name="comments"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Adicione observações relevantes para este pedido de licença..."
                    className="min-h-[120px] resize-y"
                    value={field.value as string || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormDescription>
                  Inclua quaisquer informações adicionais importantes para a análise desta solicitação
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="border border-gray-200 rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <line x1="12" y1="20" x2="12" y2="20"/>
            </svg>
            Estados Solicitados
          </h3>

          <FormField
            control={form.control}
            name="states"
            render={() => (
              <FormItem>
                <div className="mb-2">
                  <div className="flex justify-between items-center">
                    <FormLabel className="text-base font-medium">Selecione os estados para emissão de licença</FormLabel>
                    <FormField
                      control={form.control}
                      name="states"
                      render={({ field }) => {
                        const allSelected = brazilianStates.length === (field.value || []).length;
                        return (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs flex gap-1 items-center"
                            onClick={() => {
                              if (allSelected) {
                                // Desselecionar todos
                                field.onChange([]);
                              } else {
                                // Selecionar todos
                                field.onChange(brazilianStates.map(state => state.code));
                              }
                            }}
                          >
                            {allSelected ? (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                </svg>
                                Desmarcar Todos
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 11 12 14 22 4"></polyline>
                                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                </svg>
                                Selecionar Todos
                              </>
                            )}
                          </Button>
                        );
                      }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 mb-3">
                    Escolha um ou mais estados onde a licença será utilizada
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {brazilianStates.map((state) => (
                    <FormField
                      key={state.code}
                      control={form.control}
                      name="states"
                      render={({ field }) => {
                        const isSelected = (field.value || []).includes(state.code);
                        return (
                          <FormItem
                            key={state.code}
                            className="m-0 p-0"
                          >
                            <FormControl>
                              <div 
                                className={`cursor-pointer flex flex-col items-center justify-center p-2 rounded-md border ${
                                  isSelected 
                                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' 
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                                onClick={() => {
                                  if (isSelected) {
                                    field.onChange((field.value || []).filter((value) => value !== state.code));
                                  } else {
                                    field.onChange([...(field.value || []), state.code]);
                                  }
                                }}
                              >
                                <span className="text-base font-medium">{state.code}</span>
                                <span className="text-xs mt-1 text-center hidden md:block text-gray-500">{state.name}</span>
                              </div>
                            </FormControl>
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
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-4 sm:space-x-4 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            className="w-full sm:w-auto order-4 sm:order-1"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isProcessing}
            className="w-full sm:w-auto order-3 sm:order-2"
          >
            {saveAsDraftMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Rascunho
          </Button>
          {/* Botão para envio direto de rascunho, mostrado apenas quando estamos editando um rascunho existente */}
          {draft && draft.id && (
            <Button
              type="button"
              variant="outline"
              onClick={handleSubmitDraftDirectly}
              className="w-full sm:w-auto order-2 sm:order-3 bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar Rascunho
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmitRequest}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto order-1 sm:order-4"
          >
            {submitRequestMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Novo Pedido
          </Button>
        </div>
      </form>
    </Form>
  );
}
