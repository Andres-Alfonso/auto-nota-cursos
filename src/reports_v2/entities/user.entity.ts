// user.entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  last_name: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  identification: string;

  @Column({ nullable: true })
  company: string;

  @Column({ nullable: true })
  charge: string;

  @Column({ name: 'status_validation' })
  status_validation: string;

  @Column({ name: 'client_id' })
  client_id: number;
}