import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { UsersAdminService } from './users-admin.service';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import { RevokedTokensScheduler } from './revoked-tokens.scheduler';
import { ProfessionalEntity } from '@/professionals/entities/professional.entity';

/**
 * Global porque AuthGuard (usado por @Auth() en cualquier módulo, no solo
 * auth/) inyecta UsersService para validar que el usuario del token siga
 * activo. Sin @Global(), solo los módulos que importen UsersModule
 * explícitamente podrían resolver AuthGuard.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ProfessionalEntity,
      RevokedTokenEntity,
    ]),
  ],
  providers: [UsersService, UsersAdminService, RevokedTokensScheduler],
  controllers: [],
  exports: [UsersService, UsersAdminService], // SE EXPORTA PARA QUE PUEDA SER USADO POR LA "AUTH"
})
export class UsersModule {}
