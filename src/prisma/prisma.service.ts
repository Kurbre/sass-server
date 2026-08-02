import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private pool: Pool

	constructor(private readonly configService: ConfigService) {
		const pool = new Pool({
			connectionString: configService.getOrThrow('DATABASE_URL')
		})
		const adapter = new PrismaPg(pool)

		super({
			adapter,
			omit: {
				user: {
					password: true
				}
			}
		})

		this.pool = pool
	}

	async onModuleInit() {
		await this.$connect()
	}

	async onModuleDestroy() {
		await this.$disconnect()
		this.pool.end()
	}
}
