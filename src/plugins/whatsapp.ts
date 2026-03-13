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
  let serviceType: string

  if (opts.whatsapp) {
    service = opts.whatsapp
    serviceType = service.constructor.name || 'injected'
  } else if (config.whatsappProvider === 'green_api') {
    service = createWhatsAppService({
      provider: 'green_api',
      greenApiInstanceId: config.greenApiInstanceId!,
      greenApiToken: config.greenApiToken!,
    })
    serviceType = 'GreenApiWhatsAppService'
  } else {
    service = new NoopWhatsAppService('provider is fake (dev/test only)')
    serviceType = 'NoopWhatsAppService'
  }

  fastify.decorate('whatsapp', service)

  fastify.log.info(
    { provider: config.whatsappProvider, serviceType },
    'WhatsApp service registered'
  )
}

export default fp(whatsappPlugin, {
  name: 'whatsapp',
})
