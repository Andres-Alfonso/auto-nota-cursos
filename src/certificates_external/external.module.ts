import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ExternalController } from './external.controller';
import { ExternalService } from './services/external.service';
import { UserCertificate } from './models/user-certificate.entity';
import { Documents } from './models/documents.entity';
import { DocumentRequirement } from './models/document-requirement.entity';
import { UserDocument } from './models/user-document.entity';
import { User } from './models/user.entity';
import { CustomField } from './entities/custom-field.entity';
import { CustomFieldOption } from './entities/custom-field-option.entity';
import { UserCustomField } from './entities/user-custom-field.entity';


@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      UserCertificate,
      Documents,
      DocumentRequirement,
      UserDocument,
      User,
      CustomField,
      CustomFieldOption,
      UserCustomField
    ]),
  ],
  controllers: [ExternalController],
  providers: [ExternalService],
  exports: [ExternalService],
})
export class ExternalModule {}