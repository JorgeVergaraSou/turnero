import { IsNotEmpty, IsUUID } from 'class-validator';
import { IsPassword } from '@/common/decorators/is-password.decorator';

export class ResetPasswordDto {
  @IsPassword()
  password: string;

  @IsNotEmpty()
  @IsUUID('4')
  resetPasswordToken: string;
}
