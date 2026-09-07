import {
	BadRequestException,
	Inject,
	Injectable,
	UnauthorizedException
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { CreateUserDto } from 'src/users/dto/create-user.dto'
import { UsersService } from 'src/users/users.service'
import { hash, verify } from 'argon2'
import { REDIS_CLIENT } from 'src/redis/redis.module'
import Redis from 'ioredis'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
	constructor(
		private readonly usersService: UsersService,
		private readonly jwtService: JwtService,
		@Inject(REDIS_CLIENT) private readonly redis: Redis
	) {}

	async register(dto: CreateUserDto) {
		const hashPassword = await hash(dto.password)

		const user = await this.usersService.create({
			...dto,
			password: hashPassword
		})

		const { accessToken, refreshToken } = await this.generateTokens(user.id)

		await this.setRefreshTokenToRedis(refreshToken, user.id)

		return {
			user,
			accessToken,
			refreshToken
		}
	}

	async login(dto: LoginDto) {
		const user = await this.usersService.findByEmail(dto.email)

		const isValidPassword = await verify(user.password, dto.password)
		if (!isValidPassword)
			throw new UnauthorizedException('Password is not valid.')

		const { accessToken, refreshToken } = await this.generateTokens(user.id)

		await this.setRefreshTokenToRedis(refreshToken, user.id)

		return { user, accessToken, refreshToken }
	}

	async logout(id: string) {
		await this.redis.del(this.getUserSessionName(id))

		return { success: true }
	}

	async getUserFromRefreshToken(refreshToken: string): Promise<string> {
		const payload = await this.jwtService.verifyAsync(refreshToken)

		if (payload.type === 'access')
			throw new BadRequestException('Token is not valid')

		const id = payload.sub

		await this.usersService.findById(id)

		return id
	}

	async refreshTokens(refreshToken: string, userId: string) {
		const savedRefreshTokenHash = await this.redis.get(
			this.getUserSessionName(userId)
		)
		if (!savedRefreshTokenHash) {
			throw new BadRequestException('Session not found or expired')
		}

		const isValid = await verify(savedRefreshTokenHash, refreshToken)

		if (!isValid) {
			throw new BadRequestException('Session not found or expired')
		}

		return this.generateTokens(userId)
	}

	private async generateTokens(id: string) {
		const payload = { sub: id }

		const accessToken = await this.jwtService.signAsync(
			{
				...payload,
				type: 'access'
			},
			{
				expiresIn: '15m' // Changed for production
			}
		)
		const refreshToken = await this.jwtService.signAsync(
			{
				...payload,
				type: 'refresh'
			},
			{
				expiresIn: '15d'
			}
		)

		return { accessToken, refreshToken }
	}

	private async setRefreshTokenToRedis(refreshToken: string, userId: string) {
		const hashRefreshToken = await hash(refreshToken)

		await this.redis.set(
			this.getUserSessionName(userId),
			hashRefreshToken,
			'EX',
			60 * 60 * 24 * 15 // 15 d
		)
	}

	private getUserSessionName(id: string) {
		return `user:${id}:session`
	}
}
