import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivacyNoticeEntity } from './entities/privacy-notice.entity';
import { PrivacyConsentEntity } from './entities/privacy-consent.entity';
import { PrivacyService } from './privacy.service';
import {
  AdminPrivacyController,
  PublicPrivacyController,
} from './privacy.controller';

/**
 * Aviso de privacidad versionado y constancias de consentimiento (Ley
 * 25.326). AppointmentsModule lo usa para exigir y registrar la aceptación
 * en la reserva pública.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PrivacyNoticeEntity, PrivacyConsentEntity]),
  ],
  controllers: [PublicPrivacyController, AdminPrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
