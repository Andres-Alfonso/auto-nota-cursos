import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { CustomFieldOption } from './custom-field-option.entity';
import { UserCustomField } from './user-custom-field.entity';

@Entity('custom_fields')
export class CustomField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  name: string;

  @Column({ length: 191 })
  field_type: string;

  @Column({ type: 'int', unsigned: true })
  client_id: number;

  @Column()
  order: number;

  @OneToMany(() => CustomFieldOption, option => option.customField)
  options: CustomFieldOption[];

  @OneToMany(() => UserCustomField, userCustomField => userCustomField.customField)
  userCustomFields: UserCustomField[];
}