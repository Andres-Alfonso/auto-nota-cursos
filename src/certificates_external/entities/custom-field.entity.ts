// entities/custom-field.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
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

  @OneToMany(() => CustomFieldOption, option => option.customField)
  options: CustomFieldOption[];

  @OneToMany(() => UserCustomField, userCustomField => userCustomField.customField)
  userCustomFields: UserCustomField[];
}