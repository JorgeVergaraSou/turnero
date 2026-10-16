import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Zona horaria de las conexiones: la del consultorio (Argentina, UTC-3, sin
 * horario de verano). La app lee y escribe fechas asumiendo UTC-3 (opción
 * `timezone` de buildDatabaseOptions), pero las que genera MySQL por su cuenta
 * (CURRENT_TIMESTAMP en created_at, la auditoría, NOW()) usan la zona de la
 * SESIÓN, que por defecto es la del servidor. En un VPS en UTC esas fechas se
 * leían corridas 3 horas. Fijándola en cada conexión del pool, ambas coinciden
 * sin importar cómo esté configurado el sistema operativo ni MySQL.
 */
export const CLINIC_DB_TIME_ZONE = '-03:00';
const SET_TIME_ZONE = `SET time_zone = '${CLINIC_DB_TIME_ZONE}'`;

export async function initializeWithClinicTimeZone(
  options: DataSourceOptions,
): Promise<DataSource> {
  const dataSource = await new DataSource(options).initialize();
  if (dataSource.options.type === 'mysql') {
    // las conexiones que el pool abra de acá en adelante...
    const pool = (dataSource.driver as unknown as { pool?: any }).pool;
    if (!pool)
      throw new Error(
        'No se pudo fijar la zona horaria de la base: el pool de conexiones no existe',
      );
    pool.on('connection', (connection: { query: (sql: string) => void }) => {
      connection.query(SET_TIME_ZONE);
    });
    // ...y la que ya abrió al inicializar (queda libre en el pool y la toma esta consulta)
    await dataSource.query(SET_TIME_ZONE);
  }
  return dataSource;
}
