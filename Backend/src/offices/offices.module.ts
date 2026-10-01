import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeEntity } from './entities/office.entity';
import { OfficesService } from './offices.service';
import { AdminOfficesController } from './offices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OfficeEntity])],
  controllers: [AdminOfficesController],
  providers: [OfficesService],
  exports: [OfficesService],
})
export class OfficesModule {}
