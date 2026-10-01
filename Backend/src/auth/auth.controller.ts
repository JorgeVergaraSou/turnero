import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Req,
  HttpStatus,
  Post,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { Role } from '@/common/enums/role.enum';
import { Auth } from './decorators/auth.decorator';
import { Public } from './decorators/public.decorator';
import { LoginThrottlerGuard } from './guard/login-throttler.guard';
import { ActiveUser } from '@/common/decorators/active-user.decorator';
import { UserActiveInterface } from '@/common/interfaces/user-active.interface';
import { RequestResetPasswordDto } from './dto/requestResetPassword.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { UpdateUserDto } from '@/users/dto/update-user.dto';
import {
  AdminResetPasswordDto,
  AdminUpdateUserDto,
} from '@/users/dto/admin-user.dto';
import { UsersAdminService } from '@/users/users-admin.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { TwoFactorChallengeDto, TwoFactorCodeDto } from './dto/two-factor.dto';
import { CurrentActor } from '@/common/decorators/current-actor.decorator';
import { Actor } from '@/common/interfaces/actor.interface';
import {
  avatarStorage,
  avatarFileFilter,
} from '@/common/upload/avatar-upload.config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersAdminService: UsersAdminService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  /** Alta de usuarios: solo un ADMIN puede crear cuentas nuevas (y elegir
   * su rol). No hay auto-registro público — si en algún proyecto hijo de
   * esta base hace falta signup abierto, hay que agregar un endpoint
   * público aparte que fuerce role=USER, nunca reabrir este. */
  @Auth(Role.ADMIN)
  @Post('nuevo-usuario')
  async register(
    @Body() registerDto: RegisterDto,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.authService.registro(registerDto, actor);
  }

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // máx. 5 intentos por minuto por IP + nickUsuario
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @CurrentActor() actor: Actor) {
    return await this.authService.login(loginDto, actor);
  }

  // ---------- verificación en dos pasos (2.º paso del login) ----------
  // Públicos: todavía no hay sesión; los protege el challenge del login
  // (JWT de 10 min), el rate limiting y el bloqueo por intentos fallidos.

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  @Post('2fa/setup')
  async twoFactorSetup(@Body() dto: TwoFactorChallengeDto) {
    return this.twoFactorService.setup(dto.challengeToken);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  @Post('2fa/enable')
  async twoFactorEnable(
    @Body() dto: TwoFactorCodeDto,
    @CurrentActor() actor: Actor,
  ) {
    const { user, recoveryCodes } = await this.twoFactorService.enable(
      dto.challengeToken,
      dto.code,
      actor,
    );
    const session = await this.authService.createSession(user, actor, {
      twoFactor: 'setup',
    });
    return { ...session, recoveryCodes };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 600000 } })
  @HttpCode(HttpStatus.OK)
  @Post('2fa/verify')
  async twoFactorVerify(
    @Body() dto: TwoFactorCodeDto,
    @CurrentActor() actor: Actor,
  ) {
    const { user, method } = await this.twoFactorService.verify(
      dto.challengeToken,
      dto.code,
      actor,
    );
    return this.authService.createSession(user, actor, { twoFactor: method });
  }

  @Auth(Role.RECEPCIONISTA, Role.MEDICO)
  @Patch('/updateUser/:id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @ActiveUser() user: UserActiveInterface,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    // autoservicio: solo se puede editar el propio perfil, nunca el de
    // otro usuario (el :id de la URL debe coincidir con el del token).
    if (id !== user.idUser) {
      throw new ForbiddenException('No podés editar el perfil de otro usuario');
    }

    return this.authService.updateUser(id, updateUserDto, actor);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 600000 } }) // máx. 3 pedidos cada 10 min por IP
  @Post('requestResetPassword')
  async requestResetPasswordByEmail(
    @Body() dto: RequestResetPasswordDto,
  ): Promise<void> {
    return this.authService.requestResetPassword(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 600000 } }) // máx. 5 intentos cada 10 min por IP
  @Post('resetPassword')
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return await this.authService.resetPassword(dto, actor);
  }

  /** cierra ESTA sesión en el servidor (ver AuthService.logout) */
  @Auth(Role.RECEPCIONISTA, Role.MEDICO)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() request: { user: { idUser: number; jti?: string; exp?: number } },
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.authService.logout(request.user, actor);
  }

  @Get('profile')
  @Auth(Role.RECEPCIONISTA, Role.MEDICO)
  async profile(@ActiveUser() user: UserActiveInterface) {
    return await this.authService.profile(user);
  }

  @Auth(Role.RECEPCIONISTA, Role.MEDICO)
  @Post('foto')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarStorage,
      fileFilter: avatarFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async actualizarFoto(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: UserActiveInterface,
  ): Promise<void> {
    return this.authService.actualizarFoto(user.idUser, file);
  }

  @Get('listar-usuarios')
  @Auth(Role.ADMIN)
  async findAllUsers() {
    return await this.authService.findAll();
  }

  // Gestión de OTROS usuarios (solo ADMIN). Las reglas de seguridad
  // (último admin, rol propio, médico con perfil activo) y la auditoría
  // viven en UsersAdminService.
  @Delete('dar-de-baja-usuario/:id')
  @Auth(Role.ADMIN)
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.usersAdminService.deactivate(id, actor);
  }

  @Patch('activar-usuario/:id')
  @Auth(Role.ADMIN)
  async activarUsuario(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.usersAdminService.activate(id, actor);
  }

  /** celular perdido: en el próximo ingreso vuelve a configurar la app */
  @Patch('reiniciar-2fa/:id')
  @Auth(Role.ADMIN)
  async reiniciarDosPasos(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.twoFactorService.reset(id, actor);
  }

  @Patch('desbloquear-usuario/:id')
  @Auth(Role.ADMIN)
  async desbloquearUsuario(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.usersAdminService.unlock(id, actor);
  }

  @Patch('editar-usuario/:id')
  @Auth(Role.ADMIN)
  async editarUsuario(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminUpdateUserDto,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.usersAdminService.update(id, dto, actor);
  }

  @Post('restablecer-clave/:id')
  @Auth(Role.ADMIN)
  async restablecerClave(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminResetPasswordDto,
    @CurrentActor() actor: Actor,
  ): Promise<void> {
    return this.usersAdminService.resetPassword(id, dto.password, actor);
  }
}
