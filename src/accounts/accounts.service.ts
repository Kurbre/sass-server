import { InjectQueue } from '@nestjs/bullmq'
import {
	Injectable,
	NotAcceptableException,
	NotFoundException
} from '@nestjs/common'
import { BrowserSessionStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class AccountsService {
	constructor(
		private readonly prismaService: PrismaService,
		@InjectQueue('browser') private readonly browserQueue: Queue
	) {}

	async connectTiktok(userId: string) {
		const date = new Date()
		date.setMinutes(date.getMinutes() + 5)

		const session = await this.prismaService.browserSession.create({
			data: {
				userId,
				status: BrowserSessionStatus.CREATING,
				expiresAt: date
			}
		})

		await this.browserQueue.add('create-browser', { sessionId: session.id })

		return {
			sessionId: session.id
		}
	}

	async findSessionById(id: string, userId: string) {
		const session = await this.prismaService.browserSession.findUnique({
			where: { id }
		})
		if (!session) throw new NotFoundException('Sesion not found')

		if (userId !== session.userId)
			throw new NotAcceptableException('Not access')

		return session
	}
}
