import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalEntity } from './entities/professional.entity';
import { ProfessionalsService } from './professionals.service';
import {
  AdminProfessionalsController,
  PublicProfessionalsController,
} from './professionals.controller';
import { UserEntity } from '@/users/entities/user.entity';
import { SpecialtiesModule } from '@/specialties/specialties.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfessionalEntity, UserEntity]),
    SpecialtiesModule,
  ],
  controllers: [AdminProfessionalsController, PublicProfessionalsController],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
