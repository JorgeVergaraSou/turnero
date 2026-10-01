import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@/users/entities/user.entity';
import { TwoFactorService } from './two-factor/two-factor.service';
// auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@/users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([UserEntity]),
    // ServiciosModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('SECRET_WORD'), // Obtiene SECRET_WORD desde las variables de entorno
        signOptions: { expiresIn: '3h' },
      }),
      inject: [ConfigService],
      global: true,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService],
})
export class AuthModule {}
