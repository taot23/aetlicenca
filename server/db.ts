import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configurar o WebSocket para o Neon
neonConfig.webSocketConstructor = ws;

// Verificar se a URL do banco de dados está definida
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configurações ajustadas para melhor lidar com problemas de conexão
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10, // Reduzido para evitar muitas conexões simultâneas
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 10000, // Aumentado para dar mais tempo para conectar
  retryLimit: 5, // Tenta reconectar até 5 vezes
  retryDelay: 500 // Espera 500ms entre tentativas
});

// Manipulador de erro para o pool
pool.on('error', (err) => {
  console.error('Erro inesperado no pool de conexão do Postgres:', err);
});

export const db = drizzle({ client: pool, schema });

/**
 * Executa uma operação de banco de dados dentro de uma transação
 * @param callback Função que recebe o objeto de transação e executa operações
 * @returns Resultado da execução do callback
 */
export async function withTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const tx = drizzle({ client, schema });
    const result = await callback(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction failed:', error);
    throw error;
  } finally {
    client.release();
  }
}