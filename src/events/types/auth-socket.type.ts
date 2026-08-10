import { Socket } from 'socket.io'

export type AuthSocket = Socket & {
	data: {
		user?: {
			id: string
		}
	}
}
