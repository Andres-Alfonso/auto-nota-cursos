import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CustomField } from './custom-field.entity';

@Entity('custom_field_options')
export class CustomFieldOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 191 })
  value: string;

  @Column({ type: 'int', unsigned: true })
  custom_field_id: number;

  @ManyToOne(() => CustomField, customField => customField.options)
  @JoinColumn({ name: 'custom_field_id' })
  customField: CustomField;
}