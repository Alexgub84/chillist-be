import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import {
  createWhatsAppService,
  type IWhatsAppService,
  type SendResult,
} from '../services/whatsapp/index.js'

export interface WhatsAppPluginOptions {
  whatsapp?: IWhatsAppService
}

class NoopWhatsAppService implements IWhatsAppService {
  private readonly reason: string

  constructor(reason: string) {
    this.reason = reason
  }

  async sendMessage(_phone: string, _message: string): Promise<SendResult> {
    return {
      success: false,
      error: `WhatsApp service unavailable: ${this.reason}`,
    }
  }
}

async function whatsappPlugin(
  fastify: FastifyInstance,
  opts: WhatsAppPluginOptions = {}
) {
  let service: IWhatsAppService

  if (opts.whatsapp) {
    service = opts.whatsapp
  } else {
    try {
      service = createWhatsAppService({
        provider: config.whatsappProvider,
        greenApiInstanceId: config.greenApiInstanceId,
        greenApiToken: config.greenApiToken,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      fastify.log.error(
        { err, provider: config.whatsappProvider },
        `WhatsApp service failed to initialize: ${message}`
      )
      service = new NoopWhatsAppService(message)
    }
  }

  fastify.decorate('whatsapp', service)

  fastify.log.info(
    { provider: config.whatsappProvider },
    'WhatsApp service registered'
  )
}

export default fp(whatsappPlugin, {
  name: 'whatsapp',
})
