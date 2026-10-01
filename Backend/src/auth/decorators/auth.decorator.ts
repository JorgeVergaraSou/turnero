import { UseGuards, applyDecorators } from '@nestjs/common';
import { Role } from '@/common/enums/role.enum';
import { Roles } from './roles.decorator';
import { AuthGuard } from '../guard/auth.guard';
import { RolesGuard } from '../guard/roles.guard';

export function Auth(...role: Role[]) {
  return applyDecorators(
    Roles(
      ...role,
    ) /** decorador personalizado que devolvra el Rol necesario en el momento */,
    UseGuards(AuthGuard, RolesGuard),
  );
}
