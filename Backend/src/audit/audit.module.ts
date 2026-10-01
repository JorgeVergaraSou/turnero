import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditQueryService } from './audit-query.service';
import { AuditController } from './audit.controller';
import { UserEntity } from '@/users/entities/user.entity';
import { PatientEntity } from '@/patients/entities/patient.entity';

/** Global: casi todos los módulos del consultorio auditan operaciones. */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLogEntity, UserEntity, PatientEntity]),
  ],
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
