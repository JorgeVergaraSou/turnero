import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpecialtyEntity } from './entities/specialty.entity';
import { SpecialtiesService } from './specialties.service';
import {
  AdminSpecialtiesController,
  PublicSpecialtiesController,
} from './specialties.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SpecialtyEntity])],
  controllers: [AdminSpecialtiesController, PublicSpecialtiesController],
  providers: [SpecialtiesService],
  exports: [SpecialtiesService],
})
export class SpecialtiesModule {}
