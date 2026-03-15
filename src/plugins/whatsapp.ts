import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import {
  GreenApiWhatsAppService,
  HttpGreenApiClient,
  type IGreenApiClient,
  type IWhatsAppService,
  type SendResult,
} from '../services/whatsapp/index.js'

export interface WhatsAppPluginOptions {
  greenApiClient?: IGreenApiClient
}

class NoopGreenApiClient implements IGreenApiClient {
  private readonly reason: string

  constructor(reason: string) {
    this.reason = reason
  }

  async sendMessage(_chatId: string, _message: string): Promise<SendResult> {
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
  let client: IGreenApiClient
  let serviceType: string

  if (opts.greenApiClient) {
    client = opts.greenApiClient
    serviceType = client.constructor.name || 'injected'
  } else if (config.whatsappProvider === 'green_api') {
    client = new HttpGreenApiClient({
      instanceId: config.greenApiInstanceId!,
      token: config.greenApiToken!,
    })
    serviceType = 'HttpGreenApiClient'
  } else {
    client = new NoopGreenApiClient('provider is fake (dev/test only)')
    serviceType = 'NoopGreenApiClient'
  }

  const service: IWhatsAppService = new GreenApiWhatsAppService(client)
  fastify.decorate('whatsapp', service)

  fastify.log.info(
    { provider: config.whatsappProvider, serviceType },
    'WhatsApp service registered'
  )
}

export default fp(whatsappPlugin, {
  name: 'whatsapp',
})
