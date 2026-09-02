// user.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  last_name: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  identification: string;

  @Column({
    type: 'enum',
    enum: ['AA', 'CC', 'CE', 'PA', 'RC', 'TI'],
  })
  identification_type: 'AA' | 'CC' | 'CE' | 'PA' | 'RC' | 'TI';

  @Column()
  password: string;

  // La base de datos exige este campo para los usuarios nuevos.
  // Se almacena como JSON en texto y comienza sin registros de inicio de sesión.
  @Column({ name: 'login_dates', type: 'text' })
  login_dates: string;

  @Column({ nullable: true })
  company: string;

  @Column({ nullable: true })
  charge: string;

  @Column({ name: 'registerd_age_user', nullable: true })
  registerd_age_user?: string;

  @Column({name: 'registerd_sex_user', nullable: true })
  registerd_sex_user?: string;

  @Column({ name: 'status_validation' })
  status_validation: string;

  @Column({ name: 'client_id' })
  client_id: number;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  last_login_at: Date;

  @Column({nullable: true})
  creator_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
