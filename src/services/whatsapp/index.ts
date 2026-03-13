import type { IWhatsAppService } from './types.js'
import { GreenApiWhatsAppService } from './green-api.service.js'

export interface WhatsAppFactoryConfig {
  provider: 'green_api'
  greenApiInstanceId: string
  greenApiToken: string
}

export function createWhatsAppService(
  config: WhatsAppFactoryConfig
): IWhatsAppService {
  return new GreenApiWhatsAppService({
    instanceId: config.greenApiInstanceId,
    token: config.greenApiToken,
  })
}

export type { IWhatsAppService, SendResult } from './types.js'
export { FakeWhatsAppService } from './fake.service.js'
export { GreenApiWhatsAppService } from './green-api.service.js'
