import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotAcceptableException,
	NotFoundException
} from '@nestjs/common'
import { AccountType, BrowserSessionStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateAccountDto } from './dto/create-account.dto'
import { UpdateAccountDto } from './dto/update-account.dto'

@Injectable()
export class AccountsService {
	constructor(
		private readonly prismaService: PrismaService,
		@InjectQueue('tiktok') private readonly tiktokQueue: Queue
	) {}

	async logout(accountId: string, userId: string) {
		await this.findById(accountId, userId)

		await this.tiktokQueue.add('logout', { accountId, userId })

		return { success: true }
	}

	async connectTiktok(accountId: string, userId: string) {
		const account = await this.findById(accountId, userId)

		if (account.type !== AccountType.TIKTOK) {
			throw new BadRequestException('Account is not TikTok')
		}

		const date = new Date()
		date.setMinutes(date.getMinutes() + 5)

		const existingSession = await this.prismaService.browserSession.findFirst({
			where: {
				accountId,
				status: {
					in: [
						BrowserSessionStatus.CREATING,
						BrowserSessionStatus.WAITING_QR,
						BrowserSessionStatus.WAITING_LOGIN
					]
				}
			}
		})

		if (existingSession)
			throw new ConflictException('Account connection is already in progress')

		const session = await this.prismaService.browserSession.create({
			data: {
				status: BrowserSessionStatus.CREATING,
				expiresAt: date,
				accountId
			}
		})

		await this.tiktokQueue.add('login', {
			sessionId: session.id,
			userId
		})

		return {
			sessionId: session.id
		}
	}

	async create(dto: CreateAccountDto, userId: string) {
		return this.prismaService.account.create({
			data: {
				...dto,
				userId
			}
		})
	}

	async update(id: string, dto: UpdateAccountDto, userId: string) {
		await this.findById(id, userId)

		return this.prismaService.account.update({
			where: { id },
			data: dto
		})
	}

	async findByUserId(userId: string) {
		return this.prismaService.account.findMany({
			where: {
				userId
			},
			include: {
				videos: true,
				sessions: true
			}
		})
	}

	async findById(id: string, userId?: string) {
		const account = await this.prismaService.account.findUnique({
			where: { id },
			include: {
				stats: true,
				videos: true
			}
		})
		if (!account) throw new NotFoundException('Account not found')

		if (userId)
			if (account.userId !== userId)
				throw new NotAcceptableException('Not access')

		return account
	}

	async findSessionById(id: string, userId: string) {
		const session = await this.prismaService.browserSession.findUnique({
			where: { id },
			include: {
				account: true
			}
		})
		if (!session) throw new NotFoundException('Sesion not found')

		if (session.account.userId !== userId)
			throw new NotAcceptableException('Not access')

		return session
	}

	async delete(accountId: string, userId: string) {
		const account = await this.findById(accountId, userId)

		if (account.connected)
			throw new BadRequestException('First, log out of your account.')

		await this.prismaService.account.delete({
			where: {
				id: accountId
			}
		})

		return {
			success: true
		}
	}

	async dashboard(accountId: string, userId: string) {
		const account = await this.findById(accountId, userId)

		const chart = account.stats.map(i => ({
			date: i.createdAt,
			followers: i.followers,
			following: i.following,
			likes: i.likes
		}))

		const stat = account.stats.at(-1)

		return {
			following: stat?.following ?? 0,
			followers: stat?.followers ?? 0,
			likes: stat?.likes ?? 0,
			chart
		}
	}
}
