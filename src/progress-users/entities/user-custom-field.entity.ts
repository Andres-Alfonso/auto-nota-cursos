import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { CustomField } from './custom-field.entity';

@Entity('user_custom_fields')
export class UserCustomField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unsigned: true })
  user_id: number;

  @Column({ type: 'int', unsigned: true })
  custom_field_id: number;

  @Column({ type: 'text' })
  value: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => CustomField, customField => customField.userCustomFields)
  @JoinColumn({ name: 'custom_field_id' })
  customField: CustomField;
}