// custom-field.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { CustomFieldOption } from './custom-field-option.entity';
import { UserCustomField } from './user-custom-field.entity';

@Entity('custom_fields')
export class CustomField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  field_type: string;

  @Column()
  client_id: number;

  @Column()
  order: number;

  @ManyToOne(() => Client, (client) => client.customFields)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @OneToMany(() => CustomFieldOption, (option) => option.customField, { cascade: true })
  options: CustomFieldOption[];

  @OneToMany(() => UserCustomField, (userCustomField) => userCustomField.customField)
  userCustomFields: UserCustomField[];
}
