import { BullRootModuleOptions } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { JwtModuleOptions } from '@nestjs/jwt'

export const bullModuleConfig = async (
	configService: ConfigService
): Promise<BullRootModuleOptions> => ({
	connection: {
		host: configService.getOrThrow('REDIS_HOST'),
		port: configService.getOrThrow('REDIS_PORT')
	}
})
