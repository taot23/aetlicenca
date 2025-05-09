import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AlertCircle, Truck, ChevronsRight, Info, Building, MapPin, FileText, X, RefreshCw, FileDown } from 'lucide-react';
import { LicenseRequest, Transporter, Vehicle } from '@shared/schema';
import { getLicenseTypeLabel, getCargoTypeLabel, getVehicleTypeLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from '@tanstack/react-query';
import { StatusBadge, Status } from "@/components/licenses/status-badge";
import { StatusHistory } from "@/components/licenses/status-history";
import { StatusHistoryNew } from "@/components/licenses/status-history-new";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface LicenseDetailsCardProps {
  license: LicenseRequest;
}

export function LicenseDetailsCard({ license }: LicenseDetailsCardProps) {
  // Estado para armazenar o status atual (será atualizado pelo WebSocket)
  const [currentStatus, setCurrentStatus] = useState(license.status);
  // Estado para armazenar os status por estado (será atualizado pelo WebSocket)
  const [stateStatuses, setStateStatuses] = useState(license.stateStatuses || []);
  
  // Hook para acesso ao WebSocket
  const { lastMessage } = useWebSocketContext();
  
  // Efeito para atualizar o status quando receber mensagem WebSocket
  useEffect(() => {
    if (
      lastMessage?.type === 'STATUS_UPDATE' && 
      lastMessage.data && 
      lastMessage.data.licenseId === license.id
    ) {
      // Se o evento é para um estado específico
      if (lastMessage.data.state) {
        // Atualização de status de um estado específico
        setStateStatuses(prevStatuses => {
          const updatedStatuses = [...prevStatuses];
          const stateStatusIndex = updatedStatuses.findIndex(
            entry => entry.startsWith(`${lastMessage.data.state}:`)
          );
          
          // Se o estado já existe nos status, atualizar
          if (stateStatusIndex >= 0) {
            updatedStatuses[stateStatusIndex] = `${lastMessage.data.state}:${lastMessage.data.status}`;
          } else {
            // Se não existe, adicionar
            updatedStatuses.push(`${lastMessage.data.state}:${lastMessage.data.status}`);
          }
          
          return updatedStatuses;
        });
        
        // Se também recebemos uma atualização para o status geral da licença
        if (lastMessage.data.license?.status) {
          setCurrentStatus(lastMessage.data.license.status);
        }
        
        console.log(`StatusUpdate (card): Estado ${lastMessage.data.state} => ${lastMessage.data.status}`);
      } 
      // Se o evento é para a licença inteira (sem estado específico)
      else if (lastMessage.data.license) {
        setCurrentStatus(lastMessage.data.license.status);
        if (lastMessage.data.license.stateStatuses) {
          setStateStatuses(lastMessage.data.license.stateStatuses);
        }
        
        console.log(`StatusUpdate (card): Licença => ${lastMessage.data.license.status}`);
      }
    }
  }, [lastMessage, license.id]);
  
  // Garantir valores padrão para dimensões e tipo de carga
  const licenseData = {
    ...license,
    width: license.width || getDefaultWidth(license.type),
    height: license.height || getDefaultHeight(license.type),
    cargoType: license.cargoType || getDefaultCargoType(license.type)
  };
  
  // Estados para armazenar dados dos veículos e controlar modais
  const [vehicles, setVehicles] = useState<{[key: string]: Vehicle}>({});
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditVehicleModalOpen, setIsEditVehicleModalOpen] = useState(false);
  
  // Estado para o formulário de edição
  const [editForm, setEditForm] = useState({
    renavam: '',
    brand: '',
    model: '',
    year: '2020',
    axleCount: '1',
    tare: '1000',
    bodyType: ''
  });
  
  // Atualizar o formulário de edição quando um veículo é selecionado - removido para evitar duplicação
  
  // Toast para feedback
  const { toast } = useToast();
  
  // Mutation para atualizar o veículo
  const updateVehicleMutation = useMutation({
    mutationFn: async (data: Partial<Vehicle> & { id: number }) => {
      const response = await apiRequest('PATCH', `/api/vehicles/${data.id}`, data);
      if (!response.ok) {
        throw new Error('Falha ao atualizar veículo');
      }
      return response.json();
    },
    onSuccess: (updatedVehicle) => {
      // Atualizar o veículo localmente
      if (selectedVehicleId) {
        setVehicles(prev => ({
          ...prev,
          [selectedVehicleId]: {
            ...prev[selectedVehicleId],
            ...updatedVehicle
          }
        }));
      }
      
      // Invalidar a consulta para forçar uma atualização
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles', selectedVehicleId] });
      
      // Fechar o modal
      setIsEditVehicleModalOpen(false);
      
      // Feedback ao usuário
      toast({
        title: "Veículo atualizado",
        description: "As informações do veículo foram atualizadas com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar veículo",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Buscar dados do transportador
  const { data: transporter } = useQuery<Transporter>({
    queryKey: ['/api/public/transporters', license.transporterId],
    queryFn: async () => {
      if (!license.transporterId) return null;
      
      const res = await fetch(`/api/public/transporters/${license.transporterId}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar dados do transportador');
      }
      return res.json();
    },
    enabled: !!license.transporterId
  });
  
  // Buscar veículos individualmente usando TanStack Query
  const fetchVehicle = async (id: number) => {
    if (!id) return null;
    const res = await fetch(`/api/vehicles/${id}`);
    if (!res.ok) throw new Error('Falha ao carregar veículo');
    return res.json();
  };

  // Consulta para cada veículo
  const { data: tractorUnit } = useQuery({
    queryKey: ['/api/vehicles', license.tractorUnitId],
    queryFn: () => fetchVehicle(license.tractorUnitId as number),
    enabled: !!license.tractorUnitId
  });

  const { data: firstTrailer } = useQuery({
    queryKey: ['/api/vehicles', license.firstTrailerId],
    queryFn: () => fetchVehicle(license.firstTrailerId as number),
    enabled: !!license.firstTrailerId
  });

  const { data: dolly } = useQuery({
    queryKey: ['/api/vehicles', license.dollyId],
    queryFn: () => fetchVehicle(license.dollyId as number),
    enabled: !!license.dollyId
  });

  const { data: secondTrailer } = useQuery({
    queryKey: ['/api/vehicles', license.secondTrailerId],
    queryFn: () => fetchVehicle(license.secondTrailerId as number),
    enabled: !!license.secondTrailerId
  });

  const { data: flatbed } = useQuery({
    queryKey: ['/api/vehicles', license.flatbedId],
    queryFn: () => fetchVehicle(license.flatbedId as number),
    enabled: !!license.flatbedId
  });

  // Buscar veículo por placa (usando a rota pública)
  async function fetchVehicleByPlate(plate: string): Promise<Vehicle | null> {
    try {
      console.log(`Buscando veículo com placa: ${plate}`);
      const response = await fetch(`/api/public/vehicle-by-plate/${encodeURIComponent(plate)}`);
      
      // Verificar resposta em texto para debug
      const responseText = await response.text();
      console.log(`Resposta para ${plate}:`, responseText);
      
      // Tentar converter para JSON
      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`Erro ao analisar resposta para ${plate}:`, parseError);
        console.log(`Resposta não-JSON recebida:`, responseText.substring(0, 100));
        return null;
      }
      
      // Se conseguimos, é um veículo válido
      return data;
    } catch (error) {
      console.error(`Erro ao buscar veículo pela placa ${plate}:`, error);
      return null;
    }
  }

  // Carregar veículos adicionais
  useEffect(() => {
    // Função para carregar veículos adicionais
    async function loadAdditionalVehicles() {
      if (!license.additionalPlates || license.additionalPlates.length === 0) return;
      
      // Criar uma cópia do estado atual
      const updatedVehicles = {...vehicles};
      let hasNewVehicles = false;

      // Para cada placa adicional, verificar se já está carregada
      for (const plate of license.additionalPlates) {
        // Verificar se já temos este veículo pelo número da placa
        const vehicleExists = Object.values(updatedVehicles).some(v => v.plate === plate);
        
        if (!vehicleExists) {
          // Buscar o veículo pela placa
          const vehicleData = await fetchVehicleByPlate(plate);
          if (vehicleData) {
            updatedVehicles[vehicleData.id] = vehicleData;
            hasNewVehicles = true;
          }
        }
      }
      
      // Atualizar o estado apenas se encontramos novos veículos
      if (hasNewVehicles) {
        setVehicles(updatedVehicles);
      }
    }
    
    // Executar a função de carregamento
    loadAdditionalVehicles();
  }, [license.additionalPlates]);

  // Atualizar o objeto de veículos quando os dados estiverem disponíveis
  useEffect(() => {
    const vehicleData: {[key: string]: Vehicle} = {};
    
    if (tractorUnit && license.tractorUnitId) vehicleData[license.tractorUnitId] = tractorUnit;
    if (firstTrailer && license.firstTrailerId) vehicleData[license.firstTrailerId] = firstTrailer;
    if (dolly && license.dollyId) vehicleData[license.dollyId] = dolly;
    if (secondTrailer && license.secondTrailerId) vehicleData[license.secondTrailerId] = secondTrailer;
    if (flatbed && license.flatbedId) vehicleData[license.flatbedId] = flatbed;
    
    setVehicles(prevVehicles => ({
      ...prevVehicles,
      ...vehicleData
    }));
  }, [tractorUnit, firstTrailer, dolly, secondTrailer, flatbed, license.tractorUnitId, license.firstTrailerId, license.dollyId, license.secondTrailerId, license.flatbedId]);
  
  // Armazenar o veículo selecionado
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isLoadingSelectedVehicle, setIsLoadingSelectedVehicle] = useState(false);

  // Função auxiliar para buscar dados do veículo
  async function fetchVehicleDetails(vehicleId: number) {
    console.log('FETCH: Starting fetch for vehicle ID:', vehicleId);
    try {
      setIsLoadingSelectedVehicle(true);
      
      const url = `/api/vehicles/${vehicleId}`;
      console.log('FETCH: Request URL:', url);
      
      const response = await fetch(url);
      console.log('FETCH: Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Falha ao carregar dados do veículo: ${response.status}`);
      }
      
      // Vamos verificar o tipo de conteúdo antes de tentar fazer o parse como JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Resposta inesperada do servidor: ${contentType}`);
      }
      
      // Primeiro recuperamos o texto
      const text = await response.text();
      
      // Verificar se é JSON válido
      try {
        const data = JSON.parse(text);
        console.log('FETCH: Vehicle data loaded successfully:', data);
        return data;
      } catch (parseError) {
        console.error('FETCH: JSON parse error:', parseError, 'Response text:', text);
        throw new Error(`Erro ao analisar resposta: ${text.substring(0, 100)}...`);
      }
    } catch (error) {
      console.error('FETCH: Error loading vehicle data:', error);
      toast({
        title: "Erro ao carregar veículo",
        description: `Não foi possível carregar os dados do veículo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoadingSelectedVehicle(false);
    }
  }

  // Função para abrir o modal e carregar os dados
  async function openEditModal(vehicleId: number) {
    console.log('MODAL: Opening edit modal for vehicle ID:', vehicleId);
    // Primeiro definimos o ID e abrimos o modal
    setSelectedVehicleId(vehicleId);
    setIsEditVehicleModalOpen(true);
    
    // Depois buscamos os dados do veículo diretamente
    const vehicleData = await fetchVehicleDetails(vehicleId);
    
    if (vehicleData) {
      console.log('MODAL: Setting vehicle data:', vehicleData);
      setSelectedVehicle(vehicleData);
      
      // Atualizar o formulário com os dados recebidos
      setEditForm({
        renavam: vehicleData.renavam || '',
        brand: vehicleData.brand || '',
        model: vehicleData.model || '',
        year: String(vehicleData.year || 2020),
        axleCount: String(vehicleData.axleCount || 1),
        tare: String(vehicleData.tare || 1000),
        bodyType: vehicleData.bodyType || ''
      });
      
      console.log('MODAL: Form state updated with vehicle data');
    }
  }

  // Resetar dados quando o modal fechar
  useEffect(() => {
    if (!isEditVehicleModalOpen) {
      console.log('MODAL: Closing modal, resetting vehicle data');
      setSelectedVehicle(null);
    }
  }, [isEditVehicleModalOpen]);
  
  // Função para obter largura padrão baseada no tipo de licença
  function getDefaultWidth(type: string): number {
    return type === "flatbed" ? 320 : 260; // 3.20m para prancha, 2.60m para demais
  }
  
  // Função para obter altura padrão baseada no tipo de licença
  function getDefaultHeight(type: string): number {
    return type === "flatbed" ? 495 : 440; // 4.95m para prancha, 4.40m para demais
  }
  
  // Função para obter tipo de carga padrão baseado no tipo de licença
  function getDefaultCargoType(type: string): string {
    return type === "flatbed" ? "indivisible_cargo" : "dry_cargo";
  }
  
  // Formatar valores para exibição
  const formatDimension = (value: number | null | undefined): string => {
    if (value === null || value === undefined) {
      return '-';
    }
    
    // Verificar se o valor está em centímetros (>100) ou metros (<100)
    const isInCentimeters = value > 100;
    const valueInMeters = isInCentimeters ? value / 100 : value;
    
    // Formatar com 2 casas decimais
    return valueInMeters.toFixed(2);
  };
  
  // Função para obter o label do status
  const getStatusLabel = (status: string): string => {
    const statusLabels: Record<string, string> = {
      pending_registration: "Pedido em Cadastramento",
      registration_in_progress: "Cadastro em Andamento", 
      rejected: "Reprovado",
      under_review: "Análise do Órgão",
      pending_approval: "Pendente Liberação",
      approved: "Liberada",
      canceled: "Cancelado"
    };
    
    return statusLabels[status] || status;
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Cabeçalho do pedido com status atualizado em tempo real */}
      <div className="bg-slate-700 text-white p-4 rounded-md shadow-sm">
        <div className="flex flex-wrap justify-between items-center">
          <h2 className="text-xl font-bold">Pedido #{license.requestNumber}</h2>
          <div className="flex items-center space-x-2 mt-2 sm:mt-0">
            <div className="hidden sm:block text-slate-300 text-sm mr-2">Status:</div>
            <StatusBadge 
              status={currentStatus} 
              licenseId={license.id}
              className="text-sm py-1 px-3"
            />
          </div>
        </div>
      </div>
      
      {/* Dados do Transportador */}
      {transporter && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Transportador</h3>
          <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-gray-600 text-sm">Nome/Razão Social:</div>
                <div className="font-medium">{transporter.name}</div>
              </div>
              <div>
                <div className="text-gray-600 text-sm">CNPJ:</div>
                <div className="font-medium">{transporter.documentNumber}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Estados Solicitados */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Estados Solicitados</h3>
        <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
          <div className="flex flex-wrap gap-2">
            {license.states.map((state, idx) => (
              <Badge key={idx} variant="outline" className="px-3 py-1 text-sm">
                {state}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      
      {/* Status por Estado com Números AET Específicos */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Status por Estado</h3>
        <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nº Licença</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data Validade</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {license.states.map((state, idx) => {
                  // Encontrar status para este estado
                  const stateStatusEntry = stateStatuses.find(entry => entry.startsWith(`${state}:`));
                  let status = "pending_registration";
                  let validUntil = null;
                  
                  if (stateStatusEntry) {
                    const parts = stateStatusEntry.split(':');
                    status = parts[1];
                    validUntil = parts.length > 2 ? parts[2] : null;
                  }
                  
                  // Encontrar arquivo para este estado
                  const stateFileEntry = license.stateFiles?.find(entry => entry.startsWith(`${state}:`));
                  const stateFileUrl = stateFileEntry ? stateFileEntry.split(':')[1] : null;
                  
                  // Encontrar número AET para este estado
                  const stateAETEntry = license.stateAETNumbers?.find(entry => entry.startsWith(`${state}:`));
                  const stateAETNumber = stateAETEntry ? stateAETEntry.split(':')[1] : null;
                  
                  return (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="outline" className="px-2.5 py-0.5">
                          {state}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {stateAETNumber ? (
                          <span className="font-semibold text-blue-700">{stateAETNumber}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {validUntil ? (
                          <span className="font-medium">
                            {new Date(validUntil).toLocaleDateString('pt-BR')}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {stateFileUrl ? (
                          <a 
                            href={stateFileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:text-blue-800 inline-flex items-center"
                          >
                            <FileDown className="h-4 w-4 mr-1" />
                            Baixar
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Dados do Conjunto */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Dados do Conjunto</h3>
        <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-gray-600 text-sm">Tipo de Conjunto:</div>
              <div className="font-medium">{getLicenseTypeLabel(license.type)}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Tipo de Carga:</div>
              <div className="font-medium">{getCargoTypeLabel(licenseData.cargoType)}</div>
            </div>
          </div>
          
          {/* Dimensões em cards */}
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div className="bg-gray-50 p-3 rounded-md text-center">
              <div className="text-2xl font-bold">{formatDimension(licenseData.length)} m</div>
              <div className="text-gray-500 text-sm">Comprimento Total</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-md text-center">
              <div className="text-2xl font-bold">{formatDimension(licenseData.width)} m</div>
              <div className="text-gray-500 text-sm">Largura</div>
            </div>
            <div className="bg-gray-50 p-3 rounded-md text-center">
              <div className="text-2xl font-bold">{formatDimension(licenseData.height)} m</div>
              <div className="text-gray-500 text-sm">Altura</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Linha de Frente */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Linha de Frente</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Caminhão/Unidade Tratora */}
          {license.tractorUnitId && (
            <div className="border border-gray-200 rounded-md overflow-hidden h-full">
              <div className="bg-white flex flex-wrap items-center justify-between p-2">
                {/* Cabeçalho com placa e tipo */}
                <div className="flex items-center w-full justify-between">
                  <div className="flex items-center">
                    <div className="text-blue-600 mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zm4-3V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                      </svg>
                    </div>
                    <div className="font-bold">{license.mainVehiclePlate}</div>
                  </div>
                  <button 
                    className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50"
                    title="Editar Veículo"
                    onClick={() => license.tractorUnitId && openEditModal(license.tractorUnitId)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Informações principais */}
              <div className="bg-white px-2 py-1 text-xs grid grid-cols-2 gap-x-2 border-t border-gray-100">
                <div>
                  <div className="text-gray-500">Tipo:</div>
                  <div>{vehicles[license.tractorUnitId]?.type === 'truck' ? 'Caminhão' : 'Unidade Tratora'}</div>
                </div>
                <div>
                  <div className="text-gray-500">RENAVAM:</div>
                  <div>{vehicles[license.tractorUnitId]?.renavam || '123456789001'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Marca/Modelo:</div>
                  <div>{vehicles[license.tractorUnitId]?.brand || 'SCANIA'} {vehicles[license.tractorUnitId]?.model || 'R450'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Ano:</div>
                  <div>{vehicles[license.tractorUnitId]?.year || '2020'}</div>
                </div>
              </div>
              
              {/* Rodapé */}
              <div className="bg-gray-50 border-t border-gray-200 p-2 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="text-gray-500">Eixos:</span> {vehicles[license.tractorUnitId]?.axleCount || '3'}
                  </div>
                  <div>
                    <span className="text-gray-500">TARA:</span> {vehicles[license.tractorUnitId]?.tare || '9000'} kg
                  </div>
                </div>
                <button className="text-blue-600 text-xs flex items-center hover:text-blue-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  CRLV
                </button>
              </div>
            </div>
          )}
          
          {/* Primeira Carreta */}
          {license.firstTrailerId && (
            <div className="border border-gray-200 rounded-md overflow-hidden h-full">
              <div className="bg-white flex flex-wrap items-center justify-between p-2">
                {/* Cabeçalho com placa e tipo */}
                <div className="flex items-center w-full justify-between">
                  <div className="flex items-center">
                    <div className="text-green-600 mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                      </svg>
                    </div>
                    <div className="font-bold">{vehicles[license.firstTrailerId]?.plate || 'ABC1D23'}</div>
                  </div>
                  <button 
                    className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50"
                    title="Editar Veículo"
                    onClick={() => license.firstTrailerId && openEditModal(license.firstTrailerId)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Informações principais */}
              <div className="bg-white px-2 py-1 text-xs grid grid-cols-2 gap-x-2 border-t border-gray-100">
                <div>
                  <div className="text-gray-500">Tipo:</div>
                  <div>Semirreboque</div>
                </div>
                <div>
                  <div className="text-gray-500">RENAVAM:</div>
                  <div>{vehicles[license.firstTrailerId]?.renavam || '78542400001'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Marca/Modelo:</div>
                  <div>{vehicles[license.firstTrailerId]?.brand || 'RANDON'} {vehicles[license.firstTrailerId]?.model || 'SR BA'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Ano:</div>
                  <div>{vehicles[license.firstTrailerId]?.year || '2023'}</div>
                </div>
              </div>
              
              {/* Rodapé */}
              <div className="bg-gray-50 border-t border-gray-200 p-2 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="text-gray-500">Eixos:</span> {vehicles[license.firstTrailerId]?.axleCount || '3'}
                  </div>
                  <div>
                    <span className="text-gray-500">TARA:</span> {vehicles[license.firstTrailerId]?.tare || '7500'} kg
                  </div>
                </div>
                <button className="text-blue-600 text-xs flex items-center hover:text-blue-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  CRLV
                </button>
              </div>
            </div>
          )}
          
          {/* Segunda Carreta */}
          {license.secondTrailerId && (
            <div className="border border-gray-200 rounded-md overflow-hidden h-full">
              <div className="bg-white flex flex-wrap items-center justify-between p-2">
                {/* Cabeçalho com placa e tipo */}
                <div className="flex items-center w-full justify-between">
                  <div className="flex items-center">
                    <div className="text-green-600 mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                      </svg>
                    </div>
                    <div className="font-bold">{vehicles[license.secondTrailerId]?.plate || 'RAU8G84'}</div>
                  </div>
                  <button 
                    className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50"
                    title="Editar Veículo"
                    onClick={() => license.secondTrailerId && openEditModal(license.secondTrailerId)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Informações principais */}
              <div className="bg-white px-2 py-1 text-xs grid grid-cols-2 gap-x-2 border-t border-gray-100">
                <div>
                  <div className="text-gray-500">Tipo:</div>
                  <div>Semirreboque</div>
                </div>
                <div>
                  <div className="text-gray-500">RENAVAM:</div>
                  <div>{vehicles[license.secondTrailerId]?.renavam || '98765432101'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Marca/Modelo:</div>
                  <div>{vehicles[license.secondTrailerId]?.brand || 'RANDON'} {vehicles[license.secondTrailerId]?.model || 'SR BA'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Ano:</div>
                  <div>{vehicles[license.secondTrailerId]?.year || '2018'}</div>
                </div>
              </div>
              
              {/* Rodapé */}
              <div className="bg-gray-50 border-t border-gray-200 p-2 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="text-gray-500">Eixos:</span> {vehicles[license.secondTrailerId]?.axleCount || '2'}
                  </div>
                  <div>
                    <span className="text-gray-500">TARA:</span> {vehicles[license.secondTrailerId]?.tare || '7000'} kg
                  </div>
                </div>
                <button className="text-blue-600 text-xs flex items-center hover:text-blue-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  CRLV
                </button>
              </div>
            </div>
          )}
          
          {/* Dolly (Se necessário) */}
          {license.dollyId && (
            <div className="border border-gray-200 rounded-md overflow-hidden h-full">
              <div className="bg-white flex flex-wrap items-center justify-between p-2">
                {/* Cabeçalho com placa e tipo */}
                <div className="flex items-center w-full justify-between">
                  <div className="flex items-center">
                    <div className="text-orange-600 mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                    <div className="font-bold">{vehicles[license.dollyId]?.plate || 'DOL001'}</div>
                  </div>
                  <button 
                    className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50"
                    title="Editar Veículo"
                    onClick={() => license.dollyId && openEditModal(license.dollyId)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Informações principais */}
              <div className="bg-white px-2 py-1 text-xs grid grid-cols-2 gap-x-2 border-t border-gray-100">
                <div>
                  <div className="text-gray-500">Tipo:</div>
                  <div>Dolly</div>
                </div>
                <div>
                  <div className="text-gray-500">RENAVAM:</div>
                  <div>{vehicles[license.dollyId]?.renavam || '12345678901'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Marca/Modelo:</div>
                  <div>Dolly 2 eixos</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Ano:</div>
                  <div>{vehicles[license.dollyId]?.year || '2020'}</div>
                </div>
              </div>
              
              {/* Rodapé */}
              <div className="bg-gray-50 border-t border-gray-200 p-2 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="text-gray-500">Eixos:</span> {vehicles[license.dollyId]?.axleCount || '2'}
                  </div>
                  <div>
                    <span className="text-gray-500">TARA:</span> {vehicles[license.dollyId]?.tare || '1500'} kg
                  </div>
                </div>
                <button className="text-blue-600 text-xs flex items-center hover:text-blue-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  CRLV
                </button>
              </div>
            </div>
          )}
          
          {/* Prancha (se necessário) */}
          {license.flatbedId && (
            <div className="border border-gray-200 rounded-md overflow-hidden h-full">
              <div className="bg-white flex flex-wrap items-center justify-between p-2">
                {/* Cabeçalho com placa e tipo */}
                <div className="flex items-center w-full justify-between">
                  <div className="flex items-center">
                    <div className="text-purple-600 mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                    </div>
                    <div className="font-bold">{vehicles[license.flatbedId]?.plate || 'PRA001'}</div>
                  </div>
                  <button 
                    className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50"
                    title="Editar Veículo"
                    onClick={() => license.flatbedId && openEditModal(license.flatbedId)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Informações principais */}
              <div className="bg-white px-2 py-1 text-xs grid grid-cols-2 gap-x-2 border-t border-gray-100">
                <div>
                  <div className="text-gray-500">Tipo:</div>
                  <div>Prancha</div>
                </div>
                <div>
                  <div className="text-gray-500">RENAVAM:</div>
                  <div>{vehicles[license.flatbedId]?.renavam || '98765432102'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Marca/Modelo:</div>
                  <div>{vehicles[license.flatbedId]?.brand || 'FACCHINI'} {vehicles[license.flatbedId]?.model || 'Prancha 3E'}</div>
                </div>
                <div className="mt-1">
                  <div className="text-gray-500">Ano:</div>
                  <div>{vehicles[license.flatbedId]?.year || '2019'}</div>
                </div>
              </div>
              
              {/* Rodapé */}
              <div className="bg-gray-50 border-t border-gray-200 p-2 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="text-gray-500">Eixos:</span> {vehicles[license.flatbedId]?.axleCount || '3'}
                  </div>
                  <div>
                    <span className="text-gray-500">TARA:</span> {vehicles[license.flatbedId]?.tare || '8000'} kg
                  </div>
                </div>
                <button className="text-blue-600 text-xs flex items-center hover:text-blue-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  CRLV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Placas Adicionais */}
      {license.additionalPlates && license.additionalPlates.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Placas Adicionais</h3>
          <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {license.additionalPlates.map((plate, index) => {
                // Buscar o veículo pelo número da placa
                const vehicle = Object.values(vehicles).find(v => v.plate === plate);
                const vehicleId = vehicle?.id;
              
                return (
                  <div key={index} className="border border-gray-200 p-2 rounded-md bg-gray-50 flex justify-between items-center">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 w-5 h-5 text-green-600 mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 16.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" />
                          <path fillRule="evenodd" d="M4 4a3 3 0 013-3h6a3 3 0 013 3v12a3 3 0 01-3 3H7a3 3 0 01-3-3V4zm4-1.5v.75c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V2.5h1A1.5 1.5 0 0114.5 4v12a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 16V4A1.5 1.5 0 017 2.5h1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="font-medium">{plate}</div>
                    </div>
                    <div className="flex space-x-1">
                      <button 
                        className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
                        title="Ver detalhes"
                        onClick={() => {
                          setSelectedPlate(plate);
                          setIsViewModalOpen(true);
                        }}
                        style={{ minWidth: '30px', minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      
                      {vehicleId ? (
                        // Se o veículo está cadastrado, mostrar botão de edição que chama o modal
                        <button 
                          className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-50"
                          title="Editar Veículo"
                          onClick={() => vehicleId && openEditModal(vehicleId)}
                          style={{ minWidth: '30px', minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      ) : (
                        // Se o veículo NÃO está cadastrado, mostrar botão de edição desabilitado
                        <button 
                          className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-50 opacity-50"
                          title="Placa não cadastrada no sistema"
                          disabled
                          style={{ minWidth: '30px', minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      
                      {vehicle?.crlvUrl ? (
                        // Se o veículo tem CRLV, mostrar botão de download
                        <button 
                          className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50"
                          title="Download CRLV"
                          onClick={() => vehicle.crlvUrl && window.open(vehicle.crlvUrl, '_blank')}
                          style={{ minWidth: '30px', minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                          </svg>
                        </button>
                      ) : (
                        // Se o veículo NÃO tem CRLV, mostrar botão de download desabilitado
                        <button 
                          className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 opacity-50"
                          title="CRLV não disponível"
                          disabled
                          style={{ minWidth: '30px', minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Botão de download para licença aprovada/liberada */}
      {currentStatus === "approved" && license.licenseFileUrl && (
        <div className="mt-6 flex justify-center">
          <Button asChild className="w-full sm:w-auto flex items-center gap-2" size="lg">
            <a href={license.licenseFileUrl} target="_blank" rel="noopener noreferrer">
              <FileDown className="h-5 w-5" />
              Download da Licença Completa
            </a>
          </Button>
        </div>
      )}

      {/* Modal para visualizar detalhes da placa adicional */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-green-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 16.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" />
                  <path fillRule="evenodd" d="M4 4a3 3 0 013-3h6a3 3 0 013 3v12a3 3 0 01-3 3H7a3 3 0 01-3-3V4zm4-1.5v.75c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V2.5h1A1.5 1.5 0 0114.5 4v12a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 16V4A1.5 1.5 0 017 2.5h1z" clipRule="evenodd" />
                </svg>
              </span>
              Detalhes do Veículo - {selectedPlate}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
              <div>
                <div className="text-xs text-gray-500">Placa:</div>
                <div className="font-medium">{selectedPlate}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">RENAVAM:</div>
                <div className="font-medium">12345678901</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Tipo de Veículo:</div>
                <div className="font-medium">Semirreboque</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Marca/Modelo:</div>
                <div className="font-medium">RANDON / SR BA</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Ano:</div>
                <div className="font-medium">2021</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Eixos:</div>
                <div className="font-medium">3</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">TARA:</div>
                <div className="font-medium">7.500 kg</div>
              </div>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsViewModalOpen(false)}
            >
              <X className="mr-2 h-4 w-4" />
              Fechar
            </Button>
            <Button type="button" className="gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Baixar CRLV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para editar placa adicional */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </span>
              Editar Veículo - {selectedPlate}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <div className="text-center py-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Edição de veículo</h3>
              <p className="mt-1 text-sm text-gray-500">
                Para editar este veículo, você será redirecionado para a página de veículos.
              </p>
              <div className="mt-6">
                <Button className="w-full">
                  Ir para gerenciamento de veículos
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Modal para editar veículo do conjunto */}
      <Dialog open={isEditVehicleModalOpen} onOpenChange={setIsEditVehicleModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </span>
              Editar Veículo - {selectedVehicle?.plate}
            </DialogTitle>
            <DialogDescription>
              Edite as informações do veículo diretamente neste formulário.
            </DialogDescription>
          </DialogHeader>
          
          {selectedVehicle && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Placa</label>
                  <input 
                    type="text" 
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={selectedVehicle.plate || ''}
                    disabled
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">RENAVAM</label>
                  <input 
                    type="text" 
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={editForm.renavam}
                    onChange={(e) => setEditForm({...editForm, renavam: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Marca</label>
                  <input 
                    type="text" 
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={editForm.brand}
                    onChange={(e) => setEditForm({...editForm, brand: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Modelo</label>
                  <input 
                    type="text" 
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={editForm.model}
                    onChange={(e) => setEditForm({...editForm, model: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Ano</label>
                  <input 
                    type="number" 
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={editForm.year}
                    onChange={(e) => setEditForm({...editForm, year: e.target.value})}
                    min="1950"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Quantidade de Eixos</label>
                  <input 
                    type="number" 
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={editForm.axleCount}
                    onChange={(e) => setEditForm({...editForm, axleCount: e.target.value})}
                    min="1"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">TARA (kg)</label>
                  <input 
                    type="number" 
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={editForm.tare}
                    onChange={(e) => setEditForm({...editForm, tare: e.target.value})}
                    min="1"
                  />
                </div>
                
                {selectedVehicle && ['truck', 'semitrailer', 'trailer'].includes(selectedVehicle.type) && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Tipo de Carroceria</label>
                    <select 
                      className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={editForm.bodyType}
                      onChange={(e) => setEditForm({...editForm, bodyType: e.target.value})}
                    >
                      <option value="">Selecione</option>
                      <option value="open">ABERTA</option>
                      <option value="dump">BASCULANTE</option>
                      <option value="container">PORTA-CONTEINER</option>
                      <option value="closed">FECHADA</option>
                      <option value="tank">TANQUE</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter className="justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsEditVehicleModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="button"
              className="gap-1"
              onClick={() => {
                if (!selectedVehicleId) return;
                
                // Coletar dados do formulário
                const updatedVehicle = {
                  id: selectedVehicleId,
                  renavam: editForm.renavam,
                  brand: editForm.brand,
                  model: editForm.model,
                  year: Number(editForm.year) || 2020,
                  axleCount: Number(editForm.axleCount) || 1,
                  tare: Number(editForm.tare) || 1000
                };
                
                // Adicionar tipo de carroceria se aplicável
                if (selectedVehicle && ['truck', 'semitrailer', 'trailer'].includes(selectedVehicle.type)) {
                  (updatedVehicle as any).bodyType = editForm.bodyType;
                }
                
                // Enviar para o servidor
                updateVehicleMutation.mutate(updatedVehicle);
              }}
              disabled={updateVehicleMutation.isPending}
            >
              {updateVehicleMutation.isPending ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Salvando...
                </div>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Salvar Alterações
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Componente de histórico de status */}
      <div className="mt-6">
        <StatusHistoryNew licenseId={license.id} states={license.states || []} />
      </div>
    </div>
  );
}