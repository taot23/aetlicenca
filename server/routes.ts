import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, hashPassword } from "./auth";
import { db, pool } from "./db";
import { v4 as uuidv4 } from "uuid";
import { 
  insertUserSchema, 
  insertVehicleSchema, 
  insertLicenseRequestSchema, 
  insertDraftLicenseSchema, 
  updateLicenseStatusSchema,
  updateLicenseStateSchema,
  insertStatusHistorySchema,
  LicenseStatus,
  userRoleEnum,
  licenseRequests,
  transporters,
  statusHistories
} from "@shared/schema";
import { eq, sql, or, inArray } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import multer from "multer";
import path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { WebSocketServer, WebSocket } from "ws";

// Set up file storage for uploads
const uploadDir = path.join(process.cwd(), "uploads");
const ensureUploadDir = () => {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (error) {
    console.error("Error creating upload directory:", error);
  }
};

ensureUploadDir();

const storage_config = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only images and PDFs
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

// Middleware para processar dados do veículo, tanto de FormData quanto JSON direto
const processVehicleData = (req: any, res: any, next: any) => {
  console.log('Processing request body:', req.body);
  
  // Se tiver contentType application/json, já está processado como JSON
  const contentType = req.headers['content-type'] || '';
  
  // Caso 1: Dados no formato FormData com campo vehicleData (abordagem antiga)
  if (req.body && req.body.vehicleData) {
    try {
      req.body = {
        ...req.body,
        ...JSON.parse(req.body.vehicleData)
      };
      console.log('Processed vehicle data from vehicleData field:', req.body);
    } catch (error) {
      console.error('Error parsing vehicleData JSON:', error);
    }
  } 
  // Caso 2: FormData com campos individuais (nossa nova abordagem)
  else if (contentType.includes('multipart/form-data') && req.body) {
    // Campos individuais já estão acessíveis em req.body
    console.log('Using form-data fields directly:', req.body);
    
    // Garantir que números são convertidos corretamente
    if (req.body.tare) req.body.tare = Number(req.body.tare);
    if (req.body.crlvYear) req.body.crlvYear = Number(req.body.crlvYear);
  }
  // Caso 3: JSON direto (nossa nova abordagem para requests sem arquivo)
  else if (contentType.includes('application/json')) {
    // Já processado como JSON pelo bodyParser
    console.log('Request is already in JSON format:', req.body);
  }
  
  console.log('Final vehicle data for processing:', req.body);
  next();
};

const upload = multer({ 
  storage: storage_config,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  }
});

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  next();
};

// Admin middleware
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  
  if (!req.user!.isAdmin) {
    return res.status(403).json({ message: "Acesso negado" });
  }
  
  next();
};

// Middleware para usuários com papel Operacional
const requireOperational = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  
  // Verifica se o usuário tem papel Operacional
  if (req.user!.role !== 'operational' && req.user!.role !== 'supervisor' && !req.user!.isAdmin) {
    return res.status(403).json({ 
      message: "Acesso negado. Apenas usuários com perfil Operacional ou Supervisor podem acessar." 
    });
  }
  
  next();
};

// Middleware para usuários com papel Supervisor
const requireSupervisor = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  
  // Verifica se o usuário tem papel Supervisor
  if (req.user!.role !== 'supervisor' && !req.user!.isAdmin) {
    return res.status(403).json({ 
      message: "Acesso negado. Apenas usuários com perfil Supervisor podem acessar." 
    });
  }
  
  next();
};

// Middleware para verificar se o usuário é dono do recurso ou tem papel de staff
const requireOwnerOrStaff = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  
  // Os perfis que podem acessar recursos de outros usuários
  const isStaff = ['operational', 'supervisor'].includes(req.user!.role) || req.user!.isAdmin;
  
  // Se o usuário não é staff, verifica se é o dono do recurso
  if (!isStaff) {
    const resourceUserId = parseInt(req.params.userId);
    if (req.user!.id !== resourceUserId) {
      return res.status(403).json({ 
        message: "Acesso negado. Você só pode acessar seus próprios dados." 
      });
    }
  }
  
  next();
};

// Tipo para as mensagens WebSocket
interface WSMessage {
  type: 'STATUS_UPDATE' | 'LICENSE_UPDATE';
  data: any;
}

// Armazenamento de clientes WebSocket
const wsClients: Set<WebSocket> = new Set();

// Função para transmitir mensagens a todos os clientes conectados
const broadcastMessage = (message: WSMessage) => {
  console.log(`Enviando atualização por WebSocket: ${message.type}`);
  
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Servir arquivos estáticos da pasta uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  
  // Criar o servidor HTTP (definido apenas uma vez)
  const httpServer = createServer(app);
  
  // Configurar o WebSocketServer
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('Novo cliente WebSocket conectado');
    wsClients.add(ws);
    
    ws.on('message', (message) => {
      console.log('Mensagem recebida:', message.toString());
    });
    
    ws.on('close', () => {
      console.log('Cliente WebSocket desconectado');
      wsClients.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('Erro na conexão WebSocket:', error);
      wsClients.delete(ws);
    });
    
    // Enviar mensagem inicial para confirmar conexão
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Conectado ao servidor' }));
  });

  // Cache para armazenar tokens de acesso
  let accessToken: string | undefined = undefined;
  let tokenExpiration: number = 0;

  // Função para obter token de acesso
  async function getAccessToken() {
    try {
      // Verificar se o token atual ainda é válido
      if (accessToken && tokenExpiration > Date.now()) {
        return accessToken;
      }

      // Configurar a solicitação para obter o token
      const tokenUrl = 'https://h-apigateway.conectagov.estaleiro.serpro.gov.br/oauth2/jwt-token';
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
      });

      // Usar chave fornecida pelo cliente
      const authHeader = 'Basic ' + Buffer.from(
        `${process.env.GOV_BR_CLIENT_ID || 'client-id'}:${process.env.GOV_BR_CLIENT_SECRET || 'client-secret'}`
      ).toString('base64');

      // Fazer a solicitação para obter o token
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': authHeader
        },
        body: params
      });

      if (!response.ok) {
        // Se a resposta não for OK, tentar extrair o erro
        const errorText = await response.text();
        console.error('Erro ao obter token de acesso:', errorText);
        throw new Error(`Erro ao obter token: ${response.status} ${response.statusText}`);
      }

      // Extrair o token de acesso da resposta
      const data = await response.json();
      accessToken = data.access_token;
      // Calcular a expiração (normalmente em segundos) e converter para timestamp
      tokenExpiration = Date.now() + (data.expires_in * 1000) - 60000; // 1 minuto antes para evitar problemas
      
      return accessToken;
    } catch (error) {
      console.error('Erro ao obter token de acesso:', error);
      throw error;
    }
  }

  // Endpoint de API para consulta de CNPJ - usando ReceitaWS
  app.get('/api/external/cnpj/:cnpj', async (req, res) => {
    // Definir explicitamente cabeçalhos para evitar intercepção pelo Vite
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const { cnpj } = req.params;
      const cleanCnpj = cnpj.replace(/[^\d]/g, '');
      console.log(`[DEBUG] Consultando CNPJ via ReceitaWS: ${cleanCnpj}`);
      
      if (cleanCnpj.length !== 14) {
        console.log(`[DEBUG] CNPJ inválido: ${cleanCnpj}`);
        return res.status(400).json({ error: 'CNPJ deve conter 14 dígitos' });
      }
      
      // Configurar a solicitação para a ReceitaWS (API pública sem autenticação - consulta básica)
      const receitaWsUrl = `https://www.receitaws.com.br/v1/cnpj/${cleanCnpj}`;
      console.log(`[DEBUG] URL da ReceitaWS: ${receitaWsUrl}`);
      
      // Fazer a solicitação à ReceitaWS
      console.log(`[DEBUG] Enviando solicitação para ReceitaWS`);
      const response = await fetch(receitaWsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AETLicencasApp/1.0)',
        }
      });
      console.log(`[DEBUG] Resposta da ReceitaWS: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DEBUG] Erro na resposta da ReceitaWS: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Erro ao consultar ReceitaWS: ${response.status}`);
      }

      // Processar a resposta da API
      console.log(`[DEBUG] Processando resposta da ReceitaWS`);
      const apiData = await response.json();
      console.log(`[DEBUG] Dados recebidos:`, JSON.stringify(apiData));
      
      // Verificar se a API retornou um erro no corpo da resposta
      if (apiData.status === 'ERROR') {
        console.error(`[DEBUG] Erro reportado pela ReceitaWS:`, apiData.message);
        throw new Error(apiData.message || 'Erro na consulta do CNPJ');
      }
      
      // Mapear os dados da ReceitaWS para o formato esperado pelo frontend
      const dadosEmpresa = {
        razao_social: apiData.nome || '',
        nome_fantasia: apiData.fantasia || '',
        logradouro: apiData.logradouro || '',
        numero: apiData.numero || '',
        complemento: apiData.complemento || '',
        bairro: apiData.bairro || '',
        cep: apiData.cep?.replace(/\D/g, '') || '',
        municipio: apiData.municipio || '',
        uf: apiData.uf || ''
      };
      console.log(`[DEBUG] Dados mapeados:`, JSON.stringify(dadosEmpresa));

      return res.json(dadosEmpresa);
    } catch (error) {
      console.error('[DEBUG] Erro ao processar consulta CNPJ via ReceitaWS:', error);
      return res.status(503).json({ 
        error: 'Não foi possível realizar a consulta do CNPJ', 
        message: error instanceof Error ? error.message : 'Erro ao verificar dados do CNPJ',
        details: 'Não foi possível consultar o CNPJ. Prossiga com o cadastro inserindo os dados manualmente.',
        service_unavailable: true
      });
    }
  });
  
  // API antiga - manter temporariamente para compatibilidade durante a transição
  app.get('/api/cnpj/:cnpj', async (req, res) => {
    const { cnpj } = req.params;
    const cleanCnpj = cnpj.replace(/[^\d]/g, '');
    
    // Verificação de credenciais para avaliação
    if (!process.env.GOV_BR_CLIENT_ID || !process.env.GOV_BR_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: 'Credenciais não configuradas',
        message: 'As credenciais da API Gov.br não estão configuradas corretamente'
      });
    }
    
    // Retornar erro indicando que a consulta requer credenciais
    return res.status(503).json({
      error: 'Serviço temporariamente indisponível',
      message: 'O serviço de consulta de CNPJ requer credenciais válidas da API Gov.br Connect',
      instructions: 'Entre em contato com o administrador do sistema para configurar as credenciais de integração'
    });
  });

  // Dashboard Stats
  app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas do dashboard' });
    }
  });

  app.get('/api/dashboard/vehicle-stats', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getVehicleStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching vehicle stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas de veículos' });
    }
  });

  app.get('/api/dashboard/state-stats', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getStateStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching state stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas por estado' });
    }
  });
  
  // Endpoint para buscar transportadores vinculados ao usuário
  app.get('/api/user/transporters', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const userId = user.id;
      
      // Se for um usuário administrativo, retornar todos os transportadores
      if (isAdminUser(user)) {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso administrativo. Buscando todos os transportadores.`);
        const allTransporters = await storage.getAllTransporters();
        return res.json(allTransporters);
      }
      
      // Para usuários comuns, buscar todos os transportadores e filtrar
      const allTransporters = await storage.getAllTransporters();
      // Filtrar apenas os vinculados ao usuário atual
      const userTransporters = allTransporters.filter(t => t.userId === userId);
      
      console.log(`Usuário ${user.email} encontrou ${userTransporters.length} transportadores vinculados.`);
      res.json(userTransporters);
    } catch (error) {
      console.error('Error fetching user transporters:', error);
      res.status(500).json({ message: 'Erro ao buscar transportadores do usuário' });
    }
  });
  
  // Endpoint para buscar um transportador específico por ID (acessível a todos usuários autenticados)
  app.get('/api/transporters/:id', requireAuth, async (req, res) => {
    try {
      const transporterId = parseInt(req.params.id);
      
      const transporter = await storage.getTransporterById(transporterId);
      if (!transporter) {
        return res.status(404).json({ message: "Transportador não encontrado" });
      }
      
      res.json(transporter);
    } catch (error) {
      console.error("Erro ao buscar transportador:", error);
      res.status(500).json({ message: "Erro ao buscar transportador" });
    }
  });
  
  // Endpoint público para acessar dados básicos de transportadores
  // Usado pelo componente TransporterInfo para exibir informações em licenças
  app.get('/api/public/transporters/:id', async (req, res) => {
    try {
      const transporterId = parseInt(req.params.id);
      
      const transporter = await storage.getTransporterById(transporterId);
      if (!transporter) {
        return res.status(404).json({ message: "Transportador não encontrado" });
      }
      
      // Retorne apenas os dados públicos necessários
      const publicData = {
        id: transporter.id,
        name: transporter.name,
        tradeName: transporter.tradeName,
        personType: transporter.personType,
        documentNumber: transporter.documentNumber,
        city: transporter.city,
        state: transporter.state,
        email: transporter.email,
        phone: transporter.phone
      };
      
      res.json(publicData);
    } catch (error) {
      console.error("Erro ao buscar transportador por ID (público):", error);
      res.status(500).json({ message: "Erro ao buscar detalhes do transportador" });
    }
  });

  // Função auxiliar para verificar se um usuário tem papel administrativo
  function isAdminUser(user: Express.User): boolean {
    return ['admin', 'supervisor', 'operational', 'manager'].includes(user.role);
  }
  
  // Vehicles CRUD endpoints
  app.get('/api/vehicles', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      let vehicles;
      
      // Se for usuário com papel administrativo, buscar todos os veículos
      if (isAdminUser(user)) {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso administrativo. Buscando todos os veículos.`);
        vehicles = await storage.getAllVehicles();
      } else {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso comum. Buscando apenas seus veículos.`);
        vehicles = await storage.getVehiclesByUserId(user.id);
      }
      
      res.json(vehicles);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      res.status(500).json({ message: 'Erro ao buscar veículos' });
    }
  });
  
  // Buscar veículo por ID
  app.get('/api/vehicles/:id([0-9]+)', async (req, res) => {
    try {
      const vehicleId = parseInt(req.params.id);
      
      const vehicle = await storage.getVehicleById(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ message: 'Veículo não encontrado' });
      }
      
      // Definir explicitamente o content-type
      res.setHeader('Content-Type', 'application/json');
      res.json(vehicle);
    } catch (error) {
      console.error('Error fetching vehicle by ID:', error);
      res.status(500).json({ message: 'Erro ao buscar veículo pelo ID' });
    }
  });

  // Buscar veículo por placa
  app.get('/api/vehicles/by-plate/:plate', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const plate = req.params.plate.toUpperCase();
      
      // Buscar veículos do usuário
      const vehicles = await storage.getVehiclesByUserId(userId);
      
      // Encontrar o veículo com a placa correspondente
      const vehicle = vehicles.find(v => v.plate.toUpperCase() === plate);
      
      if (!vehicle) {
        return res.status(404).json({ message: 'Veículo não encontrado' });
      }
      
      res.json(vehicle);
    } catch (error) {
      console.error('Error fetching vehicle by plate:', error);
      res.status(500).json({ message: 'Erro ao buscar veículo pela placa' });
    }
  });
  
  // Endpoint público para buscar veículo por placa (para uso em licenças)
  app.get('/api/public/vehicle-by-plate/:plate', async (req, res) => {
    try {
      const plate = req.params.plate.toUpperCase();
      
      console.log(`Buscando veículo com a placa: ${plate}`);
      
      // Buscar todos os veículos
      const allVehicles = await storage.getAllVehicles();
      console.log(`Total de veículos encontrados: ${allVehicles.length}`);
      
      // Buscar todas as placas disponíveis para debug
      const availablePlates = allVehicles.map(v => v.plate);
      console.log('Placas disponíveis:', availablePlates.join(', '));
      
      // Encontrar o veículo com a placa correspondente
      const vehicle = allVehicles.find(v => v.plate.toUpperCase() === plate);
      
      if (!vehicle) {
        console.log(`Veículo não encontrado com a placa ${plate}`);
        return res.status(404).json({ message: 'Veículo não encontrado' });
      }
      
      console.log(`Veículo encontrado:`, vehicle);
      res.json(vehicle);
    } catch (error) {
      console.error('Error fetching vehicle by plate (public):', error);
      res.status(500).json({ message: 'Erro ao buscar veículo pela placa' });
    }
  });
  
  // Endpoint para buscar todos os veículos (para sugestões de placas)
  // Mantemos a rota original que requer autenticação
  app.get('/api/vehicles/all', requireAuth, async (req, res) => {
    try {
      // Retorna uma lista simplificada de todos os veículos (apenas id, placa e tipo)
      const vehicles = await storage.getAllVehicles();
      const simplifiedVehicles = vehicles.map(v => ({
        id: v.id,
        plate: v.plate,
        type: v.type
      }));
      res.json(simplifiedVehicles);
    } catch (error) {
      console.error('Error fetching all vehicles:', error);
      res.status(500).json({ message: 'Erro ao buscar lista de veículos' });
    }
  });
  
  // Criamos uma nova rota pública específica para sugestões de placas
  app.get('/api/public/vehicle-plates', async (req, res) => {
    try {
      // Retorna apenas as placas de todos os veículos, sem autenticação
      console.log("Recebida requisição para sugestões públicas de placas");
      const vehicles = await storage.getAllVehicles();
      console.log(`Encontrados ${vehicles.length} veículos para sugestões`);
      
      // Extraímos apenas as placas únicas
      const uniquePlates = Array.from(new Set(vehicles.map(v => v.plate)));
      console.log(`${uniquePlates.length} placas únicas disponíveis para sugestão`);
      
      res.json(uniquePlates);
    } catch (error) {
      console.error('Error fetching vehicle plates:', error);
      res.status(500).json({ message: 'Erro ao buscar sugestões de placas' });
    }
  });

  app.post('/api/vehicles', requireAuth, upload.single('crlvFile'), processVehicleData, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Extrair dados do campo vehicleData (JSON string)
      let vehicleData;
      
      // Já processado pelo middleware processVehicleData
      vehicleData = { ...req.body };
      delete vehicleData.vehicleData; // Remove o campo vehicleData se presente
      console.log('Using processed vehicle data:', vehicleData);
      
      // Debug: log the request body
      console.log('Vehicle data received:', vehicleData);
      
      // Validate vehicle data
      try {
        insertVehicleSchema.parse(vehicleData);
      } catch (error: any) {
        console.log('Validation error:', error);
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Add file URL if provided
      let crlvUrl: string | undefined = undefined;
      if (req.file) {
        crlvUrl = `/uploads/${req.file.filename}`;
      }
      
      const vehicle = await storage.createVehicle(userId, {
        ...vehicleData,
        crlvUrl
      });
      
      res.status(201).json(vehicle);
    } catch (error) {
      console.error('Error creating vehicle:', error);
      res.status(500).json({ message: 'Erro ao criar veículo' });
    }
  });

  app.patch('/api/vehicles/:id', requireAuth, upload.single('crlvFile'), processVehicleData, async (req, res) => {
    try {
      const user = req.user!;
      const userId = user.id;
      const vehicleId = parseInt(req.params.id);
      
      // Check if vehicle exists
      const existingVehicle = await storage.getVehicleById(vehicleId);
      if (!existingVehicle) {
        return res.status(404).json({ message: 'Veículo não encontrado' });
      }
      
      // Verificar se o usuário tem permissão para editar o veículo
      // Usuários comuns podem editar apenas seus próprios veículos
      // Administradores, Operacionais e Supervisores podem editar qualquer veículo
      const isStaff = isAdminUser(user) || user.role === 'operational' || user.role === 'supervisor';
      
      if (!isStaff && existingVehicle.userId !== userId) {
        console.log(`Usuário ${userId} (${user.role}) tentou editar veículo ${vehicleId} do usuário ${existingVehicle.userId}`);
        return res.status(403).json({ message: 'Acesso negado' });
      }
      
      console.log(`Usuário ${userId} (${user.role}) autorizado a editar veículo ${vehicleId}`);
      
      
      // Extrair dados do campo vehicleData (JSON string)
      let vehicleData;
      
      // Já processado pelo middleware processVehicleData
      vehicleData = { ...req.body };
      delete vehicleData.vehicleData; // Remove o campo vehicleData se presente
      console.log('Using processed vehicle update data:', vehicleData);
      
      // Validate vehicle data
      try {
        insertVehicleSchema.partial().parse(vehicleData);
      } catch (error: any) {
        console.log('Validation error on update:', error);
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Add file URL if provided
      if (req.file) {
        vehicleData.crlvUrl = `/uploads/${req.file.filename}`;
      }
      
      const updatedVehicle = await storage.updateVehicle(vehicleId, vehicleData);
      
      res.json(updatedVehicle);
    } catch (error) {
      console.error('Error updating vehicle:', error);
      res.status(500).json({ message: 'Erro ao atualizar veículo' });
    }
  });

  app.delete('/api/vehicles/:id', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const userId = user.id;
      const vehicleId = parseInt(req.params.id);
      
      // Check if vehicle exists
      const existingVehicle = await storage.getVehicleById(vehicleId);
      if (!existingVehicle) {
        return res.status(404).json({ message: 'Veículo não encontrado' });
      }
      
      // Verificar se o usuário tem permissão para excluir o veículo
      // Usuários comuns podem excluir apenas seus próprios veículos
      // Administradores, Operacionais e Supervisores podem excluir qualquer veículo
      const isStaff = isAdminUser(user) || user.role === 'operational' || user.role === 'supervisor';
      
      if (!isStaff && existingVehicle.userId !== userId) {
        console.log(`Usuário ${userId} (${user.role}) tentou excluir veículo ${vehicleId} do usuário ${existingVehicle.userId}`);
        return res.status(403).json({ message: 'Acesso negado' });
      }
      
      console.log(`Usuário ${userId} (${user.role}) autorizado a excluir veículo ${vehicleId}`);
      
      
      await storage.deleteVehicle(vehicleId);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      res.status(500).json({ message: 'Erro ao excluir veículo' });
    }
  });

  // License draft endpoints
  app.get('/api/licenses/drafts', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      let allDrafts;
      
      // Se for usuário administrativo, buscar todos os rascunhos
      if (isAdminUser(user)) {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso administrativo. Buscando todos os rascunhos.`);
        allDrafts = await storage.getLicenseDraftsByUserId(0); // 0 = todos os rascunhos
      } else {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso comum. Buscando apenas seus rascunhos.`);
        
        // Primeiro, obter os transportadores associados ao usuário
        const userTransporters = await db.select()
          .from(transporters)
          .where(eq(transporters.userId, user.id));
          
        const transporterIds = userTransporters.map(t => t.id);
        console.log(`[DEBUG RASCUNHOS] Transportadores associados ao usuário ${user.id}: ${transporterIds.join(', ')}`);
        
        // Buscar licenças onde o usuário é o dono OU o transportador está associado ao usuário
        let rascunhosNoBanco = [];
        
        // Se houver transportadores associados, buscar rascunhos por transporterId também
        if (transporterIds.length > 0) {
          // Vamos realizar uma consulta alternativa para entender o que está acontecendo
          // Não vamos usar os resultados desta consulta, apenas para log
          const directQuery = await db.execute(sql`
            SELECT id, user_id, transporter_id, is_draft, status
            FROM license_requests
            WHERE is_draft = true AND (user_id = ${user.id} OR transporter_id = ANY(${transporterIds}))
          `);
          
          console.log(`[DEBUG SQL] Consulta direta SQL retornou:`, directQuery.rows);
          
          // Vamos verificar também todas as licenças para debug
          const allLicensesQuery = await db.execute(sql`
            SELECT id, user_id, transporter_id, is_draft, status
            FROM license_requests
            WHERE (user_id = ${user.id} OR transporter_id = ANY(${transporterIds}))
            ORDER BY id DESC
            LIMIT 10
          `);
          
          console.log(`[DEBUG SQL] Consulta para todas licenças (limitada a 10):`, allLicensesQuery.rows);
          
          // Ainda mantém a consulta original pelo Drizzle ORM
          rascunhosNoBanco = await db.select()
            .from(licenseRequests)
            .where(eq(licenseRequests.isDraft, true))
            .where(
              or(
                eq(licenseRequests.userId, user.id),
                inArray(licenseRequests.transporterId, transporterIds)
              )
            );
            
          console.log(`[DEBUG RASCUNHOS] Encontrados ${rascunhosNoBanco.length} rascunhos para usuário ${user.id} ou transportadores ${transporterIds.join(', ')}`);
        } else {
          // Se não houver transportadores, buscar apenas por userId
          rascunhosNoBanco = await db.select()
            .from(licenseRequests)
            .where(eq(licenseRequests.isDraft, true))
            .where(eq(licenseRequests.userId, user.id));
            
          console.log(`[DEBUG RASCUNHOS] Encontrados ${rascunhosNoBanco.length} rascunhos para usuário ${user.id} sem transportadores associados`);
        }
        
        allDrafts = rascunhosNoBanco;
      }
      
      // Verificar se deve incluir rascunhos de renovação
      const shouldIncludeRenewalDrafts = req.query.includeRenewal === 'true';
      
      // Se não deve incluir rascunhos de renovação, filtrar aqueles que têm comentários sobre renovação
      const drafts = shouldIncludeRenewalDrafts 
        ? allDrafts 
        : allDrafts.filter(draft => {
            // Se o comentário menciona "Renovação", é um rascunho de renovação
            return !(draft.comments && draft.comments.includes('Renovação'));
          });
      
      console.log(`Total de rascunhos: ${allDrafts.length}, filtrados: ${drafts.length}, incluindo renovação: ${shouldIncludeRenewalDrafts}`);
      
      // Verificar quais licenças estão sendo retornadas
      console.log(`[DEBUG DETALHES] Retornando ${drafts.length} licenças com os seguintes IDs:`);
      drafts.forEach(d => {
        console.log(`- ID: ${d.id}, isDraft: ${d.isDraft}, status: ${d.status}, transporterId: ${d.transporterId}`);
      });
      
      // Fazer uma verificação final para garantir que apenas isDraft=true seja retornado
      const realDrafts = drafts.filter(draft => draft.isDraft === true);
      
      console.log(`[CORREÇÃO] Após filtro adicional para garantir isDraft=true: ${realDrafts.length} rascunhos`);
      realDrafts.forEach(d => {
        console.log(`- ID: ${d.id}, isDraft: ${d.isDraft}, status: ${d.status}`);
      });
      
      res.json(realDrafts);
    } catch (error) {
      console.error('Error fetching license drafts:', error);
      res.status(500).json({ message: 'Erro ao buscar rascunhos de licenças' });
    }
  });

  app.post('/api/licenses/drafts', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const draftData = { ...req.body };
      
      console.log("Dados de rascunho recebidos:", JSON.stringify(draftData, null, 2));
      
      // Sanitização mais rigorosa dos campos de dimensões com valores padrão
      console.log("Rascunho: Sanitizando dados para tipo " + draftData.type);
      
      // Valores padrão baseados no tipo de licença - prancha tem limites diferentes
      const isPrancha = draftData.type === "flatbed";
      
      // Verificar width (largura)
      if (draftData.width === undefined || draftData.width === null || draftData.width === "") {
        draftData.width = isPrancha ? 320 : 260; // 3.20m para prancha, 2.60m para outros
        console.log(`Aplicando valor padrão para largura: ${draftData.width}`);
      } else {
        // Garantir que é um número
        draftData.width = Number(draftData.width);
        console.log(`Convertendo largura para número: ${draftData.width}`);
      }
      
      // Verificar height (altura)
      if (draftData.height === undefined || draftData.height === null || draftData.height === "") {
        draftData.height = isPrancha ? 495 : 440; // 4.95m para prancha, 4.40m para outros
        console.log(`Aplicando valor padrão para altura: ${draftData.height}`);
      } else {
        // Garantir que é um número
        draftData.height = Number(draftData.height);
        console.log(`Convertendo altura para número: ${draftData.height}`);
      }
      
      // Verificar cargoType (tipo de carga)
      if (draftData.cargoType === undefined || draftData.cargoType === null || draftData.cargoType === "") {
        draftData.cargoType = isPrancha ? "indivisible_cargo" : "dry_cargo";
        console.log(`Aplicando valor padrão para tipo de carga: ${draftData.cargoType}`);
      }
      
      // Validate draft data
      try {
        insertDraftLicenseSchema.parse(draftData);
      } catch (error: any) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Generate a draft request number
      const draftNumber = `RASCUNHO-${uuidv4().substring(0, 8)}`;
      
      // Garantir que os campos obrigatórios sejam enviados corretamente para o banco de dados
      const sanitizedData = {
        ...draftData,
        width: draftData.width !== undefined ? Number(draftData.width) : null,
        height: draftData.height !== undefined ? Number(draftData.height) : null,
        cargoType: draftData.cargoType || null,
        requestNumber: draftNumber,
        isDraft: true,
      };
      
      console.log("Dados sanitizados para envio ao banco:", sanitizedData);
      
      const draft = await storage.createLicenseDraft(userId, sanitizedData);
      
      res.status(201).json(draft);
    } catch (error) {
      console.error('Error creating license draft:', error);
      res.status(500).json({ message: 'Erro ao criar rascunho de licença' });
    }
  });

  app.patch('/api/licenses/drafts/:id', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const draftId = parseInt(req.params.id);
      
      // Check if draft exists
      const existingDraft = await storage.getLicenseRequestById(draftId);
      if (!existingDraft) {
        return res.status(404).json({ message: 'Rascunho não encontrado' });
      }
      
      // Verificar acesso - usuários staff (admin, operacional, supervisor) podem editar qualquer rascunho
      const isStaff = isAdminUser(user) || user.role === 'operational' || user.role === 'supervisor';
      
      if (!isStaff && existingDraft.userId !== user.id) {
        console.log(`Usuário ${user.id} (${user.role}) tentou editar rascunho ${draftId} do usuário ${existingDraft.userId}`);
        return res.status(403).json({ message: 'Acesso negado' });
      }
      
      console.log(`Usuário ${user.id} (${user.role}) autorizado a editar rascunho ${draftId}`);
      
      
      const draftData = { ...req.body };
      
      console.log("Dados para atualização de rascunho recebidos:", JSON.stringify(draftData, null, 2));
      
      // Garantir que todos os campos obrigatórios não sejam nulos
      if (draftData.type === "flatbed" || existingDraft.type === "flatbed") {
        // Para prancha: verifica requisitos específicos
        console.log("Atualização de rascunho: É prancha");
        if (!draftData.width) draftData.width = existingDraft.width || 260; // Manter valor existente ou valor padrão
        if (!draftData.height) draftData.height = existingDraft.height || 440; // Manter valor existente ou valor padrão
        if (!draftData.cargoType) draftData.cargoType = existingDraft.cargoType || "indivisible_cargo"; // Manter valor existente ou valor padrão
      } else if (draftData.type || existingDraft.type) {
        // Para não-prancha: verifica requisitos gerais
        console.log("Atualização de rascunho: Não é prancha");
        if (!draftData.width) draftData.width = existingDraft.width || 260; // Manter valor existente ou valor padrão
        if (!draftData.height) draftData.height = existingDraft.height || 440; // Manter valor existente ou valor padrão
        if (!draftData.cargoType) draftData.cargoType = existingDraft.cargoType || "dry_cargo"; // Manter valor existente ou valor padrão
      }
      
      // Validate draft data
      try {
        insertDraftLicenseSchema.partial().parse(draftData);
      } catch (error: any) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Garantir que os campos obrigatórios sejam enviados corretamente para o banco de dados
      const sanitizedData = {
        ...draftData,
        width: draftData.width !== undefined ? Number(draftData.width) : existingDraft.width,
        height: draftData.height !== undefined ? Number(draftData.height) : existingDraft.height,
        cargoType: draftData.cargoType || existingDraft.cargoType,
      };
      
      console.log("Dados sanitizados para atualização do rascunho:", sanitizedData);
      
      const updatedDraft = await storage.updateLicenseDraft(draftId, sanitizedData);
      
      res.json(updatedDraft);
    } catch (error) {
      console.error('Error updating license draft:', error);
      res.status(500).json({ message: 'Erro ao atualizar rascunho de licença' });
    }
  });

  app.delete('/api/licenses/drafts/:id', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const draftId = parseInt(req.params.id);
      
      // Check if draft exists
      const existingDraft = await storage.getLicenseRequestById(draftId);
      if (!existingDraft) {
        return res.status(404).json({ message: 'Rascunho não encontrado' });
      }
      
      // Verificar se é um rascunho
      if (!existingDraft.isDraft) {
        return res.status(403).json({ message: 'Este item não é um rascunho' });
      }
      
      // Verificar acesso - usuários staff (admin, operacional, supervisor) podem excluir qualquer rascunho
      const isStaff = isAdminUser(user) || user.role === 'operational' || user.role === 'supervisor';
      
      if (!isStaff && existingDraft.userId !== user.id) {
        console.log(`Usuário ${user.id} (${user.role}) tentou excluir rascunho ${draftId} do usuário ${existingDraft.userId}`);
        return res.status(403).json({ message: 'Acesso negado' });
      }
      
      console.log(`Usuário ${user.id} (${user.role}) autorizado a excluir rascunho ${draftId}`);
      
      
      await storage.deleteLicenseRequest(draftId);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting license draft:', error);
      res.status(500).json({ message: 'Erro ao excluir rascunho de licença' });
    }
  });

  app.post('/api/licenses/drafts/:id/submit', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const draftId = parseInt(req.params.id);
      
      // Check if draft exists
      const existingDraft = await storage.getLicenseRequestById(draftId);
      if (!existingDraft) {
        return res.status(404).json({ message: 'Rascunho não encontrado' });
      }
      
      // Verificar se é um rascunho
      if (!existingDraft.isDraft) {
        return res.status(403).json({ message: 'Este item não é um rascunho ou já foi submetido' });
      }
      
      // Verificar acesso - usuários staff (admin, operacional, supervisor) podem submeter qualquer rascunho
      const isStaff = isAdminUser(user) || user.role === 'operational' || user.role === 'supervisor';
      
      if (!isStaff && existingDraft.userId !== user.id) {
        console.log(`Usuário ${user.id} (${user.role}) tentou submeter rascunho ${draftId} do usuário ${existingDraft.userId}`);
        return res.status(403).json({ message: 'Acesso negado' });
      }
      
      console.log(`Usuário ${user.id} (${user.role}) autorizado a submeter rascunho ${draftId}`);
      
      
      // Garantir que todos os campos obrigatórios não sejam nulos antes de submeter
      const draftData = { ...existingDraft };
      
      if (draftData.type === "flatbed") {
        // Para prancha: verifica requisitos específicos
        console.log("Rascunho para submissão: É prancha");
        if (!draftData.width) draftData.width = 260; // 2.60m padrão
        if (!draftData.height) draftData.height = 440; // 4.40m padrão
        if (!draftData.cargoType) draftData.cargoType = "indivisible_cargo"; // Carga indivisível padrão
      } else if (draftData.type) {
        // Para não-prancha: verifica requisitos gerais
        console.log("Rascunho para submissão: Não é prancha");
        if (!draftData.width) draftData.width = 260; // 2.60m padrão
        if (!draftData.height) draftData.height = 440; // 4.40m padrão
        if (!draftData.cargoType) draftData.cargoType = "dry_cargo"; // Carga seca padrão
      }
      
      // Atualizar o rascunho com os dados sanitizados
      await storage.updateLicenseDraft(draftId, {
        width: draftData.width,
        height: draftData.height,
        cargoType: draftData.cargoType
      });
      
      console.log("Rascunho sanitizado antes de submeter:", draftData);
      
      // Generate a real request number
      const requestNumber = `AET-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      
      // Submit the draft as a real license request
      const licenseRequest = await storage.submitLicenseDraft(draftId, requestNumber);
      
      res.json(licenseRequest);
    } catch (error) {
      console.error('Error submitting license draft:', error);
      res.status(500).json({ message: 'Erro ao enviar solicitação de licença' });
    }
  });
  
  // Novo endpoint específico para submissão de formulário de licença
  app.post('/api/licenses/submit', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      console.log("Recebendo dados do formulário:", req.body);
      
      const licenseData = { ...req.body };
      console.log("Verificando estados solicitados:", licenseData.requestedStates);
      
      // Se tiver um ID de rascunho, usa o fluxo de submissão de rascunho
      if (licenseData.id) {
        const draftId = licenseData.id;
        const existingDraft = await storage.getLicenseRequestById(draftId);
        
        if (!existingDraft) {
          return res.status(404).json({ message: 'Rascunho não encontrado' });
        }
        
        // Verificar se é um rascunho
        if (!existingDraft.isDraft) {
          return res.status(403).json({ message: 'Este item não é um rascunho ou já foi submetido' });
        }
        
        // Verificar acesso - usuários staff (admin, operacional, supervisor) podem submeter qualquer rascunho
        const isStaff = isAdminUser(user) || user.role === 'operational' || user.role === 'supervisor';
        
        if (!isStaff && existingDraft.userId !== user.id) {
          console.log(`Usuário ${user.id} (${user.role}) tentou submeter rascunho ${draftId} do usuário ${existingDraft.userId}`);
          return res.status(403).json({ message: 'Acesso negado' });
        }
        
        console.log(`Usuário ${user.id} (${user.role}) autorizado a submeter rascunho ${draftId}`);
        
        // Generate a real request number
        const requestNumber = `AET-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        
        // Update the draft with the new data
        await storage.updateLicenseDraft(draftId, {
          ...licenseData,
          isDraft: false,
        });
        
        // Submit the updated draft as a real license request
        const licenseRequest = await storage.submitLicenseDraft(draftId, requestNumber);
        
        console.log("Licença submetida com sucesso:", licenseRequest.id);
        return res.json(licenseRequest);
      } 
      // Caso contrário, cria uma nova licença
      else {
        // Faz as validações básicas necessárias
        if (!licenseData.transporterId) {
          return res.status(400).json({ message: 'Transportador é obrigatório' });
        }
        
        if (!licenseData.type) {
          return res.status(400).json({ message: 'Tipo de conjunto é obrigatório' });
        }
        
        if (!licenseData.requestedStates || licenseData.requestedStates.length === 0) {
          return res.status(400).json({ message: 'Selecione pelo menos um estado' });
        }
        
        // Prepara dados para criar a licença
        const requestNumber = `AET-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        
        // Converte estados solicitados para o formato esperado no backend
        licenseData.states = licenseData.requestedStates || licenseData.states || [];
        console.log("Estados processados para envio:", licenseData.states);
        
        // Define valores padrão se necessário
        if (!licenseData.mainVehiclePlate) {
          licenseData.mainVehiclePlate = "Não especificado";
        }
        
        if (!licenseData.length) {
          licenseData.length = 2000; // 20 metros em centímetros
        }
        
        // Sanitizar campos de dimensões e tipo de carga
        if (licenseData.width === undefined || licenseData.width === null) {
          // Valores padrão com base no tipo de licença
          licenseData.width = licenseData.type === "flatbed" ? 320 : 260; // 3.20m ou 2.60m
        }
        
        if (licenseData.height === undefined || licenseData.height === null) {
          // Valores padrão com base no tipo de licença
          licenseData.height = licenseData.type === "flatbed" ? 495 : 440; // 4.95m ou 4.40m
        }
        
        if (licenseData.cargoType === undefined || licenseData.cargoType === null || licenseData.cargoType === "") {
          // Valores padrão com base no tipo de licença
          licenseData.cargoType = licenseData.type === "flatbed" ? "indivisible_cargo" : "dry_cargo";
        }
        
        console.log("Dados processados para envio:", {
          ...licenseData,
          requestNumber,
          isDraft: false
        });
        
        // Cria a licença
        const licenseRequest = await storage.createLicenseRequest(user.id, {
          ...licenseData,
          requestNumber,
          isDraft: false,
        });
        
        console.log("Nova licença criada com sucesso:", licenseRequest.id);
        return res.json(licenseRequest);
      }
    } catch (error) {
      console.error('Erro ao enviar solicitação de licença:', error);
      res.status(500).json({ message: 'Erro ao enviar solicitação de licença' });
    }
  });

  // License request endpoints
  app.get('/api/licenses', requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      let allLicenses;
      
      // Se for usuário administrativo, buscar todas as licenças
      if (isAdminUser(user)) {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso administrativo. Buscando todas as licenças.`);
        allLicenses = await storage.getAllLicenseRequests();
      } else {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso comum. Buscando apenas suas licenças.`);
        
        // Primeiro, obter os transportadores associados ao usuário
        const userTransporters = await db.select()
          .from(transporters)
          .where(eq(transporters.userId, user.id));
          
        const transporterIds = userTransporters.map(t => t.id);
        console.log(`[DEBUG ACOMPANHAR LICENÇAS] Transportadores associados ao usuário ${user.id}: ${transporterIds.join(', ')}`);
        
        // Buscar licenças onde o usuário é o dono OU o transportador está associado ao usuário
        let licencasNoBanco = [];
        
        // Se houver transportadores associados, buscar licenças por transporterId também
        if (transporterIds.length > 0) {
          licencasNoBanco = await db.select()
            .from(licenseRequests)
            .where(
              or(
                eq(licenseRequests.userId, user.id),
                inArray(licenseRequests.transporterId, transporterIds)
              )
            );
            
          console.log(`[DEBUG ACOMPANHAR LICENÇAS] Encontradas ${licencasNoBanco.length} licenças para usuário ${user.id} ou transportadores ${transporterIds.join(', ')}`);
        } else {
          // Se não houver transportadores, buscar apenas por userId
          licencasNoBanco = await db.select()
            .from(licenseRequests)
            .where(eq(licenseRequests.userId, user.id));
            
          console.log(`[DEBUG ACOMPANHAR LICENÇAS] Encontradas ${licencasNoBanco.length} licenças para usuário ${user.id} sem transportadores associados`);
        }
        
        allLicenses = licencasNoBanco;
      }
      
      // Verificar se deve incluir rascunhos de renovação
      const shouldIncludeRenewalDrafts = req.query.includeRenewal === 'true';
      
      // Filtrar rascunhos de renovação, a menos que solicitado explicitamente para incluí-los
      const licenses = shouldIncludeRenewalDrafts 
        ? allLicenses 
        : allLicenses.filter(license => {
            // Se é um rascunho e o comentário menciona "Renovação", é um rascunho de renovação
            if (license.isDraft && license.comments && license.comments.includes('Renovação')) {
              return false; // excluir rascunhos de renovação
            }
            return true; // manter todos os outros
          });
      
      console.log(`Total de licenças: ${allLicenses.length}, filtradas: ${licenses.length}, incluindo renovação: ${shouldIncludeRenewalDrafts}`);
      
      res.json(licenses);
    } catch (error) {
      console.error('Error fetching license requests:', error);
      res.status(500).json({ message: 'Erro ao buscar solicitações de licenças' });
    }
  });

  app.post('/api/licenses', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const licenseData = { ...req.body };
      
      console.log("Dados de licença recebidos:", JSON.stringify(licenseData, null, 2));
      console.log("Tipo de licença:", licenseData.type);
      console.log("Tipo de carga:", licenseData.cargoType);
      console.log("Comprimento:", licenseData.length);
      console.log("Largura:", licenseData.width);
      console.log("Altura:", licenseData.height);
      console.log("Comprimento da licença:", licenseData.length);
      console.log("Tipo do valor do comprimento:", typeof licenseData.length);
      
      // Sanitização mais rigorosa dos campos de dimensões com valores padrão
      console.log("Sanitizando dados para tipo " + licenseData.type);
      
      // Valores padrão baseados no tipo de licença - prancha tem limites diferentes
      const isPrancha = licenseData.type === "flatbed";
      
      // Verificar width (largura)
      if (licenseData.width === undefined || licenseData.width === null || licenseData.width === "") {
        licenseData.width = isPrancha ? 320 : 260; // 3.20m para prancha, 2.60m para outros
        console.log(`Aplicando valor padrão para largura: ${licenseData.width}`);
      } else {
        // Garantir que é um número
        licenseData.width = Number(licenseData.width);
        console.log(`Convertendo largura para número: ${licenseData.width}`);
      }
      
      // Verificar height (altura)
      if (licenseData.height === undefined || licenseData.height === null || licenseData.height === "") {
        licenseData.height = isPrancha ? 495 : 440; // 4.95m para prancha, 4.40m para outros
        console.log(`Aplicando valor padrão para altura: ${licenseData.height}`);
      } else {
        // Garantir que é um número
        licenseData.height = Number(licenseData.height);
        console.log(`Convertendo altura para número: ${licenseData.height}`);
      }
      
      // Verificar cargoType (tipo de carga)
      if (licenseData.cargoType === undefined || licenseData.cargoType === null || licenseData.cargoType === "") {
        licenseData.cargoType = isPrancha ? "indivisible_cargo" : "dry_cargo";
        console.log(`Aplicando valor padrão para tipo de carga: ${licenseData.cargoType}`);
      }
      
      console.log("Dados sanitizados para envio ao banco:", licenseData);
      
      // Bypass validação temporariamente para entender o problema
      try {
        // Verificações mínimas ao invés da validação completa
        if (!licenseData.transporterId) {
          return res.status(400).json({ message: "Um transportador deve ser selecionado" });
        }
        
        if (!licenseData.type) {
          return res.status(400).json({ message: "O tipo é obrigatório" });
        }
        
        if (!licenseData.states || licenseData.states.length === 0) {
          return res.status(400).json({ message: "Selecione pelo menos um estado" });
        }
        
        if (!licenseData.mainVehiclePlate) {
          return res.status(400).json({ message: "A placa principal é obrigatória" });
        }
        
        // Nenhuma validação ou conversão de dimensões no backend
        // Todas as validações são feitas no frontend conforme o tipo específico
        // Valores de comprimento, largura e altura são mantidos exatamente como enviados do frontend
      } catch (error: any) {
        console.error("Erro de validação manual:", error);
        return res.status(400).json({ message: error.message || "Erro na validação" });
      }
      
      // Generate a request number
      const requestNumber = `AET-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      
      // Garantir que os campos obrigatórios sejam enviados corretamente para o banco de dados
      // Conversão explícita de tipos para evitar problemas de nulos
      const sanitizedData = {
        ...licenseData,
        width: licenseData.width !== undefined ? Number(licenseData.width) : null,
        height: licenseData.height !== undefined ? Number(licenseData.height) : null,
        cargoType: licenseData.cargoType || null,
        requestNumber,
        isDraft: false,
      };
      
      console.log("Dados sanitizados para envio ao banco:", sanitizedData);
      
      const licenseRequest = await storage.createLicenseRequest(userId, sanitizedData);
      
      res.status(201).json(licenseRequest);
    } catch (error) {
      console.error('Error creating license request:', error);
      res.status(500).json({ message: 'Erro ao criar solicitação de licença' });
    }
  });
  
  // Endpoint para enviar um pedido de licença (usado no formulário frontened)
  app.post('/api/licenses/submit', requireAuth, async (req, res) => {
    try {
      console.log('Received submit request with data:', JSON.stringify(req.body, null, 2));
      
      const user = req.user!;
      const userId = user.id;
      const licenseData = { ...req.body };
      
      console.log("Tipo de licença:", licenseData.type);
      console.log("Tipo de carga:", licenseData.cargoType);
      console.log("Comprimento:", licenseData.length);
      console.log("Largura:", licenseData.width);
      console.log("Altura:", licenseData.height);
      
      // Se é um rascunho existente, redireciona para a rota correspondente
      if (licenseData.id) {
        const draftId = licenseData.id;
        
        // Check if draft exists and belongs to the user
        const existingDraft = await storage.getLicenseRequestById(draftId);
        if (!existingDraft) {
          return res.status(404).json({ message: 'Rascunho não encontrado' });
        }
        
        if (existingDraft.userId !== userId) {
          return res.status(403).json({ message: 'Acesso negado' });
        }
        
        // Generate a real request number
        const requestNumber = `AET-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        
        // Submit the draft as a real license request
        const licenseRequest = await storage.submitLicenseDraft(draftId, requestNumber);
        
        return res.json(licenseRequest);
      }
      
      // Caso seja uma criação direta
      // Definindo valores padrão para campos obrigatórios, se não existirem
      if (!licenseData.status) {
        licenseData.status = 'pending_registration';
      }
      
      if (!licenseData.states || !Array.isArray(licenseData.states)) {
        licenseData.states = licenseData.requestedStates || [];
      }
      
      // Preparando estado das solicitações por estado
      if (!licenseData.stateStatuses) {
        licenseData.stateStatuses = licenseData.states.map((state: string) => `${state}:pending_registration`);
      }
      
      // Ensure additionalPlates is properly formatted
      licenseData.additionalPlates = licenseData.additionalPlates || [];
      
      // Generate a request number
      const requestNumber = `AET-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      
      // Validate license data (partially - since we're more permissive with client-side submissions)
      try {
        // Vamos fazer somente algumas validações básicas
        if (!licenseData.transporterId) {
          return res.status(400).json({ message: "Um transportador deve ser selecionado" });
        }
        
        if (!licenseData.type) {
          return res.status(400).json({ message: "O tipo é obrigatório" });
        }
        
        if (!licenseData.states || licenseData.states.length === 0) {
          return res.status(400).json({ message: "Selecione pelo menos um estado" });
        }
        
        if (!licenseData.mainVehiclePlate) {
          return res.status(400).json({ message: "A placa principal é obrigatória" });
        }
        
        if (!licenseData.length || licenseData.length <= 0) {
          return res.status(400).json({ message: "O comprimento deve ser positivo" });
        }
      } catch (error: any) {
        console.error('Validation error:', error);
        return res.status(400).json({ message: error.message || "Erro de validação" });
      }
      
      // Sanitização mais rigorosa dos campos de dimensões com valores padrão
      console.log("Sanitizando dados para tipo " + licenseData.type);
      
      // Valores padrão baseados no tipo de licença - prancha tem limites diferentes
      const isPrancha = licenseData.type === "flatbed";
      
      // Verificar width (largura)
      if (licenseData.width === undefined || licenseData.width === null || licenseData.width === "") {
        licenseData.width = isPrancha ? 320 : 260; // 3.20m para prancha, 2.60m para outros
        console.log(`Aplicando valor padrão para largura: ${licenseData.width}`);
      } else {
        // Garantir que é um número
        licenseData.width = Number(licenseData.width);
        console.log(`Convertendo largura para número: ${licenseData.width}`);
      }
      
      // Verificar height (altura)
      if (licenseData.height === undefined || licenseData.height === null || licenseData.height === "") {
        licenseData.height = isPrancha ? 495 : 440; // 4.95m para prancha, 4.40m para outros
        console.log(`Aplicando valor padrão para altura: ${licenseData.height}`);
      } else {
        // Garantir que é um número
        licenseData.height = Number(licenseData.height);
        console.log(`Convertendo altura para número: ${licenseData.height}`);
      }
      
      // Verificar cargoType (tipo de carga)
      if (licenseData.cargoType === undefined || licenseData.cargoType === null || licenseData.cargoType === "") {
        licenseData.cargoType = isPrancha ? "indivisible_cargo" : "dry_cargo";
        console.log(`Aplicando valor padrão para tipo de carga: ${licenseData.cargoType}`);
      }
      
      // Garantir que os campos obrigatórios sejam enviados corretamente para o banco de dados
      // Conversão explícita de tipos para evitar problemas de nulos
      const sanitizedData = {
        ...licenseData,
        width: licenseData.width !== undefined ? Number(licenseData.width) : null,
        height: licenseData.height !== undefined ? Number(licenseData.height) : null,
        cargoType: licenseData.cargoType || null,
        requestNumber,
        isDraft: false,
      };
      
      console.log('Creating license request with data:', JSON.stringify(sanitizedData, null, 2));
      
      const licenseRequest = await storage.createLicenseRequest(userId, sanitizedData);
      
      console.log('License request saved to database:', JSON.stringify(licenseRequest, null, 2));
      
      res.json(licenseRequest);
    } catch (error) {
      console.error('Error submitting license request:', error);
      res.status(500).json({ message: 'Erro ao enviar solicitação de licença', error: String(error) });
    }
  });

  // Renovar licença para um estado específico
  app.post('/api/licenses/renew', requireAuth, async (req, res) => {
    try {
      const { licenseId, state } = req.body;
      
      if (!licenseId || !state) {
        return res.status(400).json({ message: 'ID da licença e estado são obrigatórios' });
      }
      
      const userId = req.user!.id;
      
      // Verificar se a licença existe
      const originalLicense = await storage.getLicenseRequestById(licenseId);
      if (!originalLicense) {
        return res.status(404).json({ message: 'Pedido de licença não encontrado' });
      }
      
      // Verificar se o usuário é o dono da licença ou tem papel administrativo
      if (originalLicense.userId !== userId && !isAdminUser(req.user!)) {
        return res.status(403).json({ message: 'Você não tem permissão para renovar esta licença' });
      }
      
      // Verificar se o estado está presente na licença original
      if (!originalLicense.states.includes(state)) {
        return res.status(400).json({ message: `O estado ${state} não faz parte da licença original` });
      }
      
      // Gerar número de pedido baseado no ano atual
      const requestNumber = `AET-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      // Criar um novo rascunho baseado na licença original, mas apenas com o estado escolhido
      // Aqui, precisamos garantir que os campos opcionais sejam tratados corretamente
      const draftData: any = {
        transporterId: originalLicense.transporterId || null,
        mainVehiclePlate: originalLicense.mainVehiclePlate,
        length: originalLicense.length || 0,
        type: originalLicense.type,
        // Valores padrão para campos opcionais
        width: originalLicense.width || (originalLicense.type === "flatbed" ? 320 : 260),
        height: originalLicense.height || (originalLicense.type === "flatbed" ? 495 : 440),
        cargoType: originalLicense.cargoType || (originalLicense.type === "flatbed" ? "indivisible_cargo" : "dry_cargo"),
        // Incluir apenas o estado específico sendo renovado
        states: [state],
        requestNumber,
        isDraft: true,
        comments: `Renovação da licença ${originalLicense.requestNumber} para o estado ${state}`,
      };
      
      // Copiar campos de referência de veículos somente se existirem
      if (originalLicense.tractorUnitId) draftData.tractorUnitId = originalLicense.tractorUnitId;
      if (originalLicense.firstTrailerId) draftData.firstTrailerId = originalLicense.firstTrailerId;
      if (originalLicense.dollyId) draftData.dollyId = originalLicense.dollyId;
      if (originalLicense.secondTrailerId) draftData.secondTrailerId = originalLicense.secondTrailerId; 
      if (originalLicense.flatbedId) draftData.flatbedId = originalLicense.flatbedId;
      
      // Garantir que arrays existam ou sejam vazios
      draftData.additionalPlates = originalLicense.additionalPlates || [];
      draftData.additionalPlatesDocuments = originalLicense.additionalPlatesDocuments || [];
      
      // Logar os dados que serão enviados para criar o rascunho
      console.log("[RENOVAÇÃO] Criando rascunho com os seguintes dados:", JSON.stringify(draftData, null, 2));
      
      // Criar o novo rascunho
      const newDraft = await storage.createLicenseDraft(userId, draftData);
      
      // Logar o rascunho criado
      console.log("[RENOVAÇÃO] Rascunho criado com sucesso:", JSON.stringify(newDraft, null, 2));
      
      // Responder com o novo rascunho criado
      res.status(201).json({
        message: `Licença renovada com sucesso para o estado ${state}`,
        draft: newDraft
      });
    } catch (error) {
      console.error('Error renewing license:', error);
      
      // Logar os detalhes para diagnóstico
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      // Verificar se é um erro conhecido e fornecer mensagem mais específica
      const errorMessage = error instanceof Error 
        ? `Erro ao renovar licença: ${error.message}`
        : 'Erro ao renovar licença';
      
      res.status(500).json({ message: errorMessage });
    }
  });

  app.get('/api/licenses/issued', requireAuth, async (req, res) => {
    try {
      console.log("[DEBUG LICENÇAS EMITIDAS] Início da rota");
      
      const user = req.user!;
      let issuedLicenses = [];
      
      // Se for usuário administrativo, buscar todas as licenças emitidas
      if (isAdminUser(user)) {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso administrativo. Buscando todas as licenças emitidas.`);
        
        // Buscar diretamente no banco se há licenças com estado aprovado
        const licencasNoBanco = await db.select().from(licenseRequests).where(eq(licenseRequests.isDraft, false));
        console.log(`[DEBUG LICENÇAS EMITIDAS] Total de licenças não-rascunho no banco: ${licencasNoBanco.length}`);
        
        // Filtrar licenças com estado aprovado manualmente
        const licencasAprovadas = licencasNoBanco.filter(lic => {
          console.log(`[DEBUG LICENÇAS EMITIDAS] Avaliando licença #${lic.id} - stateStatuses: ${JSON.stringify(lic.stateStatuses)}`);
          
          // Verificar estados aprovados
          const temEstadoAprovado = lic.stateStatuses && 
                                   Array.isArray(lic.stateStatuses) && 
                                   lic.stateStatuses.some(ss => ss.includes(':approved'));
          
          console.log(`[DEBUG LICENÇAS EMITIDAS] Licença #${lic.id} - Tem estado aprovado: ${temEstadoAprovado ? 'SIM' : 'NÃO'}`);
          
          return temEstadoAprovado;
        });
        
        console.log(`[DEBUG LICENÇAS EMITIDAS] Total de licenças filtradas com estado aprovado: ${licencasAprovadas.length}`);
        issuedLicenses = licencasAprovadas;
      } else {
        console.log(`Usuário ${user.email} (${user.role}) tem acesso comum. Buscando apenas suas licenças emitidas.`);
        
        // Para usuários comuns, buscar também diretamente do banco
        // Primeiro, obter os transportadores associados ao usuário
        const userTransporters = await db.select()
          .from(transporters)
          .where(eq(transporters.userId, user.id));
          
        const transporterIds = userTransporters.map(t => t.id);
        console.log(`[DEBUG LICENÇAS EMITIDAS] Transportadores associados ao usuário ${user.id}: ${transporterIds.join(', ')}`);
        
        // Buscar licenças onde o usuário é o dono OU o transportador está associado ao usuário
        let licencasNoBanco = [];
        
        // Se houver transportadores associados, buscar licenças por transporterId também
        if (transporterIds.length > 0) {
          licencasNoBanco = await db.select()
            .from(licenseRequests)
            .where(eq(licenseRequests.isDraft, false))
            .where(
              or(
                eq(licenseRequests.userId, user.id),
                inArray(licenseRequests.transporterId, transporterIds)
              )
            );
            
          console.log(`[DEBUG LICENÇAS EMITIDAS] Encontradas ${licencasNoBanco.length} licenças para usuário ${user.id} ou transportadores ${transporterIds.join(', ')}`);
        } else {
          // Se não houver transportadores, buscar apenas por userId
          licencasNoBanco = await db.select()
            .from(licenseRequests)
            .where(eq(licenseRequests.isDraft, false))
            .where(eq(licenseRequests.userId, user.id));
            
          console.log(`[DEBUG LICENÇAS EMITIDAS] Encontradas ${licencasNoBanco.length} licenças para usuário ${user.id} sem transportadores associados`);
        }
        
        // Filtrar licenças com estado aprovado manualmente
        issuedLicenses = licencasNoBanco.filter(lic => {
          // Verificar estados aprovados
          return lic.stateStatuses && 
                 Array.isArray(lic.stateStatuses) && 
                 lic.stateStatuses.some(ss => ss.includes(':approved'));
        });
        
        console.log(`[DEBUG LICENÇAS EMITIDAS] Total de licenças emitidas para o usuário ${user.id}: ${issuedLicenses.length}`);
      }
      
      // Log das licenças que serão retornadas
      console.log(`[DEBUG LICENÇAS EMITIDAS] Retornando ${issuedLicenses.length} licenças emitidas`);
      console.log(`[DEBUG LICENÇAS EMITIDAS] IDs: ${issuedLicenses.map(l => l.id).join(', ')}`);
      
      res.json(issuedLicenses);
    } catch (error) {
      console.error('Error fetching issued licenses:', error);
      res.status(500).json({ message: 'Erro ao buscar licenças emitidas' });
    }
  });

  // Endpoint para buscar o histórico de status de uma licença
  app.get('/api/licenses/:id/status-history', requireAuth, async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      
      // Verifica se a licença existe
      const license = await storage.getLicenseRequestById(licenseId);
      if (!license) {
        return res.status(404).json({ message: 'Licença não encontrada' });
      }
      
      // Verifica se o usuário tem permissão para acessar essa licença
      const isStaff = ['operational', 'supervisor', 'admin'].includes(req.user!.role);
      if (!isStaff && license.userId !== req.user!.id) {
        return res.status(403).json({ message: 'Sem permissão para acessar o histórico desta licença' });
      }
      
      // Busca o histórico completo
      const statusHistory = await storage.getStatusHistoryByLicenseId(licenseId);
      
      res.json(statusHistory);
    } catch (error) {
      console.error('Erro ao buscar histórico de status:', error);
      res.status(500).json({ message: 'Erro ao buscar histórico de status' });
    }
  });
  
  // Endpoint para buscar o histórico de status de um estado específico na licença
  app.get('/api/licenses/:id/status-history/:state', requireAuth, async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      const state = req.params.state;
      
      // Verifica se a licença existe
      const license = await storage.getLicenseRequestById(licenseId);
      if (!license) {
        return res.status(404).json({ message: 'Licença não encontrada' });
      }
      
      // Verifica se o usuário tem permissão para acessar essa licença
      const isStaff = ['operational', 'supervisor', 'admin'].includes(req.user!.role);
      if (!isStaff && license.userId !== req.user!.id) {
        return res.status(403).json({ message: 'Sem permissão para acessar o histórico desta licença' });
      }
      
      // Verifica se o estado existe na licença
      if (!license.states.includes(state)) {
        return res.status(400).json({ message: 'Estado não encontrado na licença' });
      }
      
      // Busca o histórico para o estado específico
      const stateHistory = await storage.getStatusHistoryByState(licenseId, state);
      
      res.json(stateHistory);
    } catch (error) {
      console.error('Erro ao buscar histórico de status do estado:', error);
      res.status(500).json({ message: 'Erro ao buscar histórico de status do estado' });
    }
  });

  // Admin endpoints
  // Endpoint para buscar todas as licenças - acessível para Admin, Operacional e Supervisor
  // Rota para admin/operational obter todas as licenças
  app.get('/api/admin/licenses', requireOperational, async (req, res) => {
    try {
      // Obter todas as licenças
      const allLicenses = await storage.getAllLicenseRequests();
      
      // Verificar se deve incluir rascunhos de renovação (por padrão não inclui)
      const shouldIncludeRenewalDrafts = req.query.includeRenewal === 'true';
      
      // Filtrar rascunhos de renovação, a menos que solicitado explicitamente para incluí-los
      const licenses = shouldIncludeRenewalDrafts 
        ? allLicenses 
        : allLicenses.filter(license => {
            // Se é um rascunho e o comentário menciona "Renovação", é um rascunho de renovação
            if (license.isDraft && license.comments && license.comments.includes('Renovação')) {
              return false; // excluir rascunhos de renovação
            }
            return true; // manter todos os outros
          });
      
      // Log para diagnóstico
      if (licenses.length > 0) {
        // Get direct database row of last license for comparison
        const lastLicenseId = licenses[licenses.length - 1].id;
        const dbResult = await db.select().from(licenseRequests).where(eq(licenseRequests.id, lastLicenseId));
        
        console.log("Licença exemplo recuperada:", JSON.stringify(licenses[licenses.length - 1], null, 2));
        console.log("Mesma licença diretamente do banco de dados:", JSON.stringify(dbResult[0], null, 2));
      }
      
      console.log(`Total de licenças admin: ${allLicenses.length}, filtradas: ${licenses.length}, incluindo renovação: ${shouldIncludeRenewalDrafts}`);
      
      res.json(licenses);
    } catch (error) {
      console.error('Error fetching all license requests:', error);
      res.status(500).json({ message: 'Erro ao buscar todas as solicitações de licenças' });
    }
  });
  
  // Endpoint para excluir uma licença - acessível apenas para Admin
  app.delete('/api/admin/licenses/:id', requireAdmin, async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      
      // Verificar se a licença existe
      const existingLicense = await storage.getLicenseRequestById(licenseId);
      if (!existingLicense) {
        return res.status(404).json({ message: 'Licença não encontrada' });
      }
      
      // Excluir a licença
      await storage.deleteLicenseRequest(licenseId);
      
      res.status(200).json({ message: 'Licença excluída com sucesso' });
    } catch (error: any) {
      console.error('Erro ao excluir licença:', error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Rota para staff (operational/supervisor) obter todas as licenças
  app.get('/api/staff/licenses', requireOperational, async (req, res) => {
    try {
      // Obter todas as licenças
      const allLicenses = await storage.getAllLicenseRequests();
      
      // Verificar se deve incluir rascunhos de renovação (por padrão não inclui)
      const shouldIncludeRenewalDrafts = req.query.includeRenewal === 'true';
      
      // Filtrar rascunhos de renovação, a menos que solicitado explicitamente para incluí-los
      const licenses = shouldIncludeRenewalDrafts 
        ? allLicenses 
        : allLicenses.filter(license => {
            // Se é um rascunho e o comentário menciona "Renovação", é um rascunho de renovação
            if (license.isDraft && license.comments && license.comments.includes('Renovação')) {
              return false; // excluir rascunhos de renovação
            }
            return true; // manter todos os outros
          });
      
      console.log(`Total de licenças staff: ${allLicenses.length}, filtradas: ${licenses.length}, incluindo renovação: ${shouldIncludeRenewalDrafts}`);
      
      res.json(licenses);
    } catch (error) {
      console.error('Error fetching all license requests for staff:', error);
      res.status(500).json({ message: 'Erro ao buscar todas as solicitações de licenças' });
    }
  });
  
  // Rota para admin check
  app.get('/api/admin/check', requireAuth, (req, res) => {
    const user = req.user!;
    
    if (user.isAdmin) {
      res.json({ message: "Acesso de administrador confirmado" });
    } else {
      res.status(403).json({ message: "Acesso negado" });
    }
  });
  
  // Rotas para staff check
  app.get('/api/staff/check-operational', requireAuth, (req, res) => {
    const user = req.user!;
    
    if (user.role === 'operational' || user.role === 'supervisor' || user.isAdmin) {
      res.json({ message: "Acesso operacional confirmado" });
    } else {
      res.status(403).json({ message: "Acesso negado. Perfil operacional necessário" });
    }
  });
  
  app.get('/api/staff/check-supervisor', requireAuth, (req, res) => {
    const user = req.user!;
    
    if (user.role === 'supervisor' || user.isAdmin) {
      res.json({ message: "Acesso de supervisor confirmado" });
    } else {
      res.status(403).json({ message: "Acesso negado. Perfil de supervisor necessário" });
    }
  });
  
  /* Rota removida para evitar duplicação - já existe implementação abaixo
  // Rota para obter usuários não-admin para seleção
  app.get('/api/admin/non-admin-users', requireAdmin, async (req, res) => {
    try {
      const users = await storage.getNonAdminUsers();
      res.json(users);
    } catch (error) {
      console.error('Erro ao buscar usuários não-admin:', error);
      res.status(500).json({ message: 'Erro ao buscar usuários não-admin' });
    }
  });
  */
  
  // Dashboard Admin
  app.get('/api/admin/dashboard/stats', requireAdmin, async (req, res) => {
    try {
      // Como é admin, vamos pegar as estatísticas gerais, não específicas de um usuário
      const stats = await storage.getDashboardStats(0); // 0 = all users
      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin dashboard stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas do dashboard administrativo' });
    }
  });

  app.get('/api/admin/dashboard/vehicle-stats', requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getVehicleStats(0); // 0 = all users
      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin vehicle stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas de veículos administrativo' });
    }
  });

  app.get('/api/admin/dashboard/state-stats', requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getStateStats(0); // 0 = all users
      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin state stats:', error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas por estado administrativo' });
    }
  });
  
  // Rota para admin obter todos os veículos
  app.get('/api/admin/vehicles', requireAdmin, async (req, res) => {
    try {
      // Usar a função otimizada para buscar todos os veículos
      const allVehicles = await storage.getAllVehicles();
      res.json(allVehicles);
    } catch (error) {
      console.error("Erro ao buscar todos os veículos:", error);
      res.status(500).json({ message: "Erro ao buscar todos os veículos" });
    }
  });
  
  // Configuração do multer para upload de arquivos de veículos
  const vehicleStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Cria o diretório de uploads caso não exista
      const uploadDir = './uploads/vehicles';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Preservar o ID do veículo no nome do arquivo para facilitar substituição
      const vehicleId = req.params.id || Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `vehicle-${vehicleId}-crlv${ext}`);
    }
  });
  
  const vehicleFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Aceitar apenas imagens e PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(null, false);
    }
  };
  
  const vehicleUpload = multer({ 
    storage: vehicleStorage,
    fileFilter: vehicleFileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    }
  });

  // Rota para admin atualizar um veículo específico
  app.patch('/api/admin/vehicles/:id', requireAdmin, vehicleUpload.single('crlvFile'), async (req, res) => {
    try {
      const vehicleId = parseInt(req.params.id);
      if (isNaN(vehicleId)) {
        return res.status(400).json({ message: "ID de veículo inválido" });
      }
      
      // Verificar se o veículo existe
      const vehicle = await storage.getVehicleById(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ message: "Veículo não encontrado" });
      }
      
      // Tratar formulário multipart
      let vehicleData: any = {};
      
      // Se os dados vierem como campo JSON
      if (req.body.vehicleData) {
        try {
          vehicleData = JSON.parse(req.body.vehicleData);
        } catch (err) {
          console.error("Erro ao processar JSON de dados do veículo:", err);
          return res.status(400).json({ message: "Dados do veículo inválidos" });
        }
      } else {
        // Caso contrário, usar campos individuais
        const { plate, type, tare, crlvYear, status } = req.body;
        
        if (!plate || !type || !tare || !crlvYear || !status) {
          return res.status(400).json({ message: "Dados incompletos" });
        }
        
        vehicleData = {
          plate,
          type,
          tare: Number(tare),
          crlvYear: Number(crlvYear),
          status
        };
      }
      
      // Verificar se há um novo arquivo CRLV
      if (req.file) {
        console.log("Arquivo CRLV recebido:", req.file.filename);
        
        // Se o veículo já tinha um arquivo CRLV, excluir o arquivo antigo
        if (vehicle.crlvUrl) {
          try {
            // Extrair o caminho físico do arquivo antigo
            const oldFilePath = path.join(process.cwd(), vehicle.crlvUrl.replace(/^\//, ''));
            
            // Verificar se o arquivo existe antes de tentar excluí-lo
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
              console.log("Arquivo CRLV antigo excluído:", oldFilePath);
            }
          } catch (err) {
            console.error("Erro ao excluir arquivo CRLV antigo:", err);
            // Não interromper o processo se falhar ao excluir o arquivo antigo
          }
        }
        
        // Adicionar o caminho do novo arquivo aos dados do veículo
        vehicleData.crlvUrl = `/uploads/vehicles/${req.file.filename}`;
      }
      
      // Atualizar o veículo
      const updatedVehicle = await storage.updateVehicle(vehicleId, vehicleData);
      
      res.json(updatedVehicle);
    } catch (error) {
      console.error("Erro ao atualizar veículo:", error);
      res.status(500).json({ message: "Erro ao atualizar veículo" });
    }
  });
  
  // Rota para verificar acesso operacional
  app.get('/api/staff/check-operational', requireAuth, (req, res) => {
    const user = req.user!;
    
    if (user.role === 'operational' || user.role === 'supervisor' || user.isAdmin) {
      res.json({ 
        message: "Acesso de staff confirmado",
        role: user.role
      });
    } else {
      res.status(403).json({ message: "Acesso negado" });
    }
  });
  
  // Rota para verificar acesso supervisor
  app.get('/api/staff/check-supervisor', requireAuth, (req, res) => {
    const user = req.user!;
    
    if (user.role === 'supervisor' || user.isAdmin) {
      res.json({ 
        message: "Acesso de supervisor confirmado",
        role: user.role
      });
    } else {
      res.status(403).json({ message: "Acesso negado" });
    }
  });
  
  // Rota para listar os perfis de usuário disponíveis
  app.get('/api/roles', requireAuth, (req, res) => {
    // Lista os valores definidos no enum
    const roleValues = ["user", "operational", "supervisor", "admin", "manager"];
    res.json({ roles: roleValues });
  });
  
  // Rota para listagem de usuários (transportadores)
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      console.log(`[DEBUG] Total de usuários recuperados: ${users.length}`);
      
      // Adicionar informações extras para melhorar a visualização no frontend
      const enhancedUsers = users.map(user => {
        // Formatar o perfil para exibição
        const roleLabel = user.isAdmin ? "Administrador" : 
                         (user.role === "operational" ? "Operacional" :
                          user.role === "supervisor" ? "Supervisor" :
                          user.role === "manager" ? "Gerente" : "Usuário");
        
        return {
          ...user,
          roleLabel
        };
      });
      
      res.json(enhancedUsers);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      res.status(500).json({ message: "Erro ao buscar usuários" });
    }
  });
  
  // Rota para criação de usuários (transportadores)
  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const { fullName, email, password, isAdmin, role = "user", phone = "" } = req.body;
      
      // Verificar se já existe um usuário com este e-mail
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Este e-mail já está em uso" });
      }
      
      // Criar o usuário
      const hashedPassword = await hashPassword(password);
      const newUser = await storage.createUser({
        fullName,
        email,
        password: hashedPassword,
        phone,
        role: userRoleEnum.parse(role), // Garantir que o role seja válido
        isAdmin: !!isAdmin
      });
      
      // Remover a senha do objeto retornado
      const { password: _, ...userWithoutPassword } = newUser;
      
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      res.status(500).json({ message: "Erro ao criar usuário" });
    }
  });
  
  // Rota para atualização de usuários (transportadores)
  app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "ID de usuário inválido" });
    }
    
    try {
      // Verificar se o usuário existe
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      const { fullName, email, password, isAdmin, role, phone } = req.body;
      
      // Verificar se o e-mail já está em uso por outro usuário
      if (email !== existingUser.email) {
        const userWithEmail = await storage.getUserByEmail(email);
        if (userWithEmail && userWithEmail.id !== userId) {
          return res.status(400).json({ message: "Este e-mail já está em uso por outro usuário" });
        }
      }
      
      // Preparar os dados para atualização
      const updateData: any = {
        fullName,
        email,
        phone,
        isAdmin: !!isAdmin
      };
      
      // Se o perfil for fornecido, atualizar
      if (role) {
        try {
          updateData.role = userRoleEnum.parse(role);
        } catch (error) {
          return res.status(400).json({ message: "Tipo de perfil inválido" });
        }
      }
      
      // Se foi fornecida uma nova senha, hash ela
      if (password) {
        updateData.password = await hashPassword(password);
      }
      
      // Atualizar o usuário
      const updatedUser = await storage.updateUser(userId, updateData);
      
      // Remover a senha do objeto retornado
      const { password: _, ...userWithoutPassword } = updatedUser;
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error);
      res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
  });
  
  // Rota para exclusão de usuários (transportadores)
  app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "ID de usuário inválido" });
    }
    
    // Impedir que o administrador exclua a si mesmo
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "Você não pode excluir sua própria conta" });
    }
    
    try {
      // Verificar se o usuário existe
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      // Excluir o usuário
      await storage.deleteUser(userId);
      
      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      res.status(500).json({ message: "Erro ao excluir usuário" });
    }
  });

  // Rotas para transportadores
  app.get('/api/admin/transporters', requireAdmin, async (req, res) => {
    try {
      const transporters = await storage.getAllTransporters();
      res.json(transporters);
    } catch (error) {
      console.error("Erro ao buscar transportadores:", error);
      res.status(500).json({ message: "Erro ao buscar transportadores" });
    }
  });
  
  // Configuração do multer para upload de arquivos do transportador
  const transporterStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Cria o diretório de uploads caso não exista
      const uploadDir = './uploads/transporter';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Cria um nome de arquivo único
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  });
  
  const transporterUpload = multer({ storage: transporterStorage });

  app.post('/api/admin/transporters', requireAdmin, transporterUpload.any(), async (req, res) => {
    try {
      // Validar dados do transportador
      try {
        const { 
          personType, name, documentNumber, email, phone, 
          tradeName, legalResponsible,
          birthDate, nationality, idNumber, idIssuer, idState,
          street, number, complement, district, zipCode, city, state,
          subsidiaries, 
          contact1Name, contact1Phone, contact2Name, contact2Phone
        } = req.body;
        
        // Verificar se já existe um transportador com este documento
        const existingTransporter = await storage.getTransporterByDocument(documentNumber);
        if (existingTransporter) {
          return res.status(400).json({ message: "Este CPF/CNPJ já está cadastrado" });
        }
        
        // Processar arquivos enviados
        const files = req.files as Express.Multer.File[];
        const documents: { type: string, url: string, filename: string }[] = [];
        
        if (files && files.length > 0) {
          files.forEach((file) => {
            const fileType = file.fieldname.replace('document_', '');
            documents.push({
              type: fileType,
              url: `/uploads/transporter/${file.filename}`,
              filename: file.originalname
            });
          });
        }
        
        // Criar transportador com os dados específicos para o tipo (PJ ou PF)
        const transporterData: any = {
          personType,
          name,
          documentNumber,
          email,
          phone,
          contact1Name: contact1Name || "",
          contact1Phone: contact1Phone || "",
          contact2Name: contact2Name || "",
          contact2Phone: contact2Phone || "",
          documents: JSON.stringify(documents)
        };
        
        // Adicionar campos específicos de PJ
        if (personType === "pj") {
          transporterData.tradeName = tradeName;
          transporterData.legalResponsible = legalResponsible;
          
          // Adicionar endereço
          transporterData.street = street;
          transporterData.number = number;
          transporterData.complement = complement;
          transporterData.district = district;
          transporterData.zipCode = zipCode;
          transporterData.city = city;
          transporterData.state = state;
          
          // Processar subsidiárias (filiais)
          if (subsidiaries) {
            try {
              const parsedSubsidiaries = JSON.parse(subsidiaries);
              transporterData.subsidiaries = JSON.stringify(parsedSubsidiaries);
            } catch (e) {
              console.error("Erro ao processar subsidiárias:", e);
              transporterData.subsidiaries = '[]';
            }
          } else {
            transporterData.subsidiaries = '[]';
          }
        } 
        // Adicionar campos específicos de PF
        else if (personType === "pf") {
          transporterData.birthDate = birthDate;
          transporterData.nationality = nationality;
          transporterData.idNumber = idNumber;
          transporterData.idIssuer = idIssuer;
          transporterData.idState = idState;
        }
        
        const transporter = await storage.createTransporter(transporterData);
        
        res.status(201).json(transporter);
      } catch (error) {
        console.error("Erro ao validar dados do transportador:", error);
        return res.status(400).json({ message: "Dados inválidos: " + (error as Error).message });
      }
    } catch (error) {
      console.error("Erro ao criar transportador:", error);
      res.status(500).json({ message: "Erro ao criar transportador" });
    }
  });
  
  app.get('/api/admin/transporters/:id', requireAdmin, async (req, res) => {
    try {
      const transporterId = parseInt(req.params.id);
      
      const transporter = await storage.getTransporterById(transporterId);
      if (!transporter) {
        return res.status(404).json({ message: "Transportador não encontrado" });
      }
      
      res.json(transporter);
    } catch (error) {
      console.error("Erro ao buscar transportador:", error);
      res.status(500).json({ message: "Erro ao buscar transportador" });
    }
  });
  
  app.patch('/api/admin/transporters/:id', requireAdmin, transporterUpload.any(), async (req, res) => {
    try {
      const transporterId = parseInt(req.params.id);
      
      // Verificar se o transportador existe
      const transporter = await storage.getTransporterById(transporterId);
      if (!transporter) {
        return res.status(404).json({ message: "Transportador não encontrado" });
      }
      
      // Se está atualizando o documento, verificar se já existe outro transportador com este documento
      if (req.body.documentNumber && req.body.documentNumber !== transporter.documentNumber) {
        const existingTransporter = await storage.getTransporterByDocument(req.body.documentNumber);
        if (existingTransporter && existingTransporter.id !== transporterId) {
          return res.status(400).json({ message: "Este CPF/CNPJ já está cadastrado para outro transportador" });
        }
      }
      
      // Processar arquivos enviados
      const files = req.files as Express.Multer.File[];
      let existingDocuments: { type: string, url: string, filename: string }[] = [];
      
      // Tentar carregar documentos existentes
      try {
        if (transporter.documents) {
          existingDocuments = JSON.parse(transporter.documents as string);
        }
      } catch (e) {
        console.error("Erro ao processar documentos existentes:", e);
      }
      
      // Adicionar novos documentos
      if (files && files.length > 0) {
        files.forEach((file) => {
          const fileType = file.fieldname.replace('document_', '');
          existingDocuments.push({
            type: fileType,
            url: `/uploads/transporter/${file.filename}`,
            filename: file.originalname
          });
        });
      }
      
      // Preparar dados para atualização
      const transporterData: any = {
        ...req.body,
        documents: JSON.stringify(existingDocuments)
      };
      
      // Processar subsidiárias se for PJ
      if (transporterData.personType === "pj" && transporterData.subsidiaries) {
        try {
          const parsedSubsidiaries = JSON.parse(transporterData.subsidiaries);
          transporterData.subsidiaries = JSON.stringify(parsedSubsidiaries);
        } catch (e) {
          console.error("Erro ao processar subsidiárias:", e);
          // Manter as subsidiárias existentes se houver erro
          if (transporter.subsidiaries) {
            transporterData.subsidiaries = transporter.subsidiaries;
          } else {
            transporterData.subsidiaries = '[]';
          }
        }
      }
      
      // Atualizar transportador
      const updatedTransporter = await storage.updateTransporter(transporterId, transporterData);
      
      res.json(updatedTransporter);
    } catch (error) {
      console.error("Erro ao atualizar transportador:", error);
      res.status(500).json({ message: "Erro ao atualizar transportador" });
    }
  });
  
  app.delete('/api/admin/transporters/:id', requireAdmin, async (req, res) => {
    try {
      const transporterId = parseInt(req.params.id);
      
      // Verificar se o transportador existe
      const transporter = await storage.getTransporterById(transporterId);
      if (!transporter) {
        return res.status(404).json({ message: "Transportador não encontrado" });
      }
      
      await storage.deleteTransporter(transporterId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir transportador:", error);
      res.status(500).json({ message: "Erro ao excluir transportador" });
    }
  });
  
  // Rota para vincular transportador a usuário
  app.post('/api/admin/transporters/:id/link', requireAdmin, async (req, res) => {
    try {
      const transporterId = parseInt(req.params.id);
      const { userId } = req.body;
      
      // Verificar se o transportador existe
      const transporter = await storage.getTransporterById(transporterId);
      if (!transporter) {
        return res.status(404).json({ message: "Transportador não encontrado" });
      }
      
      if (userId !== null) {
        // Verificar se o usuário existe
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "Usuário não encontrado" });
        }
      }
      
      // Vincular transportador ao usuário (ou desvincular se userId for null)
      const updatedTransporter = await storage.linkTransporterToUser(transporterId, userId);
      
      res.json(updatedTransporter);
    } catch (error) {
      console.error("Erro ao vincular transportador a usuário:", error);
      res.status(500).json({ message: "Erro ao vincular transportador a usuário" });
    }
  });
  
  // Rota para obter usuários não-admin para seleção
  app.get('/api/admin/non-admin-users', requireAdmin, async (req, res) => {
    try {
      const users = await storage.getNonAdminUsers();
      console.log("[DEBUG] Usuários não-admin recuperados:", users.length);
      
      // Adicionar informações extras para melhorar a visualização no frontend
      const enhancedUsers = users.map(user => {
        // Formatar o perfil para exibição
        const roleLabel = user.isAdmin ? "Administrador" : 
                         (user.role === "operational" ? "Operacional" :
                          user.role === "supervisor" ? "Supervisor" :
                          user.role === "manager" ? "Gerente" : "Usuário");
        
        return {
          ...user,
          roleLabel
        };
      });
      
      res.json(enhancedUsers);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      res.status(500).json({ message: "Erro ao buscar usuários" });
    }
  });

  // Rota para atualizar o status de uma licença - acessível para Admin, Operacional e Supervisor
app.patch('/api/admin/licenses/:id/status', requireOperational, upload.single('licenseFile'), async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      const statusData: {
        status: LicenseStatus;
        comments: string;
        validUntil?: string;
        state?: string; // Agora exigimos um estado específico
        aetNumber?: string; // Número AET específico do estado
      } = {
        status: req.body.status as LicenseStatus,
        comments: req.body.comments,
      };
      
      // Add state if provided (agora é obrigatório)
      if (req.body.state) {
        statusData.state = req.body.state;
      } else {
        return res.status(400).json({ message: 'É obrigatório informar o estado para atualizar o status' });
      }
      
      // Add aetNumber if provided
      if (req.body.aetNumber) {
        statusData.aetNumber = req.body.aetNumber;
      }
      
      // Add validUntil if provided
      if (req.body.validUntil) {
        statusData.validUntil = new Date(req.body.validUntil).toISOString();
      }
      
      // Validate status data
      try {
        updateLicenseStatusSchema.parse(statusData);
      } catch (error: any) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Check if license exists
      const existingLicense = await storage.getLicenseRequestById(licenseId);
      if (!existingLicense) {
        return res.status(404).json({ message: 'Licença não encontrada' });
      }
      
      // Verifica se o estado está incluído na lista de estados da licença
      if (!existingLicense.states.includes(statusData.state)) {
        return res.status(400).json({ message: 'Estado não incluído na solicitação da licença' });
      }
      
      // Add file se fornecido
      let file: Express.Multer.File | undefined = undefined;
      if (req.file) {
        file = req.file;
      }
      
      // Obter o status anterior do estado específico
      const previousStateStatus = existingLicense.stateStatuses?.find(ss => 
        ss.startsWith(`${statusData.state}:`)
      )?.split(':')?.[1] || 'pending';
      
      // Usar updateLicenseStateStatus para garantir que o arquivo e número AET 
      // sejam específicos para o estado selecionado
      const updatedLicense = await storage.updateLicenseStateStatus({
        licenseId,
        state: statusData.state,
        status: statusData.status,
        comments: statusData.comments,
        validUntil: statusData.validUntil,
        aetNumber: statusData.aetNumber,
        file
      });
      
      // Registrar mudança no histórico de status
      await storage.createStatusHistory({
        licenseId: updatedLicense.id,
        state: statusData.state,
        userId: req.user!.id,
        oldStatus: previousStateStatus,
        newStatus: statusData.status,
        comments: statusData.comments || null,
        createdAt: new Date()
      });
      
      console.log(`Histórico de status criado para licença ${licenseId}, estado ${statusData.state}: ${previousStateStatus} -> ${statusData.status}`);
      
      // Enviar notificação em tempo real via WebSocket
      broadcastMessage({
        type: 'STATUS_UPDATE',
        data: {
          licenseId: updatedLicense.id,
          state: statusData.state,
          status: statusData.status,
          updatedAt: new Date().toISOString(),
          license: updatedLicense
        }
      });
      
      res.json(updatedLicense);
    } catch (error) {
      console.error('Error updating license status:', error);
      res.status(500).json({ message: 'Erro ao atualizar status da licença' });
    }
  });
  
  // Endpoint específico para atualizar o status de um estado específico em uma licença
  app.patch('/api/admin/licenses/:id/state-status', requireOperational, upload.single('stateFile'), async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      
      // Validar dados do status do estado
      const stateStatusData = {
        licenseId,
        state: req.body.state,
        status: req.body.status,
        comments: req.body.comments,
        validUntil: req.body.validUntil,
        aetNumber: req.body.aetNumber, // Incluir número da AET
      };
      
      try {
        updateLicenseStateSchema.parse(stateStatusData);
      } catch (error: any) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Verificar se a licença existe
      const existingLicense = await storage.getLicenseRequestById(licenseId);
      if (!existingLicense) {
        return res.status(404).json({ message: 'Licença não encontrada' });
      }
      
      // Verificar se o estado está incluído na lista de estados da licença
      if (!existingLicense.states.includes(stateStatusData.state)) {
        return res.status(400).json({ message: 'Estado não incluído na solicitação da licença' });
      }
      
      // Adicionar arquivo se fornecido
      let file: Express.Multer.File | undefined = undefined;
      if (req.file) {
        file = req.file;
      }
      
      // Obter o status anterior do estado específico
      const previousStateStatus = existingLicense.stateStatuses?.find(ss => 
        ss.startsWith(`${stateStatusData.state}:`)
      )?.split(':')?.[1] || 'pending';
      
      // Atualizar status do estado da licença
      const updatedLicense = await storage.updateLicenseStateStatus({
        ...stateStatusData,
        file,
      });
      
      // Registrar mudança no histórico de status
      await storage.createStatusHistory({
        licenseId: updatedLicense.id,
        state: stateStatusData.state,
        userId: req.user!.id,
        oldStatus: previousStateStatus,
        newStatus: stateStatusData.status,
        comments: stateStatusData.comments || null,
        createdAt: new Date()
      });
      
      console.log(`Histórico de status criado para licença ${licenseId}, estado ${stateStatusData.state}: ${previousStateStatus} -> ${stateStatusData.status}`);
      
      // Enviar notificação em tempo real via WebSocket
      broadcastMessage({
        type: 'STATUS_UPDATE',
        data: {
          licenseId: updatedLicense.id,
          state: stateStatusData.state,
          status: stateStatusData.status,
          updatedAt: new Date().toISOString(),
          license: updatedLicense
        }
      });
      
      console.log(`Status da licença ${licenseId} para o estado ${stateStatusData.state} atualizado para ${stateStatusData.status}. Notificação enviada.`);
      
      res.json(updatedLicense);
    } catch (error) {
      console.error('Error updating license state status:', error);
      res.status(500).json({ message: 'Erro ao atualizar status do estado da licença' });
    }
  });
  
  // Endpoint de teste para atualizar apenas dimensões de uma licença
  app.post('/api/test/license-dimensions/:id', requireAdmin, async (req, res) => {
    try {
      const licenseId = parseInt(req.params.id);
      const { width, height, cargoType } = req.body;
      
      console.log(`Atualizando licença ${licenseId} com dimensões:`, {
        width, height, cargoType
      });
      
      // Sanitizar os dados antes de atualizar
      const updateData = {
        width: width !== undefined ? Number(width) : null,
        height: height !== undefined ? Number(height) : null,
        cargoType: cargoType || null
      };
      
      // Log para diagnóstico
      console.log('Dados sanitizados para atualização:', JSON.stringify(updateData, null, 2));
      
      // Atualizar o banco de dados
      const results = await db.update(licenseRequests)
        .set(updateData)
        .where(eq(licenseRequests.id, licenseId))
        .returning();
      
      if (results.length === 0) {
        return res.status(404).json({ error: 'Licença não encontrada' });
      }
      
      console.log('Licença atualizada com sucesso:', JSON.stringify(results[0], null, 2));
      
      // Buscar a licença diretamente do banco para verificar se a atualização funcionou
      const dbResults = await db.select()
        .from(licenseRequests)
        .where(eq(licenseRequests.id, licenseId));
      
      if (dbResults.length === 0) {
        return res.status(404).json({ error: 'Não foi possível verificar a licença após atualização' });
      }
      
      console.log('Licença verificada após atualização:', JSON.stringify(dbResults[0], null, 2));
      
      res.json({
        updated: results[0],
        verification: dbResults[0]
      });
    } catch (error) {
      console.error('Erro ao atualizar dimensões da licença:', error);
      res.status(500).json({ error: String(error) });
    }
  });
  
  // Endpoint temporário para migrar os dados de aetNumber para stateAETNumbers
  app.post('/api/admin/migrate-aet-numbers', requireAdmin, async (req, res) => {
    try {
      console.log('Iniciando migração de números AET...');
      
      // Buscar todas as licenças que têm número AET mas não têm stateAETNumbers
      const licenses = await db.select().from(licenseRequests)
        .where(sql`aet_number IS NOT NULL AND 
                   (state_aet_numbers IS NULL OR array_length(state_aet_numbers, 1) IS NULL)`);
      
      console.log(`Encontradas ${licenses.length} licenças para migração`);
      
      let migratedCount = 0;
      
      // Para cada licença, criar um array stateAETNumbers com os estados da licença
      for (const license of licenses) {
        if (!license.aetNumber || !license.states || license.states.length === 0) {
          console.log(`Pulando licença ${license.id}: sem número AET ou estados definidos`);
          continue;
        }
        
        console.log(`Migrando licença ${license.id} com AET ${license.aetNumber}`);
        
        // Criar um array de stateAETNumbers
        const stateAETNumbers = license.states.map(state => `${state}:${license.aetNumber}`);
        
        // Atualizar a licença
        await db.update(licenseRequests)
          .set({ stateAETNumbers })
          .where(eq(licenseRequests.id, license.id));
        
        migratedCount++;
        console.log(`Licença ${license.id} atualizada com stateAETNumbers:`, stateAETNumbers);
      }
      
      res.json({ 
        message: `Migração concluída. ${migratedCount} licenças atualizadas de ${licenses.length} encontradas.` 
      });
    } catch (error) {
      console.error('Erro na migração de números AET:', error);
      res.status(500).json({ message: 'Erro durante migração de números AET' });
    }
  });

  return httpServer;
}
