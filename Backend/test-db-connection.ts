import * as dotenv from 'dotenv';
import mysql from 'mysql2/promise';

// Cargar variables del archivo .env
dotenv.config();

async function testConnection() {
  console.log('🔍 Iniciando prueba de conexión con MySQL...\n');

  const config = {
    host: process.env.HOST || process.env.DB_HOST,
    port: Number(process.env.PORT || process.env.DB_PORT) || 3306,
    user: process.env.USER_DB_NAME || process.env.DB_USERNAME,
    password: process.env.USER_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.DATABASE_NAME || process.env.DB_NAME,
  };

  console.log('⚙️ Configuración usada:', config);

  try {
    const connection = await mysql.createConnection(config);
    console.log('\n✅ Conexión exitosa con la base de datos MySQL');
    await connection.end();
  } catch (error: any) {
    console.error('\n❌ Error al conectar con MySQL:');
    console.error('Mensaje:', error.message);
    if (error.code) console.error('Código:', error.code);
    if (error.errno) console.error('Errno:', error.errno);
    if (error.sqlState) console.error('SQLState:', error.sqlState);
  }
}

testConnection();
