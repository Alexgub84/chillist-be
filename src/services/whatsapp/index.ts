import type { IWhatsAppService } from './types.js'
import {
  GreenApiWhatsAppService,
  HttpGreenApiClient,
} from './green-api.service.js'

export interface WhatsAppFactoryConfig {
  provider: 'green_api'
  greenApiInstanceId: string
  greenApiToken: string
}

export function createWhatsAppService(
  config: WhatsAppFactoryConfig
): IWhatsAppService {
  const client = new HttpGreenApiClient({
    instanceId: config.greenApiInstanceId,
    token: config.greenApiToken,
  })
  return new GreenApiWhatsAppService(client)
}

export type { IWhatsAppService, IGreenApiClient, SendResult } from './types.js'
export { FakeGreenApiClient } from './fake.service.js'
export {
  GreenApiWhatsAppService,
  HttpGreenApiClient,
  phoneToChatId,
} from './green-api.service.js'
