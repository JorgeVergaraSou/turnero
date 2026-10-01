import { Controller, Get, Query } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { RequirePermissions } from '@/auth/decorators/require-permissions.decorator';
import { Permission } from '@/auth/permissions/permission.enum';

/** Solo lectura: la auditoría no se edita ni se borra (triggers append-only). */
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  search(@Query() query: AuditQueryDto) {
    return this.auditQueryService.search(query);
  }
}
