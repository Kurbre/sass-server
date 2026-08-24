import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateUserDto } from './dto/create-user.dto'

@Injectable()
export class UsersService {
	constructor(private readonly prismaService: PrismaService) {}

	async create(dto: CreateUserDto) {
		const oldUser = await this.prismaService.user.findUnique({
			where: {
				email: dto.email
			}
		})
		if (oldUser) throw new BadRequestException('This user already exsis.')

		return this.prismaService.user.create({
			data: dto
		})
	}

	async findById(id: string) {
		const user = await this.prismaService.user.findUnique({
			where: { id },
			include: {
				accounts: true,
				videos: true,
				notifications: true
			}
		})
		if (!user) throw new NotFoundException('User not found.')

		return user
	}

	async findByEmail(email: string) {
		const user = await this.prismaService.user.findUnique({
			where: { email },
			select: {
				password: true,
				id: true,
				email: true
			}
		})
		if (!user) throw new NotFoundException('User not found.')

		return user
	}

	async findByEmailNoValidation(email: string) {
		return this.prismaService.user.findUnique({
			where: { email }
		})
	}
}
