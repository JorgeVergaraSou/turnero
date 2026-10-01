import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthInsuranceEntity } from './entities/health-insurance.entity';
import { HealthInsurancesService } from './health-insurances.service';
import {
  AdminHealthInsurancesController,
  PublicHealthInsurancesController,
} from './health-insurances.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HealthInsuranceEntity])],
  controllers: [
    AdminHealthInsurancesController,
    PublicHealthInsurancesController,
  ],
  providers: [HealthInsurancesService],
  exports: [HealthInsurancesService],
})
export class HealthInsurancesModule {}
