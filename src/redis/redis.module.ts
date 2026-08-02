import { Global, Module } from '@nestjs/common'
import Redis from 'ioredis'

export const REDIS_CLIENT = Symbol('REDIS_CLIENT')

@Global()
@Module({
	providers: [
		{
			provide: REDIS_CLIENT,
			useFactory: () =>
				new Redis({
					host: process.env.REDIS_HOST,
					port: Number(process.env.REDIS_PORT)
				})
		}
	],
	exports: [REDIS_CLIENT]
})
export class RedisModule {}
