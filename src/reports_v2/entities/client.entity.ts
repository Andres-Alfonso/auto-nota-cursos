import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { CustomField } from './custom-field.entity';

@Entity('customers')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  url_portal: string;

  @Column()
  name_contact: string;

  @Column()
  email_contact: string;

  @Column()
  position_contact: string;

  @Column()
  department_contact: string;

  @Column()
  phone_contact: string;

  @Column()
  address_contact: string;

  @Column()
  lang_id: number;

  @Column({ nullable: true })
  favico: string;

  @Column({ nullable: true })
  background: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ nullable: true })
  logo: string;

  @Column({ default: false })
  facebook_login: boolean;

  @Column({ nullable: true })
  portal: string;

  @Column({ default: false })
  conference: boolean;

  @Column({ nullable: true })
  conference_tab: string;

  @Column({ nullable: true })
  conference_tab_icon: string;

  @Column('text', { nullable: true })
  metadata: string;

  @Column({ type: 'text', nullable: true })
  conference_users: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  conference_background: string;

  @Column({ default: false })
  public_list: boolean;

  @Column({ nullable: true })
  tracking_id: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  streaming_embed: string;

  @Column({ nullable: true })
  streaming_chat: string;

  @Column({ nullable: true })
  es_term_title: string;

  @Column({ type: 'text', nullable: true })
  es_term: string;

  @Column({ nullable: true })
  es_priv_title: string;

  @Column({ type: 'text', nullable: true })
  es_priv: string;

  @Column({ nullable: true })
  en_term_title: string;

  @Column({ type: 'text', nullable: true })
  en_term: string;

  @Column({ nullable: true })
  en_priv_title: string;

  @Column({ type: 'text', nullable: true })
  en_priv: string;

  @Column({ nullable: true })
  live_url: string;

  @Column({ nullable: true })
  live_chat_url: string;

  @Column({ nullable: true })
  live_url_2: string;

  @Column({ nullable: true })
  live_chat_url_2: string;

  @Column({ default: false })
  allow_user_directory: boolean;

  @Column({ nullable: true })
  auditorium: string;

  @Column({ nullable: true })
  Title_perzonalize_group: string;

  @Column({ default: false })
  information__active: boolean;

  @Column({ type: 'text', nullable: true })
  information__data: string;

  @Column({ nullable: true })
  information_select: string;

  @Column({ type: 'text', nullable: true })
  prices__data: string;

  @Column({ default: false })
  prices__active: boolean;

  @Column({ nullable: true })
  prices_select: string;

  @Column({ default: false })
  contactUs__active: boolean;

  @Column({ nullable: true })
  contactUs_email: string;

  @Column({ nullable: true })
  title_perzonalize_group_en: string;

  @Column({ nullable: true })
  url_auditorium: string;

  @Column({ default: false })
  register_login_status: boolean;

  @Column({ default: false })
  google_login: boolean;

  @Column({ nullable: true })
  title_perzonalize_secction_es: string;

  @Column({ nullable: true })
  title_perzonalize_secction_en: string;

  @Column({ type: 'text', nullable: true })
  seections: string;

  @Column({ type: 'text', nullable: true })
  clubsshow: string;

  @Column({ type: 'text', nullable: true })
  clubsuserdata: string;

  @Column({ type: 'text', nullable: true })
  order_secction: string;

  @Column({ nullable: true })
  notification_mail: string;

  @Column({ default: false })
  validation_user: boolean;

  @Column({ type: 'text', nullable: true })
  clubprivateshow: string;

  @Column({ nullable: true })
  register_name_user: string;

  @Column({ nullable: true })
  register_lastname_user: string;

  @Column({ nullable: true })
  register_email_user: string;

  @Column({ nullable: true })
  registerd_phone_user: string;

  @Column({ nullable: true })
  register_document_user: string;

  @Column({ nullable: true })
  registerd_number_document_user: string;

  @Column({ nullable: true })
  registerd_company_user: string;

  @Column({ nullable: true })
  register_position_user: string;

  @Column({ nullable: true })
  registerd_sex_user: string;

  @Column({ nullable: true })
  registerd_status_civil_user: string;

  @Column({ nullable: true })
  registerd_city_user: string;

  @Column({ nullable: true })
  registerd_direction_user: string;

  @Column({ nullable: true })
  user_type_haus_user: string;

  @Column({ nullable: true })
  registerd_age_user: string;

  @Column({ nullable: true })
  banner_home: string;

  @Column({ default: false })
  check_banner_home: boolean;

  @Column({ nullable: true })
  limit_max_storage: number;

  @Column({ nullable: true })
  limit_max_user: number;

  @Column({ nullable: true })
  limit_max_userHost: number;

  @Column({ nullable: true })
  limit_max_clubs: number;

  @Column({ nullable: true })
  colorNadvar: string;

  @Column({ nullable: true })
  colorTextNadvar: string;

  @Column({ nullable: true })
  fondoMetricas: string;

  @Column({ nullable: true })
  fondoOpcion: string;

  @Column({ nullable: true })
  fondoCustomer: string;

  @Column({ nullable: true })
  fondoUser: string;

  @Column({ nullable: true })
  fondoClubs: string;

  @Column({ nullable: true })
  fondoSecction: string;

  @Column({ nullable: true })
  type_fondoMetricas: string;

  @Column({ nullable: true })
  type_fondoOpcion: string;

  @Column({ nullable: true })
  type_fondoCustomer: string;

  @Column({ nullable: true })
  type_fondoUser: string;

  @Column({ nullable: true })
  type_fondoClubs: string;

  @Column({ nullable: true })
  type_fondoSecction: string;

  @Column({ nullable: true })
  notification_whatsapp: string;

  @Column({ default: false })
  check_status: boolean;

  @Column({ nullable: true })
  wa_accessToken: string;

  @Column({ nullable: true })
  wa_phoneNumberId: string;

  @Column({ nullable: true })
  nit: string;

  @Column({ default: false })
  hidden_download_video: boolean;

  @Column({ nullable: true })
  title_company_user_es: string;

  @Column({ nullable: true })
  title_company_user_en: string;

  @Column({ nullable: true })
  login_type: string;

  @Column({ nullable: true })
  camp_user_1: string;

  @Column({ nullable: true })
  camp_user_2: string;

  @Column({ nullable: true })
  camp_user_3: string;

  @Column({ nullable: true })
  camp_user_4: string;

  @Column({ default: false })
  enable_facetoface_programs_sec: boolean;

  @Column({ default: false })
  enable_change_password: boolean;

  @Column({ default: false })
  enable_tutotial_face_to_face: boolean;

  @Column({ nullable: true })
  tutorial_link_face_to_face: string;

  @Column({ default: false })
  enable_tutotial_files: boolean;

  @Column({ nullable: true })
  tutorial_link_files: string;

  @Column({ default: false })
  enable_payments: boolean;

  @Column({ default: false })
  enable_payment_stripe: boolean;

  @Column({ nullable: true })
  stripe_public_key: string;

  @Column({ nullable: true })
  stripe_secret_key: string;

  @Column({ default: false })
  enable_payment_mercadopago: boolean;

  @Column({ nullable: true })
  mercadopago_public_key: string;

  @Column({ nullable: true })
  mercadopago_secret_key: string;


  @OneToMany(() => CustomField, (customField) => customField.client, { cascade: true })
  customFields: CustomField[];
}
