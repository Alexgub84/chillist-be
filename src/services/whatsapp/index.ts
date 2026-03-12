import type { IWhatsAppService } from './types.js'
import { FakeWhatsAppService } from './fake.service.js'
import { GreenApiWhatsAppService } from './green-api.service.js'

export interface WhatsAppFactoryConfig {
  provider: 'green_api' | 'fake'
  greenApiInstanceId?: string
  greenApiToken?: string
}

export function createWhatsAppService(
  config: WhatsAppFactoryConfig
): IWhatsAppService {
  if (config.provider === 'green_api') {
    if (!config.greenApiInstanceId || !config.greenApiToken) {
      throw new Error(
        'GREEN_API_INSTANCE_ID and GREEN_API_TOKEN are required for green_api provider'
      )
    }
    return new GreenApiWhatsAppService({
      instanceId: config.greenApiInstanceId,
      token: config.greenApiToken,
    })
  }

  return new FakeWhatsAppService()
}

export type { IWhatsAppService, SendResult } from './types.js'
export { FakeWhatsAppService } from './fake.service.js'
export { GreenApiWhatsAppService } from './green-api.service.js'
