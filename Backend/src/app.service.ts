import {
  Injectable,
  OnApplicationBootstrap,
  LoggerService,
  Inject,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UsersService } from '@/users/users.service';
import { Role } from '@/common/enums/role.enum';
import * as argon2 from 'argon2';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  constructor(
    private dataSource: DataSource,
    private readonly usersService: UsersService,

    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.dataSource.query('SELECT 1');
      this.logger.log('✅ Conexión exitosa a la base de datos');
    } catch (error) {
      this.logger.error('❌ Falló la conexión a la base de datos', error);
      return;
    }

    await this.seedInitialAdmin();
  }

  /**
   * POST /auth/nuevo-usuario requiere ser ADMIN (ver AuthController), así
   * que una base de datos nueva no tiene forma de crear el primer usuario.
   * Si no existe ningún ADMIN todavía y están seteadas SEED_ADMIN_NICK /
   * SEED_ADMIN_PASSWORD, se crea ese usuario automáticamente acá (el email
   * es opcional, igual que en el registro normal). Pensado para usarse una
   * sola vez al levantar un proyecto nuevo a partir de esta base — sacar
   * esas variables del .env después del primer arranque (si quedan
   * seteadas no vuelve a crear nada, porque ya existe un ADMIN).
   */
  private async seedInitialAdmin() {
    const nickUsuario = process.env.SEED_ADMIN_NICK;
    const password = process.env.SEED_ADMIN_PASSWORD;
    const email = process.env.SEED_ADMIN_EMAIL || undefined;

    if (!nickUsuario || !password) {
      return;
    }

    if (await this.usersService.existsAdmin()) {
      return;
    }

    const hashedPassword = await argon2.hash(password);

    await this.usersService.nuevoUsuario({
      nickUsuario,
      nombre: 'Admin',
      apellido: 'Inicial',
      email,
      password: hashedPassword,
      role: Role.ADMIN,
    });

    this.logger.warn(
      `👑 Usuario ADMIN inicial creado (nickUsuario: ${nickUsuario}) a partir de SEED_ADMIN_NICK/SEED_ADMIN_PASSWORD — sacá esas variables del .env ahora que ya existe.`,
    );
  }
}
