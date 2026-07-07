// user-custom-field.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
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

  @ManyToOne(() => CustomField, (customField) => customField.userCustomFields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'custom_field_id' })
  customField: CustomField;
}
