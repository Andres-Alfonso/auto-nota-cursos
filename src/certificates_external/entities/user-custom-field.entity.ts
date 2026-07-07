// entities/user-custom-field.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CustomField } from './custom-field.entity';

@Entity('user_custom_fields')
export class UserCustomField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  custom_field_id: number;

  @Column()
  value: string;

  @ManyToOne(() => CustomField, customField => customField.userCustomFields)
  @JoinColumn({ name: 'custom_field_id' })
  customField: CustomField;
}