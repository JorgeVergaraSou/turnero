import { Role } from '@/common/enums/role.enum';

export class ProfileResponseDto {
  idUser: number;
  nickUsuario: string;
  nombre: string;
  apellido: string;
  email: string | null;
  role: Role;
  twoFactorEnabled: boolean;
  fotoUrl: string | null;
}
