// entities/custom-field-option.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CustomField } from './custom-field.entity';

@Entity('custom_fields_options')
export class CustomFieldOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  custom_field_id: number;

  @Column()
  option_value: string;

  @ManyToOne(() => CustomField, customField => customField.options)
  @JoinColumn({ name: 'custom_field_id' })
  customField: CustomField;
}