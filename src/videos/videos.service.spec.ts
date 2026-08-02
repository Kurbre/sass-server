import { VideoStatus } from '@prisma/client'
import { CloudinaryService } from 'src/cloudinary/cloudinary.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { VideosService } from './videos.service'

describe('VideosService', () => {
	let prismaService: Pick<PrismaService, 'video'>
	let queue: { add: jest.Mock }
	let cloudinaryService: Pick<CloudinaryService, 'uploadFile'>
	let service: VideosService

	beforeEach(() => {
		prismaService = {
			video: {
				create: jest.fn()
			}
		} as unknown as Pick<PrismaService, 'video'>
		queue = {
			add: jest.fn()
		}
		cloudinaryService = {
			uploadFile: jest.fn()
		}
		service = new VideosService(
			prismaService as PrismaService,
			queue as any,
			cloudinaryService as CloudinaryService
		)
	})

	it('falls back to safe values when title and description are missing', async () => {
		;(cloudinaryService.uploadFile as jest.Mock).mockResolvedValue({
			secure_url: 'https://example.com/video.mp4'
		})
		;(prismaService.video.create as jest.Mock).mockResolvedValue({
			id: 'video-1'
		})

		await service.create(
			'user-1',
			{
				originalname: 'clip.mov',
				buffer: Buffer.from('video')
			} as Express.Multer.File,
			{ title: undefined, description: undefined } as any
		)

		expect(prismaService.video.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					title: 'clip',
					description: '',
					userId: 'user-1',
					status: VideoStatus.PEDNGING
				})
			})
		)
	})
})
