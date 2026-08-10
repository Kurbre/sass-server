import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
} from '@nestjs/websockets'
import { EventsService } from './events.service'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { type AuthSocket } from './types/auth-socket.type'

@WebSocketGateway({
	cors: {
		credentials: true,
		origin: process.env.CLIENT_URL
	},
	namespace: '/ws'
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server

	private readonly logger = new Logger(EventsGateway.name)

	constructor(
		private readonly eventsService: EventsService,
		private readonly jwtService: JwtService
	) {}

	async handleConnection(client: AuthSocket) {
		try {
			const token = this.extractToken(client)

			if (!token) {
				client.disconnect()
				return
			}

			const payload = await this.jwtService.verifyAsync<{ sub: string }>(token)

			client.data.user = {
				id: payload.sub
			}

			client.join(this.getUserRoom(payload.sub))

			this.logger.log(`User connected: ${payload.sub}`)
		} catch {
			client.disconnect()
		}
	}

	async handleDisconnect(client: AuthSocket) {
		this.logger.log(`Socket disconnected: ${client.id}`)
	}

	emitToUser(userId: string, event: string, payload: unknown) {
		this.server.to(this.getUserRoom(userId)).emit(event, payload)
	}

	emitToVideo(videoId: string, event: string, payload: unknown) {
		this.server.to(this.getVideoRoom(videoId)).emit(event, payload)
	}

	@SubscribeMessage('joinVideo')
	handleJoinVideo(
		@ConnectedSocket() client: AuthSocket,
		@MessageBody() data: { videoId: string }
	) {
		client.join(this.getVideoRoom(data.videoId))
		this.logger.log(`[SOcket] Пользователь подключился к ${data.videoId}`)
		return { event: 'joinedVideo', data: data.videoId }
	}

	private extractToken(client: Socket): string | null {
		const tokenFromAuth = client.handshake.auth?.token

		if (tokenFromAuth) {
			return tokenFromAuth
		}

		const authorization = client.handshake.headers.authorization

		if (authorization?.startsWith('Bearer ')) {
			return authorization.split(' ')[1]
		}

		return null
	}

	private getUserRoom(userId: string) {
		return `user:${userId}`
	}

	private getVideoRoom(videoId: string) {
		return `video:${videoId}`
	}
}
