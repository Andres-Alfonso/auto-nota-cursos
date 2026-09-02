import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface MailserverResponse {
  message?: string;
  jobId?: string;
}

@Injectable()
export class MailserverService {
  private readonly logger = new Logger(MailserverService.name);

  constructor(private readonly configService: ConfigService) {}

  async queueGroupWelcomeMultiple(
    to: string,
    name: string,
    addedGroups: string[],
  ): Promise<MailserverResponse> {
    const baseUrl = (
      this.configService.get<string>('MAILSERVER_URL') || 'http://localhost:3001'
    ).replace(/\/+$/, '');
    const apiKey = this.configService.get<string>('MAILSERVER_API_KEY');

    if (!apiKey) {
      throw new Error('MAILSERVER_API_KEY no está configurada');
    }

    if (!to || !to.trim()) {
      throw new Error('El usuario no tiene un correo válido para notificar');
    }

    try {
      const response = await axios.post<MailserverResponse>(
        `${baseUrl}/mail/send`,
        {
          to: to.trim(),
          template: 'group_welcome_multiple',
          data: {
            name: name?.trim() || 'Usuario',
            addedGroups,
          },
        },
        {
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 'sin respuesta';
        const responseMessage = error.response?.data?.message;
        const detail = Array.isArray(responseMessage)
          ? responseMessage.join(', ')
          : responseMessage || error.message;

        this.logger.error(
          `Mailserver no pudo encolar el correo para ${to}: HTTP ${status} - ${detail}`,
        );
        throw new Error(`Mailserver HTTP ${status}: ${detail}`);
      }

      throw error;
    }
  }
}
