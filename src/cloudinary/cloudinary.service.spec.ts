import { CloudinaryService } from './cloudinary.service'
import { v2 as cloudinary } from 'cloudinary'

jest.mock('cloudinary', () => ({
	v2: {
		uploader: {
			upload_stream: jest.fn()
		}
	}
}))

describe('CloudinaryService', () => {
	it('uploads video files with the video resource type', async () => {
		const uploadResult = { secure_url: 'https://example.com/video.mp4' }
		const mockEnd = jest.fn()
		const uploadStreamMock = cloudinary.uploader.upload_stream as jest.Mock

		uploadStreamMock.mockImplementation(
			(options: unknown, callback: Function) => {
				callback(null, uploadResult)
				return { end: mockEnd }
			}
		)

		const service = new CloudinaryService()
		const file = {
			buffer: Buffer.from('video-data')
		} as Express.Multer.File

		await expect(service.uploadFile(file)).resolves.toEqual(uploadResult)
		expect(uploadStreamMock).toHaveBeenCalledWith(
			expect.objectContaining({
				folder: 'nestjs_uploads',
				resource_type: 'video'
			}),
			expect.any(Function)
		)
		expect(mockEnd).toHaveBeenCalledWith(file.buffer)
	})
})
